/**
 * Client for the Nexus Mail self-hosted backend (IMAP/SMTP mail engine).
 *
 * The backend base URL is provided at build time via `NEXT_PUBLIC_API_URL`.
 * When it is unset, the app runs in standalone mode (sample data + local
 * client-side E2EE only) and {@link apiConfigured} returns false.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";

export function apiConfigured(): boolean {
  return BASE.length > 0;
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
  createdAt: string;
}

export interface MessageSummary {
  uid: number;
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
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
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

export function deleteAccount(id: string) {
  return req<null>(`/api/accounts/${id}`, { method: "DELETE" });
}

export function getMessages(accountId: string, mailbox = "INBOX", limit = 25) {
  const q = new URLSearchParams({ mailbox, limit: String(limit) });
  return req<{ messages: MessageSummary[] }>(
    `/api/accounts/${accountId}/messages?${q}`,
  ).then((r) => r.messages);
}

export function getMessage(accountId: string, uid: number, mailbox = "INBOX") {
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
