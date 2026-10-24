"use client";

import { useState } from "react";
import {
  X,
  Minus,
  Send,
  Paperclip,
  Smile,
  Trash2,
  Lock,
  ShieldCheck,
  KeyRound,
  Timer,
  Loader2,
} from "lucide-react";
import { encryptToKey, encryptConfidential } from "@/lib/crypto";
import { useVault, addVaultMessage } from "@/lib/vault";
import type { Thread } from "@/types/email";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyTo?: { subject: string; to: string; messageId?: string };
  onNeedUnlock: () => void;
}

type Mode = "standard" | "pgp" | "confidential";

const EXPIRY_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "Pas d'expiration", ms: null },
  { label: "1 heure", ms: 60 * 60 * 1000 },
  { label: "24 heures", ms: 24 * 60 * 60 * 1000 },
  { label: "7 jours", ms: 7 * 24 * 60 * 60 * 1000 },
];

export default function ComposeModal({
  isOpen,
  onClose,
  replyTo,
  onNeedUnlock,
}: ComposeModalProps) {
  const { identity, isUnlocked, passphrase } = useVault();

  const [to, setTo] = useState(replyTo?.to || "");
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : "",
  );
  const [body, setBody] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [mode, setMode] = useState<Mode>("standard");
  const [recipientKey, setRecipientKey] = useState("");
  const [passcode, setPasscode] = useState("");
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setTo("");
    setSubject("");
    setBody("");
    setRecipientKey("");
    setPasscode("");
    setMode("standard");
    setExpiryIdx(0);
    setError(null);
  };

  const handleSend = async () => {
    if (!to.trim()) return;
    setError(null);

    // Standard (unencrypted) send — original mock behaviour.
    if (mode === "standard") {
      setIsSending(true);
      setTimeout(() => {
        setIsSending(false);
        onClose();
        reset();
      }, 800);
      return;
    }

    // Validate encryption prerequisites.
    if (mode === "pgp" && (!identity || !isUnlocked || !passphrase)) {
      onNeedUnlock();
      return;
    }
    if (mode === "confidential" && passcode.length < 4) {
      setError("Le passcode doit contenir au moins 4 caractères.");
      return;
    }

    setIsSending(true);
    try {
      const exp = EXPIRY_OPTIONS[expiryIdx].ms;
      const expiresAt = exp ? new Date(Date.now() + exp).toISOString() : undefined;
      let envelope: string;
      let encryption: "pgp" | "confidential";

      if (mode === "pgp") {
        // Default to the user's own public key so a round trip is testable
        // even without a second party's key on hand.
        const pubKey = recipientKey.trim() || identity!.publicKey;
        envelope = await encryptToKey(
          body,
          pubKey,
          { identity: identity!, passphrase: passphrase! },
          { subject, expiresAt, recipientHint: to.trim() },
        );
        encryption = "pgp";
      } else {
        envelope = await encryptConfidential(body, passcode, {
          subject,
          expiresAt,
          recipientHint: to.trim(),
        });
        encryption = "confidential";
      }

      const now = new Date().toISOString();
      const id = `vault_${Date.now()}`;
      const snippet =
        encryption === "confidential"
          ? "Message confidentiel chiffré (passcode requis)"
          : "Message chiffré de bout en bout";
      const thread: Thread = {
        id,
        subject: subject || "(sans objet)",
        snippet,
        date: now,
        isUnread: false,
        isStarred: false,
        labels: ["VAULT"],
        messages: [
          {
            id,
            threadId: id,
            sender: `${identity?.name ?? "Moi"} <${identity?.email ?? "moi"}>`,
            senderName: identity?.name ?? "Moi",
            senderEmail: identity?.email ?? "moi@nexus",
            toRecipients: [to.trim()],
            subject: subject || "(sans objet)",
            snippet,
            body: envelope,
            date: now,
            labelIds: ["VAULT"],
            isUnread: false,
            isStarred: false,
            isImportant: false,
            encryption,
          },
        ],
      };
      addVaultMessage(thread);
      setIsSending(false);
      onClose();
      reset();
    } catch (e) {
      setIsSending(false);
      setError(`Échec du chiffrement : ${(e as Error).message}`);
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-0 sm:right-6 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-nexus-surface border border-nexus-border rounded-t-xl px-4 py-2.5 text-sm font-medium text-nexus-text hover:bg-nexus-surface-hover transition-colors shadow-xl"
        >
          {mode !== "standard" && <Lock size={13} className="text-nexus-primary-light" />}
          <Send size={14} className="text-nexus-primary-light" />
          {subject || "Nouveau message"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-6 z-50 w-full sm:w-[min(520px,calc(100vw-3rem))] animate-fade-in">
      <div className="bg-nexus-surface border border-nexus-border rounded-t-xl shadow-2xl shadow-black/50 flex flex-col max-h-[100dvh] sm:max-h-[80dvh] min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-nexus-surface-active rounded-t-xl cursor-move">
          <span className="flex items-center gap-2 text-sm font-medium">
            {mode !== "standard" && <Lock size={13} className="text-nexus-primary-light" />}
            {replyTo ? "Répondre" : "Nouveau message"}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="border-b border-nexus-border">
          <div className="flex items-center px-4 py-2 border-b border-nexus-border/50">
            <span className="text-sm text-nexus-text-dim w-8">À</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 bg-transparent text-sm text-nexus-text outline-none placeholder:text-nexus-text-dim"
              placeholder="destinataire@email.com"
            />
          </div>
          <div className="flex items-center px-4 py-2">
            <span className="text-sm text-nexus-text-dim w-8">Obj</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-sm text-nexus-text outline-none placeholder:text-nexus-text-dim"
              placeholder="Objet du message"
            />
          </div>
        </div>

        {/* Encryption mode selector */}
        <div className="px-4 py-2.5 border-b border-nexus-border bg-nexus-bg/40">
          <div className="flex gap-1 p-1 bg-nexus-bg rounded-xl">
            <ModeButton
              active={mode === "standard"}
              onClick={() => setMode("standard")}
              icon={<Send size={13} />}
              label="Standard"
            />
            <ModeButton
              active={mode === "pgp"}
              onClick={() => setMode("pgp")}
              icon={<ShieldCheck size={13} />}
              label="E2EE"
            />
            <ModeButton
              active={mode === "confidential"}
              onClick={() => setMode("confidential")}
              icon={<Lock size={13} />}
              label="Confidentiel"
            />
          </div>

          {mode === "pgp" && (
            <div className="mt-2.5 space-y-2">
              {!identity || !isUnlocked ? (
                <button
                  onClick={onNeedUnlock}
                  className="flex items-center gap-1.5 text-[11px] text-yellow-400 hover:underline"
                >
                  <KeyRound size={12} />
                  {identity
                    ? "Déverrouillez votre identité pour signer"
                    : "Créez une identité pour chiffrer"}
                </button>
              ) : (
                <p className="text-[11px] text-nexus-text-dim">
                  Signé par {identity.email}. Sans clé destinataire, le message
                  est chiffré vers votre propre clé (test round-trip).
                </p>
              )}
              <textarea
                value={recipientKey}
                onChange={(e) => setRecipientKey(e.target.value)}
                placeholder="Clé publique du destinataire (optionnel) -----BEGIN PGP PUBLIC KEY BLOCK-----"
                className="w-full bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-nexus-text outline-none focus:border-nexus-primary transition-colors resize-none h-14 placeholder:text-nexus-text-dim"
              />
            </div>
          )}

          {mode === "confidential" && (
            <div className="mt-2.5">
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode partagé (hors bande)"
                className="w-full bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text outline-none focus:border-nexus-primary transition-colors placeholder:text-nexus-text-dim"
              />
            </div>
          )}

          {mode !== "standard" && (
            <div className="mt-2 flex items-center gap-2">
              <Timer size={13} className="text-nexus-text-dim" />
              <select
                value={expiryIdx}
                onChange={(e) => setExpiryIdx(Number(e.target.value))}
                className="flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-xs text-nexus-text outline-none focus:border-nexus-primary transition-colors"
              >
                {EXPIRY_OPTIONS.map((o, i) => (
                  <option key={i} value={i}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <div className="mt-2 text-[11px] text-red-400">{error}</div>}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 min-h-[160px] px-4 py-3 bg-transparent text-sm text-nexus-text outline-none resize-none placeholder:text-nexus-text-dim"
          placeholder={
            mode === "standard"
              ? "Rédigez votre message..."
              : "Rédigez votre message chiffré..."
          }
        />

        <div className="flex items-center justify-between px-4 py-3 border-t border-nexus-border">
          <button
            onClick={handleSend}
            disabled={isSending || !to.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg hover:shadow-nexus-primary/25"
          >
            {isSending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : mode === "standard" ? (
              <Send size={14} />
            ) : (
              <Lock size={14} />
            )}
            {isSending
              ? mode === "standard"
                ? "Envoi..."
                : "Chiffrement..."
              : mode === "standard"
                ? "Envoyer"
                : "Chiffrer & envoyer"}
          </button>
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors">
              <Paperclip size={16} />
            </button>
            <button className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors">
              <Smile size={16} />
            </button>
            <button
              onClick={() => {
                onClose();
                reset();
              }}
              className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "bg-nexus-primary text-white"
          : "text-nexus-text-dim hover:text-nexus-text"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
