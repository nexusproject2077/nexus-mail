import { Router } from "express";
import { z } from "zod";
import { getAccountWithSecret } from "../db.js";
import { fetchSummaries, fetchDetail } from "../imap.js";
import { sendMessage } from "../smtp.js";
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
    const messages = await fetchSummaries(account, mailbox, limit);
    res.json({ messages });
  } catch (e) {
    res.status(502).json({ error: "IMAP fetch failed", message: (e as Error).message });
  }
});

/** GET /api/accounts/:id/messages/:uid?mailbox=INBOX */
messagesRouter.get("/:id/messages/:uid", async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const uid = Number(req.params.uid);
  if (!Number.isInteger(uid)) {
    res.status(400).json({ error: "Invalid uid" });
    return;
  }
  const mailbox = String(req.query.mailbox ?? "INBOX");
  try {
    const message = await fetchDetail(account, mailbox, uid);
    if (!message) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    res.json({ message });
  } catch (e) {
    res.status(502).json({ error: "IMAP fetch failed", message: (e as Error).message });
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
    const result = await sendMessage(account, parsed.data);
    res.status(201).json(result);
  } catch (e) {
    res.status(502).json({ error: "SMTP send failed", message: (e as Error).message });
  }
});
