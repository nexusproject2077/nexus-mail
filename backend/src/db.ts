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
    created_at   TEXT NOT NULL
  );
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
    createdAt: r.created_at,
  };
}

function strip(a: Account): PublicAccount {
  const { password: _password, ...pub } = a;
  return pub;
}

export function listAccounts(): PublicAccount[] {
  const rows = db.prepare("SELECT * FROM accounts ORDER BY created_at").all() as Row[];
  return rows.map((r) => strip(rowToAccount(r)));
}

/** Internal: full account with decrypted password (for opening connections). */
export function getAccountWithSecret(id: string): Account | null {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? rowToAccount(row) : null;
}

export function insertAccount(
  input: Omit<Account, "id" | "createdAt">,
): PublicAccount {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO accounts
      (id, label, email, imap_host, imap_port, imap_secure,
       smtp_host, smtp_port, smtp_secure, username, enc_password, created_at)
     VALUES (@id, @label, @email, @imapHost, @imapPort, @imapSecure,
       @smtpHost, @smtpPort, @smtpSecure, @username, @encPassword, @createdAt)`,
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
    createdAt,
  });
  return strip({ ...input, id, createdAt });
}

export function deleteAccount(id: string): boolean {
  const info = db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  return info.changes > 0;
}
