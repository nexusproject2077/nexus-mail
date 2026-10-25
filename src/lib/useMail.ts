"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiConfigured,
  getAccounts,
  getCategoryCounts,
  getMessages,
  getMessage,
  getAccountLabels,
  performMessageAction,
  searchAccountMessages,
  type MessageAction,
  type AccountLabel,
  markMessageRead,
  trashMessage,
  type PublicAccount,
  type MessageSummary,
} from "./api";
import type { Thread, Email } from "@/types/email";

const ACTIVE_ACCOUNT_STORAGE_KEY = "nexus-mail:active-account-id";
const ALL_ACCOUNTS = "all";

/** Encode account + IMAP uid into an opaque thread id. */
export function liveId(accountId: string, uid: string): string {
  return `live:${accountId}:${uid}`;
}
export function parseLiveId(
  id: string,
): { accountId: string; uid: string } | null {
  const m = id.match(/^live:(.+):([^:]+)$/);
  return m ? { accountId: m[1], uid: m[2] } : null;
}

export function summaryToThread(accountId: string, s: MessageSummary, mailbox = "INBOX"): Thread {
  const id = liveId(accountId, s.threadId ?? s.inReplyTo ?? s.messageId ?? s.uid);
  const email: Email = {
    id: liveId(accountId, s.uid),
    threadId: id,
    sender: s.from.name ? `${s.from.name} <${s.from.email}>` : s.from.email,
    senderName: s.from.name || s.from.email,
    senderEmail: s.from.email,
    toRecipients: s.to,
    subject: s.subject,
    snippet: s.snippet,
    date: s.date,
    labelIds: s.labelIds ?? [mailbox, ...(s.seen ? [] : ["UNREAD"])],
    isUnread: !s.seen,
    isStarred: s.flagged,
    isImportant: (s.labelIds ?? []).includes("IMPORTANT"),
  };
  return {
    id,
    mailbox,
    messages: [email],
    subject: s.subject,
    snippet: s.snippet,
    date: s.date,
    isUnread: !s.seen,
    isStarred: s.flagged,
    labels: email.labelIds,
  };
}

