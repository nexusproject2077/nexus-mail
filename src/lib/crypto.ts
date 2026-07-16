/**
 * Nexus Mail — Zero-Access E2EE core.
 *
 * All cryptography here runs entirely in the browser. The server (when one
 * exists) only ever sees the armored ciphertext produced by these functions.
 *
 * Two encryption modes are supported:
 *
 *  - `pgp`          Public-key encryption to a recipient's OpenPGP key,
 *                   signed by the sender. This is the default E2EE path.
 *  - `confidential` Password-based (symmetric) encryption with an optional
 *                   expiry, mirroring Gmail's "Confidential Mode". The passcode
 *                   is shared out-of-band. Expiry is enforced by the client:
 *                   the authoritative `expiresAt` is sealed *inside* the
 *                   ciphertext so it cannot be extended without the passcode.
 *
 * openpgp is imported lazily inside each function so the module never loads
 * during static prerendering (the app ships as a static export).
 */

export type EncryptionMode = "pgp" | "confidential";

/** A generated (or imported) OpenPGP identity, all fields armored. */
export interface Identity {
  /** Passphrase-protected private key, ASCII-armored. */
  privateKey: string;
  /** Public key, ASCII-armored — safe to share. */
  publicKey: string;
  /** Human-readable key fingerprint (uppercase hex, space-grouped). */
  fingerprint: string;
  name: string;
  email: string;
  createdAt: string;
}

/**
 * Envelope stored as an email body. Everything here is safe for the server to
 * see — the payload is already encrypted and the metadata only aids display.
 */
export interface EncryptedEnvelope {
  nexus: "e2ee";
  v: 1;
  mode: EncryptionMode;
  /** ASCII-armored OpenPGP message. */
  armored: string;
  /** ISO timestamp after which the client refuses to decrypt (display copy). */
  expiresAt?: string;
  /** True when a passcode is required (confidential mode). */
  requiresPasscode: boolean;
  /** Non-sensitive hint about the intended recipient, for the UI. */
  recipientHint?: string;
}

/** Sealed plaintext — what actually gets encrypted. */
interface SealedPayload {
  text: string;
  /** Authoritative expiry, sealed so it cannot be tampered with. */
  expiresAt?: string;
  subject?: string;
}

const ENVELOPE_MARKER = '"nexus":"e2ee"';

async function pgp() {
  return import("openpgp");
}

/** Format an OpenPGP fingerprint (40 hex chars) into grouped uppercase. */
function formatFingerprint(fp: string): string {
  const up = fp.toUpperCase();
  return up.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Generate a fresh Curve25519 OpenPGP identity. The private key is encrypted
 * at rest with `passphrase` and never leaves the device unprotected.
 */
export async function generateIdentity(
  name: string,
  email: string,
  passphrase: string,
): Promise<Identity> {
  const openpgp = await pgp();
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name, email }],
    passphrase,
    format: "armored",
  });
  const key = await openpgp.readKey({ armoredKey: publicKey });
  return {
    privateKey,
    publicKey,
    fingerprint: formatFingerprint(key.getFingerprint()),
    name,
    email,
    createdAt: new Date().toISOString(),
  };
}

/** Validate & normalize a pasted armored public key, returning its identity. */
export async function inspectPublicKey(
  armoredKey: string,
): Promise<{ fingerprint: string; userId: string }> {
  const openpgp = await pgp();
  const key = await openpgp.readKey({ armoredKey });
  const primaryUser = await key.getPrimaryUser();
  return {
    fingerprint: formatFingerprint(key.getFingerprint()),
    userId: primaryUser.user.userID?.userID ?? "clé inconnue",
  };
}

/** Decrypt (unlock) an armored private key with its passphrase. */
async function unlockPrivateKey(armoredKey: string, passphrase: string) {
  const openpgp = await pgp();
  return openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey }),
    passphrase,
  });
}

/** Return true if `passphrase` successfully unlocks the identity's key. */
export async function verifyPassphrase(
  identity: Identity,
  passphrase: string,
): Promise<boolean> {
  try {
    await unlockPrivateKey(identity.privateKey, passphrase);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt with public-key E2EE to `recipientPublicKey`, signed by the sender's
 * unlocked identity. Returns a serialized {@link EncryptedEnvelope}.
 */
export async function encryptToKey(
  text: string,
  recipientPublicKey: string,
  sender: { identity: Identity; passphrase: string },
  opts: { subject?: string; expiresAt?: string; recipientHint?: string } = {},
): Promise<string> {
  const openpgp = await pgp();
  const payload: SealedPayload = {
    text,
    expiresAt: opts.expiresAt,
    subject: opts.subject,
  };
  const signingKey = await unlockPrivateKey(
    sender.identity.privateKey,
    sender.passphrase,
  );
  const armored = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: JSON.stringify(payload) }),
    encryptionKeys: await openpgp.readKey({ armoredKey: recipientPublicKey }),
    signingKeys: signingKey,
  });
  const envelope: EncryptedEnvelope = {
    nexus: "e2ee",
    v: 1,
    mode: "pgp",
    armored: armored as string,
    expiresAt: opts.expiresAt,
    requiresPasscode: false,
    recipientHint: opts.recipientHint,
  };
  return JSON.stringify(envelope);
}

