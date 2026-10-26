import type { Account, MessageDetail, MessageSummary } from "./types.js";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { OutgoingMessage } from "./smtp.js";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GoogleAccessRevokedError extends Error {}

/** Best-effort revocation when the owner removes a connected Google account. */
export async function revokeGoogleAccess(account: Account): Promise<void> {
  if (!account.refreshToken) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: account.refreshToken }),
  }).catch(() => undefined);
}

async function accessToken(account: Account): Promise<string> {
  if (!account.refreshToken) throw new GoogleAccessRevokedError("Google authorization is missing. Reconnect the account.");
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new GoogleAccessRevokedError("Google access was revoked or expired. Reconnect the account.");
    throw new Error("Unable to refresh Google authorization");
  }
  return json.access_token;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const accountQueues = new Map<string, Promise<void>>();
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function cachedAccessToken(account: Account): Promise<string> {
  const cached = tokenCache.get(account.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const token = await accessToken(account);
  tokenCache.set(account.id, { token, expiresAt: Date.now() + 45 * 60_000 });
  return token;
}

async function gmail(account: Account, path: string, init?: RequestInit) {
  // Serialize requests per Gmail account and pace them to prevent quota spikes.
  const previous = accountQueues.get(account.id) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  accountQueues.set(account.id, previous.catch(() => undefined).then(() => turn));
  await previous.catch(() => undefined);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = await cachedAccessToken(account);
      const response = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
      if (response.ok) return response.json() as Promise<any>;
      const errorBody = await response.json().catch(() => ({})) as {
        error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> };
      };
      const reason = errorBody.error?.errors?.[0]?.reason ?? errorBody.error?.status ?? "";
      const detail = errorBody.error?.message ?? "Unknown Gmail API error";
      if (response.status === 401) {
        tokenCache.delete(account.id);
        if (attempt === 0) continue;
        throw new GoogleAccessRevokedError("Google access token rejected. Reconnect the account if this persists.");
      }
      if (response.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason))
        throw new GoogleAccessRevokedError("Google permission missing. Reconnect the account to grant Gmail access.");
      const limited = response.status === 429 || ((response.status === 403 || response.status === 503) && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED|backendError/i.test(reason + detail));
      if (limited && attempt < 4) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 60_000)
          : Math.min(1000 * 2 ** attempt + Math.floor(Math.random() * 400), 16_000);
        await sleep(delay);
        continue;
      }
      throw new Error(`Gmail API HTTP ${response.status}: ${reason || detail}`);
    }
    throw new Error("Gmail API retry limit reached");
  } finally {
    await sleep(140);
    release();
  }
}

