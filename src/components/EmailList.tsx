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
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore) return;
    const root = scrollRef.current;
    const target = bottomRef.current;
    if (!root || !target) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) onLoadMore();
    }, { root, rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, threads.length]);

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
    <div ref={scrollRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto" onScroll={event => { const el = event.currentTarget; if (hasMore && !loadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 500) onLoadMore?.(); }}>
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
      {hasMore && <button type="button" disabled={loadingMore} onClick={onLoadMore} className="w-full py-4 text-sm text-nexus-text-muted hover:text-nexus-text disabled:opacity-60">{loadingMore ? "Chargement des anciens emails…" : "Charger les emails plus anciens"}</button>}
    </div>
  );
}

function SwipeEmailRow({ thread, onSelect, onTrash, children }: {
  thread: Thread;
  onSelect: (thread: Thread) => void;
  onTrash?: (thread: Thread) => Promise<void>;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const current = useRef(0);
  const suppressClick = useRef(false);
  const active = !!onTrash && !busy;
  const reset = () => { current.current = 0; setOffset(0); setDragging(false); start.current = null; };
  return (
    <div className="relative overflow-hidden md:overflow-visible select-none md:select-text" style={{ WebkitUserSelect: "none", maxHeight: exiting ? 0 : 140, opacity: exiting ? 0 : 1, transition: exiting ? "max-height 180ms ease-out, opacity 140ms ease-out" : "none" }}>
      {active && <div className="absolute inset-y-0 right-0 w-full bg-red-600 flex justify-end items-center pr-6 text-white pointer-events-none">
        <Trash2 size={22} aria-hidden="true" />
        <span className="ml-2 text-sm font-medium">Corbeille</span>
      </div>}
      <div
        className="relative bg-nexus-bg touch-pan-y"
        style={{ transform: `translate3d(${offset}px,0,0)`, transition: dragging ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)", willChange: dragging ? "transform" : "auto" }}
        onTouchStart={event => {
          if (!active || event.touches.length !== 1) return;
          const t = event.touches[0];
          start.current = { x: t.clientX, y: t.clientY, horizontal: null };
          current.current = 0;
        }}
        onTouchMove={event => {
          if (!start.current || !active) return;
          const t = event.touches[0];
          const dx = t.clientX - start.current.x;
          const dy = t.clientY - start.current.y;
          if (start.current.horizontal === null && Math.hypot(dx,dy) > 8) start.current.horizontal = Math.abs(dx) > Math.abs(dy) * 1.25;
          if (!start.current.horizontal) return;
          suppressClick.current = true;
          setDragging(true);
          current.current = Math.max(-Math.min(220, window.innerWidth * 0.65), Math.min(0, dx));
          setOffset(current.current);
        }}
        onTouchEnd={async () => {
          if (!start.current) return;
          const dx = current.current;
          if (dx > -100 || !active) { reset(); return; }
          start.current = null;
          setDragging(false);
          setBusy(true);
          setOffset(-window.innerWidth);
          await new Promise(resolve => window.setTimeout(resolve, 160));
          setExiting(true);
          try { await onTrash?.(thread); }
          catch { setExiting(false); reset(); }
          finally { setBusy(false); }
        }}
        onTouchCancel={reset}
        onClickCapture={event => {
          if (suppressClick.current) { event.stopPropagation(); event.preventDefault(); suppressClick.current = false; }
        }}
      >{children}</div>
    </div>
  );
}
