import { randomBytes } from "node:crypto";
import { Router } from "express";
import { config } from "../config.js";
import { requireAuth } from "../auth.js";
import { consumeOAuthState, createOAuthState, insertGoogleAccount } from "../db.js";

export const googleOAuthRouter = Router();
const scopes = ["openid", "email", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"];
function configured() { return Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri && config.oauthSuccessRedirect); }

googleOAuthRouter.get("/google/start", requireAuth, (req, res) => {
  if (!configured()) { res.status(503).json({ error: "Google OAuth is not configured on this server." }); return; }
  const state = randomBytes(32).toString("base64url");
  createOAuthState(state, req.auth!.ownerId, req.auth!.tokenHash, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: config.googleRedirectUri, response_type: "code", scope: scopes.join(" "), state, access_type: "offline", prompt: "consent", include_granted_scopes: "true" });
  res.json({ authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

googleOAuthRouter.get("/google/callback", requireAuth, async (req, res) => {
  const redirect = new URL(config.oauthSuccessRedirect);
  const finish = (status: string) => { redirect.searchParams.set("google", status); res.redirect(303, redirect.toString()); };
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const record = state ? consumeOAuthState(state) : undefined;
  if (!record || record.owner_id !== req.auth!.ownerId || record.session_token_hash !== req.auth!.tokenHash) { finish("state_invalid"); return; }
  if (req.query.error) { finish("denied"); return; }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) { finish("failed"); return; }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: config.googleRedirectUri, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string };
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token) throw new Error("No refresh token returned");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json() as { email?: string; name?: string };
    if (!profileResponse.ok || !profile.email) throw new Error("No Google email returned");
    insertGoogleAccount({ email: profile.email, label: profile.name || "Gmail", refreshToken: tokens.refresh_token }, record.owner_id);
    finish("connected");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown OAuth callback error";
    console.error("[Google OAuth callback] Connection failed:", reason);
    finish("failed");
  }
});
