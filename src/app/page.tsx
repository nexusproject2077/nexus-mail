"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Menu,
  Pencil,
  Bell,
  Settings,
  RefreshCw,
  Loader2,
  CheckSquare,
  ChevronDown,
  ShieldCheck,
  ServerCog,
  CircleUserRound,
  Inbox,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import EmailList from "@/components/EmailList";
import DeliveriesPanel from "@/components/DeliveriesPanel";
import EmailView from "@/components/EmailView";
import ComposeModal from "@/components/ComposeModal";
import SearchBar from "@/components/SearchBar";
import SecurityPanel from "@/components/SecurityPanel";
import AccountsPanel from "@/components/AccountsPanel";
import SettingsPanel, { DEFAULT_SETTINGS, type NexusSettings } from "@/components/SettingsPanel";

import { useVault } from "@/lib/vault";
import { useMail, parseLiveId, summaryToThread } from "@/lib/useMail";
import { blockMailSender, changeMailCategory, getMessages } from "@/lib/api";
import type { Thread, Folder } from "@/types/email";

export default function NexusMail() {
  const [activeFolder, setActiveFolder] = useState<Folder>("inbox");

  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Thread[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeFabCompact, setComposeFabCompact] = useState(false);
  const [mailtoDraft, setMailtoDraft] = useState<{ to: string; subject: string; body: string; html?: string; quotedText?: string; forwardAttachments?: { accountId: string; uid: string; mailbox: string; items: { id: string; filename: string; contentType: string }[] } } | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("compose") !== "1") return;
    setMailtoDraft({ to: url.searchParams.get("to") ?? "", subject: url.searchParams.get("subject") ?? "", body: url.searchParams.get("body") ?? "" });
    setComposeOpen(true);
    window.history.replaceState(window.history.state, "", url.pathname);
  }, []);
  const [replyTo, setReplyTo] = useState<{
    subject: string;
    to: string;
    messageId?: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [drawerDragX, setDrawerDragX] = useState(0);
  const [drawerDragging, setDrawerDragging] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTouch = useRef<{ startX: number; startY: number; horizontal: boolean | null } | null>(null);
  const closeDrawer = () => { setDrawerDragging(false); setDrawerDragX(0); setSidebarOpen(false); };
  const onDrawerTouchStart = (event: import("react").TouchEvent<HTMLDivElement>) => {
    if (!sidebarOpen || event.touches.length !== 1) return;
    drawerTouch.current = { startX: event.touches[0].clientX, startY: event.touches[0].clientY, horizontal: null };
  };
  const onDrawerTouchMove = (event: import("react").TouchEvent<HTMLDivElement>) => {
    const touch = drawerTouch.current;
    if (!touch || !sidebarOpen) return;
    const dx = event.touches[0].clientX - touch.startX;
    const dy = event.touches[0].clientY - touch.startY;
    if (touch.horizontal === null && Math.hypot(dx, dy) > 8) touch.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (!touch.horizontal) return;
    setDrawerDragging(true);
    setDrawerDragX(Math.max(-(drawerRef.current?.offsetWidth ?? window.innerWidth * 0.8), Math.min(0, dx)));
  };
  const onDrawerTouchEnd = () => {
    if (!drawerTouch.current) return;
    drawerTouch.current = null;
    setDrawerDragging(false);
    if (Math.abs(drawerDragX) > (drawerRef.current?.offsetWidth ?? window.innerWidth * 0.8) / 2) closeDrawer();
    else setDrawerDragX(0);
  };
  const [securityOpen, setSecurityOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NexusSettings>(DEFAULT_SETTINGS);
  const [messageActionError, setMessageActionError] = useState<string | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);
  const { identity, isUnlocked, messages: vaultMessages } = useVault();
  const mail = useMail();
  const tabListRef = useRef<HTMLDivElement>(null);
  const [tabIndicator, setTabIndicator] = useState<{left: number; width: number} | null>(null);
  useEffect(() => {
    const update = () => {
      const container = tabListRef.current;
      const active = container?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (active) setTabIndicator({left: active.offsetLeft, width: active.offsetWidth});
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [mail.category, mail.categoryCounts, activeFolder]);

  // A live IMAP account replaces the sample inbox with real mail.
  const liveInbox = mail.configured && !!mail.activeAccountId;

  useEffect(() => {
    if (!liveInbox || searchQuery.trim().length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      mail.searchMessages(searchQuery.trim()).then(results => {
        if (!cancelled) { setSearchResults(results); setSearchError(null); }
      }).catch(error => { if (!cancelled) setSearchError((error as Error).message); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchQuery, liveInbox, mail.searchMessages]);

  const [specialThreads, setSpecialThreads] = useState<Thread[]>([]);
  const [specialLoading, setSpecialLoading] = useState(false);
  useEffect(() => {
    if (activeFolder !== "drafts" && activeFolder !== "starred") {
      setSpecialThreads([]);
      setSpecialLoading(false);
      return;
    }
    const ids = mail.activeAccountId === "all" ? mail.accounts : mail.accounts.filter(account => account.id === mail.activeAccountId);
    if (!ids.length) return;
    let cancelled = false;
    setSpecialThreads([]);
    setSpecialLoading(true);
    void (async () => {
      const mailbox = activeFolder === "drafts" ? "DRAFT" : "STARRED";
      const results = await Promise.allSettled(ids.map(async account => {
        if (account.authType !== "google_oauth" && activeFolder === "starred") return [];
        const folder = account.authType === "google_oauth" ? mailbox : "Drafts";
        const found: Thread[] = [];
        let cursor: string | undefined;
        const visited = new Set<string>();
        do {
          const page = await getMessages(account.id, folder, 100, cursor);
          found.push(...page.messages.map(message => summaryToThread(account.id, message, folder)));
          cursor = page.nextCursor ?? undefined;
          if (cursor && visited.has(cursor)) break;
          if (cursor) visited.add(cursor);
        } while (cursor && !cancelled);
        return found;
      }));
      if (cancelled) return;
      const fetched = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
      const unique = [...new Map(fetched.map(thread => [thread.id, thread])).values()];
      setSpecialThreads(unique.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)));
      setSpecialLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeFolder, mail.activeAccountId, mail.accounts]);

  const filteredThreads = useMemo(() => {
    let filtered: Thread[];

    if (activeFolder === "deliveries") {
      filtered = liveInbox ? mail.threads : [];
    } else if (activeFolder === "vault") {
      filtered = vaultMessages;
    } else if (liveInbox) {
      if (mail.selectedLabel) filtered = mail.threads;
      else if (activeFolder === "inbox") filtered = mail.threads.filter(t => t.labels.includes("INBOX") && (t.labels.includes(mail.category) || (mail.category === "CATEGORY_PERSONAL" && !t.labels.some(label => ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES"].includes(label)))));
      else if (activeFolder === "all") filtered = mail.threads;
      else if (activeFolder === "starred")
        filtered = [...specialThreads, ...mail.threads.filter(t => t.isStarred)].filter((t, index, items) => items.findIndex(other => other.id === t.id) === index);
      else if (activeFolder === "drafts") filtered = specialThreads;
      else filtered = []; // sent/trash not yet backed by IMAP
    } else {
      filtered = []; // Never display sample emails as a real inbox.
    }

    if (liveInbox && searchQuery.trim().length >= 2) return searchResults;
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
  }, [activeFolder, mail.category, mail.accounts, searchQuery, vaultMessages, liveInbox, mail.threads, mail.selectedLabel, searchResults, specialThreads]);

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

  const handleTrash = async () => {
    if (!selectedThread || trashBusy) return;
    setTrashBusy(true);
    setMessageActionError(null);
    try {
      await mail.trashThread(selectedThread);
      setSelectedThread(null);
    } catch (e) {
      setMessageActionError((e as Error).message);
    } finally {
      setTrashBusy(false);
    }
  };

  const handleAction = async (action: "read" | "unread" | "star" | "unstar" | "archive") => {
    if (!selectedThread) return;
    setMessageActionError(null);
    try {
      await mail.actionThread(selectedThread, action);
      if (action === "archive" || action === "unread") { setSelectedThread(null); setActiveFolder("inbox"); }
      else setSelectedThread(current => current ? { ...current,
        isUnread: action === "read" ? false : current.isUnread,
        isStarred: action === "star" ? true : action === "unstar" ? false : current.isStarred,
      } : current);
    } catch (error) { setMessageActionError((error as Error).message); }
  };

  const handleMessageCompose = (threadId: string, messageId: string, kind: "reply" | "forward") => {
    const thread = selectedThread?.id === threadId ? selectedThread : mail.threads.find(t => t.id === threadId);
    const msg = thread?.messages.find(m => m.id === messageId);
    if (!msg || !thread) return;
    const prefix = kind === "reply" ? "Re:" : "Fwd:";
    const subject = /^(re|fwd|fw|tr):/i.test(msg.subject) && kind === "reply" ? msg.subject : `${prefix} ${msg.subject}`;
    const date = new Date(msg.date).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
    const quote = kind === "reply" ? `Le ${date}, ${msg.senderName || msg.senderEmail} a écrit :` : `---------- Message transféré ----------\nDe : ${msg.sender}\nDate : ${date}\nObjet : ${msg.subject}\nÀ : ${msg.toRecipients.join(", ")}`;
    const cleanText = (value: unknown) => typeof value === "string" && !/^(null|undefined)$/i.test(value.trim()) ? value : "";
    const normalizeLines = (value: string) => value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n?/g, "\n");
    const original = normalizeLines(cleanText(msg.body) || cleanText(msg.snippet));
    const quotedText = `${quote}\n${original.split("\n").map(line => kind === "reply" ? `> ${line}` : line).join("\n")}`;
    const body = "";
    const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const quoteHtml = escapeHtml(quote).replace(/\n/g, "<br />");
    const originalHtml = cleanText(msg.htmlBody);
    const html = originalHtml ? `<div style="line-height:1.6;overflow-wrap:anywhere">${quoteHtml}</div><hr />${originalHtml}` : `<div style="line-height:1.6;overflow-wrap:anywhere">${quoteHtml}<br />${escapeHtml(original).replace(/\n/g, "<br />")}</div>`;
    const parsed = parseLiveId(msg.id);
    setReplyTo(null);
    setMailtoDraft({
      to: kind === "reply" ? msg.senderEmail : "",
      subject,
      body,
      html,
      quotedText,
      forwardAttachments: kind === "forward" && parsed && msg.attachments?.length ? {
        accountId: parsed.accountId, uid: parsed.uid, mailbox: thread.mailbox ?? "INBOX",
        items: msg.attachments.map(a => ({ id: a.id, filename: a.filename, contentType: a.contentType })),
      } : undefined,
    });
    setComposeOpen(true);
  };

  const handleReply = (threadId: string, messageId: string) => handleMessageCompose(threadId, messageId, "reply");
  const handleForward = (threadId: string, messageId: string) => handleMessageCompose(threadId, messageId, "forward");

  const handleCompose = () => {
    setMailtoDraft(null);
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
    deliveries: "Mes livraisons",
  };

  return (
    <div className="h-dvh min-w-0 flex flex-col overflow-hidden bg-nexus-bg">
      {/* Keep an opaque, viewport-fixed layer behind the iOS status bar, like the hamburger drawer. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[90] bg-black" style={{ height: "env(safe-area-inset-top, 0px)", transform: "translateZ(0)", WebkitTransform: "translateZ(0)" }} />
      {/* Header */}
      <header className={`${selectedThread ? "hidden lg:flex" : "flex"} relative z-20 min-h-16 items-center gap-2 sm:gap-4 px-3 sm:px-5 py-2 pt-[max(8px,env(safe-area-inset-top))] border-b border-nexus-border bg-black flex-shrink-0`}>
        <button
          onClick={() => { if (window.matchMedia("(min-width: 1024px)").matches) setDesktopSidebarOpen(value => !value); else { setDrawerDragX(0); setSidebarOpen(!sidebarOpen); } }}
          className="nexus-interactive flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1a1a1a] hover:bg-[#252525] transition-colors text-white"
        >
          <Menu size={23} />
        </button>

        <div className="hidden sm:flex shrink-0 items-center gap-0 pr-1" aria-label="Nexus Mail">
          <svg aria-hidden="true" viewBox="0 0 64 64" className="h-11 w-11 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 33 11 L 16 27 L 33 43" />
            <path d="M 35 25 L 51 41 L 35 57" />
          </svg>
          <span className="text-[36px] font-normal leading-none tracking-tight text-white whitespace-nowrap">Mail</span>
        </div>

        <div className="min-w-0 flex-1 max-w-3xl lg:mx-2"><SearchBar value={searchQuery} onChange={setSearchQuery} /></div>

        <div className="relative shrink-0 sm:hidden">
          <button type="button" onClick={() => setProfileMenuOpen(value => !value)} aria-label="Compte et sécurité" aria-expanded={profileMenuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10">
            <CircleUserRound size={26} />
          </button>
          {profileMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-white/15 bg-[#1a1a1a] p-1.5 shadow-2xl">
              <button type="button" onClick={() => { setProfileMenuOpen(false); setAccountsOpen(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/10"><ServerCog size={18} /> Comptes de messagerie</button>
              <button type="button" onClick={() => { setProfileMenuOpen(false); setSecurityOpen(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/10"><ShieldCheck size={18} /> Sécurité et chiffrement</button>
              <button type="button" onClick={() => { setProfileMenuOpen(false); setSettingsOpen(true); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white hover:bg-white/10"><Settings size={18} /> Paramètres</button>
            </div>
          )}
        </div>
        <div className="hidden sm:flex shrink-0 items-center rounded-xl border border-white/10 bg-[#111] p-1 shadow-sm ml-auto">
          <button
            onClick={() => setSecurityOpen(true)}
            title="Chiffrement & clés"
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors text-xs font-medium ${
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
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors text-xs font-medium ${
              liveInbox
                ? "text-nexus-primary-light hover:bg-nexus-primary/10"
                : "text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text"
            }`}
          >
            <ServerCog size={16} />
            <span className="hidden md:inline max-w-[160px] truncate">
              {mail.activeAccountId === "all"
                ? "Toutes les boîtes"
                : mail.accounts.find((a) => a.id === mail.activeAccountId)?.email ?? "Comptes"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => liveInbox ? void mail.refreshMessages() : setAccountsOpen(true)}
            disabled={mail.loading || mail.loadingMore}
            title={liveInbox ? "Actualiser les e-mails" : "Connecter un compte"}
            aria-label={liveInbox ? "Actualiser les e-mails" : "Connecter un compte"}
            className="hidden md:inline-flex items-center justify-center p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-nexus-text transition-colors disabled:opacity-40"
          >
            {mail.loading || mail.loadingMore ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          </button>
          <button className="relative hidden sm:block p-2 rounded-lg hover:bg-nexus-surface-hover transition-colors text-nexus-text-muted hover:text-nexus-text" aria-label="Notifications">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-nexus-primary rounded-full" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative flex-1 flex min-h-0 min-w-0 overflow-hidden">
        <div className={`fixed inset-0 z-[80] lg:hidden transition-[visibility] duration-[250ms] ${sidebarOpen ? "visible" : "invisible pointer-events-none"}`} aria-hidden={!sidebarOpen}>
          <button type="button" aria-label="Fermer le menu" onClick={closeDrawer} className={`absolute inset-0 bg-black/50 transition-opacity duration-[250ms] ease-out ${sidebarOpen ? "opacity-100" : "opacity-0"}`} />
          <div ref={drawerRef} onTouchStart={onDrawerTouchStart} onTouchMove={onDrawerTouchMove} onTouchEnd={onDrawerTouchEnd} onTouchCancel={onDrawerTouchEnd} style={{ transform: sidebarOpen ? `translate3d(${drawerDragX}px,0,0)` : "translate3d(-100%,0,0)", transition: drawerDragging ? "none" : drawerDragX < 0 ? "transform 350ms cubic-bezier(0.2, 1.25, 0.3, 1)" : "transform 250ms ease-out" }} className="absolute inset-y-0 left-0 w-[80vw] max-w-[360px] h-full overflow-hidden rounded-r-[40px] shadow-2xl will-change-transform motion-reduce:transition-none">
          <Sidebar
            activeFolder={activeFolder}
            onFolderChange={(f) => {
              setActiveFolder(f);
              mail.selectLabel(null);
              setSelectedThread(null);
              setSidebarOpen(false);
            }}
            onOpenSecurity={() => { setSidebarOpen(false); setSecurityOpen(true); }}
            onOpenSettings={() => { setSidebarOpen(false); setSettingsOpen(true); }}
            unreadCount={unreadCount}
            vaultCount={vaultMessages.length}
            labels={mail.labels}
            activeAccountId={mail.activeAccountId}
            selectedLabel={mail.selectedLabel}
            onSelectLabel={(label) => {
              mail.selectLabel(label);
              setActiveFolder("inbox");
              setSelectedThread(null);
              setSidebarOpen(false);
            }}
          />
          </div>
        </div>

        <div className={`hidden lg:flex shrink-0 min-h-0 overflow-hidden border-r border-nexus-border transition-[width] duration-200 ${desktopSidebarOpen ? "w-[280px]" : "w-[72px]"}`}>
          <Sidebar compact={!desktopSidebarOpen} activeFolder={activeFolder} onFolderChange={(f) => { setActiveFolder(f); mail.selectLabel(null); setSelectedThread(null); }} onOpenSecurity={() => setSecurityOpen(true)} onOpenSettings={() => setSettingsOpen(true)} unreadCount={unreadCount} vaultCount={vaultMessages.length} labels={mail.labels} activeAccountId={mail.activeAccountId} selectedLabel={mail.selectedLabel} onSelectLabel={(label) => { mail.selectLabel(label); setActiveFolder("inbox"); setSelectedThread(null); }} />
        </div>
        <div className="flex-1 flex min-w-0 min-h-0">
          {activeFolder === "deliveries" && !selectedThread ? (
            <DeliveriesPanel threads={liveInbox ? mail.threads : []} onOpen={(thread) => void handleSelectThread(thread)} />
          ) : (
          <>
          {/* Email List Panel */}
          <div
            className={`min-w-0 min-h-0 flex-col bg-nexus-bg lg:border-r lg:border-nexus-border ${
              selectedThread ? "hidden lg:flex lg:w-[clamp(300px,32vw,420px)] lg:shrink-0" : "flex flex-1"
            }`}
          >
            <div className="flex min-w-0 items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-nexus-border">
              <div className="flex items-center gap-3">
                <button className="p-1 rounded hover:bg-nexus-surface-hover text-nexus-text-dim">
                  <CheckSquare size={16} />
                </button>
                <h1 className="text-sm font-semibold text-nexus-text truncate">
                  {mail.selectedLabel?.name ?? folderTitle[activeFolder]}
                </h1>
                <span className="text-xs text-nexus-text-dim bg-nexus-surface-hover px-2 py-0.5 rounded-xl">
                  {filteredThreads.length}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-xs text-nexus-text-dim">
                <span>Plus récent</span>
                <ChevronDown size={12} />
              </div>
            </div>
            {activeFolder === "inbox" && !mail.selectedLabel && (
              <div ref={tabListRef} role="tablist" aria-label="Catégories Gmail" className="relative flex gap-0.5 overflow-x-auto border-b border-nexus-border/40 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {tabIndicator && <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 rounded-full bg-white pointer-events-none transition-[left,width] duration-[250ms] ease-out motion-reduce:transition-none" style={{left: tabIndicator.left, width: tabIndicator.width}} />}
                {([
                  ["CATEGORY_PERSONAL", "Principale"],
                  ["CATEGORY_PROMOTIONS", "Promotions"],
                  ["CATEGORY_SOCIAL", "Réseaux sociaux"],
                  ["CATEGORY_UPDATES", "Notifications"],
                ] as const).map(([id, title]) => (
                  <button key={id} type="button" role="tab" aria-selected={mail.category === id}
                    onClick={() => mail.setCategory(id)}
                    className={`relative z-10 shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-[color,transform,opacity] duration-[250ms] ease-out active:scale-[0.95] active:opacity-80 ${mail.category === id ? "text-black" : "text-nexus-text-muted hover:text-nexus-text"}`}>
                    {title}{mail.categoryCounts && <span className="ml-1.5 text-xs opacity-70">{mail.categoryCounts[id] ?? "—"}</span>}
                  </button>
                ))}
              </div>
            )}
            {searchError && <div role="alert" className="mx-4 mt-3 text-xs text-red-400">{searchError}</div>}
            {messageActionError && (
              <div role="alert" className="mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                Action impossible : {messageActionError}
              </div>
            )}
            {mail.error && liveInbox && (
              <div className="mx-4 mt-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                Erreur de synchronisation : {mail.error}
              </div>
            )}
            {!liveInbox && activeFolder !== "vault" && (
              <div className="mx-4 mt-4 rounded-xl border border-nexus-border bg-nexus-surface p-4 text-sm text-nexus-text">
                <p className="font-semibold">Aucun compte de messagerie connecté</p>
                <p className="mt-1 text-nexus-text-dim">Les emails de démonstration ont été masqués. Connectez un compte IMAP pour récupérer vos vrais messages.</p>
                <button type="button" onClick={() => setAccountsOpen(true)} className="mt-3 rounded-lg bg-nexus-primary px-3 py-2 text-black">Configurer la synchronisation</button>
              </div>
            )}
            <EmailList
              threads={filteredThreads}
              loading={liveInbox && (mail.loading || specialLoading)}
              onRefresh={liveInbox ? mail.refreshMessages : undefined}
              selectedId={selectedThread?.id || null}
              onSelect={handleSelectThread}
              onTrash={activeFolder !== "trash" && liveInbox ? async (thread) => { try { await mail.trashThread(thread); if (selectedThread?.id === thread.id) setSelectedThread(null); } catch (error) { setMessageActionError((error as Error).message); throw error; } } : undefined}
              folder={activeFolder}
              onScrollDirection={(direction) => setComposeFabCompact(direction === "down")}
              hasMore={!searchQuery.trim() && mail.hasMore}
              loadingMore={mail.loadingMore}
              onLoadMore={() => void mail.loadMore()}
            />
          </div>

          {/* Email View Panel */}
          {selectedThread ? (
            <div key={selectedThread.id} className="nexus-mail-panel flex-1 min-w-0 min-h-0 flex flex-col bg-nexus-surface/30 animate-[mail-open_250ms_ease-out_both] motion-reduce:animate-none">
              <EmailView
                thread={selectedThread}
                onBack={() => setSelectedThread(null)}
                onReply={handleReply}
                onForward={handleForward}
                onNeedUnlock={() => setSecurityOpen(true)}
                onTrash={parseLiveId(selectedThread.id) ? () => void handleTrash() : undefined}
                trashBusy={trashBusy}
                onAction={parseLiveId(selectedThread.id) ? (action) => void handleAction(action) : undefined}
                onBlockSender={async (email) => { await blockMailSender(email); setSelectedThread(null); }}
                onChangeCategory={parseLiveId(selectedThread.id) && mail.accounts.find(a => a.id === parseLiveId(selectedThread.id)?.accountId)?.authType === "google_oauth" ? async (category) => {
                  const parsed = parseLiveId(selectedThread.id);
                  if (!parsed) throw new Error("Message indisponible");
                  await changeMailCategory(parsed.accountId, parsed.uid, category);
                  setSelectedThread(null);
                  await mail.refreshMessages();
                } : undefined}
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
          </>
          )}
        </div>
      </div>

      {!selectedThread && !composeOpen && !sidebarOpen && activeFolder !== "deliveries" && (
        <button
          type="button"
          onClick={handleCompose}
          aria-label="Nouveau message"
          className={`fixed bottom-6 right-6 z-40 flex h-14 flex-row items-center justify-center gap-2 overflow-hidden rounded-full bg-white text-black shadow-lg transition-[width,padding,gap] duration-300 ease-in-out motion-reduce:transition-none active:scale-[0.98] ${composeFabCompact ? "w-14 gap-0 p-0" : "w-[210px] min-w-[150px] px-5"}`}
          style={{ bottom: "max(24px, env(safe-area-inset-bottom))" }}
        >
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden={!composeFabCompact} style={{ opacity: composeFabCompact ? 1 : 0 }}>
            <Pencil size={21} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className={`flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-opacity duration-300 ease-in-out ${composeFabCompact ? "opacity-0" : "opacity-100"}`} aria-hidden={composeFabCompact}>
            <Pencil size={21} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap text-sm font-semibold leading-none">Nouveau message</span>
          </span>
        </button>
      )}

      <ComposeModal
        isOpen={composeOpen}
        onClose={() => {
          setComposeOpen(false);
          setMailtoDraft(null);
          setReplyTo(null);
        }}
        replyTo={replyTo || undefined}
        initialDraft={mailtoDraft || undefined}
        onNeedUnlock={() => setSecurityOpen(true)}
        activeAccountId={mail.activeAccountId === "all" ? mail.accounts[0]?.id ?? null : mail.activeAccountId}
        onSent={() => void mail.refreshMessages()}
      />

      <SecurityPanel
        isOpen={securityOpen}
        onClose={() => setSecurityOpen(false)}
      />

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onAccounts={() => { setSettingsOpen(false); setAccountsOpen(true); }} onSecurity={() => { setSettingsOpen(false); setSecurityOpen(true); }} accounts={mail.accounts} onSettingsChange={setSettings} />
      <AccountsPanel
        isOpen={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        accounts={mail.accounts}
        activeAccountId={mail.activeAccountId}
        onSelectAccount={(id) => {
          mail.setActiveAccountId(id);
          setSelectedThread(null);
        }}
        onChanged={mail.refreshAccounts}
      />
    </div>
  );
}
