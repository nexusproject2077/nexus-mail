import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import { encryptSecret, decryptSecret } from "./crypto.js";
import type { Account, PublicAccount } from "./types.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id           TEXT PRIMARY KEY,
    label        TEXT NOT NULL,
    email        TEXT NOT NULL,
    imap_host    TEXT NOT NULL,
    imap_port    INTEGER NOT NULL,
    imap_secure  INTEGER NOT NULL,
    smtp_host    TEXT NOT NULL,
    smtp_port    INTEGER NOT NULL,
    smtp_secure  INTEGER NOT NULL,
    username     TEXT NOT NULL,
    enc_password TEXT NOT NULL,
    auth_type    TEXT NOT NULL DEFAULT 'password',
    enc_refresh_token TEXT,
    owner_id     TEXT,
    created_at   TEXT NOT NULL
  );
`);

// Existing single-user installations retain their accounts, but they become
// visible only to the configured owner once authentication is enabled.
const columns = db.prepare("PRAGMA table_info(accounts)").all() as { name: string }[];
if (!columns.some((column) => column.name === "owner_id")) {
  db.exec("ALTER TABLE accounts ADD COLUMN owner_id TEXT");
}
if (!columns.some((column) => column.name === "auth_type")) db.exec("ALTER TABLE accounts ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'password'");
if (!columns.some((column) => column.name === "enc_refresh_token")) db.exec("ALTER TABLE accounts ADD COLUMN enc_refresh_token TEXT");
db.prepare("UPDATE accounts SET owner_id = ? WHERE owner_id IS NULL").run(config.authUserId);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);

interface Row {
  id: string;
  label: string;
  email: string;
  imap_host: string;
  imap_port: number;
  imap_secure: number;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: number;
  username: string;
  enc_password: string;
  auth_type?: "password" | "google_oauth";
  enc_refresh_token?: string | null;
  created_at: string;
}

function rowToAccount(r: Row): Account {
  return {
    id: r.id,
    label: r.label,
    email: r.email,
    imapHost: r.imap_host,
    imapPort: r.imap_port,
    imapSecure: !!r.imap_secure,
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
    smtpSecure: !!r.smtp_secure,
    username: r.username,
    password: decryptSecret(r.enc_password),
    authType: r.auth_type === "google_oauth" ? "google_oauth" : "password",
    refreshToken: r.enc_refresh_token ? decryptSecret(r.enc_refresh_token) : undefined,
    createdAt: r.created_at,
  };
}

function strip(a: Account): PublicAccount {
  const { password: _password, refreshToken: _refreshToken, ...pub } = a;
  return pub;
}

export function listAccounts(ownerId: string): PublicAccount[] {
  const rows = db.prepare("SELECT * FROM accounts WHERE owner_id = ? ORDER BY created_at").all(ownerId) as Row[];
  return rows.map((r) => strip(rowToAccount(r)));
}

/** Internal: full account with decrypted password (for opening connections). */
export function getAccountWithSecret(id: string, ownerId: string): Account | null {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ? AND owner_id = ?").get(id, ownerId) as
    | Row
    | undefined;
  return row ? rowToAccount(row) : null;
}

export function insertAccount(
  input: Omit<Account, "id" | "createdAt">,
  ownerId: string,
): PublicAccount {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO accounts
      (id, label, email, imap_host, imap_port, imap_secure,
       smtp_host, smtp_port, smtp_secure, username, enc_password, auth_type, enc_refresh_token, owner_id, created_at)
     VALUES (@id, @label, @email, @imapHost, @imapPort, @imapSecure,
       @smtpHost, @smtpPort, @smtpSecure, @username, @encPassword, @authType, @encRefreshToken, @ownerId, @createdAt)`,
  ).run({
    id,
    label: input.label,
    email: input.email,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapSecure: input.imapSecure ? 1 : 0,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure ? 1 : 0,
    username: input.username,
    encPassword: encryptSecret(input.password),
    authType: input.authType,
    encRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    ownerId,
    createdAt,
  });
  return strip({ ...input, id, createdAt });
}

export function insertGoogleAccount(input: { label: string; email: string; refreshToken: string }, ownerId: string): PublicAccount {
  const existing = db.prepare(
    "SELECT * FROM accounts WHERE owner_id = ? AND auth_type = 'google_oauth' AND lower(email) = lower(?) ORDER BY created_at LIMIT 1",
  ).get(ownerId, input.email) as Row | undefined;
  if (existing) {
    db.prepare(
      "UPDATE accounts SET label = ?, enc_refresh_token = ? WHERE id = ? AND owner_id = ?",
    ).run(input.label, encryptSecret(input.refreshToken), existing.id, ownerId);
    return strip(rowToAccount({
      ...existing,
      label: input.label,
      enc_refresh_token: encryptSecret(input.refreshToken),
    }));
  }
  return insertAccount({
    label: input.label, email: input.email, username: input.email, password: "",
    // Compatibility metadata only; Google accounts use the Gmail API, never IMAP/SMTP.
    imapHost: "gmail.googleapis.com", imapPort: 443, imapSecure: true,
    smtpHost: "gmail.googleapis.com", smtpPort: 443, smtpSecure: true,
    authType: "google_oauth", refreshToken: input.refreshToken,
  }, ownerId);
}

export function deleteAccount(id: string, ownerId: string): boolean {
  const info = db.prepare("DELETE FROM accounts WHERE id = ? AND owner_id = ?").run(id, ownerId);
  return info.changes > 0;
}

export function createSession(tokenHash: string, csrfToken: string, ownerId: string, expiresAt: number) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, owner_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(tokenHash, ownerId, csrfToken, expiresAt, Date.now());
}

export function getSession(tokenHash: string) {
  return db.prepare("SELECT owner_id, csrf_token, expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as { owner_id: string; csrf_token: string; expires_at: number } | undefined;
}

export function deleteSession(tokenHash: string) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY, owner_id TEXT NOT NULL, session_token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS oauth_states_expiry_idx ON oauth_states(expires_at);
`);
export function createOAuthState(state: string, ownerId: string, sessionTokenHash: string, expiresAt: number) {
  db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO oauth_states (state, owner_id, session_token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(state, ownerId, sessionTokenHash, expiresAt, Date.now());
}
export function consumeOAuthState(state: string) {
  const row = db.prepare("SELECT owner_id, session_token_hash, expires_at FROM oauth_states WHERE state = ?").get(state) as { owner_id: string; session_token_hash: string; expires_at: number } | undefined;
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  return row && row.expires_at > Date.now() ? row : undefined;
}

/** Per-owner sender blacklist, persisted in the existing SQLite database. */
db.exec(`
  CREATE TABLE IF NOT EXISTS blocked_senders (
    owner_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (owner_id, email)
  );
`);
export function blockSender(ownerId: string, email: string): void {
  db.prepare("INSERT OR IGNORE INTO blocked_senders (owner_id, email) VALUES (?, ?)").run(ownerId, email.trim().toLowerCase());
}
export function listBlockedSenders(ownerId: string): string[] {
  return (db.prepare("SELECT email FROM blocked_senders WHERE owner_id = ? ORDER BY created_at DESC").all(ownerId) as { email: string }[]).map(row => row.email);
}
