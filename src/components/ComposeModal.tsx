"use client";

import { useEffect, useRef, useState } from "react";
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
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  ImagePlus,
  Link2,
} from "lucide-react";
import { sendViaAccount, downloadAttachment } from "@/lib/api";
import { encryptToKey, encryptConfidential } from "@/lib/crypto";
import { useVault, addVaultMessage } from "@/lib/vault";
import type { Thread } from "@/types/email";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyTo?: { subject: string; to: string; messageId?: string };
  initialDraft?: { to: string; subject: string; body: string; html?: string; quotedText?: string; forwardAttachments?: { accountId: string; uid: string; mailbox: string; items: { id: string; filename: string; contentType: string }[] } };
  onNeedUnlock: () => void;
  activeAccountId?: string | null;
  onSent?: () => void;
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
  initialDraft,
  onNeedUnlock,
  activeAccountId,
  onSent,
}: ComposeModalProps) {
  const { identity, isUnlocked, passphrase } = useVault();

  const [to, setTo] = useState(replyTo?.to || "");
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : "",
  );
  const [body, setBody] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const [htmlBody, setHtmlBody] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showComposeOptions, setShowComposeOptions] = useState(false);

  const [mode, setMode] = useState<Mode>("standard");
  const [securityOpen, setSecurityOpen] = useState(false);
  const [recipientKey, setRecipientKey] = useState("");
  const [passcode, setPasscode] = useState("");
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !initialDraft) return;
    setTo(initialDraft.to);
    setSubject(initialDraft.subject);
    setBody(initialDraft.body ?? "");
    setHtmlBody((initialDraft.html ?? "").replace(/\\n/g, "<br />"));
    setShowOriginal(false);
    setAttachments([]);
    const source = initialDraft.forwardAttachments;
    if (!source?.items.length) {
      setAttachmentsLoading(false);
      requestAnimationFrame(() => { bodyInputRef.current?.focus(); bodyInputRef.current?.setSelectionRange(0, 0); });
      return;
    }
    let cancelled = false;
    setAttachmentsLoading(true);
    Promise.all(source.items.map(async item => {
      const blob = await downloadAttachment(source.accountId, source.uid, item.id, source.mailbox);
      return new File([blob], item.filename, { type: item.contentType || blob.type });
    })).then(files => { if (!cancelled) setAttachments(files); })
      .catch(() => { if (!cancelled) setError("Impossible de récupérer les pièces jointes d'origine. Le transfert est bloqué pour éviter un envoi incomplet."); })
      .finally(() => { if (!cancelled) setAttachmentsLoading(false); });
    requestAnimationFrame(() => { bodyInputRef.current?.focus(); bodyInputRef.current?.setSelectionRange(0, 0); });
    return () => { cancelled = true; };
  }, [isOpen, initialDraft]);

  const draftKey = activeAccountId ? `nexus-mail:compose-draft:${activeAccountId}` : null;
  const draftRestored = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || initialDraft || !draftKey || draftRestored.current === draftKey) return;
    draftRestored.current = draftKey;
    try {
      const saved = window.localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved) as { to?: string; subject?: string; body?: string };
      if (!replyTo) {
        setTo(draft.to ?? "");
        setSubject(draft.subject ?? "");
        setBody(draft.body ?? "");
      }
    } catch { /* Corrupt or unavailable storage: allow composing normally. */ }
  }, [isOpen, draftKey, replyTo, initialDraft]);
  useEffect(() => {
    if (!isOpen || !draftKey || isSending || mode !== "standard" || draftRestored.current !== draftKey || replyTo) return;
    try {
      if (to.trim() || subject.trim() || body.trim()) {
        window.localStorage.setItem(draftKey, JSON.stringify({ to, subject, body, savedAt: Date.now() }));
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch { /* Storage may be unavailable or full. */ }
  }, [to, subject, body, isOpen, draftKey, isSending, mode, replyTo]);

  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const timer = window.setTimeout(() => setVisible(true), 16);
      return () => window.clearTimeout(timer);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), 250);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!mounted) return null;

  const reset = () => {
    setTo("");
    setSubject("");
    setBody("");
    setHtmlBody("");
    setShowOriginal(false);
    setAttachments([]);
    setEmojiOpen(false);
    if (editorRef.current) editorRef.current.innerHTML = "";
    setRecipientKey("");
    setPasscode("");
    setMode("standard");
    setSecurityOpen(false);
    setExpiryIdx(0);
    setError(null);
  };

  const insertEmoji = (emoji: string) => {
    const input = bodyInputRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    setBody(current => current.slice(0, start) + emoji + current.slice(end));
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handleSend = async () => {
    if (!to.trim() || attachmentsLoading) return;
    if (initialDraft?.forwardAttachments?.items.length && attachments.length !== initialDraft.forwardAttachments.items.length) {
      setError("Les pièces jointes du message original ne sont pas toutes disponibles.");
      return;
    }
    setError(null);

    // Send a real HTML email through the configured SMTP account.
    if (mode === "standard") {
      if (!activeAccountId) {
        setError("Connectez un compte SMTP pour envoyer ce message.");
        return;
      }
      setIsSending(true);
      try {
        const outgoing = await Promise.all(attachments.map(async file => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return { filename: file.name, contentType: file.type || "application/octet-stream", data: btoa(binary) };
        }));
        let signature = "";
        try { signature = JSON.parse(window.localStorage.getItem("nexus-mail:settings:v1") || "{}").signatures?.[activeAccountId] || ""; } catch { /* no signature */ }
        const plainText = initialDraft?.quotedText ? `${body}\n\n${initialDraft.quotedText}` : body;
        const signedText = signature ? `${plainText}\n\n${signature}` : plainText;
        const typedIntro = initialDraft?.html ? body.trim() : "";
        const escapedIntro = typedIntro.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\n/g, "<br />").replace(/\r?\n/g, "<br />");
        const outgoingHtml = initialDraft?.html ? `${escapedIntro ? `<div style="white-space:pre-wrap">${escapedIntro}</div><br>` : ""}${htmlBody}` : htmlBody;
        const signedHtml = outgoingHtml && signature ? `${outgoingHtml}<p>${signature.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\n/g, "<br>")}</p>` : outgoingHtml;
        await sendViaAccount(activeAccountId, {
          to: to.trim(),
          subject: subject.trim(),
          text: signedText,
          html: signedHtml || undefined,
          attachments: outgoing,
        });
        if (draftKey) { try { window.localStorage.removeItem(draftKey); } catch {} }
        onSent?.();
        onClose();
        reset();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsSending(false);
      }
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

  const format = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setHtmlBody(editorRef.current?.innerHTML ?? "");
    setBody(editorRef.current?.innerText ?? "");
  };

  const insertImage = () => {
    const url = window.prompt("Adresse HTTPS de l'image à insérer :");
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
      format("insertImage", parsed.toString());
    } catch {
      setError("Utilisez une adresse d'image HTTPS valide.");
    }
  };

  const insertLink = () => {
    const url = window.prompt("Adresse HTTPS du lien :");
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
      format("createLink", parsed.toString());
    } catch {
      setError("Utilisez une adresse HTTPS valide.");
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
    <div className="fixed inset-0 z-[100] w-screen h-[100dvh] sm:inset-auto sm:bottom-0 sm:right-6 sm:z-50 sm:h-auto sm:w-[min(520px,calc(100vw-3rem))] ">
      <div className={`bg-black border-0 sm:border sm:border-nexus-border rounded-none sm:rounded-t-xl shadow-2xl shadow-black/50 flex flex-col h-full sm:h-auto sm:max-h-[80dvh] min-w-0 overflow-hidden transform-gpu transition-[transform,opacity] duration-[250ms] ease-out motion-reduce:transition-none ${visible && isOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`}>
        <div className="relative z-[120] shrink-0 flex items-center justify-between pl-4 pr-3 py-3 bg-[#000000] border-b border-white/10 sm:rounded-t-xl">
          <span className="flex items-center gap-2 text-base font-semibold">
            {mode !== "standard" && <Lock size={13} className="text-nexus-primary-light" />}
            {replyTo ? "Répondre" : "Nouveau message"}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={handleSend} disabled={isSending || !to.trim() || attachmentsLoading} aria-label="Envoyer le message" title="Envoyer"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-nexus-primary-light hover:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed">
              {isSending ? <Loader2 size={21} className="animate-spin" /> : mode === "standard" ? <Send size={21} /> : <Lock size={21} />}
            </button>
            <button
              onClick={() => { setVisible(false); window.setTimeout(onClose, 250); }}
              className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-white transition-colors" aria-label="Fermer"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        <div className="relative z-10 shrink-0 px-4 pt-3 pb-2 space-y-0 bg-black">
          <div className="flex items-center gap-3 border-b border-white/10 px-2 py-3">
            <span className="text-sm text-nexus-text-dim w-10">À</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base text-nexus-text outline-none placeholder:text-[#a3a3a3]"
              placeholder="destinataire@email.com"
            />
          </div>
          <div className="flex items-center gap-3 border-b border-white/10 px-2 py-3">
            <span className="text-sm text-nexus-text-muted w-10">Objet</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base text-nexus-text outline-none placeholder:text-[#a3a3a3]"
              placeholder="Objet du message"
            />
          </div>
        </div>

        {/* Advanced sending modes are available on demand. */}
        <div className="px-4 bg-transparent">
          <button type="button" onClick={() => setShowComposeOptions(value => !value)}
            aria-expanded={showComposeOptions}
            className="flex items-center gap-2 py-2 text-xs text-nexus-text-muted hover:text-nexus-text">
            <ShieldCheck size={14} />
            {mode === "standard" ? "Options d'envoi" : mode === "pgp" ? "Chiffrement E2EE" : "Mode confidentiel"}
          </button>
          {showComposeOptions && (
            <div className="flex gap-1 rounded-xl bg-nexus-bg p-1 mb-2">
              <ModeButton active={mode === "standard"} onClick={() => setMode("standard")} icon={<Send size={13} />} label="Standard" />
              <ModeButton active={mode === "pgp"} onClick={() => setMode("pgp")} icon={<ShieldCheck size={13} />} label="E2EE" />
              <ModeButton active={mode === "confidential"} onClick={() => setMode("confidential")} icon={<Lock size={13} />} label="Confidentiel" />
            </div>
          )}
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
                className="w-full bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-base text-nexus-text outline-none focus:border-nexus-primary transition-colors placeholder:text-nexus-text-dim"
              />
            </div>
          )}

          {mode !== "standard" && (
            <div className="mt-2 flex items-center gap-2">
              <Timer size={13} className="text-nexus-text-dim" />
              <select
                value={expiryIdx}
                onChange={(e) => setExpiryIdx(Number(e.target.value))}
                className="flex-1 bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-base text-nexus-text outline-none focus:border-nexus-primary transition-colors"
              >
                {EXPIRY_OPTIONS.map((o, i) => (
                  <option key={i} value={i}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {attachmentsLoading && <div className="mt-2 text-xs text-nexus-text-muted">Chargement des pièces jointes du message original…</div>}
          {error && <div className="mt-2 text-[11px] text-red-400">{error}</div>}
        </div>

        <textarea
          ref={bodyInputRef}
          value={body ?? ""}
          onChange={(e) => setBody(e.target.value)}
          wrap="soft"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", width: "100%", overflowX: "hidden", overflowY: "auto" }}
          className="block w-full min-w-0 flex-1 min-h-0 sm:min-h-[160px] px-5 py-5 bg-transparent text-base leading-relaxed text-nexus-text outline-none resize-none whitespace-pre-wrap break-words [overflow-wrap:anywhere] overflow-x-hidden overflow-y-auto placeholder:text-[#a3a3a3]"
          placeholder={
            mode === "standard"
              ? "Rédigez votre message..."
              : "Rédigez votre message chiffré..."
          }
        />

        {mode === "standard" && initialDraft?.html && (
          <div className="relative z-0 shrink-0 min-w-0 border-t border-white/10">
            <button type="button" onClick={() => setShowOriginal(value => !value)}
              aria-expanded={showOriginal}
              className="flex items-center gap-2 px-5 py-3 text-sm text-nexus-text-muted hover:text-nexus-text">
              <span className="inline-flex items-center justify-center rounded-full border border-nexus-border w-8 h-7 text-lg leading-none">···</span>
              {showOriginal ? "Masquer le message d'origine" : "Afficher le message d'origine"}
            </button>
            {showOriginal && (
              <div className="w-full min-w-0 max-h-[55dvh] overflow-y-auto overflow-x-hidden bg-white" aria-label="Message d'origine cité">
                <iframe
                  title="Contenu HTML du message original"
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer"
                  srcDoc={`<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0!important;padding:0!important;max-width:100%!important;overflow-x:hidden!important}table{max-width:100%!important}img{max-width:100%!important;height:auto}*{box-sizing:border-box}</style>${htmlBody}`}
                  className="block w-full h-[55dvh] border-0 bg-white"
                />
              </div>
            )}
          </div>
        )}

        {attachments.length > 0 && <div className="px-4 py-2 text-xs text-nexus-text-muted flex flex-wrap gap-2">{attachments.map((file, i) => <button key={i} type="button" onClick={() => setAttachments(old => old.filter((_, j) => i !== j))} className="rounded-lg border border-nexus-border px-2 py-1">{file.name} ×</button>)}</div>}
        <div className="relative shrink-0 flex items-center justify-end gap-3 px-4 sm:px-5 py-2 pb-[max(12px,env(safe-area-inset-bottom))] bg-black border-t border-white/10">
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.pdf,.doc,.docx,.txt,.zip,.csv,.xlsx,.pptx" aria-label="Sélectionner des photos, PDF ou fichiers" className="hidden" onChange={event => {
              const files = Array.from(event.target.files ?? []);
              const next = [...attachments, ...files];
              if (next.length > 5 || next.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) {
                setError("Maximum 5 fichiers et 10 Mo au total.");
              } else { setAttachments(next); setError(null); }
              event.target.value = "";
            }} />
            <button type="button" onClick={() => { if (mode !== "standard") { setError("Les pièces jointes ne sont disponibles qu'en mode standard."); return; } fileInputRef.current?.click(); }} title="Ajouter des pièces jointes" className="flex h-11 w-11 items-center justify-center rounded-xl active:scale-[0.95] transition-transform duration-[250ms] ease-out hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-nexus-text transition-colors">
              <Paperclip size={21} />
            </button>
            <button type="button" onClick={() => setEmojiOpen(value => !value)} aria-label="Insérer un émoji" aria-expanded={emojiOpen} className="flex h-11 w-11 items-center justify-center rounded-xl active:scale-[0.95] transition-transform duration-[250ms] ease-out hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-nexus-text transition-colors">
              <Smile size={21} />
            </button>
            <button
              onClick={() => {
                onClose();
                reset();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl active:scale-[0.95] transition-transform duration-[250ms] ease-out hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-red-400 transition-colors"
            >
              <Trash2 size={21} />
            </button>
          </div>
          {emojiOpen && (
            <div className="absolute bottom-full right-4 mb-2 grid grid-cols-6 gap-1 rounded-xl border border-nexus-border bg-[#242424] p-2 shadow-2xl" role="group" aria-label="Choisir un émoji">
              {["😀", "😊", "😂", "😍", "🥰", "😎", "👍", "👏", "🙏", "❤️", "🎉", "🔥", "💯", "🤝", "👋", "✨", "😢", "😉"].map(emoji => (
                <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-white/10" aria-label={"Insérer " + emoji}>{emoji}</button>
              ))}
            </div>
          )}
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
          ? "bg-nexus-primary text-black"
          : "text-nexus-text-dim hover:text-nexus-text"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