function header(headers: Array<{ name: string; value: string }> | undefined, name: string) {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function addresses(value: string) { return value.split(",").map((part) => part.trim()).filter(Boolean); }
function sender(value: string) {
  const match = value.match(/^(.*)<([^>]+)>$/);
  return match ? { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() } : { name: "", email: value };
}
function decode(data?: string) { return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : ""; }
function bodies(part: any): { text: string; html: string | null } {
  if (part?.mimeType === "text/plain") return { text: decode(part.body?.data), html: null };
  if (part?.mimeType === "text/html") return { text: "", html: decode(part.body?.data) };
  const found = (part?.parts ?? []).map(bodies);
  return { text: found.map((item: { text: string }) => item.text).find(Boolean) ?? "", html: found.map((item: { html: string | null }) => item.html).find(Boolean) ?? null };
}
function summary(message: any): MessageSummary {
  const headers = message.payload?.headers;
  return { uid: message.id, threadId: message.threadId ?? message.id, subject: header(headers, "Subject") || "(sans objet)", from: sender(header(headers, "From")), to: addresses(header(headers, "To")), date: header(headers, "Date") || new Date(Number(message.internalDate ?? Date.now())).toISOString(), snippet: message.snippet ?? "", seen: !(message.labelIds ?? []).includes("UNREAD"), flagged: (message.labelIds ?? []).includes("STARRED"), labelIds: Array.isArray(message.labelIds) ? message.labelIds : [] };
}

export async function fetchGmailSummaries(account: Account, mailbox: string, limit: number, pageToken?: string, category?: string): Promise<{ messages: MessageSummary[]; nextCursor: string | null }> {
  const label = mailbox === "INBOX" ? "INBOX" : mailbox;
  const params = new URLSearchParams({ labelIds: label, maxResults: String(limit) });
  // Gmail supports repeated labelIds filters; category + inbox are intersected.
  if (category) params.append("labelIds", category);
  if (pageToken) params.set("pageToken", pageToken);
  const list = await gmail(account, `/messages?${params}`);
  // Limit concurrent Gmail metadata requests to avoid rate-limit bursts when
  // fetching 500 messages across several pages/accounts.
  const items: Array<{ id: string }> = list.messages ?? [];
  const messages: Awaited<ReturnType<typeof gmail>>[] = [];
  for (let offset = 0; offset < items.length; offset += 10) {
    const batch = items.slice(offset, offset + 10);
    const details = await Promise.all(batch.map(item =>
      gmail(account, `/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)
    ));
    messages.push(...details);
  }
  return { messages: messages.map(summary), nextCursor: list.nextPageToken ?? null };
}

export async function fetchGmailDetail(account: Account, id: string): Promise<MessageDetail | null> {
  const message = await gmail(account, `/messages/${encodeURIComponent(id)}?format=full`);
  const base = summary(message); const content = bodies(message.payload);
  // Resolve inline CID images in the message itself. Gmail may encode CIDs with
  // angle brackets, case differences or percent-escaped characters.
  let renderedHtml = content.html;
  if (renderedHtml && /cid:/i.test(renderedHtml)) {
    const parts = gmailAttachmentsRaw(message.payload);
    let totalBytes = 0;
    for (const part of parts) {
      const cid = header(part.headers, "Content-ID").trim().replace(/^<|>$/g, "");
      const mime = String(part.mimeType ?? "").toLowerCase();
      const size = Number(part.body?.size ?? 0);
      if (!cid || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime) || size > 5_000_000 || totalBytes + size > 12_000_000) continue;
      let encoded = part.body?.data as string | undefined;
      if (!encoded && part.body?.attachmentId) {
        try {
          const attachment = await gmail(account, "/messages/" + encodeURIComponent(id) + "/attachments/" + encodeURIComponent(part.body.attachmentId));
          encoded = attachment.data as string | undefined;
        } catch { continue; }
      }
      if (!encoded) continue;
      const dataUri = "data:" + mime + ";base64," + Buffer.from(encoded, "base64url").toString("base64");
      renderedHtml = renderedHtml.replace(/cid:([^"'\s<>]+)/gi, (original: string, value: string) => {
        let normalized = value;
        try { normalized = decodeURIComponent(value); } catch { /* preserve original */ }
        return normalized.toLowerCase() === cid.toLowerCase() ? dataUri : original;
      });
      totalBytes += size;
    }
  }
  return { ...base, snippet: message.snippet || content.text.replace(/\s+/g, " ").trim().slice(0, 200), text: content.text, html: renderedHtml, attachments: gmailAttachments(message.payload) };
}

export async function sendGmailMessage(account: Account, message: OutgoingMessage) {
  // Nodemailer generates RFC-compliant multipart/alternative and multipart/mixed
  // MIME, including UTF-8 transfer encoding and Base64 file attachments.
  // Gmail users.getProfile only returns emailAddress, messagesTotal and threadsTotal.
  // Google OpenID userinfo (profile scope) supplies the account's display name.
  let displayName = account.label?.trim() || "";
  try {
    const token = await accessToken(account);
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const profile = await response.json() as { name?: string; email?: string };
      if (profile.name?.trim() && profile.email?.toLowerCase() === account.email.toLowerCase()) {
        displayName = profile.name.trim();
      }
    }
  } catch {
    // Existing OAuth connections may not have the profile scope yet.
    // Fall back to the display name saved at connection time.
  }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const generated = await transport.sendMail({
    from: { name: displayName, address: account.email },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments?.map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      content: Buffer.from(a.data, "base64"),
    })),
  });
  const raw = generated.message as Buffer;
  const sent = await gmail(account, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: raw.toString("base64url") }),
  });
  return { messageId: sent.id as string };
}

/** Update Gmail labels. gmail.modify OAuth scope is required. */
export async function markGmailRead(account: Account, id: string): Promise<void> {
  await gmail(account, `/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

/** Move a message to Gmail Trash; does not permanently delete it. */
export async function trashGmailMessage(account: Account, id: string): Promise<void> {
  await gmail(account, `/messages/${encodeURIComponent(id)}/trash`, { method: "POST" });
}

/** User-created Gmail labels, including their actual Gmail colors. */
export async function fetchGmailLabels(account: Account): Promise<Array<{ id: string; name: string; color?: string }>> {
  const response = await gmail(account, "/labels");
  return (response.labels ?? [])
    .filter((label: { type?: string }) => label.type === "user")
    .map((label: { id: string; name: string; color?: { backgroundColor?: string } }) => ({
      id: label.id, name: label.name, color: label.color?.backgroundColor,
    }));
}

export async function updateGmailFlags(account: Account, id: string, action: "read" | "unread" | "star" | "unstar" | "archive"): Promise<void> {
  const addLabelIds = action === "unread" ? ["UNREAD"] : action === "star" ? ["STARRED"] : [];
  const removeLabelIds = action === "read" ? ["UNREAD"] : action === "unstar" ? ["STARRED"] : action === "archive" ? ["INBOX"] : [];
  await gmail(account, `/messages/${encodeURIComponent(id)}/modify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addLabelIds, removeLabelIds }) });
}

export async function searchGmail(account: Account, query: string, limit: number): Promise<MessageSummary[]> {
  const list = await gmail(account, `/messages?${new URLSearchParams({ q: query, maxResults: String(limit) })}`);
  const messages = await Promise.all((list.messages ?? []).map((item: { id: string }) => gmail(account, `/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)));
  return messages.map(summary);
}

export async function fetchGmailAttachmentMetadata(account: Account, id: string): Promise<Array<{ id: string; filename: string; contentType: string; size: number }>> {
  const message = await gmail(account, `/messages/${encodeURIComponent(id)}?format=full`);
  return gmailAttachments(message.payload);
}

export async function fetchGmailAttachment(account: Account, id: string, attachmentId: string): Promise<Buffer> {
  const result = await gmail(account, `/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`);
  return Buffer.from(String(result.data ?? ""), "base64url");
}

function gmailAttachments(part: any): Array<{ id: string; filename: string; contentType: string; size: number }> {
  return [part, ...(part?.parts ?? []).flatMap(gmailAttachmentsRaw)].filter((p: any) => p?.filename && p?.body?.attachmentId)
    .map((p: any) => ({ id: p.body.attachmentId, filename: p.filename, contentType: p.mimeType ?? "application/octet-stream", size: Number(p.body.size ?? 0) }));
}
function gmailAttachmentsRaw(part: any): any[] { return [part, ...(part?.parts ?? []).flatMap(gmailAttachmentsRaw)]; }

/** Gmail label counters come from Gmail itself, not the loaded message page. */
export async function fetchGmailCategoryCounts(account: Account): Promise<Record<string, number>> {
  const ids = ["CATEGORY_PERSONAL", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES"];
  const results = await Promise.all(ids.map(async id => {
    const label = await gmail(account, "/labels/" + id);
    return [id, Number(label.messagesUnread ?? 0)] as const;
  }));
  return Object.fromEntries(results);
}

/** Reassign Gmail's category while keeping other labels untouched. */
export async function setGmailCategory(account: Account, id: string, category: string): Promise<void> {
  const allowed = ["CATEGORY_PERSONAL", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"];
  if (!allowed.includes(category)) throw new Error("Invalid Gmail category");
  await gmail(account, `/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [category], removeLabelIds: allowed.filter(item => item !== category) }),
  });
}
