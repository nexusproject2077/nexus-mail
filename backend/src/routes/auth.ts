import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { login, logout, requireAuth, requireCsrf, verifyPassword } from "../auth.js";

export const authRouter = Router();
const loginSchema = z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(1024) });
const attempts = new Map<string, { count: number; resetAt: number }>();

authRouter.post("/login", async (req, res) => {
  const key = String(req.ip ?? "unknown");
  const state = attempts.get(key);
  if (state && state.resetAt > Date.now() && state.count >= 8) { res.status(429).json({ error: "Too many login attempts" }); return; }
  const parsed = loginSchema.safeParse(req.body);
  const ok = parsed.success
    ? parsed.data.username === config.authUsername && await verifyPassword(parsed.data.password)
    : false;
  if (!ok) {
    attempts.set(key, { count: (state?.resetAt && state.resetAt > Date.now() ? state.count : 0) + 1, resetAt: Date.now() + 15 * 60 * 1000 });
    res.status(401).json({ error: "Invalid credentials" }); return;
  }
  attempts.delete(key);
  res.json(login(res));
});

authRouter.get("/session", requireAuth, (req, res) => {
  res.json({ authenticated: true, username: config.authUsername, csrfToken: req.auth!.csrfToken });
});
authRouter.post("/logout", requireAuth, requireCsrf, (req, res) => { logout(req, res); res.status(204).end(); });
