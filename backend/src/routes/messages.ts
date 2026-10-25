import { Router } from "express";
import { z } from "zod";
import { getAccountWithSecret } from "../db.js";
import { fetchSummaries, fetchDetail, markImapRead, trashImapMessage, fetchImapLabels, updateImapFlags, searchImap, fetchImapAttachment } from "../imap.js";
import { sendMessage } from "../smtp.js";
import { fetchGmailDetail, fetchGmailSummaries, sendGmailMessage, markGmailRead, trashGmailMessage, fetchGmailLabels, updateGmailFlags, searchGmail, fetchGmailAttachment } from "../gmail.js";
import { requireAuth, requireCsrf } from "../auth.js";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

/** GET /api/accounts/:id/messages?mailbox=INBOX&limit=25 */
messagesRouter.get("/:id/messages", async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const mailbox = String(req.query.mailbox ?? "INBOX");
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);
  const cursor = String(req.query.cursor ?? "");
  if (cursor.length > 2048 || (account.authType !== "google_oauth" && cursor && !/^\d+$/.test(cursor))) { res.status(400).json({ error: "Invalid pagination cursor" }); return; }
  try {
    const result = account.authType === "google_oauth" ? await fetchGmailSummaries(account, mailbox, limit, cursor || undefined) : await fetchSummaries(account, mailbox, limit, Number(cursor || 0));
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: "Mail fetch failed", message: (e as Error).message });
  }
});

/** GET /api/accounts/:id/messages/:uid?mailbox=INBOX */
messagesRouter.get("/:id/messages/:uid", async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const uid = req.params.uid;
  if (!uid || (account.authType !== "google_oauth" && !/^\d+$/.test(uid))) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const mailbox = String(req.query.mailbox ?? "INBOX");
  try {
    const message = account.authType === "google_oauth" ? await fetchGmailDetail(account, uid) : await fetchDetail(account, mailbox, uid);
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json({ message });
  } catch (e) {
    res.status(502).json({ error: "Mail fetch failed", message: (e as Error).message });
  }
});

const sendSchema = z.object({
  to: z.string().min(1),
  subject: z.string().default(""),
  text: z.string().default(""),
  html: z.string().optional(),
  attachments: z.array(z.object({ filename: z.string().min(1).max(255), contentType: z.string().max(150), data: z.string().max(14_000_000) })).max(5).optional(),
});

/** POST /api/accounts/:id/send */
messagesRouter.post("/:id/send", requireCsrf, async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message", details: parsed.error.issues });
    return;
  }
  if ((parsed.data.attachments ?? []).reduce((total, item) => total + Buffer.byteLength(item.data, "base64"), 0) > 10 * 1024 * 1024) { res.status(413).json({ error: "Pièces jointes limitées à 10 Mo au total" }); return; }
  try {
    const result = account.authType === "google_oauth" ? await sendGmailMessage(account, parsed.data) : await sendMessage(account, parsed.data);
    res.status(201).json(result);
  } catch (e) {
    res.status(502).json({ error: "Mail send failed", message: (e as Error).message });
  }
});

/** POST /api/accounts/:id/messages/:uid/read */
messagesRouter.post("/:id/messages/:uid/read", requireCsrf, async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const uid = req.params.uid;
  if (!uid || (account.authType !== "google_oauth" && !/^\d+$/.test(uid))) {
    res.status(400).json({ error: "Invalid uid" }); return;
  }
  try {
    if (account.authType === "google_oauth") await markGmailRead(account, uid);
    else await markImapRead(account, String(req.query.mailbox ?? "INBOX"), uid);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: "Unable to mark read", message: (e as Error).message }); }
});

/** POST /api/accounts/:id/messages/:uid/trash — reversible trash, not permanent deletion */
messagesRouter.post("/:id/messages/:uid/trash", requireCsrf, async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const uid = req.params.uid;
  if (!uid || (account.authType !== "google_oauth" && !/^\d+$/.test(uid))) {
    res.status(400).json({ error: "Invalid uid" }); return;
  }
  try {
    if (account.authType === "google_oauth") await trashGmailMessage(account, uid);
    else await trashImapMessage(account, String(req.query.mailbox ?? "INBOX"), uid);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: "Unable to move to Trash", message: (e as Error).message }); }
});

/** GET /api/accounts/:id/labels */
messagesRouter.get("/:id/labels", async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  try {
    const labels = account.authType === "google_oauth"
      ? await fetchGmailLabels(account)
      : await fetchImapLabels(account);
    res.json({ labels });
  } catch (error) {
    res.status(502).json({ error: "Unable to fetch labels", message: (error as Error).message });
  }
});

const actionSchema = z.object({ action: z.enum(["read", "unread", "star", "unstar", "archive"]) });
messagesRouter.post("/:id/messages/:uid/action", requireCsrf, async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid action" }); return; }
  const uid = req.params.uid;
  if (!uid || (account.authType !== "google_oauth" && !/^\d+$/.test(uid))) { res.status(400).json({ error: "Invalid uid" }); return; }
  try {
    if (account.authType === "google_oauth") await updateGmailFlags(account, uid, parsed.data.action);
    else await updateImapFlags(account, String(req.query.mailbox ?? "INBOX"), uid, parsed.data.action);
    res.json({ ok: true });
  } catch (error) { res.status(502).json({ error: "Message action failed", message: (error as Error).message }); }
});

messagesRouter.get("/:id/search", async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const q = String(req.query.q ?? "").trim().slice(0, 250);
  if (q.length < 2) { res.status(400).json({ error: "Recherche trop courte" }); return; }
  try {
    const messages = account.authType === "google_oauth" ? await searchGmail(account, q, 50) : await searchImap(account, q, 50);
    res.json({ messages });
  } catch (error) { res.status(502).json({ error: "Search failed", message: (error as Error).message }); }
});

messagesRouter.get("/:id/messages/:uid/attachments/:attachmentId", async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const { uid, attachmentId } = req.params;
  if (!uid || (account.authType !== "google_oauth" && !/^\d+$/.test(uid))) { res.status(400).json({ error: "Invalid uid" }); return; }
  try {
    let content: Buffer;
    let filename = "piece-jointe";
    let contentType = "application/octet-stream";
    if (account.authType === "google_oauth") {
      const detail = await fetchGmailDetail(account, uid);
      const attachment = detail?.attachments?.find(a => a.id === attachmentId);
      if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }
      filename = attachment.filename; contentType = attachment.contentType;
      content = await fetchGmailAttachment(account, uid, attachmentId);
    } else {
      if (!/^\d+$/.test(attachmentId)) { res.status(400).json({ error: "Invalid attachment id" }); return; }
      const result = await fetchImapAttachment(account, String(req.query.mailbox ?? "INBOX"), uid, Number(attachmentId));
      content = result.content; filename = result.filename; contentType = result.contentType;
    }
    if (content.length > 25 * 1024 * 1024) { res.status(413).json({ error: "Attachment too large" }); return; }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename.replace(/[\r\n]/g, ""))}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(content);
  } catch (error) { res.status(502).json({ error: "Attachment download failed", message: (error as Error).message }); }
});
