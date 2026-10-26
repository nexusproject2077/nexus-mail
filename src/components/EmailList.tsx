"use client";

import { Archive, Clock3, Mail, MailOpen, Trash2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Thread } from "@/types/email";
import { formatEmailDate, getInitials, getAvatarColor, getLabelInfo } from "@/lib/utils";

interface EmailListProps {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (thread: Thread) => void;
  folder: string;
  onTrash?: (thread: Thread) => Promise<void>;
  onQuickAction?: (thread: Thread, action: "archive" | "read" | "unread") => Promise<void>;
  onSnooze?: (thread: Thread, snoozedUntil: string) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  loading?: boolean;
  onRefresh?: () => Promise<void>;
  onScrollDirection?: (direction: "up" | "down") => void;
}

export default function EmailList({
  threads,
  selectedId,
  onSelect,
  folder,
  onTrash,
  onQuickAction,
  onSnooze,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  loading = false,
  onRefresh,
  onScrollDirection,
}: EmailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const accumulatedScroll = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);
  const touchStart = useRef<number | null>(null);
  const distance = useRef(0);
  const busy = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [snoozingThreadId, setSnoozingThreadId] = useState<string | null>(null);
  const [snoozeValue, setSnoozeValue] = useState("");
  const [snoozeBusy, setSnoozeBusy] = useState(false);
  const [snoozePosition, setSnoozePosition] = useState({ top: 0, left: 0 });
  const defaultSnoozeValue = () => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setHours(8, 0, 0, 0);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
  };
  const openSnooze = (threadId: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const menuWidth = Math.min(288, window.innerWidth - 24);
    setSnoozePosition({ top: rect.bottom + 310 > window.innerHeight ? Math.max(12, rect.top - 240) : rect.bottom + 8, left: Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)) });
    setSnoozingThreadId(threadId);
    setSnoozeValue(defaultSnoozeValue());
  };
  const finishPull = () => {
    const shouldRefresh = distance.current >= 64;
    touchStart.current = null;
    distance.current = 0;
    if (!shouldRefresh || !onRefresh || busy.current) { setPull(0); return; }
    busy.current = true;
    setRefreshing(true);
    setPull(64);
    void onRefresh().catch(() => {}).finally(() => {
      busy.current = false;
      setRefreshing(false);
      setPull(0);
    });
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const requestNext = () => {
    if (!hasMore || loadingMore || !onLoadMore || !userScrolledRef.current) return;
    userScrolledRef.current = false;
    onLoadMore();
  };
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore) return;
    const root = scrollRef.current;
    const target = bottomRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && userScrolledRef.current) requestNext();
    }, { root, rootMargin: "0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, threads.length]);

  if (threads.length === 0 && !onRefresh) {
    return (
      <div className="flex-1 flex items-center justify-center text-nexus-text-dim">
        <div className="text-center">
          <div className="mb-3 flex justify-center"><MailOpen size={40} strokeWidth={1.5} className="text-nexus-primary-light" aria-hidden="true" /></div>
          <p className="text-sm">Aucun message</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="nexus-mail-list flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain" onTouchStart={event => { if (onRefresh && !busy.current && event.touches.length === 1 && (scrollRef.current?.scrollTop ?? 1) <= 0) touchStart.current = event.touches[0].clientY; }} onTouchMove={event => { if (touchStart.current === null || busy.current) return; if ((scrollRef.current?.scrollTop ?? 0) > 0) { touchStart.current = null; setPull(0); return; } distance.current = Math.min(110, Math.max(0, (event.touches[0].clientY - touchStart.current) * 0.45)); setPull(distance.current); }} onTouchCancel={() => { touchStart.current = null; distance.current = 0; if (!busy.current) setPull(0); }} onScroll={event => {
        const el = event.currentTarget;
        if (el.scrollTop > 0) userScrolledRef.current = true;
        if (userScrolledRef.current && hasMore && !loadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 80) requestNext();
        const top = Math.max(0, el.scrollTop);
        const delta = top - lastScrollTop.current;
        lastScrollTop.current = top;
        if (top <= 8) {
          accumulatedScroll.current = 0;
          if (lastDirection.current !== "up") { lastDirection.current = "up"; onScrollDirection?.("up"); }
        } else if (Math.abs(delta) > 0.5) {
          const direction = delta > 0 ? "down" : "up";
          accumulatedScroll.current = Math.sign(accumulatedScroll.current) === Math.sign(delta) ? accumulatedScroll.current + delta : delta;
          if (Math.abs(accumulatedScroll.current) >= 12 && lastDirection.current !== direction) {
            lastDirection.current = direction;
            onScrollDirection?.(direction);
            accumulatedScroll.current = 0;
          }
        }
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 650) requestNext();
      }} onTouchEnd={event => { finishPull(); const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 900) requestNext(); }}>
      <div aria-live="polite" className="flex items-center justify-center overflow-hidden transition-[height] duration-200" style={{ height: pull }}>
        <Loader2 size={25} className={refreshing ? "animate-spin text-nexus-text-muted" : "text-nexus-text-muted"} style={refreshing ? undefined : { transform: `rotate(${pull * 5}deg)` }} />
        <span className="sr-only">{refreshing ? "Synchronisation des e-mails" : "Tirer pour actualiser"}</span>
      </div>
      {loading && (
        <div role="status" aria-label="Chargement des e-mails" className="relative overflow-hidden">
          {Array.from({ length: threads.length ? 2 : 7 }, (_, index) => (
            <div key={index} className="relative flex items-center gap-3 px-4 py-4 border-b border-nexus-border/30 overflow-hidden">
              <div className="h-10 w-10 shrink-0 rounded-full bg-white/10 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/5 rounded-md bg-white/10 animate-pulse" />
                <div className="h-3 w-4/5 rounded-md bg-white/10 animate-pulse" />
                <div className="h-2.5 w-3/5 rounded-md bg-white/10 animate-pulse" />
              </div>
              <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[mail-shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
            </div>
          ))}
          <span className="sr-only">Synchronisation en cours</span>
        </div>
      )}
      {!loading && threads.length === 0 && <div className="py-12 text-center text-sm text-nexus-text-dim">Aucun message</div>}
      {threads.map((thread) => {
        const lastMsg = thread.messages.reduce((latest, message) => Date.parse(message.date) > Date.parse(latest.date) ? message : latest, thread.messages[0]);
        const isSelected = selectedId === thread.id;
        const senderName = lastMsg.senderName;
        const avatarColor = getAvatarColor(lastMsg.senderEmail);
        const userLabel = lastMsg.labelIds.find((l) => l.startsWith("Label_"));
        const labelInfo = userLabel ? getLabelInfo(userLabel) : null;

        return (
          <SwipeEmailRow key={thread.id} thread={thread} onSelect={onSelect} onTrash={onTrash}>
          <div className="relative group/mail">
          <button
            onClick={() => onSelect(thread)}
            className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-nexus-border/40 bg-nexus-bg transition-[background-color,opacity,transform] duration-[250ms] ease-out active:opacity-80 active:scale-[0.99] active:bg-white/10 text-left hover:bg-nexus-surface-hover ${isSelected ? "border-l-2 border-l-nexus-primary" : "border-l-2 border-l-transparent"}`}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
              style={{ backgroundColor: avatarColor }}
            >
              {getInitials(senderName)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm truncate ${
                    thread.isUnread
                      ? "font-semibold text-nexus-text"
                      : "text-nexus-text-muted"
                  }`}
                >
                  {senderName}{thread.messages.length > 1 ? ` (${thread.messages.length})` : ""}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-nexus-text-dim whitespace-nowrap flex-shrink-0">
                  {thread.isUnread && <span className="h-1.5 w-1.5 rounded-full bg-nexus-primary" aria-label="Non lu" />}
                  {formatEmailDate(thread.date)}
                </span>
              </div>

              <div
                className={`text-sm truncate mt-0.5 ${
                  thread.isUnread
                    ? "font-medium text-nexus-text"
                    : "text-nexus-text-muted"
                }`}
              >
                {thread.subject}
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-nexus-text-dim truncate flex-1 leading-5">
                  {thread.snippet}
                </span>
                {labelInfo && (
                  <span
                    className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{
                      backgroundColor: labelInfo.color + "20",
                      color: labelInfo.color,
                    }}
                  >
                    {labelInfo.name}
                  </span>
                )}
              </div>
            </div>
          </button>
          {(onQuickAction || onTrash || onSnooze) && (
            <div className="absolute right-3 top-2 hidden items-center gap-0.5 rounded-lg border border-nexus-border bg-nexus-surface px-1 py-0.5 shadow-lg group-hover/mail:flex group-focus-within/mail:flex max-lg:hidden" role="group" aria-label="Actions rapides">
              {onQuickAction && <button type="button" title="Archiver" aria-label="Archiver" className="rounded-md p-2 hover:bg-nexus-surface-hover" onClick={(event) => { event.stopPropagation(); void onQuickAction(thread, "archive"); }}><Archive size={17} /></button>}
              {onTrash && <button type="button" title="Supprimer" aria-label="Mettre à la corbeille" className="rounded-md p-2 hover:bg-nexus-surface-hover" onClick={(event) => { event.stopPropagation(); void onTrash(thread).catch(() => {}); }}><Trash2 size={17} /></button>}
              {onQuickAction && <button type="button" title={thread.isUnread ? "Marquer comme lu" : "Marquer comme non lu"} aria-label={thread.isUnread ? "Marquer comme lu" : "Marquer comme non lu"} className="rounded-md p-2 hover:bg-nexus-surface-hover" onClick={(event) => { event.stopPropagation(); void onQuickAction(thread, thread.isUnread ? "read" : "unread"); }}>{thread.isUnread ? <MailOpen size={17} /> : <Mail size={17} />}</button>}
              {onSnooze && <button type="button" title="Mettre en attente" aria-label="Mettre en attente" aria-expanded={snoozingThreadId === thread.id} className="rounded-md p-2 hover:bg-nexus-surface-hover" onClick={(event) => { event.stopPropagation(); openSnooze(thread.id, event.currentTarget); }}><Clock3 size={17} /></button>}
              {onSnooze && snoozingThreadId === thread.id && createPortal(
                <><div className="fixed inset-0 z-[99]" onClick={() => setSnoozingThreadId(null)} aria-hidden="true" /><form role="dialog" aria-label="Mettre en attente" className="fixed z-[100] w-72 max-w-[calc(100vw-24px)] rounded-xl border border-nexus-border bg-nexus-surface p-3 shadow-2xl" style={{ top: snoozePosition.top, left: snoozePosition.left }}" onSubmit={(event) => {
                  event.preventDefault();
                  const date = new Date(snoozeValue);
                  if (Number.isNaN(date.valueOf()) || date.valueOf() < Date.now() + 60_000 || snoozeBusy) return;
                  setSnoozeBusy(true);
                  void onSnooze(thread, date.toISOString()).then(() => setSnoozingThreadId(null)).catch(() => {}).finally(() => setSnoozeBusy(false));
                }} onClick={event => event.stopPropagation()}>
                  <label className="block text-xs font-medium text-nexus-text" htmlFor={`snooze-${thread.id}`}>Réapparaître le</label>
                  <input id={`snooze-${thread.id}`} required min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)} type="datetime-local" value={snoozeValue} onChange={event => setSnoozeValue(event.target.value)} className="mt-2 w-full rounded-lg border border-nexus-border bg-nexus-bg px-2 py-2 text-sm text-nexus-text" />
                  <div className="mt-3 flex justify-end gap-2"><button type="button" className="rounded-lg px-2 py-1.5 text-xs text-nexus-text-muted hover:bg-nexus-surface-hover" onClick={() => setSnoozingThreadId(null)}>Annuler</button><button type="submit" disabled={snoozeBusy} className="rounded-lg bg-nexus-primary px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">{snoozeBusy ? "Patientez…" : "Mettre en attente"}</button></div>
                </form></>, document.body
              )}
            </div>
          )}
          </div>
          </SwipeEmailRow>
        );
      })}
      <div ref={bottomRef} aria-hidden="true" className="h-px" />
      {(hasMore || loadingMore) && <div role="status" className="nexus-mail-loading flex items-center justify-center gap-2 w-full py-4 text-center text-xs text-nexus-text-muted">{loadingMore && <Loader2 size={17} className="animate-spin" />}{loadingMore ? "Chargement des anciens e-mails…" : "Fais défiler pour voir les anciens e-mails"}</div>}
    </div>
  );
}