/** One normalized conversation per account + provider threadId, retaining every unique message. */
function mergeThreads(existing: Thread[], incoming: Thread[]): Thread[] {
  const byId = new Map<string, Thread>();
  for (const thread of [...existing, ...incoming]) {
    const previous = byId.get(thread.id);
    if (!previous) { byId.set(thread.id, thread); continue; }
    const messages = new Map(previous.messages.map(message => [message.id, message]));
    for (const message of thread.messages) messages.set(message.id, { ...messages.get(message.id), ...message });
    const sorted = [...messages.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const latest = sorted[sorted.length - 1];
    byId.set(thread.id, {
      ...previous, messages: sorted, date: latest.date, snippet: latest.snippet,
      subject: latest.subject, isUnread: sorted.some(m => m.isUnread),
      isStarred: sorted.some(m => m.isStarred),
      labels: [...new Set(sorted.flatMap(m => m.labelIds))],
    });
  }
  return [...byId.values()].map(thread => {
    const messages = [...thread.messages].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const latest = messages[messages.length - 1];
    return { ...thread, messages, date: latest.date, subject: latest.subject, snippet: latest.snippet };
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export interface UseMail {
  configured: boolean;
  accounts: PublicAccount[];
  activeAccountId: string | null;
  setActiveAccountId: (id: string | null) => void;
  threads: Thread[];
  category: string;
  setCategory: (category: string) => void;
  categoryCounts: Record<string, number> | null;
  categoryLoading: boolean;
  labels: Array<AccountLabel & { accountId: string; accountEmail: string }>;
  selectedLabel: { accountId: string; id: string; name: string } | null;
  selectLabel: (label: { accountId: string; id: string; name: string } | null) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  error: string | null;
  refreshAccounts: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  loadDetail: (thread: Thread) => Promise<Thread>;
  trashThread: (thread: Thread) => Promise<void>;
  actionThread: (thread: Thread, action: MessageAction) => Promise<void>;
  searchMessages: (query: string) => Promise<Thread[]>;
}

/** Loads accounts and the active account's inbox from the backend. */
export function useMail(): UseMail {
  const configured = apiConfigured();
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const storeRef = useRef<Thread[]>([]);
  const [category, setCategory] = useState("ALL");
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number> | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [labels, setLabels] = useState<Array<AccountLabel & { accountId: string; accountEmail: string }>>([]);
  const [selectedLabel, setSelectedLabel] = useState<{ accountId: string; id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursors, setCursors] = useState<Record<string, string | null>>({});
  const cursorsRef = useRef<Record<string, string | null>>({});
  const moreBusy = useRef(false);
  const syncInProgress = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeAccountRef = useRef<string | null>(null);
  const accountsRef = useRef<PublicAccount[]>([]);

  const refreshAccounts = useCallback(async () => {
    if (!configured) return;
    try {
      const list = await getAccounts();
      setAccounts(list);
      accountsRef.current = list;
      setActiveAccountIdState((cur) => {
        // Unified inbox by default: fetch across every connected account.
        // Preserve explicit account selections made during the current session.
        const next = (cur && (cur === ALL_ACCOUNTS || list.some((account) => account.id === cur)) ? cur : null)
          ?? (list.length ? ALL_ACCOUNTS : null);
        if (next) window.localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, next);
        else window.localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [configured]);

  const refreshCategoryCounts = useCallback(async () => {
    const ids = activeAccountId === ALL_ACCOUNTS ? accountsRef.current.filter(a => a.authType === "google_oauth").map(a => a.id) : accountsRef.current.filter(a => a.id === activeAccountId && a.authType === "google_oauth").map(a => a.id);
    if (!ids.length) { setCategoryCounts(null); return; }
    const results = await Promise.allSettled(ids.map(id => getCategoryCounts(id)));
    const counts: Record<string, number> = {};
    let succeeded = false;
    for (const result of results) if (result.status === "fulfilled" && result.value) {
      succeeded = true;
      for (const [key, value] of Object.entries(result.value)) counts[key] = (counts[key] ?? 0) + value;
    }
    setCategoryCounts(succeeded ? counts : null);
  }, [activeAccountId]);

  const refreshMessages = useCallback(async () => {
    if (!configured || !activeAccountId) {
      setThreads([]);
      return;
    }
    const currentRequest = ++requestId.current;
    const ids = selectedLabel ? [selectedLabel.accountId] : activeAccountId === ALL_ACCOUNTS
      ? accountsRef.current.map((account) => account.id)
      : [activeAccountId];
    const mailbox = selectedLabel?.id ?? "INBOX";
    setLoading(true);
    setThreads([]);
    storeRef.current = [];
    cursorsRef.current = {};
    setCursors({});
    setCategoryLoading(true);
    void refreshCategoryCounts();
    try {
      const selectedAccounts = accountsRef.current.filter((account) => activeAccountId === ALL_ACCOUNTS || account.id === activeAccountId);
      const labelResults = await Promise.allSettled(selectedAccounts.map(async (account) => ({
        account,
        labels: await getAccountLabels(account.id),
      })));
      if (requestId.current !== currentRequest || activeAccountRef.current !== activeAccountId) return;
      setLabels(labelResults.flatMap((result) => result.status === "fulfilled"
        ? result.value.labels.map((label) => ({ ...label, accountId: result.value.account.id, accountEmail: result.value.account.email }))
        : []));
      // Load at most 500 messages in total across all connected accounts.
      // Keep API requests paginated (up to 100 messages per account per round).
      const allMessages = new Map<string, Thread>();
      const next: Record<string, string | null> = {};
      const failures = new Map<string, string>();
      let pending = ids.map(id => ({ id, cursor: null as string | null }));
      const seenCursors = new Set<string>();
      const messageLimit = 500;
      const gmailCategory = !selectedLabel && category !== "ALL" ? category : undefined;
      let loadedMessages = 0;
      setLoadingMore(true);
      try {
        while (pending.length && loadedMessages < messageLimit && requestId.current === currentRequest && activeAccountRef.current === activeAccountId) {
          const perAccountLimit = Math.min(100, Math.max(1, Math.floor((messageLimit - loadedMessages) / pending.length)));
          const batch = await Promise.allSettled(pending.map(async ({ id, cursor }) => ({
            id, page: await getMessages(id, mailbox, perAccountLimit, cursor ?? undefined, gmailCategory && accountsRef.current.find(a => a.id === id)?.authType === "google_oauth" ? gmailCategory : undefined),
          })));
          const upcoming: typeof pending = [];
          for (let index = 0; index < batch.length; index++) {
            const result = batch[index];
            const id = pending[index].id;
            if (result.status !== "fulfilled") {
              failures.set(id, result.reason instanceof Error ? result.reason.message : "Erreur de connexion");
              next[id] = null;
              continue;
            }
            for (const message of result.value.page.messages) {
              if (loadedMessages >= messageLimit) break;
              loadedMessages++;
              const thread = summaryToThread(id, message, mailbox);
              allMessages.set(thread.id, mergeThreads(allMessages.has(thread.id) ? [allMessages.get(thread.id)!] : [], [thread])[0]);
            }
            const cursor = result.value.page.nextCursor;
            next[id] = cursor;
            if (cursor && !seenCursors.has(id + ":" + cursor)) {
              seenCursors.add(id + ":" + cursor);
              upcoming.push({ id, cursor });
            }
          }
          if (requestId.current !== currentRequest || activeAccountRef.current !== activeAccountId) return;
          storeRef.current = mergeThreads(storeRef.current, [...allMessages.values()]);
          setThreads(storeRef.current);
          cursorsRef.current = { ...next };
          setCursors({ ...next });
          setLoading(false);
          pending = upcoming;
        }
        if (failures.size) setError(`Synchronisation incomplète : ${[...failures.entries()].map(([id, reason]) => `${accountsRef.current.find(a => a.id === id)?.email ?? id} — ${reason}`).join("; ")}`);
        else setError(null);
      } finally {
        if (requestId.current === currentRequest) setLoadingMore(false);
      }
    } catch (e) {
      if (requestId.current === currentRequest) setError((e as Error).message);
    } finally {
      if (requestId.current === currentRequest) { setLoading(false); setCategoryLoading(false); }
    }
  }, [configured, activeAccountId, selectedLabel, category, refreshCategoryCounts]);

  const loadMore = useCallback(async () => {
    if (!configured || !activeAccountId || moreBusy.current || loading) return;
    const entries = Object.entries(cursorsRef.current).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);
    if (!entries.length) return;
    moreBusy.current = true;
    setLoadingMore(true);
    const currentRequest = requestId.current;
    const mailbox = selectedLabel?.id ?? "INBOX";
    try {
      const results = await Promise.allSettled(entries.map(async ([id, cursor]) => ({ id, page: await getMessages(id, mailbox, 50, cursor, !selectedLabel && accountsRef.current.find(a => a.id === id)?.authType === "google_oauth" ? (category === "ALL" ? undefined : category) : undefined) })));
      if (requestId.current !== currentRequest) return;
      const next = { ...cursorsRef.current };
      const additions: Thread[] = [];
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        next[result.value.id] = result.value.page.nextCursor;
        additions.push(...result.value.page.messages.map(m => summaryToThread(result.value.id, m, mailbox)));
      }
      cursorsRef.current = next;
      setCursors(next);
      storeRef.current = mergeThreads(storeRef.current, additions);
      setThreads(storeRef.current);
      if (results.some(r => r.status === "rejected")) setError("Une page n'a pas pu être chargée. Réessaie.");
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }, [configured, activeAccountId, loading, selectedLabel, category]);

  useEffect(() => {
    activeAccountRef.current = activeAccountId;
  }, [activeAccountId]);

  // Fetch accounts and messages on mount / when the active account changes.
  // The loading/error setState calls live in these fetch flows by design.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshMessages();
  }, [refreshMessages]);

  // Synchronize periodically while the tab is visible and when connectivity returns.
  useEffect(() => {
    if (!configured || !activeAccountId) return;
    const sync = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshMessages();
      }
    };
    const getFrequency = () => { try { return JSON.parse(window.localStorage.getItem("nexus-mail:settings:v1") || "{}").sync || "30"; } catch { return "30"; } };
    let timer: number | undefined;
    const schedule = () => {
      if (timer) window.clearInterval(timer);
      const frequency = getFrequency();
      if (frequency !== "manual") timer = window.setInterval(sync, frequency === "push" ? 30000 : Number(frequency) * 60000);
    };
    schedule();
    window.addEventListener("nexus-settings-change", schedule);
    if (getFrequency() !== "manual") document.addEventListener("visibilitychange", sync);
    if (getFrequency() !== "manual") window.addEventListener("focus", sync);
    if (getFrequency() !== "manual") window.addEventListener("online", sync);
    return () => {
      if (timer) window.clearInterval(timer);
      window.removeEventListener("nexus-settings-change", schedule);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [configured, activeAccountId, refreshMessages]);

  const loadDetail = useCallback(
    async (thread: Thread): Promise<Thread> => {
      const parsed = parseLiveId(thread.id);
      if (!parsed) return thread;
      const details = await Promise.all(thread.messages.map(message => {
        const messageId = parseLiveId(message.id);
        return messageId ? getMessage(messageId.accountId, messageId.uid, thread.mailbox ?? "INBOX") : Promise.resolve(null);
      }));
      if (!details.some(Boolean)) return thread;
      if (thread.isUnread) await Promise.all(thread.messages.filter(m => m.isUnread).map(m => { const id = parseLiveId(m.id); return id ? markMessageRead(id.accountId, id.uid, thread.mailbox ?? "INBOX") : Promise.resolve(); }));
      setThreads((current) => current.map((item) => item.id === thread.id
        ? { ...item, isUnread: false, labels: item.labels.filter((label) => label !== "UNREAD"),
            messages: item.messages.map((message) => ({ ...message, isUnread: false, labelIds: message.labelIds.filter((label) => label !== "UNREAD") })) }
        : item));
      const enrichedMessages: Email[] = thread.messages.map((msg, index) => {
        const item = details[index];
        return item ? { ...msg, body: item.text, htmlBody: item.html ?? undefined,
          attachments: item.attachments, hasAttachment: !!item.attachments?.length,
          snippet: item.snippet || msg.snippet, isUnread: false } : msg;
      });
      return {
        ...thread,
        isUnread: false,
        messages: enrichedMessages,
      };
    },
    [],
  );

  const trashThread = useCallback(async (thread: Thread) => {
    const messageIds = [...new Set(thread.messages.map(message => {
      const parsed = parseLiveId(message.id);
      if (!parsed) throw new Error("Identifiant de message invalide.");
      return JSON.stringify([parsed.accountId, parsed.uid]);
    }))].map(value => JSON.parse(value) as [string, string]);
    if (!messageIds.length) throw new Error("Aucun message à supprimer.");
    // Start the provider request immediately, while the row slides away.
    const request = Promise.all(messageIds.map(([accountId, uid]) =>
      trashMessage(accountId, uid, thread.mailbox ?? "INBOX")));
    storeRef.current = storeRef.current.filter(item => item.id !== thread.id);
    setThreads(current => current.filter(item => item.id !== thread.id));
    const results = await Promise.allSettled([request]);
    if (results[0].status === "rejected") {
      // Refresh from the server: some messages may already have been removed.
      await refreshMessages();
      throw results[0].reason;
    }
  }, [refreshMessages]);

  const actionThread = useCallback(async (thread: Thread, action: MessageAction) => {
    // A Gmail conversation id is not a Gmail message id.  Using the thread id
    // here made Gmail answer 404 when an action (notably "Non lu") was applied
    // to a conversation.  Always address the provider with the real ids of the
    // messages that make up the thread, as we already do for deletion.
    const messageIds = [...new Set(thread.messages.map((message) => {
      const parsed = parseLiveId(message.id);
      if (!parsed) throw new Error("Identifiant de message invalide.");
      return JSON.stringify([parsed.accountId, parsed.uid]);
    }))].map((value) => JSON.parse(value) as [string, string]);
    if (!messageIds.length) throw new Error("Aucun message à modifier.");
    await Promise.all(messageIds.map(([accountId, uid]) =>
      performMessageAction(accountId, uid, thread.mailbox ?? "INBOX", action)));
    if (action === "archive") {
      setThreads(current => current.map(item => item.id !== thread.id ? item : {
        ...item,
        labels: item.labels.filter(label => label !== "INBOX"),
        messages: item.messages.map(message => ({ ...message, labelIds: message.labelIds.filter(label => label !== "INBOX") })),
      }));
    } else {
      setThreads(current => current.map(item => item.id !== thread.id ? item : {
        ...item,
        isUnread: action === "unread" ? true : action === "read" ? false : item.isUnread,
        isStarred: action === "star" ? true : action === "unstar" ? false : item.isStarred,
        messages: item.messages.map(message => ({
          ...message,
          isUnread: action === "unread" ? true : action === "read" ? false : message.isUnread,
          isStarred: action === "star" ? true : action === "unstar" ? false : message.isStarred,
        })),
      }));
    }
  }, []);

  const searchMessages = useCallback(async (query: string): Promise<Thread[]> => {
    if (query.trim().length < 2) return [];
    const ids = activeAccountId === ALL_ACCOUNTS ? accountsRef.current.map(a => a.id) : activeAccountId ? [activeAccountId] : [];
    const results = await Promise.allSettled(ids.map(async id => ({ id, messages: await searchAccountMessages(id, query.trim()) })));
    const matches = results.flatMap(result => result.status === "fulfilled" ? result.value.messages.map(message => summaryToThread(result.value.id, message)) : []);
    if (results.length && results.every(result => result.status === "rejected")) throw new Error("Recherche indisponible sur les comptes connectés");
    return matches.sort((a,b) => Date.parse(b.date) - Date.parse(a.date));
  }, [activeAccountId]);

  const setActiveAccountId = useCallback((id: string | null) => {
    activeAccountRef.current = id;
    requestId.current += 1;
    syncInProgress.current = false;
    setThreads([]);
    storeRef.current = [];
    cursorsRef.current = {};
    setCursors({});
    setLabels([]);
    setSelectedLabel(null);
    setError(null);
    setLoading(false);
    setActiveAccountIdState(id);
    if (id) window.localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
  }, []);

  return {
    configured,
    accounts,
    activeAccountId,
    setActiveAccountId,
    threads,
    category,
    setCategory,
    categoryCounts,
    categoryLoading,
    labels,
    selectedLabel,
    selectLabel: setSelectedLabel,
    loading,
    loadingMore,
    hasMore: Object.values(cursors).some(Boolean),
    loadMore,
    error,
    refreshAccounts,
    refreshMessages,
    loadDetail,
    trashThread,
    actionThread,
    searchMessages,
  };
}
