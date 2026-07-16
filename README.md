# Nexus Mail

A privacy-first, open-source email client with a clean, Gmail-like interface.
This branch implements the crown jewel of **Phase 1: Zero-Access
end-to-end encryption**, done entirely client-side.

## Zero-Access E2EE (implemented)

All cryptography runs in the browser via [OpenPGP.js](https://openpgpjs.org/).
The server (when one exists) only ever sees ciphertext.

- **Identity & keys** — generate a Curve25519 OpenPGP identity locally. The
  private key is encrypted with your passphrase and stored only in this
  browser; the passphrase lives in memory for the session and is never
  persisted. Open it via **Sécurité & clés** (sidebar) or the shield button in
  the header. You can export your public key or import an existing keypair.
- **E2EE messages** — compose with the **E2EE** mode to encrypt to a
  recipient's public key and sign with your identity. With no recipient key on
  hand, the message is encrypted to your own key so the round trip is testable.
- **Confidential Mode** — compose with the **Confidentiel** mode for
  password-based (AES-256) encryption with an optional **expiry**. The
  authoritative expiry is sealed *inside* the ciphertext, so it cannot be
  extended without the passcode. Encrypted messages you send are stored locally
  in the **Coffre-fort** (vault) — a full encrypt → store → decrypt round trip
  with no backend.

### Try it in 30 seconds

1. `npm install && npm run dev`, open http://localhost:3000
2. The inbox ships with a **🔐 Message confidentiel de démonstration**. Open it
   and enter the passcode **`nexus2077`** to decrypt it in the browser.
3. Click **Sécurité & clés** → generate an identity, then compose a message in
   **E2EE** or **Confidentiel** mode and find it in the **Coffre-fort**.

### Crypto architecture

| Concern | Approach |
| --- | --- |
| Public-key E2EE | OpenPGP encrypt to recipient key + sign, verify on read |
| Confidential Mode | OpenPGP symmetric (password) encryption, AES-256 |
| Key storage | Passphrase-encrypted private key in `localStorage`; passphrase in memory only |
| Expiry | App-enforced, sealed inside the plaintext so it is tamper-evident |
| Envelope | JSON `{ nexus, v, mode, armored, expiresAt?, requiresPasscode }` stored as the message body |

Core modules: [`src/lib/crypto.ts`](src/lib/crypto.ts) (OpenPGP wrapper) and
[`src/lib/vault.ts`](src/lib/vault.ts) (identity + vault store).

## Roadmap (from the product spec)

Phase 1 #1 (E2EE + Confidential Mode) is implemented here. The remaining
Phase 1 and Phase 2 items — self-hostable Docker backend with IMAP/SMTP, unified
multi-account inbox, local AI/vector search, account recovery, spam killer,
offline sync, teams, aliases, mobile apps — are future work and are **not** yet
built. They require a backend service, which is out of scope for the current
static-export deployment.

## Getting Started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/ (GitHub Pages)
```

Built with Next.js (App Router, static export), React 19, Tailwind CSS v4, and
OpenPGP.js.
