"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MailOpen,
  FolderInput,
  Ban,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CalendarPlus,
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

function InlineImagePreview({ accountId, uid, mailbox, attachment }: {
  accountId: string;
  uid: string;
  mailbox: string;
  attachment: { id: string; filename: string; contentType: string; size: number };
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(false);
    void downloadAttachment(accountId, uid, attachment.id, mailbox).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accountId, uid, mailbox, attachment.id]);
  if (error) return <span className="text-xs text-nexus-text-dim">Aperçu indisponible : {attachment.filename}</span>;
  if (!url) return <span className="text-xs text-nexus-text-dim">Chargement de l’image…</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${attachment.filename}`} className="block w-fit max-w-full">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt={attachment.filename} loading="lazy" className="max-h-[420px] max-w-full rounded-xl object-contain" />
  </a>;
}

/** Resize the sandboxed email frame to its actual content instead of a fixed height. */
function AdaptiveEmailFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const doc = frame.contentDocument;
      if (!doc) return;
      const body = doc.body;
      const root = doc.documentElement;
      if (!body || !root) return;
      const next = Math.max(body.scrollHeight, body.offsetHeight, root.scrollHeight, root.offsetHeight, 1);
      setHeight(previous => previous === next ? previous : next);
    };
    const onLoad = () => {
      observer?.disconnect();
      const doc = frame.contentDocument;
      if (!doc) return;
      // Images and responsive email layouts may change height after load.
      observer = new ResizeObserver(measure);
      if (doc.body) observer.observe(doc.body);
      if (doc.documentElement) observer.observe(doc.documentElement);
      doc.querySelectorAll("img").forEach(img => {
        img.addEventListener("load", measure);
        img.addEventListener("error", measure);
      });
      measure();
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => { disposed = true; frame.removeEventListener("load", onLoad); observer?.disconnect(); };
  }, [html]);

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-[28px] bg-white">
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={prepareEmailHtml(html)}
        scrolling="no"
        style={{ height: height + "px" }}
        className="block w-full border-0 bg-white"
      />
    </div>
  );
}

/** Extractive, deterministic summary: no external requests or generated claims. */
function flashSummary(input: string) {
  // Decode before extracting sentences. Browser parser covers all named and numeric entities.
  const decodeEntities = (value: string) => {
    const fallback: Record<string, string> = { eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", icirc: "î", iuml: "ï", ocirc: "ô", oelig: "œ", ugrave: "ù", ucirc: "û", uuml: "ü", ccedil: "ç", Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Icirc: "Î", Ccedil: "Ç", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
    const decoded = typeof document !== "undefined" ? (() => { const node = document.createElement("textarea"); node.innerHTML = value; return node.value; })() : value;
    return decoded.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, name: string) => {
      if (name.startsWith("#")) { const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity; }
      return fallback[name] ?? entity;
    });
  };
  const clean = decodeEntities(decodeEntities(input.replace(/<[^>]*>/g, " ").replace(/\\n/g, "\n")))
    .replace(/https?:\/\/[^\s<>"\x27]+/gi, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  const withoutUrls = clean.replace(/\s+/g, " ").trim();
  const rawLines = clean.split(/\n+/).map(s => s.trim()).filter(Boolean);
  // Exclude the entire quoted example, even when markers share a line with real text.
  const quoteStart = /\*\*\s*(?:extrait|exemple|citation|message frauduleux|faux mail)\s*\*\*/i;
  const quoteEnd = /\*\*\s*fin\s+(?:(?:de\s+)?l[’\x27])?(?:de\s+)?(?:extrait|citation|exemple)\s*\*\*/i;
  let inQuotedExample = false;
  const actionLines: string[] = [];
  for (const line of rawLines) {
    let remainder = line;
    let safe = "";
    while (remainder) {
      if (inQuotedExample) {
        const end = quoteEnd.exec(remainder);
        if (!end) break;
        remainder = remainder.slice(end.index + end[0].length);
        inQuotedExample = false;
      } else {
        const start = quoteStart.exec(remainder);
        if (!start) { safe += remainder; break; }
        safe += remainder.slice(0, start.index);
        remainder = remainder.slice(start.index + start[0].length);
        inQuotedExample = true;
      }
    }
    const candidate = safe.trim().replace(/^[-•]\s*/, "");
    if (candidate && !/^\s*(?:>|«|“)/.test(candidate) && !/bonjour\s+x{2,}|\b(?:le texte est rédigé ainsi|le message est rédigé ainsi)\b/i.test(candidate)) actionLines.push(candidate);
  }
  // Calendar proposals only use explicit deadlines outside quoted examples.
  const calendarItems: { label: string; date: string; hour: number; minute: number }[] = [];
  const months: Record<string, number> = { janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12 };
  for (const line of actionLines) {
    if (!/\b(rendre|remettre|déposer|envoyer|soumettre|date limite|échéance|avant le|pour le|à rendre)\b/i.test(line)) continue;
    const french = /(?:\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre)\s+(\d{4})(?:\s*,?\s*(?:à\s*)?(\d{1,2})[:h](\d{2}))?/i.exec(line);
    const numeric = /(?:\b|^)(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s*(?:à\s*)?(\d{1,2})[:h](\d{2}))?/.exec(line);
    if (!french && !numeric) continue;
    const match = french ?? numeric!;
    const day = Number(match[1]);
    const month = french ? months[match[2].toLowerCase()] : Number(match[2]);
    const year = Number(match[3]);
    const hour = match[4] === undefined ? 12 : Number(match[4]);
    const minute = match[5] === undefined ? 0 : Number(match[5]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) continue;
    const date = [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("");
    if (!calendarItems.some(item => item.date === date && item.hour === hour && item.minute === minute && item.label === line)) {
      calendarItems.push({ label: line.slice(0, 150), date, hour, minute });
    }
  }
  const safetyPattern = /\b(ne\s+cliquez\s+pas|ne\s+pas\s+cliquer|surtout\s+pas|à\s+la\s+corbeille|mettez\s+.{0,45}\s+à\s+la\s+corbeille|supprimez|modifiez\s+votre\s+mot\s+de\s+passe|changez\s+votre\s+mot\s+de\s+passe)\b/i;
  const safetyActions = actionLines.flatMap(line => line.split(/(?<=[.!?])\s+/)).filter(sentence => safetyPattern.test(sentence));
  const safetyAction = safetyActions.length ? safetyActions.slice(0, 2).map(s => s.trim()).join(" ").toLocaleUpperCase("fr-FR") : "";
  const sentences = withoutUrls.split(/(?<=[!?])\s+|(?<=\.)\s+(?=[A-ZÀ-ÖØ-Þ])/u).map(s => s.trim()).filter(Boolean);
  const clip = (s: string, n = 180) => s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
  const actionPattern = /\b(veuillez|merci de|il faut|obligatoire|action|répondre|confirmer|envoyer|inscrire|participer|cliquez|valider|payer|remplir|déposer|remettre|à rendre|échéances?)\b/i;
  const actionText = actionLines.join(" ");
  const task = actionText.match(/(?:devoir|séquence)\s+(?:séquence\s*)?(\d+)\b/i);
  const hasDeadline = /date\s+limite\s*:|[àa]\s+rendre\b/i.test(actionText);
  const dueLine = /\b(ce soir|aujourd[\x27’]hui|demain|le\s+\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|avant le|pour le|date limite)\b/i;
  const taskVerb = /\b(remplir|déposer|remettre|rendre|envoyer|soumettre|valider)\b/i;
  const deadlineActions = actionLines.filter(line => dueLine.test(line) && taskVerb.test(line));
  const action = safetyAction
    ? safetyAction
    : deadlineActions.length
    ? deadlineActions.slice(0, 3).join(" ; ")
    : hasDeadline && task ? "Rendre le devoir SÉQUENCE " + task[1]
    : clip(actionLines.find(s => actionPattern.test(s)) ?? "Aucune action immédiate requise", 160);
  const timestamp = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:\s*(?:UTC|GMT|Z|[+-]\d{2}:?\d{2}))?\b/i;
  const frenchDate = /\b(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}(?:\s*,?\s*(?:à\s*)?\d{1,2}[:h]\d{2})?\b/i;
  const numericRange = /\bdu\s+\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\s+au\s+\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/i;
  const numericDate = /\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/;
  const contextDate = /\b(dès maintenant|cette semaine|jusqu['’]au|jusqu['’]à|à partir de|ce week-end|aujourd['’]hui|demain|avant le|au plus tard)\b/i;
  // Prefer a complete deadline over the first weekday or unrelated log text.
  const extractedDate = withoutUrls.match(frenchDate)?.[0]
    ?? withoutUrls.match(timestamp)?.[0]?.replace("T", " ").replace(/Z$/i, " UTC")
    ?? withoutUrls.match(numericRange)?.[0]
    ?? withoutUrls.match(numericDate)?.[0]
    ?? withoutUrls.match(contextDate)?.[0]
    ?? "Aucune échéance détectée";
  // Two-stage extractive summary: situation/problem, then impact or resolution.
  const contextText = withoutUrls
    .replace(/^(?:(?:bonjour(?:\s+[a-zà-ÿ-]+)?|mesdames\s*,?\s*messieurs|cher(?:s|e|es)?\s+[a-zà-ÿ-]+)\s*[,!:.]?\s*)+/i, "")
    .trim();
  const contextSentences = contextText
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])|\n+/u)
    .map(s => s.trim().replace(/^(?:depuis\s+(?:\w+\s+){0,3}(?:jours?|semaines?|mois)\s*,?\s*)/i, ""))
    .filter(s => s.length > 15 && /[a-zà-ÿ]/i.test(s));
  const problemTerms = /\b(devoir|projet|faille(?:s)?|panne(?:s)?|maintenance|indisponibilit[ée]|incident(?:s)?|sécurité|dysfonctionnement(?:s)?|problème(?:s)?|échéance)\b/i;
  const stateTerms = /\b(corrig[ée](?:s)?|corriger|correction|rétabli(?:e|s|es)?|accessible(?:s)?|fonctionnel(?:le|s|les)?|en cours|bloqu[ée](?:s)?|obligatoire|rendu|résolu(?:e|s|es)?|mobilis[ée](?:s)?|indisponible(?:s)?)\b/i;
  const countTerms = (s: string, pattern: RegExp) => (s.match(new RegExp(pattern.source, "gi")) ?? []).length;
  const normalize = (s: string) => s.toLocaleLowerCase("fr-FR").replace(/[^a-zà-ÿ0-9]/gi, "");
  const ranked = contextSentences.map((sentence, index) => ({
    sentence, index,
    problem: countTerms(sentence, problemTerms),
    state: countTerms(sentence, stateTerms),
    duplicate: (extractedDate !== "Aucune échéance détectée" && sentence.toLocaleLowerCase("fr-FR").includes(extractedDate.toLocaleLowerCase("fr-FR")))
      || (action !== "Aucune action immédiate requise" && normalize(sentence).includes(normalize(action))),
  }));
  const candidates = ranked.filter(item => !item.duplicate);
  const situation = [...candidates].sort((a, b) => (b.problem * 3 + b.state) - (a.problem * 3 + a.state) || a.index - b.index)[0];
  const impact = [...candidates].filter(item => item.index !== situation?.index)
    .sort((a, b) => (b.state * 3 + b.problem) - (a.state * 3 + a.problem) || a.index - b.index)[0];
  const concise = (sentence: string) => sentence
    .replace(/^(?:depuis\s+(?:\w+\s+){0,3}(?:jours?|semaines?|mois)\s*,?\s*)/i, "")
    .replace(/\s+/g, " ").trim();
  const contextParts = [situation?.sentence, impact && impact.state > 0 ? impact.sentence : undefined]
    .filter((s): s is string => Boolean(s)).map(concise);
  const context = contextParts.length ? contextParts.join(" ") : "Aucun contexte disponible";
  const category = /phishing|hameçonnage|filoutage|courriel frauduleux|faux (?:mail|courriel)/i.test(withoutUrls)
    ? "security" : /devoir|séquence|moodle|rendu|remettre|déposer|formulaire/i.test(withoutUrls)
    ? "assignment" : /maintenance|panne|faille|services numériques|rétabli|indisponible/i.test(withoutUrls)
    ? "maintenance" : "general";
  const title = category === "security" ? "Alerte de sécurité"
    : category === "assignment" ? (deadlineActions.length > 1 ? "Plusieurs travaux à rendre" : "Travail à préparer")
    : category === "maintenance" ? "État des services numériques"
    : "À retenir";
  const conciseText = (value: string) => value
    .replace(/^(?:bonjour(?:\\s+[^,.!]+)?|mesdames,? messieurs)[,!:.]?\\s*/i, "")
    .replace(/\\s+/g, " ").trim();
  const summaryParts = category === "assignment" && deadlineActions.length
    ? deadlineActions.slice(0, 2).map(conciseText)
    : category === "security" && safetyAction
    ? [conciseText(contextParts[0] ?? ""), conciseText(safetyAction)]
    : contextParts.slice(0, 2).map(conciseText);
  const summary = summaryParts.filter(Boolean).join(" ").trim() || "Consultez le message pour connaître les détails.";
  const deadline = extractedDate !== "Aucune échéance détectée" ? clip(extractedDate, 80) : null;
  return { action, date: clip(extractedDate, 80), snippet: context, title, summary, deadline, category, calendarItems: category === "security" ? [] : calendarItems };
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
  onBlockSender?: (email: string) => Promise<void>;
  onChangeCategory?: (category: string) => Promise<void>;
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
  onBlockSender,
  onChangeCategory,
}: EmailViewProps) {
  const lastMsg = thread.messages[thread.messages.length - 1];
  const [flashExpanded, setFlashExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuError, setMenuError] = useState("");
  const flash = useMemo(() => flashSummary(lastMsg?.body || lastMsg?.snippet || ""), [lastMsg?.body, lastMsg?.snippet]);
  const addDeadlinesToCalendar = () => {
    if (!flash.calendarItems.length) return;
    const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const events = flash.calendarItems.map((item, index) => {
      const time = String(item.hour).padStart(2, "0") + String(item.minute).padStart(2, "0");
      const start = item.date + "T" + time + "00";
      const end = new Date(Date.UTC(Number(item.date.slice(0, 4)), Number(item.date.slice(4, 6)) - 1, Number(item.date.slice(6, 8)), item.hour, item.minute + 30));
      const endLocal = [end.getUTCFullYear(), String(end.getUTCMonth() + 1).padStart(2, "0"), String(end.getUTCDate()).padStart(2, "0")].join("") + "T" + String(end.getUTCHours()).padStart(2, "0") + String(end.getUTCMinutes()).padStart(2, "0") + "00";
      return ["BEGIN:VEVENT", "UID:nexus-mail-" + item.date + "-" + index + "@local", "DTSTAMP:" + stamp, "DTSTART:" + start, "DTEND:" + endLocal, "SUMMARY:" + escapeIcs("Échéance : " + thread.subject), "DESCRIPTION:" + escapeIcs(item.label), "END:VEVENT"].join("\r\n");
    });
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexus Mail//Resume Flash//FR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nexus-mail-echeances.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };


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
          <div className="relative">
            <button type="button" onClick={() => { setMenuOpen(value => !value); setCategoryOpen(false); setMenuError(""); }}
              aria-label="Plus d'options" aria-expanded={menuOpen}
              className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-nexus-text">
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-[40] cursor-default" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-[50] w-[min(285px,calc(100vw-24px))] rounded-xl border border-white/15 bg-[#171717] p-1.5 shadow-2xl shadow-black/70 text-white text-sm">
                  <button type="button" disabled={!onAction || menuBusy} onClick={() => { setMenuOpen(false); onAction?.("unread"); }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/10 disabled:opacity-40">
                    <MailOpen size={17} /> Marquer comme non lu
                  </button>
                  <button type="button" disabled={!onChangeCategory || menuBusy} onClick={() => setCategoryOpen(value => !value)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/10 disabled:opacity-40">
                    <FolderInput size={17} /> Changer de catégorie <ChevronRight size={15} className="ml-auto" />
                  </button>
                  {categoryOpen && (
                    <div className="ml-7 border-l border-white/15 pl-2">
                      {([["CATEGORY_PERSONAL", "Principale"], ["CATEGORY_PROMOTIONS", "Promotions"], ["CATEGORY_UPDATES", "Notifications"], ["CATEGORY_SOCIAL", "Réseaux sociaux"], ["CATEGORY_FORUMS", "Forums"]] as const).map(([id, name]) => (
                        <button key={id} type="button" disabled={menuBusy} onClick={async () => {
                          if (!onChangeCategory) return;
                          setMenuBusy(true); setMenuError("");
                          try { await onChangeCategory(id); setMenuOpen(false); }
                          catch (e) { setMenuError((e as Error).message); }
                          finally { setMenuBusy(false); }
                        }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40">{name}</button>
                      ))}
                    </div>
                  )}
                  <button type="button" disabled={!onBlockSender || menuBusy || !lastMsg?.senderEmail} onClick={async () => {
                    if (!onBlockSender || !lastMsg?.senderEmail || !window.confirm(`Bloquer ${lastMsg.senderEmail} dans Nexus Mail ?`)) return;
                    setMenuBusy(true); setMenuError("");
                    try { await onBlockSender(lastMsg.senderEmail); setMenuOpen(false); }
                    catch (e) { setMenuError((e as Error).message); }
                    finally { setMenuBusy(false); }
                  }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/10 disabled:opacity-40">
                    <Ban size={17} /> Bloquer l'expéditeur
                  </button>
                  {menuError && <p role="alert" className="px-3 py-2 text-xs text-red-400">{menuError}</p>}
                </div>
              </>
            )}
          </div>
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
          <div className="px-4 pb-4 space-y-3 break-words [overflow-wrap:anywhere]">
            <h3 className="text-[17px] font-semibold leading-snug text-white">{flash.title}</h3>
            <p className="text-sm leading-relaxed text-white/85">{flash.summary}</p>
            {flash.deadline && (
              <div className="flex items-center gap-2 text-xs text-white/65">
                <span aria-hidden="true">◷</span>
                <span>Échéance : {flash.deadline}</span>
              </div>
            )}
            {flash.calendarItems.length > 0 && (
              <button type="button" onClick={addDeadlinesToCalendar}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">
                <CalendarPlus size={16} />
                {flash.calendarItems.length > 1 ? "Ajouter les échéances au calendrier" : "Ajouter au calendrier"}
              </button>
            )}
          </div>
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
                      const parsed = parseLiveId(msg.id);
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
              {!!msg.attachments?.length && (() => {
                const parsed = parseLiveId(msg.id);
                if (!parsed) return null;
                const images = msg.attachments.filter(attachment =>
                  /^(image\/(jpeg|png|webp))$/i.test(attachment.contentType) ||
                  /\.(jpe?g|png|webp)$/i.test(attachment.filename)
                );
                if (!images.length) return null;
                return <div className="pl-3 pr-3 sm:pl-14 sm:pr-0 mb-4 flex flex-wrap gap-3">
                  {images.map(attachment => <InlineImagePreview
                    key={attachment.id}
                    accountId={parsed.accountId}
                    uid={parsed.uid}
                    mailbox={thread.mailbox ?? "INBOX"}
                    attachment={attachment}
                  />)}
                </div>;
              })()}

              <div className="pl-0 sm:pl-14 min-w-0 break-words">
                {msg.encryption || isEncryptedBody(msg.body) ? (
                  <EncryptedMessage
                    body={msg.body as string}
                    onNeedUnlock={onNeedUnlock}
                  />
                ) : msg.htmlBody ? (
                  <AdaptiveEmailFrame
                    title={`Contenu du message de ${msg.senderName}`}
                    html={msg.htmlBody}
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
