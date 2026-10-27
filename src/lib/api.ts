/**
 * Client for the Nexus Mail self-hosted backend (IMAP/SMTP mail engine).
 *
 * The backend address is public by design; credentials and session secrets are
 * never bundled. The backend authenticates with an HttpOnly cookie.
 * When it is unset, the app runs in standalone mode (sample data + local
 * client-side E2EE only) and {@link apiConfigured} returns false.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
let session: { csrfToken: string; username: string } | null = null;

export function apiConfigured(): boolean {
  return BASE.length > 0;
}

export async function checkBackend(): Promise<boolean> {
  if (!apiConfigured()) return false;
  try {
    const response = await fetch(`${BASE}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

export function isAuthenticated(): boolean { return session !== null; }

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  session = { csrfToken: body.csrfToken, username: body.username };
}

export async function restoreSession(): Promise<boolean> {
  if (!apiConfigured()) return false;
  const res = await fetch(`${BASE}/api/auth/session`, { credentials: "include", cache: "no-store" });
  if (!res.ok) { session = null; return false; }
  const body = await res.json();
  session = { csrfToken: body.csrfToken, username: body.username };
  return true;
}

export async function logout(): Promise<void> {
  if (!session) return;
  await fetch(`${BASE}/api/auth/logout`, {
    method: "POST", credentials: "include", headers: { "X-CSRF-Token": session.csrfToken },
  });
  session = null;
}

export interface PublicAccount {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  authType: "password" | "google_oauth";
  createdAt: string;
}

export interface MessageSummary {
  uid: string;
  threadId?: string;
  messageId?: string;
  inReplyTo?: string;
  subject: string;
  from: { name: string; email: string };
  to: string[];
  date: string;
  snippet: string;
  seen: boolean;
  flagged: boolean;
  labelIds: string[];
}

export interface MessageDetail extends MessageSummary {
  text: string;
  html: string | null;
  attachments?: Array<{ id: string; filename: string; contentType: string; size: number }>;
}

export interface NewAccount {
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (!session && !(await restoreSession())) throw new Error("Connexion requise.");
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.method && init.method !== "GET" ? { "X-CSRF-Token": session!.csrfToken } : {}), ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export function getAccounts() {
  return req<{ accounts: PublicAccount[] }>("/api/accounts").then((r) => r.accounts);
}

export function addAccount(account: NewAccount) {
  return req<{ account: PublicAccount }>("/api/accounts", {
    method: "POST",
    body: JSON.stringify(account),
  }).then((r) => r.account);
}

/** Starts a server-side authorization-code flow. No Google token reaches this app. */
export async function connectGoogle(): Promise<void> {
  const result = await req<{ authorizeUrl: string }>("/api/oauth/google/start");
  window.location.assign(result.authorizeUrl);
}

export function deleteAccount(id: string) {
  return req<null>(`/api/accounts/${id}`, { method: "DELETE" });
}
export type EmailAlias = { id: string; accountId: string; alias: string; label: string; active: boolean; createdAt: string };
export function getEmailAliases(accountId: string) { return req<{ aliases: EmailAlias[] }>(`/api/accounts/${encodeURIComponent(accountId)}/aliases`).then(r => r.aliases); }
export function createEmailAlias(accountId: string, label: string) { return req<{ alias: EmailAlias }>(`/api/accounts/${encodeURIComponent(accountId)}/aliases`, { method: "POST", body: JSON.stringify({ label }) }).then(r => r.alias); }
export function deactivateEmailAlias(accountId: string, aliasId: string) { return req<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(accountId)}/aliases/${encodeURIComponent(aliasId)}/deactivate`, { method: "POST" }); }

export interface MessagePage {
  messages: MessageSummary[];
  nextCursor: string | null;
  nextPageToken?: string | null;
  nextPage?: number | null;
}

export async function getMessages(accountId: string, mailbox = "INBOX", limit = 50, cursor?: string, category?: string): Promise<MessagePage> {
  const q = new URLSearchParams({ mailbox, pageSize: String(limit) });
  if (cursor) q.set("cursor", cursor);
  if (category) q.set("category", category);
  const result = await req<MessagePage | MessageSummary[] | { messages: MessageSummary[]; nextCursor?: string | null; nextPageToken?: string | null; nextPage?: number | null }>(`/api/accounts/${encodeURIComponent(accountId)}/messages?${q}`);
  // Older deployed backends returned a bare array; never blank the inbox
  // while the paginated backend is being rolled out.
  if (Array.isArray(result)) return { messages: result, nextCursor: null };
  if (result && Array.isArray(result.messages)) return { messages: result.messages, nextCursor: result.nextCursor ?? result.nextPageToken ?? (result.nextPage == null ? null : String(result.nextPage)) };
  throw new Error("Format de réponse de messagerie inattendu : vérifie le déploiement du backend.");
}

export function getMessage(accountId: string, uid: string, mailbox = "INBOX") {
  const q = new URLSearchParams({ mailbox });
  return req<{ message: MessageDetail }>(
    `/api/accounts/${accountId}/messages/${uid}?${q}`,
  ).then((r) => r.message);
}

export function sendViaAccount(
  accountId: string,
  message: { to: string; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; contentType: string; data: string }>; undoDelaySeconds: 5 | 10 | 20 | 30 },
) {
  return req<{ message: QueuedMail }>(`/api/accounts/${accountId}/send`, {
    method: "POST",
    body: JSON.stringify(message),
  });
}

export interface QueuedMail {
  id: string; accountId: string; to: string; subject: string; scheduledAt: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  createdAt: string; sentAt: string | null; error: string | null;
}
export function scheduleViaAccount(
  accountId: string,
  message: { to: string; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; contentType: string; data: string }> },
  scheduledAt: string,
) {
  return req<{ message: QueuedMail }>(`/api/accounts/${encodeURIComponent(accountId)}/outbox`, {
    method: "POST", body: JSON.stringify({ ...message, scheduledAt }),
  });
}
export function getQueuedMail(accountId: string) {
  return req<{ messages: QueuedMail[] }>(`/api/accounts/${encodeURIComponent(accountId)}/outbox`).then(r => r.messages);
}
export function rescheduleQueuedMail(accountId: string, id: string, scheduledAt: string) {
  return req<{ message: QueuedMail }>(`/api/accounts/${encodeURIComponent(accountId)}/outbox/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ scheduledAt }),
  }).then(r => r.message);
}
export function cancelQueuedMail(accountId: string, id: string) {
  return req<{ ok: boolean; draft: { to: string; subject: string; text: string; html?: string } }>(`/api/accounts/${encodeURIComponent(accountId)}/outbox/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export function markMessageRead(accountId: string, uid: string, mailbox = "INBOX") {
  return req<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}/read?${new URLSearchParams({ mailbox })}`, { method: "POST" });
}

