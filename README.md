# Nexus Mail

A privacy-first, open-source email client with a clean, Gmail-like interface.
It pairs client-side **Zero-Access end-to-end encryption** with an optional,
**self-hostable Node/IMAP/SMTP backend** so you can bring in real accounts
(Gmail included) without vendor lock-in.

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

## Self-hostable mail engine — real Gmail/IMAP (implemented)

A Node backend ([`backend/`](backend/)) connects to any IMAP/SMTP provider
(Gmail included) so real mail lands in the inbox. It is optional: with no
backend configured the app runs standalone with sample data + local E2EE.

- **Backend** — Express + TypeScript. Fetches mail with
  [`imapflow`](https://imapflow.com/) + [`mailparser`](https://nodemailer.com/extras/mailparser/),
  sends with `nodemailer`, and stores accounts in SQLite. **IMAP/SMTP passwords
  are encrypted at rest (AES-256-GCM)** with a key derived from `APP_SECRET`;
  they are only unsealed in memory to open a connection.
- **Frontend** — set `NEXT_PUBLIC_API_URL` to the backend. Add accounts via the
  **Comptes** button (a Gmail preset is included), then the inbox shows live
  mail with a refresh control. Message bodies are fetched on open. When no
  account is configured the app falls back to the sample inbox.
- **API** — `GET /api/health`, `GET/POST/DELETE /api/accounts`,
  `GET /api/accounts/:id/messages`, `GET /api/accounts/:id/messages/:uid`,
  `POST /api/accounts/:id/send`.

> **Gmail:** enable 2-Step Verification and create an **App Password** — a normal
> password will not authenticate over IMAP.

### Self-host with Docker

```bash
cp .env.example .env      # set a strong APP_SECRET
docker compose up -d --build
# open http://localhost:3000  (backend on :4000)
```

`docker-compose.yml` builds the backend and serves the static frontend (nginx)
with `NEXT_PUBLIC_API_URL` baked in and an empty base path. Account data lives in
the `nexus-data` volume.

### Run the backend directly

```bash
cd backend
cp .env.example .env      # set APP_SECRET
npm install
npm run dev               # API on http://localhost:4000
```

## Roadmap (from the product spec)

Implemented: **Phase 1 #1** (E2EE + Confidential Mode) and the **self-hostable
Node/IMAP/SMTP backend** with a unified live inbox and Docker Compose. Still
future work: local AI/vector search, robust account recovery, spam killer,
offline sync, teams/shared inboxes, aliases/burners, and native mobile apps.
Current IMAP scope covers the inbox (fetch/read) and SMTP send; sent/drafts/trash
folders and background sync are not backed by IMAP yet.

## Getting Started (frontend)

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static export to out/ (GitHub Pages)
```

Built with Next.js (App Router, static export), React 19, Tailwind CSS v4,
OpenPGP.js, and a Node/Express + imapflow backend.
