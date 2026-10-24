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
  subject: string;
  from: { name: string; email: string };
  to: string[];
  date: string;
  snippet: string;
  seen: boolean;
  flagged: boolean;
}

export interface MessageDetail extends MessageSummary {
  text: string;
  html: string | null;
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

export function getMessages(accountId: string, mailbox = "INBOX", limit = 25) {
  const q = new URLSearchParams({ mailbox, limit: String(limit) });
  return req<{ messages: MessageSummary[] }>(
    `/api/accounts/${accountId}/messages?${q}`,
  ).then((r) => r.messages);
}

export function getMessage(accountId: string, uid: string, mailbox = "INBOX") {
  const q = new URLSearchParams({ mailbox });
  return req<{ message: MessageDetail }>(
    `/api/accounts/${accountId}/messages/${uid}?${q}`,
  ).then((r) => r.message);
}

export function sendViaAccount(
  accountId: string,
  message: { to: string; subject: string; text: string; html?: string },
) {
  return req<{ messageId: string }>(`/api/accounts/${accountId}/send`, {
    method: "POST",
    body: JSON.stringify(message),
  });
}
