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

/** Resolve provider-specific IMAP system mailbox names using SPECIAL-USE flags. */
async function resolveSystemMailbox(client: ImapFlow, requested: string): Promise<string | null> {
  if (!["Drafts", "Sent", "Trash", "Junk", "All"].includes(requested)) return requested;
  const boxes = await client.list();
  const flags: Record<string, string> = { Drafts: "\\Drafts", Sent: "\\Sent", Trash: "\\Trash", Junk: "\\Junk", All: "\\All" };
  const alternatives: Record<string, RegExp> = {
    Drafts: /^(drafts?|brouillons)$/i,
    Sent: /^(sent( items| mail| messages)?|envoyés|messages envoyés)$/i,
    Trash: /^(trash|deleted( items| messages)?|corbeille)$/i,
    Junk: /^(junk|spam|courrier indésirable)$/i,
    All: /^(all( mail| messages)?|tous les messages|archives?)$/i,
  };
  return boxes.find(box => box.specialUse === flags[requested])?.path
    ?? boxes.find(box => alternatives[requested].test(box.name))?.path
    ?? null;
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
    const resolvedMailbox = await resolveSystemMailbox(client, mailbox);
    if (!resolvedMailbox) return { messages: [], nextCursor: null };
    const lock = await client.getMailboxLock(resolvedMailbox);
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
          messageId: env?.messageId ?? undefined,
          inReplyTo: env?.inReplyTo ?? undefined,
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
    const lock = await client.getMailboxLock(mailbox);
    try {
      const boxes = await client.list();
      const trash = boxes.find(box => box.specialUse === "\\Trash")
        ?? boxes.find(box => /^(trash|corbeille|deleted items|deleted messages|éléments supprimés)$/i.test(box.name));
      if (!trash) throw new Error("Dossier Corbeille introuvable : suppression annulée pour protéger le message.");
      if (trash.path === mailbox) throw new Error("Le message est déjà dans la Corbeille.");
      const moved = await client.messageMove(uid, trash.path, { uid: true });
      if (!moved) throw new Error("Le serveur IMAP n'a pas confirmé le déplacement vers la Corbeille.");
    } finally { lock.release(); }
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
      const tokens = query.match(/(?:"[^"]*"|\S)+/g) ?? [];
      const criteria: Record<string, unknown> = {};
      const terms: string[] = [];
      for (const token of tokens) {
        const value = token.slice(token.indexOf(":") + 1).replace(/^"|"$/g, "");
        if (/^from:/i.test(token) && value) criteria.from = value;
        else if (/^to:/i.test(token) && value) criteria.to = value;
        else if (/^subject:/i.test(token) && value) criteria.subject = value;
        else if (/^is:unread$/i.test(token)) criteria.seen = false;
        else if (/^is:read$/i.test(token)) criteria.seen = true;
        else if (/^is:starred$/i.test(token)) criteria.flagged = true;
        else if (/^has:attachment$/i.test(token)) criteria.body = "Content-Disposition: attachment";
        else if (/^after:/i.test(token) && /^\d{4}\/\d{2}\/\d{2}$/.test(value)) criteria.since = new Date(value.replace(/\//g, "-") + "T00:00:00Z");
        else if (/^before:/i.test(token) && /^\d{4}\/\d{2}\/\d{2}$/.test(value)) criteria.before = new Date(value.replace(/\//g, "-") + "T00:00:00Z");
        else terms.push(token.replace(/^"|"$/g, ""));
      }
      if (terms.length) criteria.or = terms.flatMap(term => [{ subject: term }, { from: term }, { body: term }]);
      const uids = await client.search(criteria, { uid: true });
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
