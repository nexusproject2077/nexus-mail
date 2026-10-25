"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowLeft,
  Star,
  Reply,
  Forward,
  Trash2,
  Archive,
  MoreHorizontal,
  Tag,
  Paperclip,
  Download,
} from "lucide-react";
import { Thread } from "@/types/email";
import {
  formatFullDate,
  getInitials,
  getAvatarColor,
  getLabelInfo,
} from "@/lib/utils";
import { downloadAttachment } from "@/lib/api";
import { parseLiveId } from "@/lib/useMail";
import { isEncryptedBody } from "@/lib/crypto";
import EncryptedMessage from "./EncryptedMessage";

/** Email HTML stays sandboxed (scripts and forms disabled), but ordinary links
 * open in a separate browser tab instead of navigating the mail iframe. */
function prepareEmailHtml(html: string): string {
  const base = '<base target="_blank">';
  const withBase = /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(\s[^>]*)?>/i, (head) => head + base)
    : '<head>' + base + '</head>' + html;
  const buttonLinks = withBase.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (original, attrs: string, body: string) => {
    // Support common email buttons using data-url or simple location/open handlers.
    // Never execute the original JavaScript; only extract an HTTPS destination.
    const dataUrl = attrs.match(/\bdata-(?:url|href|link)\s*=\s*(["'])(.*?)\1/i)?.[2];
    const handler = attrs.match(/\bonclick\s*=\s*(["'])(.*?)\1/i)?.[2];
    const scriptedUrl = handler?.match(/(?:window\.open\s*\(|(?:window\.|document\.)?location(?:\.href)?\s*=\s*)(["'])(https:\/\/[^"'\s<>]+)\1/i)?.[2];
    const candidate = dataUrl ?? scriptedUrl;
    if (!candidate) return original;
    let safe: string;
    try {
      const url = new URL(candidate.replace(/&amp;/gi, "&"));
      if (url.protocol !== "https:") return original;
      safe = url.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    } catch { return original; }
    return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none">' + body + '</a>';
  });
  return buttonLinks.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const clean = attrs
      .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    return '<a' + clean + ' target="_blank" rel="noopener noreferrer">';
  });
}

/** Extractive, deterministic summary: no external requests or generated claims. */
function flashSummary(input: string) {
  const clean = input.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?\\n]+(?:[.!?]+|$)/g)?.map(s => s.trim()).filter(Boolean) ?? [];
  const actionPattern = /\\b(veuillez|merci de|il faut|obligatoire|action|répondre|confirmer|envoyer|inscrire|participer|cliquez|valider|payer)\\b/i;
  const datePattern = /\\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|avant le|au plus tard|\\d{1,2}[\\/.-]\\d{1,2}(?:[\\/.-]\\d{2,4})?|\\d{1,2}\\s?h(?:\\d{2})?)\\b/i;
  const clip = (s: string, n = 180) => s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
  return {
    action: clip(sentences.find(s => actionPattern.test(s)) ?? "Aucune action immédiate requise"),
    date: clip(sentences.find(s => datePattern.test(s)) ?? "Aucune échéance détectée"),
    snippet: clip(clean || "Aucun texte disponible pour ce message", 100),
  };
}

interface EmailViewProps {
  thread: Thread;
  onBack: () => void;
  onReply: (threadId: string, messageId: string) => void;
  onForward: (threadId: string, messageId: string) => void;
  onNeedUnlock: () => void;
  onTrash?: () => void;
  trashBusy?: boolean;
  onAction?: (action: "read" | "unread" | "star" | "unstar" | "archive") => void;
}

export default function EmailView({
  thread,
  onBack,
  onReply,
  onForward,
  onNeedUnlock,
  onTrash,
  trashBusy = false,
  onAction,
}: EmailViewProps) {
  const lastMsg = thread.messages[thread.messages.length - 1];
  const [flashExpanded, setFlashExpanded] = useState(true);
  const flash = useMemo(() => flashSummary(lastMsg?.body || lastMsg?.snippet || ""), [lastMsg?.body, lastMsg?.snippet]);

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col animate-slide-in">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2 px-2 sm:px-4 py-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] lg:pt-3 border-b border-nexus-border">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="flex-1 min-w-0 text-sm sm:text-lg font-semibold whitespace-normal break-words leading-snug">
          {thread.subject}
        </h2>
        <div className="flex shrink-0 items-center gap-0 sm:gap-1">
          <button onClick={() => onAction?.("archive")} disabled={!onAction} title="Archiver" className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text disabled:opacity-40">
            <Archive size={18} />
          </button>
          <button onClick={onTrash} disabled={!onTrash || trashBusy} title="Déplacer vers la corbeille" aria-label="Déplacer vers la corbeille" className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text disabled:opacity-40">
            <Trash2 size={18} />
          </button>
          <button onClick={() => onAction?.(thread.isUnread ? "read" : "unread")} disabled={!onAction} title={thread.isUnread ? "Marquer comme lu" : "Marquer comme non lu"} className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text disabled:opacity-40">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      <section className="mx-3 sm:mx-6 mt-3 mb-1 rounded-xl border border-white/15 bg-[#121212] text-white" aria-label="Résumé Flash">
        <button type="button" onClick={() => setFlashExpanded(value => !value)}
          aria-expanded={flashExpanded}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} aria-hidden="true" /> Résumé Flash</span>
          {flashExpanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {flashExpanded && (
          <ul className="list-disc space-y-2 px-7 pb-4 text-sm leading-relaxed text-white/90 break-words">
            <li><strong className="font-medium text-white">Action :</strong> {flash.action}</li>
            <li><strong className="font-medium text-white">Date :</strong> {flash.date}</li>
            <li><strong className="font-medium text-white">Contexte :</strong> {flash.snippet}</li>
          </ul>
        )}
      </section>

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-0 py-3 sm:p-6">
        {thread.messages.map((msg, idx) => {
          const avatarColor = getAvatarColor(msg.senderEmail);
          const userLabel = msg.labelIds.find((l) => l.startsWith("Label_"));
          const labelInfo = userLabel ? getLabelInfo(userLabel) : null;

          return (
            <div
              key={msg.id}
              className={`mb-6 ${idx > 0 ? "pt-6 border-t border-nexus-border/50" : ""}`}
            >
              <div className="flex min-w-0 items-start gap-2 sm:gap-4 mb-4 px-3 sm:px-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: avatarColor }}
                >
                  {getInitials(msg.senderName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {msg.senderName}
                    </span>
                    <span className="text-xs text-nexus-text-dim">
                      &lt;{msg.senderEmail}&gt;
                    </span>
                    {labelInfo && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: labelInfo.color + "20",
                          color: labelInfo.color,
                        }}
                      >
                        {labelInfo.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-nexus-text-dim mt-0.5">
                    à {msg.toRecipients.join(", ")}
                  </div>
                  <div className="text-xs text-nexus-text-dim">
                    {formatFullDate(msg.date)}
                  </div>
                </div>
                <button onClick={() => onAction?.(thread.isStarred ? "unstar" : "star")} disabled={!onAction} title={thread.isStarred ? "Retirer des favoris" : "Ajouter aux favoris"} className="p-1.5 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-yellow-400 transition-colors disabled:opacity-40">
                  <Star size={16} fill={thread.isStarred ? "currentColor" : "none"} />
                </button>
              </div>

              {!!msg.attachments?.length && (
                <div className="pl-3 pr-3 sm:pl-14 sm:pr-0 mb-4 flex flex-wrap gap-2">
                  {msg.attachments.map(attachment => (
                    <button key={attachment.id} type="button" className="flex items-center gap-2 rounded-lg border border-nexus-border px-3 py-2 text-xs hover:bg-nexus-surface-hover" onClick={async () => {
                      const parsed = parseLiveId(thread.id);
                      if (!parsed) return;
                      try {
                        const blob = await downloadAttachment(parsed.accountId, parsed.uid, attachment.id, thread.mailbox ?? "INBOX");
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement("a");
                        anchor.href = url; anchor.download = attachment.filename; anchor.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                      } catch (error) { window.alert((error as Error).message); }
                    }}>
                      <Paperclip size={14} />
                      <span className="max-w-44 truncate">{attachment.filename}</span>
                      <span className="text-nexus-text-dim">{Math.ceil(attachment.size / 1024)} Ko</span>
                      <Download size={14} />
                    </button>
                  ))}
                </div>
              )}
              <div className="pl-0 sm:pl-14 min-w-0 break-words">
                {msg.encryption || isEncryptedBody(msg.body) ? (
                  <EncryptedMessage
                    body={msg.body as string}
                    onNeedUnlock={onNeedUnlock}
                  />
                ) : msg.htmlBody ? (
                  <iframe
                    title={`Contenu du message de ${msg.senderName}`}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    srcDoc={prepareEmailHtml(msg.htmlBody)}
                    className="block w-full min-h-[420px] rounded-none border-0 bg-transparent"
                  />
                ) : (
                  <div className="text-sm text-nexus-text leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] bg-nexus-surface-hover/30 rounded-xl p-4">
                    {msg.body ?? msg.snippet}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-nexus-border flex items-center gap-3">
        <button
          onClick={() => onReply(thread.id, lastMsg.id)}
          className="flex items-center gap-2 px-4 py-2.5 bg-nexus-primary hover:bg-nexus-primary-dark text-black rounded-xl text-sm font-medium transition-all hover:shadow-lg hover:shadow-nexus-primary/25"
        >
          <Reply size={16} />
          Répondre
        </button>
        <button onClick={() => onForward(thread.id, lastMsg.id)} className="flex items-center gap-2 px-4 py-2.5 bg-nexus-surface-hover hover:bg-nexus-surface-active text-nexus-text rounded-xl text-sm transition-all border border-nexus-border">
          <Forward size={16} />
          Transférer
        </button>
      </div>
    </div>
  );
}
