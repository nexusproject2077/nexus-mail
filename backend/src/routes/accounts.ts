import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  listAccounts,
  insertAccount,
  deleteAccount,
  getAccountWithSecret,
  listEmailAliases, createEmailAlias, deactivateEmailAlias, getActiveEmailAlias,
} from "../db.js";
import { testConnection } from "../imap.js";
import { requireAuth, requireCsrf } from "../auth.js";
import { revokeGoogleAccess, trashGmailAlias } from "../gmail.js";

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

accountsRouter.get("/:id/aliases", (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  res.json({ aliases: listEmailAliases(req.auth!.ownerId, account.id) });
});
accountsRouter.post("/:id/aliases", requireCsrf, (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) { res.status(404).json({ error: "Account not found" }); return; }
  const parsed = z.object({ label: z.string().trim().min(1).max(80) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid alias label" }); return; }
  const at = account.email.lastIndexOf("@");
  if (at <= 0) { res.status(400).json({ error: "Cette adresse ne prend pas en charge les alias" }); return; }
  const alias = `${account.email.slice(0, at).replace(/\+.*/, "")}+nexus-${randomUUID().replace(/-/g, "").slice(0, 10)}${account.email.slice(at)}`;
  res.status(201).json({ alias: createEmailAlias(req.auth!.ownerId, account.id, alias, parsed.data.label) });
});
accountsRouter.post("/:id/aliases/:aliasId/deactivate", requireCsrf, (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  const alias = getActiveEmailAlias(req.auth!.ownerId, req.params.id, req.params.aliasId);
  if (!account || !alias) { res.status(404).json({ error: "Alias not found or already disabled" }); return; }
  void (async () => {
    try {
      const filterId = account.authType === "google_oauth" ? await trashGmailAlias(account, alias.alias) : undefined;
      if (!deactivateEmailAlias(req.auth!.ownerId, req.params.id, req.params.aliasId, filterId)) throw new Error("L'alias a changé d'état.");
      res.json({ ok: true, gmailFilterCreated: Boolean(filterId) });
    } catch (error) { res.status(502).json({ error: "Impossible d'activer le filtre anti-spam", message: (error as Error).message }); }
  })();
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
    await testConnection({ ...input, id: "probe", createdAt: "", authType: "password" });
  } catch (e) {
    res.status(400).json({
      error: "IMAP connection failed",
      message: (e as Error).message,
    });
    return;
  }
  const account = insertAccount({ ...input, authType: "password" }, req.auth!.ownerId);
  res.status(201).json({ account });
});

accountsRouter.delete("/:id", requireCsrf, async (req, res) => {
  const account = getAccountWithSecret(req.params.id, req.auth!.ownerId);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  if (account.authType === "google_oauth") await revokeGoogleAccess(account);
  deleteAccount(req.params.id, req.auth!.ownerId);
  res.status(204).end();
});
