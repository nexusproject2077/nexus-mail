"use client";

import {
  ArrowLeft,
  Star,
  Reply,
  Forward,
  Trash2,
  Archive,
  MoreHorizontal,
  Tag,
} from "lucide-react";
import { Thread } from "@/types/email";
import {
  formatFullDate,
  getInitials,
  getAvatarColor,
  getLabelInfo,
} from "@/lib/utils";

interface EmailViewProps {
  thread: Thread;
  onBack: () => void;
  onReply: (threadId: string, messageId: string) => void;
}

export default function EmailView({ thread, onBack, onReply }: EmailViewProps) {
  const lastMsg = thread.messages[thread.messages.length - 1];

  return (
    <div className="flex-1 flex flex-col animate-slide-in">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-nexus-border">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="flex-1 text-lg font-semibold truncate">
          {thread.subject}
        </h2>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
            <Archive size={18} />
          </button>
          <button className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
            <Trash2 size={18} />
          </button>
          <button className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {thread.messages.map((msg, idx) => {
          const avatarColor = getAvatarColor(msg.senderEmail);
          const userLabel = msg.labelIds.find((l) => l.startsWith("Label_"));
          const labelInfo = userLabel ? getLabelInfo(userLabel) : null;

          return (
            <div
              key={msg.id}
              className={`mb-6 ${idx > 0 ? "pt-6 border-t border-nexus-border/50" : ""}`}
            >
              <div className="flex items-start gap-4 mb-4">
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
                <button className="p-1.5 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-yellow-400 transition-colors">
                  <Star size={16} />
                </button>
              </div>

              <div className="pl-14">
                <div className="text-sm text-nexus-text leading-relaxed whitespace-pre-wrap bg-nexus-surface-hover/30 rounded-xl p-4">
                  {msg.snippet}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-nexus-border flex items-center gap-3">
        <button
          onClick={() => onReply(thread.id, lastMsg.id)}
          className="flex items-center gap-2 px-4 py-2.5 bg-nexus-primary hover:bg-nexus-primary-dark text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg hover:shadow-nexus-primary/25"
        >
          <Reply size={16} />
          Répondre
        </button>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-nexus-surface-hover hover:bg-nexus-surface-active text-nexus-text rounded-xl text-sm transition-all border border-nexus-border">
          <Forward size={16} />
          Transférer
        </button>
      </div>
    </div>
  );
}
