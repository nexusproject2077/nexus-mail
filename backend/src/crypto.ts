import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { config } from "./config.js";

/**
 * Symmetric encryption for credentials at rest (AES-256-GCM).
 *
 * IMAP/SMTP passwords are never stored in plaintext: the frontend sends them
 * once, the backend seals them under a key derived from `APP_SECRET`, and only
 * unseals them in memory when opening a connection to the mail server.
 */

const KEY = scryptSync(config.appSecret, "nexus-mail-cred-salt", 32);

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv.tag.ciphertext, all base64.
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(sealed: string): string {
  const [ivB64, tagB64, dataB64] = sealed.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    KEY,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