function SwipeEmailRow({ thread, onTrash, children }: {
  thread: Thread;
  onSelect: (thread: Thread) => void;
  onTrash?: (thread: Thread) => Promise<void>;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; initial: number; horizontal: boolean | null } | null>(null);
  const offsetRef = useRef(0);
  const suppressClick = useRef(false);
  const revealWidth = 112;
  const moveTo = (value: number) => { offsetRef.current = value; setOffset(value); };
  const reset = () => { moveTo(0); setDragging(false); gesture.current = null; };
  const remove = async () => {
    if (!onTrash || busy) return;
    setBusy(true);
    setDragging(false);
    moveTo(-(rowRef.current?.offsetWidth ?? window.innerWidth));
    // The provider request starts in parallel with the exit animation.
    const deletion = onTrash(thread);
    await new Promise<void>(resolve => window.setTimeout(resolve, 250));
    setExiting(true);
    try { await deletion; }
    catch { setExiting(false); reset(); }
    finally { setBusy(false); }
  };
  return (
    <div ref={rowRef} className="relative overflow-hidden select-none md:select-text" style={{ WebkitUserSelect: "none", maxHeight: exiting ? 0 : 140, opacity: exiting ? 0 : 1, transition: exiting ? "max-height 250ms ease-out, opacity 250ms ease-out" : "none" }}>
      {onTrash && <button type="button" disabled={busy} aria-label="Mettre à la corbeille" onClick={() => void remove()} className="absolute inset-0 w-full bg-[#db766d] flex flex-col gap-1 items-center justify-center text-white transition-[opacity] duration-[250ms] ease-out">
        <Trash2 size={23} aria-hidden="true" />
        <span className="text-xs font-medium">Corbeille</span>
      </button>}
      <div
        className="nexus-mail-row relative bg-nexus-bg will-change-transform"
        style={{
          touchAction: "pan-y",
          transform: `translate3d(${offset}px,0,0)`,
          transition: dragging ? "none" : offset < 0 && offset > -revealWidth
            ? "transform 350ms cubic-bezier(0.2, 1.25, 0.3, 1)"
            : "transform 250ms ease-out",
        }}
        onTouchStart={event => {
          if (!onTrash || busy || event.touches.length !== 1) return;
          const touch = event.touches[0];
          gesture.current = { x: touch.clientX, y: touch.clientY, initial: offsetRef.current, horizontal: null };
        }}
        onTouchMove={event => {
          const g = gesture.current;
          if (!g || !onTrash || busy) return;
          const touch = event.touches[0];
          const dx = touch.clientX - g.x;
          const dy = touch.clientY - g.y;
          if (g.horizontal === null && Math.hypot(dx, dy) > 8) g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
          if (!g.horizontal) return;
          suppressClick.current = true;
          setDragging(true);
          moveTo(Math.max(-(rowRef.current?.offsetWidth ?? window.innerWidth), Math.min(0, g.initial + dx)));
        }}
        onTouchEnd={() => {
          const g = gesture.current;
          if (!g) return;
          gesture.current = null;
          setDragging(false);
          if (!g.horizontal) return;
          const distance = Math.abs(offsetRef.current);
          const width = rowRef.current?.offsetWidth ?? window.innerWidth;
          if (distance > width / 2) { void remove(); return; }
          moveTo(distance > revealWidth / 2 ? -revealWidth : 0);
        }}
        onTouchCancel={() => {
          gesture.current = null;
          setDragging(false);
          moveTo(Math.abs(offsetRef.current) > revealWidth / 2 ? -revealWidth : 0);
        }}
        onClickCapture={event => {
          if (suppressClick.current || offsetRef.current < 0) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
            if (offsetRef.current < 0) reset();
          }
        }}
      >{children}</div>
    </div>
  );
}
