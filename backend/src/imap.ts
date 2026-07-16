import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Account, MessageSummary, MessageDetail } from "./types.js";

/** Open an authenticated IMAP client for an account. */
async function open(account: Account): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.username, pass: account.password },
    logger: false,
    // Gmail and most providers are fine with a modest timeout.
    socketTimeout: 30000,
  });
  await client.connect();
  return client;
}

/** Verify credentials by connecting and logging out. Throws on failure. */
export async function testConnection(account: Account): Promise<void> {
  const client = await open(account);
  await client.logout();
}

function addr(a?: { name?: string; address?: string } | null): {
  name: string;
  email: string;
} {
  return { name: a?.name ?? "", email: a?.address ?? "" };
}

/** Fetch the most recent `limit` message envelopes from a mailbox, newest first. */
export async function fetchSummaries(
  account: Account,
  mailbox: string,
  limit: number,
): Promise<MessageSummary[]> {
  const client = await open(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const total =
        typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      if (!total) return [];
      const start = Math.max(1, total - limit + 1);
      const summaries: MessageSummary[] = [];
      for await (const msg of client.fetch(`${start}:${total}`, {
        uid: true,
        envelope: true,
        flags: true,
      })) {
        const env = msg.envelope;
        summaries.push({
          uid: msg.uid,
          subject: env?.subject ?? "(sans objet)",
          from: addr(env?.from?.[0]),
          to: (env?.to ?? []).map((t) => t.address ?? "").filter(Boolean),
          date: (env?.date ?? new Date()).toISOString(),
          snippet: "",
          seen: msg.flags?.has("\\Seen") ?? false,
          flagged: msg.flags?.has("\\Flagged") ?? false,
        });
      }
      return summaries.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

/** Fetch and parse a single message by UID, marking it seen. */
export async function fetchDetail(
  account: Account,
  mailbox: string,
  uid: number,
): Promise<MessageDetail | null> {
  const client = await open(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, flags: true, source: true },
        { uid: true },
      );
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      const env = msg.envelope;
      const text = parsed.text ?? "";
      // Best-effort: mark the message as read.
      try {
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } catch {
        /* read-only mailbox — ignore */
      }
      return {
        uid,
        subject: env?.subject ?? parsed.subject ?? "(sans objet)",
        from: addr(env?.from?.[0]),
        to: (env?.to ?? []).map((t) => t.address ?? "").filter(Boolean),
        date: (env?.date ?? parsed.date ?? new Date()).toISOString(),
        snippet: text.replace(/\s+/g, " ").trim().slice(0, 200),
        seen: true,
        flagged: msg.flags?.has("\\Flagged") ?? false,
        text,
        html: typeof parsed.html === "string" ? parsed.html : null,
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}