/**
 * Confidential Mode: symmetric encryption under a shared `passcode`. The
 * authoritative expiry is sealed inside the ciphertext.
 */
export async function encryptConfidential(
  text: string,
  passcode: string,
  opts: { subject?: string; expiresAt?: string; recipientHint?: string } = {},
): Promise<string> {
  const openpgp = await pgp();
  const payload: SealedPayload = {
    text,
    expiresAt: opts.expiresAt,
    subject: opts.subject,
  };
  const armored = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: JSON.stringify(payload) }),
    passwords: [passcode],
  });
  const envelope: EncryptedEnvelope = {
    nexus: "e2ee",
    v: 1,
    mode: "confidential",
    armored: armored as string,
    expiresAt: opts.expiresAt,
    requiresPasscode: true,
    recipientHint: opts.recipientHint,
  };
  return JSON.stringify(envelope);
}

export class MessageExpiredError extends Error {
  constructor() {
    super("Ce message confidentiel a expiré et ne peut plus être déchiffré.");
    this.name = "MessageExpiredError";
  }
}

export interface DecryptResult {
  text: string;
  /** True if a valid signature from the expected key was verified. */
  signatureVerified: boolean;
  expiresAt?: string;
  subject?: string;
}

/** True when `body` looks like a Nexus encrypted envelope. */
export function isEncryptedBody(body: string | undefined): boolean {
  return !!body && body.includes(ENVELOPE_MARKER);
}

/** Parse a serialized envelope, or return null if it isn't one. */
export function parseEnvelope(body: string | undefined): EncryptedEnvelope | null {
  if (!isEncryptedBody(body)) return null;
  try {
    const parsed = JSON.parse(body as string);
    if (parsed?.nexus === "e2ee") return parsed as EncryptedEnvelope;
  } catch {
    /* not JSON */
  }
  return null;
}

function assertNotExpired(expiresAt?: string) {
  if (expiresAt && Date.now() > new Date(expiresAt).getTime()) {
    throw new MessageExpiredError();
  }
}

/** Decrypt a Confidential Mode envelope with its passcode. */
export async function decryptConfidential(
  envelope: EncryptedEnvelope,
  passcode: string,
): Promise<DecryptResult> {
  assertNotExpired(envelope.expiresAt);
  const openpgp = await pgp();
  const { data } = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: envelope.armored }),
    passwords: [passcode],
  });
  const payload = JSON.parse(data as string) as SealedPayload;
  assertNotExpired(payload.expiresAt); // sealed, authoritative copy
  return {
    text: payload.text,
    signatureVerified: false,
    expiresAt: payload.expiresAt,
    subject: payload.subject,
  };
}

/**
 * Decrypt a public-key E2EE envelope with the recipient's unlocked identity,
 * verifying the sender's signature when their public key is provided.
 */
export async function decryptWithKey(
  envelope: EncryptedEnvelope,
  recipient: { identity: Identity; passphrase: string },
  senderPublicKey?: string,
): Promise<DecryptResult> {
  assertNotExpired(envelope.expiresAt);
  const openpgp = await pgp();
  const decryptionKey = await unlockPrivateKey(
    recipient.identity.privateKey,
    recipient.passphrase,
  );
  const result = await openpgp.decrypt({
    message: await openpgp.readMessage({ armoredMessage: envelope.armored }),
    decryptionKeys: decryptionKey,
    verificationKeys: senderPublicKey
      ? await openpgp.readKey({ armoredKey: senderPublicKey })
      : undefined,
    expectSigned: false,
  });
  let signatureVerified = false;
  if (senderPublicKey && result.signatures.length > 0) {
    try {
      await result.signatures[0].verified;
      signatureVerified = true;
    } catch {
      signatureVerified = false;
    }
  }
  const payload = JSON.parse(result.data as string) as SealedPayload;
  assertNotExpired(payload.expiresAt);
  return {
    text: payload.text,
    signatureVerified,
    expiresAt: payload.expiresAt,
    subject: payload.subject,
  };
}
