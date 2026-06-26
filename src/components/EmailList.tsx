"use client";

import { Star, Paperclip } from "lucide-react";
import { Thread } from "@/types/email";
import { formatEmailDate, getInitials, getAvatarColor, getLabelInfo } from "@/lib/utils";

interface EmailListProps {
  threads: Thread[];
  selectedId: string | null;
  onSelect: (thread: Thread) => void;
  folder: string;
}

export default function EmailList({
  threads,
  selectedId,
  onSelect,
  folder,
}: EmailListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-nexus-text-dim">
        <div className="text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">Aucun message</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((thread) => {
        const lastMsg = thread.messages[thread.messages.length - 1];
        const isSelected = selectedId === thread.id;
        const senderName = lastMsg.senderName;
        const avatarColor = getAvatarColor(lastMsg.senderEmail);
        const userLabel = lastMsg.labelIds.find((l) => l.startsWith("Label_"));
        const labelInfo = userLabel ? getLabelInfo(userLabel) : null;

        return (
          <button
            key={thread.id}
            onClick={() => onSelect(thread)}
            className={`w-full flex items-start gap-3 px-4 py-3 border-b border-nexus-border/50 transition-all text-left ${
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
        );
      })}
    </div>
  );
}
