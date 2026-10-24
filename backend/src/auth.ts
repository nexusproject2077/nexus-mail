import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { createSession, deleteSession, getSession } from "./db.js";

const SESSION_COOKIE = "nexus_mail_session";

declare module "express-serve-static-core" {
  interface Request { auth?: { ownerId: string; tokenHash: string; csrfToken: string } }
}

function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function cookies(req: Request) {
  return Object.fromEntries((req.headers.cookie ?? "").split(";").map((part) => {
    const at = part.indexOf("=");
    return at < 0 ? [] : [part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1).trim())];
  }).filter((entry): entry is [string, string] => entry.length === 2));
}
function cookie(res: Response, value: string, maxAge?: number) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, `Path=${config.cookiePath}`, "HttpOnly", "SameSite=None"];
  if (config.cookieSecure) parts.push("Secure");
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  res.append("Set-Cookie", parts.join("; "));
}

export async function verifyPassword(password: string): Promise<boolean> {
  // Stored as scrypt$N$r$p$saltBase64$derivedKeyBase64. The password itself is never stored.
  const [kind, n, r, p, salt, expected] = config.authPasswordHash.split("$");
  if (kind !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, Buffer.from(salt, "base64"), Buffer.from(expected, "base64").length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
  const target = Buffer.from(expected, "base64");
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) { res.status(401).json({ error: "Authentication required" }); return; }
  const tokenHash = sha256(token);
  const session = getSession(tokenHash);
  if (!session || session.expires_at <= Date.now()) {
    if (session) deleteSession(tokenHash);
    cookie(res, "", 0);
    res.status(401).json({ error: "Session expired" }); return;
  }
  req.auth = { ownerId: session.owner_id, tokenHash, csrfToken: session.csrf_token };
  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const received = req.header("X-CSRF-Token");
  const expected = req.auth?.csrfToken;
  if (!expected || !received || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    res.status(403).json({ error: "Invalid CSRF token" }); return;
  }
  next();
}

export function login(res: Response) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + config.sessionTtlHours * 60 * 60 * 1000;
  createSession(sha256(token), csrfToken, config.authUserId, expiresAt);
  cookie(res, token, Math.floor((expiresAt - Date.now()) / 1000));
  return { csrfToken, username: config.authUsername, expiresAt };
}

export function logout(req: Request, res: Response) {
  if (req.auth) deleteSession(req.auth.tokenHash);
  cookie(res, "", 0);
}
