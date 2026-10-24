import { Router } from "express";
import { z } from "zod";
import {
  listAccounts,
  insertAccount,
  deleteAccount,
  getAccountWithSecret,
} from "../db.js";
import { testConnection } from "../imap.js";
import { requireAuth, requireCsrf } from "../auth.js";

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

const createSchema = z.object({
  label: z.string().min(1),
  email: z.string().email(),
  imapHost: z.string().min(1),
  imapPort: z.number().int().positive().default(993),
  imapSecure: z.boolean().default(true),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().positive().default(465),
  smtpSecure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
});

accountsRouter.get("/", (req, res) => {
  res.json({ accounts: listAccounts(req.auth!.ownerId) });
});

accountsRouter.post("/", requireCsrf, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid account", details: parsed.error.issues });
    return;
  }
  const input = parsed.data;
  // Verify IMAP credentials before persisting anything.
  try {
    await testConnection({ ...input, id: "probe", createdAt: "" });
  } catch (e) {
    res.status(400).json({
      error: "IMAP connection failed",
      message: (e as Error).message,
    });
    return;
  }
  const account = insertAccount(input, req.auth!.ownerId);
  res.status(201).json({ account });
});

accountsRouter.delete("/:id", requireCsrf, (req, res) => {
  if (!getAccountWithSecret(req.params.id, req.auth!.ownerId)) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  deleteAccount(req.params.id, req.auth!.ownerId);
  res.status(204).end();
});
