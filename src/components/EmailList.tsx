"use client";

import { MailOpen, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Star, Paperclip } from "lucide-react";
import { Thread } from "@/types/email";
import { formatEmailDate, getInitials, getAvatarColor, getLabelInfo } from "@/lib/utils";

interface EmailListProps {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (thread: Thread) => void;
  folder: string;
  onTrash?: (thread: Thread) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export default function EmailList({
  threads,
  selectedId,
  onSelect,
  folder,
  onTrash,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: EmailListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastLoadCount = useRef(-1);
  const requestNext = () => {
    if (!hasMore || loadingMore || !onLoadMore || lastLoadCount.current === threads.length) return;
    lastLoadCount.current = threads.length;
    onLoadMore();
  };
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore) return;
    const root = scrollRef.current;
    const target = bottomRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) requestNext();
    }, { root, rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, threads.length]);
  useEffect(() => { if (!hasMore) lastLoadCount.current = -1; }, [hasMore]);

  if (threads.length === 0) {
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
    <div ref={scrollRef} className="nexus-mail-list flex-1 min-h-0 min-w-0 overflow-y-auto" onScroll={event => { const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 650) requestNext(); }} onTouchEnd={event => { const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 900) requestNext(); }}>
      {threads.map((thread) => {
        const lastMsg = thread.messages[thread.messages.length - 1];
        const isSelected = selectedId === thread.id;
        const senderName = lastMsg.senderName;
        const avatarColor = getAvatarColor(lastMsg.senderEmail);
        const userLabel = lastMsg.labelIds.find((l) => l.startsWith("Label_"));
        const labelInfo = userLabel ? getLabelInfo(userLabel) : null;

        return (
          <SwipeEmailRow key={thread.id} thread={thread} onSelect={onSelect} onTrash={onTrash}>
          <button
            onClick={() => onSelect(thread)}
            className={`w-full flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b border-nexus-border/50 transition-all text-left ${
              isSelected
                ? "bg-nexus-primary/10 border-l-2 border-l-nexus-primary"
                : thread.isUnread
                ? "bg-nexus-unread hover:bg-nexus-surface-hover border-l-2 border-l-transparent"
                : "hover:bg-nexus-surface-hover border-l-2 border-l-transparent"
            }`}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
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
                  {senderName}
                </span>
                <span className="text-xs text-nexus-text-dim whitespace-nowrap flex-shrink-0">
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

              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-nexus-text-dim truncate flex-1">
                  {thread.snippet}
                </span>
                {labelInfo && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
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
          </SwipeEmailRow>
        );
      })}
      <div ref={bottomRef} aria-hidden="true" className="h-px" />
      {hasMore && <div role="status" className="nexus-mail-loading w-full py-4 text-center text-xs text-nexus-text-muted">{loadingMore ? "Chargement des anciens emails…" : "Fais défiler pour voir les anciens emails"}</div>}
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
    moveTo(-window.innerWidth);
    await new Promise<void>(resolve => window.setTimeout(resolve, 160));
    setExiting(true);
    try { await onTrash(thread); }
    catch { setExiting(false); reset(); }
    finally { setBusy(false); }
  };
  return (
    <div className="relative overflow-hidden select-none md:select-text" style={{ WebkitUserSelect: "none", maxHeight: exiting ? 0 : 140, opacity: exiting ? 0 : 1, transition: exiting ? "max-height 180ms ease-out, opacity 140ms ease-out" : "none" }}>
      {onTrash && <button type="button" disabled={busy} aria-label="Mettre à la corbeille" onClick={() => void remove()} className="absolute inset-y-0 right-0 w-28 bg-[#db766d] flex flex-col gap-1 items-center justify-center text-white">
        <Trash2 size={23} aria-hidden="true" />
        <span className="text-xs font-medium">Corbeille</span>
      </button>}
      <div
        className="nexus-mail-row relative bg-nexus-bg"
        style={{ touchAction: "pan-y", transform: `translate3d(${offset}px,0,0)`, transition: dragging ? "none" : "transform 210ms cubic-bezier(.2,.8,.2,1)" }}
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
          if (g.horizontal === null && Math.hypot(dx, dy) > 7) g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.15;
          if (!g.horizontal) return;
          suppressClick.current = true;
          setDragging(true);
          moveTo(Math.max(-Math.min(260, window.innerWidth * .75), Math.min(0, g.initial + dx)));
        }}
        onTouchEnd={() => {
          const g = gesture.current;
          if (!g) return;
          gesture.current = null;
          setDragging(false);
          if (!g.horizontal) return;
          const dx = offsetRef.current;
          if (dx <= -205) { void remove(); return; }
          moveTo(dx < -45 ? -revealWidth : 0);
        }}
        onTouchCancel={() => { gesture.current = null; setDragging(false); moveTo(offsetRef.current <= -45 ? -revealWidth : 0); }}
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
