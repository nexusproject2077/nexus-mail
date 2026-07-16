"use client";

import { useState, useMemo } from "react";
import {
  Menu,
  Bell,
  Settings,
  RefreshCw,
  CheckSquare,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import EmailList from "@/components/EmailList";
import EmailView from "@/components/EmailView";
import ComposeModal from "@/components/ComposeModal";
import SearchBar from "@/components/SearchBar";
import SecurityPanel from "@/components/SecurityPanel";
import { threads as allThreads } from "@/lib/mock-data";
import { useVault } from "@/lib/vault";
import type { Thread, Folder } from "@/types/email";

export default function NexusMail() {
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{
    subject: string;
    to: string;
    messageId?: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [securityOpen, setSecurityOpen] = useState(false);
  const { identity, isUnlocked, messages: vaultMessages } = useVault();

  const filteredThreads = useMemo(() => {
    let filtered: Thread[] =
      activeFolder === "vault" ? vaultMessages : allThreads;

    if (activeFolder === "starred") {
      filtered = filtered.filter((t) => t.isStarred);
    } else if (activeFolder === "inbox") {
      filtered = filtered.filter((t) => t.labels.includes("INBOX"));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.snippet.toLowerCase().includes(q) ||
          t.messages.some(
            (m) =>
              m.senderName.toLowerCase().includes(q) ||
              m.senderEmail.toLowerCase().includes(q)
          )
      );
    }

    return filtered;
  }, [activeFolder, searchQuery, vaultMessages]);

  const unreadCount = allThreads.filter(
    (t) => t.isUnread && t.labels.includes("INBOX")
  ).length;

  const handleReply = (threadId: string, messageId: string) => {
    const thread = allThreads.find((t) => t.id === threadId);
    if (!thread) return;
    const msg = thread.messages.find((m) => m.id === messageId);
    if (!msg) return;
    setReplyTo({
      subject: msg.subject,
      to: msg.senderEmail,
      messageId: msg.id,
    });
    setComposeOpen(true);
  };

  const handleCompose = () => {
    setReplyTo(null);
    setComposeOpen(true);
  };

  const folderTitle: Record<Folder, string> = {
    inbox: "Boîte de réception",
    starred: "Favoris",
    sent: "Messages envoyés",
    drafts: "Brouillons",
    trash: "Corbeille",
    all: "Tous les messages",
    vault: "Coffre-fort chiffré",
  };

  return (
    <div className="h-screen flex flex-col bg-nexus-bg">
      {/* Header */}
      <header className="h-14 flex items-center gap-4 px-4 border-b border-nexus-border bg-nexus-surface/80 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nexus-primary to-purple-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-nexus-primary-light to-purple-400 bg-clip-text text-transparent">
            Nexus Mail
          </span>
        </div>

        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setSecurityOpen(true)}
            title="Chiffrement & clés"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium ${
              identity && isUnlocked
                ? "text-green-400 hover:bg-green-500/10"
                : "text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text"
            }`}
          >
            <ShieldCheck size={16} />
            <span className="hidden sm:inline">
              {identity
                ? isUnlocked
                  ? "Chiffré"
                  : "Verrouillé"
                : "Activer E2EE"}
            </span>
          </button>
          <button className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
            <RefreshCw size={18} />
          </button>
          <button className="relative p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-nexus-primary rounded-full" />
            )}
          </button>
          <button className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <Sidebar
            activeFolder={activeFolder}
            onFolderChange={(f) => {
              setActiveFolder(f);
              setSelectedThread(null);
            }}
            onCompose={handleCompose}
            onOpenSecurity={() => setSecurityOpen(true)}
            unreadCount={unreadCount}
            vaultCount={vaultMessages.length}
          />
        )}

        <div className="flex-1 flex">
          {/* Email List Panel */}
          <div
            className={`flex flex-col border-r border-nexus-border bg-nexus-bg ${
              selectedThread ? "w-[380px]" : "flex-1"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-nexus-border">
              <div className="flex items-center gap-3">
                <button className="p-1 rounded hover:bg-nexus-surface-hover text-nexus-text-dim">
                  <CheckSquare size={16} />
                </button>
                <h1 className="text-sm font-semibold text-nexus-text">
                  {folderTitle[activeFolder]}
                </h1>
                <span className="text-xs text-nexus-text-dim bg-nexus-surface-hover px-2 py-0.5 rounded-full">
                  {filteredThreads.length}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-nexus-text-dim">
                <span>Plus récent</span>
                <ChevronDown size={12} />
              </div>
            </div>
            <EmailList
              threads={filteredThreads}
              selectedId={selectedThread?.id || null}
              onSelect={setSelectedThread}
              folder={activeFolder}
            />
          </div>

          {/* Email View Panel */}
          {selectedThread ? (
            <div className="flex-1 flex flex-col bg-nexus-surface/30">
              <EmailView
                thread={selectedThread}
                onBack={() => setSelectedThread(null)}
                onReply={handleReply}
                onNeedUnlock={() => setSecurityOpen(true)}
              />
            </div>
          ) : (
            <div className="flex-1 hidden lg:flex items-center justify-center bg-nexus-surface/30">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-nexus-primary/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">📬</span>
                </div>
                <h3 className="text-lg font-semibold text-nexus-text mb-1">
                  Sélectionnez un message
                </h3>
                <p className="text-sm text-nexus-text-dim">
                  Choisissez un email pour le lire
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ComposeModal
        isOpen={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setReplyTo(null);
        }}
        replyTo={replyTo || undefined}
        onNeedUnlock={() => setSecurityOpen(true)}
      />

      <SecurityPanel
        isOpen={securityOpen}
        onClose={() => setSecurityOpen(false)}
      />
    </div>
  );
}
