import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Account, MessageSummary, MessageDetail } from "./types.js";

/** Open an authenticated IMAP client for an account. */
async function open(account: Account): Promise<ImapFlow> {
  if (account.authType === "google_oauth") throw new Error("Google OAuth accounts use the Gmail API");
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
  offset = 0,
): Promise<{ messages: MessageSummary[]; nextCursor: string | null }> {
  const client = await open(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const total =
        typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      if (!total || offset >= total) return { messages: [], nextCursor: null };
      const end = Math.max(1, total - offset);
      const start = Math.max(1, end - limit + 1);
      const summaries: MessageSummary[] = [];
      for await (const msg of client.fetch(`${start}:${end}`, {
        uid: true,
        envelope: true,
        flags: true,
      })) {
        const env = msg.envelope;
        summaries.push({
          uid: String(msg.uid),
          subject: env?.subject ?? "(sans objet)",
          from: addr(env?.from?.[0]),
          to: (env?.to ?? []).map((t) => t.address ?? "").filter(Boolean),
          date: (env?.date ?? new Date()).toISOString(),
          snippet: "",
          seen: msg.flags?.has("\\Seen") ?? false,
          flagged: msg.flags?.has("\\Flagged") ?? false,
          labelIds: [mailbox, ...(msg.flags?.has("\\Seen") ? [] : ["UNREAD"]), ...(msg.flags?.has("\\Flagged") ? ["STARRED"] : [])],
        });
      }
      return { messages: summaries.reverse(), nextCursor: start > 1 ? String(offset + (end - start + 1)) : null };
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
  uid: string,
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
        labelIds: [mailbox, ...(msg.flags?.has("\\Flagged") ? ["STARRED"] : [])],
        text,
        html: typeof parsed.html === "string" ? parsed.html : null,
        attachments: parsed.attachments.map((a, i) => ({ id: String(i), filename: a.filename ?? "piece-jointe", contentType: a.contentType, size: a.size })),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

/** Mark an IMAP message read by UID. */
export async function markImapRead(account: Account, mailbox: string, uid: string): Promise<void> {
  const client = await open(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try { await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true }); }
    finally { lock.release(); }
  } finally { await client.logout(); }
}

/** Move a message into the provider's Trash folder, without permanent deletion. */
export async function trashImapMessage(account: Account, mailbox: string, uid: string): Promise<void> {
  const client = await open(account);
  try {
    const boxes = await client.list();
    const trash = boxes.find((box) => box.specialUse === "\\Trash")
      ?? boxes.find((box) => /^(trash|corbeille|deleted items|deleted messages)$/i.test(box.name));
    if (!trash) throw new Error("Aucun dossier Corbeille trouvé sur ce compte.");
    const lock = await client.getMailboxLock(mailbox);
    try { await client.messageMove(uid, trash.path, { uid: true }); }
    finally { lock.release(); }
  } finally { await client.logout(); }
}

/** Provider IMAP folders, excluding standard system mailboxes. */
export async function fetchImapLabels(account: Account): Promise<Array<{ id: string; name: string }>> {
  const client = await open(account);
  try {
    const boxes = await client.list();
    const system = new Set(["\\Inbox", "\\Sent", "\\Drafts", "\\Trash", "\\Junk", "\\Archive", "\\All", "\\Flagged"]);
    return boxes.filter((box) => !box.specialUse || !system.has(box.specialUse))
      .filter((box) => !/^(INBOX|Sent|Drafts|Trash|Junk|Spam|Archive)$/i.test(box.path))
      .filter((box) => !box.flags?.has("\\Noselect"))
      .map((box) => ({ id: box.path, name: box.path }));
  } finally { await client.logout(); }
}

export async function updateImapFlags(account: Account, mailbox: string, uid: string, action: "read" | "unread" | "star" | "unstar" | "archive"): Promise<void> {
  const client = await open(account);
  try {
    if (action === "archive") {
      const boxes = await client.list();
      const archive = boxes.find((box) => box.specialUse === "\\Archive") ?? boxes.find((box) => /^archives?$/i.test(box.name));
      if (!archive) throw new Error("Dossier Archives introuvable.");
      const lock = await client.getMailboxLock(mailbox);
      try { await client.messageMove(uid, archive.path, { uid: true }); } finally { lock.release(); }
    } else {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const flag = action === "read" || action === "unread" ? "\\Seen" : "\\Flagged";
        if (action === "read" || action === "star") await client.messageFlagsAdd(uid, [flag], { uid: true });
        else await client.messageFlagsRemove(uid, [flag], { uid: true });
      } finally { lock.release(); }
    }
  } finally { await client.logout(); }
}

export async function searchImap(account: Account, query: string, limit: number): Promise<MessageSummary[]> {
  const client = await open(account);
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ or: [{ subject: query }, { from: query }, { body: query }] }, { uid: true });
      if (!uids || !uids.length) return [];
      const results: MessageSummary[] = [];
      for await (const msg of client.fetch(uids.slice(-limit).join(","), { uid: true, envelope: true, flags: true }, { uid: true })) {
        const env = msg.envelope;
        results.push({ uid: String(msg.uid), subject: env?.subject ?? "(sans objet)", from: addr(env?.from?.[0]), to: (env?.to ?? []).map(t => t.address ?? "").filter(Boolean), date: (env?.date ?? new Date()).toISOString(), snippet: "", seen: msg.flags?.has("\\Seen") ?? false, flagged: msg.flags?.has("\\Flagged") ?? false, labelIds: ["INBOX", ...(msg.flags?.has("\\Seen") ? [] : ["UNREAD"]), ...(msg.flags?.has("\\Flagged") ? ["STARRED"] : [])] });
      }
      return results.reverse();
    } finally { lock.release(); }
  } finally { await client.logout(); }
}

export async function fetchImapAttachment(account: Account, mailbox: string, uid: string, index: number): Promise<{ content: Buffer; filename: string; contentType: string }> {
  const client = await open(account);
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) throw new Error("Message introuvable");
      const parsed = await simpleParser(msg.source);
      const attachment = parsed.attachments[index];
      if (!attachment) throw new Error("Pièce jointe introuvable");
      return { content: attachment.content, filename: attachment.filename ?? "piece-jointe", contentType: attachment.contentType };
    } finally { lock.release(); }
  } finally { await client.logout(); }
}
