"use client";

import { useMemo, useState } from "react";
import {
  Lock,
  ShieldCheck,
  ShieldAlert,
  Timer,
  Unlock,
  KeyRound,
  BadgeCheck,
  Loader2,
} from "lucide-react";
import {
  parseEnvelope,
  decryptConfidential,
  decryptWithKey,
  MessageExpiredError,
  type DecryptResult,
} from "@/lib/crypto";
import { useVault } from "@/lib/vault";
import { formatFullDate } from "@/lib/utils";

interface EncryptedMessageProps {
  body: string;
  /** Opens the security/keys panel (needed to unlock for PGP messages). */
  onNeedUnlock: () => void;
}

export default function EncryptedMessage({
  body,
  onNeedUnlock,
}: EncryptedMessageProps) {
  const envelope = useMemo(() => parseEnvelope(body), [body]);
  const { identity, isUnlocked, passphrase } = useVault();

  const [passcode, setPasscode] = useState("");
  const [result, setResult] = useState<DecryptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Snapshot "now" once at mount for the expiry banner; decryption itself
  // re-checks against the live clock (and the sealed expiry) in crypto.ts.
  const [now] = useState(() => Date.now());

  if (!envelope) {
    return (
      <div className="text-sm text-nexus-text-dim italic">
        Contenu chiffré illisible.
      </div>
    );
  }

  const expired =
    !!envelope.expiresAt && now > new Date(envelope.expiresAt).getTime();

  const handleDecrypt = async () => {
    setError(null);
    setBusy(true);
    try {
      let res: DecryptResult;
      if (envelope.mode === "confidential") {
        res = await decryptConfidential(envelope, passcode);
      } else {
        if (!identity || !passphrase) {
          onNeedUnlock();
          return;
        }
        res = await decryptWithKey(
          envelope,
          { identity, passphrase },
          identity.publicKey,
        );
      }
      setResult(res);
      setPasscode("");
    } catch (e) {
      if (e instanceof MessageExpiredError) {
        setError(e.message);
      } else if (envelope.mode === "confidential") {
        setError("Passcode incorrect ou message illisible.");
      } else {
        setError(`Déchiffrement impossible : ${(e as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // Decrypted view.
  if (result) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="flex items-center gap-1 text-green-400 font-medium">
            <Unlock size={12} /> Déchiffré
          </span>
          {result.signatureVerified && (
            <span className="flex items-center gap-1 text-nexus-primary-light">
              <BadgeCheck size={12} /> Signature vérifiée
            </span>
          )}
        </div>
        <div className="text-sm text-nexus-text leading-relaxed whitespace-pre-wrap bg-nexus-surface-hover/30 rounded-xl p-4">
          {result.text}
        </div>
      </div>
    );
  }

  const modeLabel =
    envelope.mode === "confidential"
      ? "Mode confidentiel · passcode requis"
      : "Chiffré de bout en bout (clé publique)";

  return (
    <div className="rounded-xl border border-nexus-primary/30 bg-nexus-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-nexus-primary/15 flex items-center justify-center">
          <Lock size={15} className="text-nexus-primary-light" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-nexus-text">{modeLabel}</div>
          {envelope.recipientHint && (
            <div className="text-[11px] text-nexus-text-dim truncate">
              Pour : {envelope.recipientHint}
            </div>
          )}
        </div>
      </div>

      {envelope.expiresAt && (
        <div
          className={`flex items-center gap-1.5 text-[11px] mb-3 ${
            expired ? "text-red-400" : "text-yellow-400"
          }`}
        >
          <Timer size={12} />
          {expired
            ? "Expiré — ne peut plus être déchiffré"
            : `Expire le ${formatFullDate(envelope.expiresAt)}`}
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-400">
          <ShieldAlert size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {expired ? null : envelope.mode === "confidential" ? (
        <div className="flex gap-2">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && passcode && handleDecrypt()}
            placeholder="Passcode"
            className="flex-1 bg-nexus-bg border border-nexus-border rounded-xl px-3 py-2 text-sm text-nexus-text outline-none focus:border-nexus-primary transition-colors placeholder:text-nexus-text-dim"
          />
          <button
            onClick={handleDecrypt}
            disabled={busy || !passcode}
            className="flex items-center gap-1.5 px-4 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 text-black rounded-xl text-sm font-medium transition-colors"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
            Ouvrir
          </button>
        </div>
      ) : !identity ? (
        <button
          onClick={onNeedUnlock}
          className="flex items-center gap-2 px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-dark text-black rounded-xl text-sm font-medium transition-colors"
        >
          <KeyRound size={15} /> Créer une identité pour déchiffrer
        </button>
      ) : !isUnlocked ? (
        <button
          onClick={onNeedUnlock}
          className="flex items-center gap-2 px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-dark text-black rounded-xl text-sm font-medium transition-colors"
        >
          <Unlock size={15} /> Déverrouiller mon identité
        </button>
      ) : (
        <button
          onClick={handleDecrypt}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 text-black rounded-xl text-sm font-medium transition-colors"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          Déchiffrer le message
        </button>
      )}
    </div>
  );
}
