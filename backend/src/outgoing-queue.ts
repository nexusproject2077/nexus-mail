import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { getAccountWithSecret } from "./db.js";
import { sendGmailMessage } from "./gmail.js";
import { sendMessage } from "./smtp.js";
import type { OutgoingMessage } from "./smtp.js";

// Durable queue: SQLite lives on the VPS, never in the browser.
// A message is claimed atomically before any external send.
const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS outgoing_queue (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, account_id TEXT NOT NULL,
  payload TEXT NOT NULL, scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','failed','cancelled')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  error TEXT, sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS outgoing_queue_due_idx ON outgoing_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS outgoing_queue_owner_idx ON outgoing_queue(owner_id, account_id);
`);

export type QueueStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";
type QueueRow = { id: string; owner_id: string; account_id: string; payload: string; scheduled_at: number; status: QueueStatus; created_at: number; updated_at: number; error: string | null; sent_at: number | null };
function publicRow(row: QueueRow) {
  const payload = JSON.parse(row.payload) as OutgoingMessage;
  return { id: row.id, accountId: row.account_id, to: payload.to, subject: payload.subject,
    scheduledAt: new Date(row.scheduled_at).toISOString(), status: row.status,
    createdAt: new Date(row.created_at).toISOString(), error: row.error,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null };
}
export function listQueued(ownerId: string, accountId: string) {
  return (db.prepare("SELECT * FROM outgoing_queue WHERE owner_id = ? AND account_id = ? ORDER BY scheduled_at DESC LIMIT 200")
    .all(ownerId, accountId) as QueueRow[]).map(publicRow);
}
export function enqueue(ownerId: string, accountId: string, payload: OutgoingMessage, scheduledAt: number) {
  const now = Date.now();
  const id = randomUUID();
  db.prepare("INSERT INTO outgoing_queue (id, owner_id, account_id, payload, scheduled_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
    .run(id, ownerId, accountId, JSON.stringify(payload), scheduledAt, now, now);
  return publicRow(db.prepare("SELECT * FROM outgoing_queue WHERE id = ?").get(id) as QueueRow);
}
export function cancelQueued(ownerId: string, accountId: string, id: string): OutgoingMessage | null {
  // The conditional update is the claim boundary: once a worker switches to
  // sending, cancellation can never restore a message that may be delivered.
  const changed = db.prepare("UPDATE outgoing_queue SET status = 'cancelled', updated_at = ? WHERE id = ? AND owner_id = ? AND account_id = ? AND status = 'pending'")
    .run(Date.now(), id, ownerId, accountId).changes;
  if (!changed) return null;
  const row = db.prepare("SELECT payload FROM outgoing_queue WHERE id = ?").get(id) as { payload: string };
  return JSON.parse(row.payload) as OutgoingMessage;
}
let running = false;
export async function processQueue() {
  if (running) return;
  running = true;
  try {
    const due = db.prepare("SELECT * FROM outgoing_queue WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20")
      .all(Date.now()) as QueueRow[];
    for (const row of due) {
      const claimed = db.prepare("UPDATE outgoing_queue SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(Date.now(), row.id).changes;
      if (!claimed) continue;
      try {
        const account = getAccountWithSecret(row.account_id, row.owner_id);
        if (!account) throw new Error("Compte expéditeur introuvable");
        const payload = JSON.parse(row.payload) as OutgoingMessage;
        if (account.authType === "google_oauth") await sendGmailMessage(account, payload);
        else await sendMessage(account, payload);
        db.prepare("UPDATE outgoing_queue SET status = 'sent', sent_at = ?, updated_at = ?, error = NULL WHERE id = ?")
          .run(Date.now(), Date.now(), row.id);
      } catch (error) {
        // Never retry automatically after an ambiguous provider error: doing so
        // can duplicate a message which the provider actually accepted.
        db.prepare("UPDATE outgoing_queue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
          .run(String((error as Error).message).slice(0, 500), Date.now(), row.id);
      }
    }
  } finally { running = false; }
}
export function startQueueWorker() {
  // A 'sending' item after a process crash stays visible for manual review.
  // It is NOT silently resent (at-most-once attempt).
  void processQueue();
  const timer = setInterval(() => { void processQueue(); }, 15_000);
  timer.unref();
}
