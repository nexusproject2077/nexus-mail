"use client";

import { useState } from "react";
import { X, Minus, Maximize2, Send, Paperclip, Smile, Trash2 } from "lucide-react";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyTo?: { subject: string; to: string; messageId?: string };
}

export default function ComposeModal({
  isOpen,
  onClose,
  replyTo,
}: ComposeModalProps) {
  const [to, setTo] = useState(replyTo?.to || "");
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` : ""
  );
  const [body, setBody] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!to.trim()) return;
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      onClose();
      setTo("");
      setSubject("");
      setBody("");
    }, 800);
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-nexus-surface border border-nexus-border rounded-t-xl px-4 py-2.5 text-sm font-medium text-nexus-text hover:bg-nexus-surface-hover transition-colors shadow-xl"
        >
          <Send size={14} className="text-nexus-primary-light" />
          {subject || "Nouveau message"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-6 z-50 w-[520px] animate-fade-in">
      <div className="bg-nexus-surface border border-nexus-border rounded-t-xl shadow-2xl shadow-black/50 flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-2.5 bg-nexus-surface-active rounded-t-xl cursor-move">
          <span className="text-sm font-medium">
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

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="flex-1 min-h-[200px] px-4 py-3 bg-transparent text-sm text-nexus-text outline-none resize-none placeholder:text-nexus-text-dim"
          placeholder="Rédigez votre message..."
        />

        <div className="flex items-center justify-between px-4 py-3 border-t border-nexus-border">
          <button
            onClick={handleSend}
            disabled={isSending || !to.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg hover:shadow-nexus-primary/25"
          >
            <Send size={14} />
            {isSending ? "Envoi..." : "Envoyer"}
          </button>
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors">
              <Paperclip size={16} />
            </button>
            <button className="p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors">
              <Smile size={16} />
            </button>
            <button
              onClick={onClose}
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

