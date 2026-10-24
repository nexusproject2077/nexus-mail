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
  ServerCog,
  Loader2,
  Inbox,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import EmailList from "@/components/EmailList";
import EmailView from "@/components/EmailView";
import ComposeModal from "@/components/ComposeModal";
import SearchBar from "@/components/SearchBar";
import SecurityPanel from "@/components/SecurityPanel";
import AccountsPanel from "@/components/AccountsPanel";

import { useVault } from "@/lib/vault";
import { useMail, parseLiveId } from "@/lib/useMail";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const { identity, isUnlocked, messages: vaultMessages } = useVault();
  const mail = useMail();

  // A live IMAP account replaces the sample inbox with real mail.
  const liveInbox = mail.configured && !!mail.activeAccountId;

  const filteredThreads = useMemo(() => {
    let filtered: Thread[];

    if (activeFolder === "vault") {
      filtered = vaultMessages;
    } else if (liveInbox) {
      if (activeFolder === "inbox") filtered = mail.threads;
      else if (activeFolder === "starred")
        filtered = mail.threads.filter((t) => t.isStarred);
      else filtered = []; // sent/drafts/trash not yet backed by IMAP
    } else {
      filtered = []; // Never display sample emails as a real inbox.
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
  }, [activeFolder, searchQuery, vaultMessages, liveInbox, mail.threads]);

  const unreadCount = mail.threads.filter((t) => t.isUnread).length;

  // Live messages arrive as summaries; fetch the full body on selection.
  const handleSelectThread = async (t: Thread | null) => {
    setSelectedThread(t);
    if (t && parseLiveId(t.id)) {
      try {
        const full = await mail.loadDetail(t);
        setSelectedThread((cur) => (cur?.id === full.id ? full : cur));
      } catch {
        /* keep the summary view if the body fetch fails */
      }
    }
  };

  const handleReply = (threadId: string, messageId: string) => {
    const thread =
      selectedThread?.id === threadId
        ? selectedThread
        : mail.threads.find((t) => t.id === threadId);
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
    <div className="h-dvh min-w-0 flex flex-col overflow-hidden bg-nexus-bg">
      {/* Header */}
      <header className="min-h-14 flex items-center gap-2 sm:gap-4 px-2 sm:px-4 border-b border-nexus-border bg-nexus-surface/80 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted"
        >
          <Menu size={20} />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nexus-primary to-purple-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="text-lg font-bold bg-gradient-to-r from-nexus-primary-light to-purple-400 bg-clip-text text-transparent">
            Nexus Mail
          </span>
        </div>

        <div className="min-w-0 flex-1 max-w-2xl"><SearchBar value={searchQuery} onChange={setSearchQuery} /></div>

        <div className="flex shrink-0 items-center gap-0 sm:gap-1 ml-auto">
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
          <button
            onClick={() => setAccountsOpen(true)}
            title="Comptes de messagerie"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium ${
              liveInbox
                ? "text-nexus-primary-light hover:bg-nexus-primary/10"
                : "text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text"
            }`}
          >
            <ServerCog size={16} />
            <span className="hidden md:inline max-w-[160px] truncate">
              {mail.accounts.find((a) => a.id === mail.activeAccountId)?.email ??
                "Comptes"}
            </span>
          </button>
          <button
            onClick={() => liveInbox ? void mail.refreshMessages() : setAccountsOpen(true)}
            disabled={mail.loading}
            title={liveInbox ? "Synchroniser les emails" : "Connecter un compte pour synchroniser"}
            className="p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text disabled:opacity-40"
          >
            {mail.loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} />
            )}
          </button>
          <button className="relative hidden sm:block p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text">
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
      <div className="relative flex-1 flex min-h-0 min-w-0 overflow-hidden">
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

        <div className="flex-1 flex min-w-0 min-h-0">
          {/* Email List Panel */}
          <div
            className={`min-w-0 min-h-0 flex-col border-r border-nexus-border bg-nexus-bg ${
              selectedThread ? "hidden lg:flex lg:w-[clamp(300px,32vw,420px)] lg:shrink-0" : "flex flex-1"
            }`}
          >
            <div className="flex min-w-0 items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-nexus-border">
              <div className="flex items-center gap-3">
                <button className="p-1 rounded hover:bg-nexus-surface-hover text-nexus-text-dim">
                  <CheckSquare size={16} />
                </button>
                <h1 className="text-sm font-semibold text-nexus-text truncate">
                  {folderTitle[activeFolder]}
                </h1>
                <span className="text-xs text-nexus-text-dim bg-nexus-surface-hover px-2 py-0.5 rounded-full">
                  {filteredThreads.length}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-xs text-nexus-text-dim">
                <span>Plus récent</span>
                <ChevronDown size={12} />
              </div>
            </div>
            {mail.error && liveInbox && (
              <div className="mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                Erreur de synchronisation : {mail.error}
              </div>
            )}
            {!liveInbox && activeFolder !== "vault" && (
              <div className="mx-4 mt-4 rounded-xl border border-nexus-border bg-nexus-surface p-4 text-sm text-nexus-text">
                <p className="font-semibold">Aucun compte de messagerie connecté</p>
                <p className="mt-1 text-nexus-text-dim">Les emails de démonstration ont été masqués. Connectez un compte IMAP pour récupérer vos vrais messages.</p>
                <button type="button" onClick={() => setAccountsOpen(true)} className="mt-3 rounded-lg bg-nexus-primary px-3 py-2 text-white">Configurer la synchronisation</button>
              </div>
            )}
            <EmailList
              threads={filteredThreads}
              selectedId={selectedThread?.id || null}
              onSelect={handleSelectThread}
              folder={activeFolder}
            />
          </div>

          {/* Email View Panel */}
          {selectedThread ? (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-nexus-surface/30">
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
                  <Inbox size={40} strokeWidth={1.5} className="text-nexus-primary-light" aria-hidden="true" />
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
        activeAccountId={mail.activeAccountId}
        onSent={() => void mail.refreshMessages()}
      />

      <SecurityPanel
        isOpen={securityOpen}
        onClose={() => setSecurityOpen(false)}
      />

      <AccountsPanel
        isOpen={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        accounts={mail.accounts}
        onChanged={mail.refreshAccounts}
      />
    </div>
  );
}
