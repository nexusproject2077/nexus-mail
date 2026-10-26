import { ImapFlow } from "imapflow";
import type { Account } from "./types.js";
import { fetchGmailSubscriptionHeaders } from "./gmail.js";

export interface Subscription {
  sender: string; name: string; count: number; lastReceived: string;
  unsubscribeUrl?: string; oneClickUrl?: string; mailto?: string;
}
type Raw = { from: string; name: string; date: string; unsubscribe: string; post: string };
function parseLinks(value: string) {
  const links = [...value.matchAll(/<([^>]+)>/g)].map(m => m[1].trim());
  const https = links.find(link => /^https:\/\//i.test(link));
  const mailto = links.find(link => /^mailto:/i.test(link));
  return { https, mailto };
}
function aggregate(rows: Raw[]): Subscription[] {
  const groups = new Map<string, Subscription>();
  for (const row of rows) {
    if (!row.from || !row.unsubscribe) continue;
    const key = row.from.toLowerCase();
    const links = parseLinks(row.unsubscribe);
    if (!links.https && !links.mailto) continue;
    const current = groups.get(key) ?? { sender: key, name: row.name || key, count: 0, lastReceived: row.date };
    current.count++;
    if (Date.parse(row.date) > Date.parse(current.lastReceived)) {
      current.lastReceived = row.date;
      current.name = row.name || key;
    }
    if (links.https) {
      current.unsubscribeUrl = links.https;
      if (/\bList-Unsubscribe\s*=\s*One-Click\b/i.test(row.post)) current.oneClickUrl = links.https;
    }
    if (links.mailto) current.mailto = links.mailto;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a,b) => b.count-a.count || Date.parse(b.lastReceived)-Date.parse(a.lastReceived));
}
export async function discoverSubscriptions(account: Account): Promise<Subscription[]> {
  if (account.authType === "google_oauth") return aggregate(await fetchGmailSubscriptionHeaders(account));
  const client = new ImapFlow({
    host: account.imapHost, port: account.imapPort, secure: account.imapSecure,
    auth: { user: account.username, pass: account.password }, logger: false, socketTimeout: 30000,
  });
  await client.connect();
  const rows: Raw[] = [];
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const total = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      const start = Math.max(1, total - 199);
      if (total) {
        for await (const message of client.fetch(`${start}:${total}`, { envelope: true, headers: ["list-unsubscribe", "list-unsubscribe-post"] })) {
          const h = message.headers?.toString("utf8") ?? "";
          const extract = (key: string) => {
            const unfolded = h.replace(/\r?\n[ \t]+/g, " ");
            return unfolded.match(new RegExp(`^${key}:\\s*(.*)$`, "im"))?.[1]?.trim() ?? "";
          };
          const from = message.envelope?.from?.[0];
          rows.push({ from: from?.address ?? "", name: from?.name ?? "", date: message.envelope?.date?.toISOString() ?? "",
            unsubscribe: extract("List-Unsubscribe"), post: extract("List-Unsubscribe-Post") });
        }
      }
    } finally { lock.release(); }
  } finally { await client.logout(); }
  return aggregate(rows);
}
/** Only POST to RFC 8058 endpoints. Never GET arbitrary links on the server. */
export async function requestOneClick(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) throw new Error("Adresse HTTPS non autorisée");
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":") || !hostname.includes(".")) {
    throw new Error("Adresse de désabonnement non autorisée");
  }
  // External redirects are not followed to limit SSRF exposure.
  const response = await fetch(parsed.toString(), {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
  if (!response.ok) throw new Error(`Le serveur a refusé le désabonnement (HTTP ${response.status})`);
}