export function trashMessage(accountId: string, uid: string, mailbox = "INBOX") {
  return req<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}/trash?${new URLSearchParams({ mailbox })}`, { method: "POST" });
}

export interface AccountLabel {
  id: string;
  name: string;
  color?: string;
}

export function getAccountLabels(accountId: string) {
  return req<{ labels: AccountLabel[] }>(`/api/accounts/${encodeURIComponent(accountId)}/labels`)
    .then((result) => result.labels);
}

export type MessageAction = "read" | "unread" | "star" | "unstar" | "archive";
export function performMessageAction(accountId: string, uid: string, mailbox: string, action: MessageAction) {
  return req<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}/action?${new URLSearchParams({ mailbox })}`, { method: "POST", body: JSON.stringify({ action }) });
}
export function snoozeMessage(accountId: string, uid: string, mailbox: string, snoozedUntil: string) {
  return req<{ ok: boolean; snoozedUntil: string }>(`/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}/snooze?${new URLSearchParams({ mailbox })}`, {
    method: "POST", body: JSON.stringify({ snoozedUntil }),
  });
}
export function getSnoozedMessages(accountId: string) {
  return req<{ messages: MessageSummary[] }>(`/api/accounts/${encodeURIComponent(accountId)}/snoozed`).then(result => result.messages);
}
export function searchAccountMessages(accountId: string, query: string) {
  return req<{ messages: MessageSummary[] }>(`/api/accounts/${encodeURIComponent(accountId)}/search?${new URLSearchParams({ q: query })}`).then(r => r.messages);
}
export async function downloadAttachment(accountId: string, uid: string, attachmentId: string, mailbox = "INBOX"): Promise<Blob> {
  if (!session && !(await restoreSession())) throw new Error("Connexion requise.");
  const url = `${BASE}/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}/attachments/${encodeURIComponent(attachmentId)}?${new URLSearchParams({ mailbox })}`;
  const settings = (() => { try { return JSON.parse(window.localStorage.getItem("nexus-mail:settings:v1") || "{}"); } catch { return {}; } })();
  const shouldCache = settings.attachments === "always" && "caches" in window;
  const cache = shouldCache ? await caches.open("nexus-mail-attachments-v1") : null;
  const cached = cache ? await cache.match(url) : undefined;
  if (cached) return cached.blob();
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  if (cache) await cache.put(url, res.clone());
  return res.blob();
}

export function getCategoryCounts(accountId: string): Promise<Record<string, number> | null> {
  return req<{ counts: Record<string, number> | null }>(`/api/accounts/${encodeURIComponent(accountId)}/category-counts`).then(r => r.counts);
}

export function blockMailSender(email: string) {
  return req<{ ok: boolean }>("/api/accounts/blocked-senders", { method: "POST", body: JSON.stringify({ email }) });
}
export function changeMailCategory(accountId: string, uid: string, category: string) {
  return req<{ ok: boolean }>(`/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}/category`, {
    method: "POST", body: JSON.stringify({ category }),
  });
}

export interface MailSubscription {
  sender: string; name: string; count: number; lastReceived: string;
  unsubscribeUrl?: string; oneClickUrl?: string; mailto?: string;
}
export function getMailSubscriptions(accountId: string) {
  return req<{ subscriptions: MailSubscription[] }>(`/api/accounts/${encodeURIComponent(accountId)}/subscriptions`).then(r => r.subscriptions);
}
