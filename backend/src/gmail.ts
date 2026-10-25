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

async function gmail(account: Account, path: string, init?: RequestInit) {
  const token = await accessToken(account);
  const response = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init?.headers } });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as {
      error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> };
    };
    const reason = errorBody.error?.errors?.[0]?.reason ?? errorBody.error?.status ?? "";
    const detail = errorBody.error?.message ?? "Unknown Gmail API error";
    if (response.status === 401) throw new GoogleAccessRevokedError("Google access token rejected. Reconnect the account if this persists.");
    // A 403 may be rate limiting, insufficient scopes, or policy restrictions.
    // It is NOT necessarily a revoked OAuth authorization.
    if (response.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason))
      throw new GoogleAccessRevokedError("Google permission missing. Reconnect the account to grant Gmail access.");
    throw new Error(`Gmail API HTTP ${response.status}: ${reason || detail}`);
  }
  return response.json() as Promise<any>;
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
  return { uid: message.id, subject: header(headers, "Subject") || "(sans objet)", from: sender(header(headers, "From")), to: addresses(header(headers, "To")), date: header(headers, "Date") || new Date(Number(message.internalDate ?? Date.now())).toISOString(), snippet: message.snippet ?? "", seen: !(message.labelIds ?? []).includes("UNREAD"), flagged: (message.labelIds ?? []).includes("STARRED") };
}

export async function fetchGmailSummaries(account: Account, mailbox: string, limit: number, pageToken?: string): Promise<{ messages: MessageSummary[]; nextCursor: string | null }> {
  const label = mailbox === "INBOX" ? "INBOX" : mailbox;
  const params = new URLSearchParams({ labelIds: label, maxResults: String(limit) });
  if (pageToken) params.set("pageToken", pageToken);
  const list = await gmail(account, `/messages?${params}`);
  const messages = await Promise.all((list.messages ?? []).map((item: { id: string }) => gmail(account, `/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)));
  return { messages: messages.map(summary), nextCursor: list.nextPageToken ?? null };
}

export async function fetchGmailDetail(account: Account, id: string): Promise<MessageDetail | null> {
  const message = await gmail(account, `/messages/${encodeURIComponent(id)}?format=full`);
  const base = summary(message); const content = bodies(message.payload);
  // Inline images referenced by Content-ID need to be embedded for the email iframe.
  let renderedHtml = content.html;
  if (renderedHtml?.includes("cid:")) {
    const parts = gmailAttachmentsRaw(message.payload);
    let totalBytes = 0;
    for (const part of parts) {
      const cid = header(part.headers, "Content-ID").replace(/^</, "").replace(/>$/, "");
      const mime = String(part.mimeType ?? "");
      const size = Number(part.body?.size ?? 0);
      if (!cid || !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime) || size > 1_500_000 || totalBytes + size > 4_000_000) continue;
      let encoded = part.body?.data as string | undefined;
      if (!encoded && part.body?.attachmentId) {
        try {
          const attachment = await gmail(account, "/messages/" + encodeURIComponent(id) + "/attachments/" + encodeURIComponent(part.body.attachmentId));
          encoded = attachment.data as string | undefined;
        } catch { continue; }
      }
      if (!encoded) continue;
      totalBytes += size;
      const dataUri = "data:" + mime + ";base64," + Buffer.from(encoded, "base64url").toString("base64");
      renderedHtml = renderedHtml.split("cid:" + cid).join(dataUri);
    }
  }
  return { ...base, snippet: message.snippet || content.text.replace(/\s+/g, " ").trim().slice(0, 200), text: content.text, html: renderedHtml, attachments: gmailAttachments(message.payload) };
}

export async function sendGmailMessage(account: Account, message: OutgoingMessage) {
  if (message.attachments?.length) {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const generated = await transport.sendMail({ from: { name: account.label, address: account.email }, to: message.to, subject: message.subject, text: message.text, html: message.html, attachments: message.attachments.map(a => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.data, "base64") })) });
    const raw = generated.message as Buffer;
    const sent = await gmail(account, "/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: raw.toString("base64url") }) });
    return { messageId: sent.id as string };
  }
  const boundary = `nexus-${randomUUID()}`;
  const raw = [
    `From: ${account.label} <${account.email}>`, `To: ${message.to}`, `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`, "MIME-Version: 1.0",
    message.html ? `Content-Type: multipart/alternative; boundary=\"${boundary}\"` : "Content-Type: text/plain; charset=UTF-8", "",
    ...(message.html ? [`--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "", message.text, `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "", message.html, `--${boundary}--`] : [message.text]),
  ].join("\r\n");
  const result = await gmail(account, "/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }) });
  return { messageId: result.id as string };
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

export async function fetchGmailAttachment(account: Account, id: string, attachmentId: string): Promise<Buffer> {
  const result = await gmail(account, `/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`);
  return Buffer.from(String(result.data ?? ""), "base64url");
}

function gmailAttachments(part: any): Array<{ id: string; filename: string; contentType: string; size: number }> {
  return [part, ...(part?.parts ?? []).flatMap(gmailAttachmentsRaw)].filter((p: any) => p?.filename && p?.body?.attachmentId)
    .map((p: any) => ({ id: p.body.attachmentId, filename: p.filename, contentType: p.mimeType ?? "application/octet-stream", size: Number(p.body.size ?? 0) }));
}
function gmailAttachmentsRaw(part: any): any[] { return [part, ...(part?.parts ?? []).flatMap(gmailAttachmentsRaw)]; }
