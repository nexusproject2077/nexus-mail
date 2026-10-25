import { Router } from "express";
import { z } from "zod";
import { getAccountWithSecret } from "../db.js";
import { fetchSummaries, fetchDetail, markImapRead, trashImapMessage } from "../imap.js";
import { sendMessage } from "../smtp.js";
import { fetchGmailDetail, fetchGmailSummaries, sendGmailMessage, markGmailRead, trashGmailMessage } from "../gmail.js";
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
  const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
  try {
    const messages = account.authType === "google_oauth" ? await fetchGmailSummaries(account, mailbox, limit) : await fetchSummaries(account, mailbox, limit);
    res.json({ messages });
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
  if (!uid || (account.authType !== "google_oauth" && !/^\\d+$/.test(uid))) {
    res.status(400).json({ error: "Invalid uid" }); return;
  }
  try {
    if (account.authType === "google_oauth") await markGmailRead(account, uid);
    else await markImapRead(account, "INBOX", uid);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: "Unable to mark read", message: (e as Error).message }); }
});

/** POST /api/accounts/:id/messages/:uid/trash — reversible trash, not permanent deletion */
messagesRouter.post("/:id/messages/:uid/trash", requireCsrf, async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const uid = req.params.uid;
  if (!uid || (account.authType !== "google_oauth" && !/^\\d+$/.test(uid))) {
    res.status(400).json({ error: "Invalid uid" }); return;
  }
  try {
    if (account.authType === "google_oauth") await trashGmailMessage(account, uid);
    else await trashImapMessage(account, "INBOX", uid);
    res.json({ ok: true });
  } catch (e) { res.status(502).json({ error: "Unable to move to Trash", message: (e as Error).message }); }
});
