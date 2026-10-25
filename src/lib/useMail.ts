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

function summaryToThread(accountId: string, s: MessageSummary, mailbox = "INBOX"): Thread {
  const id = liveId(accountId, s.uid);
  const email: Email = {
    id,
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
  const [category, setCategory] = useState("CATEGORY_PERSONAL");
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
        const saved = window.localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
        const next = [cur, saved].find(
          (id): id is string => !!id && (id === ALL_ACCOUNTS || list.some((account) => account.id === id)),
        ) ?? (list.length > 1 ? ALL_ACCOUNTS : list[0]?.id ?? null);
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
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    const currentRequest = ++requestId.current;
    const ids = selectedLabel ? [selectedLabel.accountId] : activeAccountId === ALL_ACCOUNTS
      ? accountsRef.current.map((account) => account.id)
      : [activeAccountId];
    const mailbox = selectedLabel?.id ?? "INBOX";
    setLoading(true);
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
      // Synchronise toute la boîte sans plafond : les pages restent une contrainte
      // technique de l'API, pas une limite de messages visible par l'utilisateur.
      const allMessages = new Map<string, Thread>();
      const next: Record<string, string | null> = {};
      const failures = new Map<string, string>();
      let pending = ids.map(id => ({ id, cursor: null as string | null }));
      const seenCursors = new Set<string>();
      setLoadingMore(true);
      try {
        while (pending.length && requestId.current === currentRequest && activeAccountRef.current === activeAccountId) {
          const batch = await Promise.allSettled(pending.map(async ({ id, cursor }) => ({
            id, page: await getMessages(id, mailbox, 100, cursor ?? undefined, !selectedLabel && accountsRef.current.find(a => a.id === id)?.authType === "google_oauth" ? category : undefined),
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
              const thread = summaryToThread(id, message, mailbox);
              allMessages.set(thread.id, thread);
            }
            const cursor = result.value.page.nextCursor;
            next[id] = cursor;
            if (cursor && !seenCursors.has(id + ":" + cursor)) {
              seenCursors.add(id + ":" + cursor);
              upcoming.push({ id, cursor });
            }
          }
          if (requestId.current !== currentRequest || activeAccountRef.current !== activeAccountId) return;
          setThreads(previous => {
            const merged = new Map<string, Thread>();
            for (const [id, thread] of allMessages) merged.set(id, thread);
            return [...merged.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
          });
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
      syncInProgress.current = false;
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
      const results = await Promise.allSettled(entries.map(async ([id, cursor]) => ({ id, page: await getMessages(id, mailbox, 50, cursor, !selectedLabel && accountsRef.current.find(a => a.id === id)?.authType === "google_oauth" ? category : undefined) })));
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
      setThreads(old => {
        const known = new Set(old.map(t => t.id));
        return [...old, ...additions.filter(t => !known.has(t.id) && !!known.add(t.id))].sort((a,b) => Date.parse(b.date) - Date.parse(a.date));
      });
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
    const timer = window.setInterval(sync, 30000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [configured, activeAccountId, refreshMessages]);

  const loadDetail = useCallback(
    async (thread: Thread): Promise<Thread> => {
      const parsed = parseLiveId(thread.id);
      if (!parsed) return thread;
      const detail = await getMessage(parsed.accountId, parsed.uid, thread.mailbox ?? "INBOX");
      if (thread.isUnread) await markMessageRead(parsed.accountId, parsed.uid, thread.mailbox ?? "INBOX");
      setThreads((current) => current.map((item) => item.id === thread.id
        ? { ...item, isUnread: false, labels: item.labels.filter((label) => label !== "UNREAD"),
            messages: item.messages.map((message) => ({ ...message, isUnread: false, labelIds: message.labelIds.filter((label) => label !== "UNREAD") })) }
        : item));
      const msg = thread.messages[0];
      const enrichedMsg: Email = {
        ...msg,
        body: detail.text,
        htmlBody: detail.html ?? undefined,
        attachments: detail.attachments,
        hasAttachment: !!detail.attachments?.length,
        snippet: detail.snippet || msg.snippet,
        isUnread: false,
      };
      return {
        ...thread,
        isUnread: false,
        messages: [enrichedMsg],
      };
    },
    [],
  );

  const trashThread = useCallback(async (thread: Thread) => {
    const parsed = parseLiveId(thread.id);
    if (!parsed) throw new Error("Ce message ne provient pas d'un compte connecté.");
    // Optimistic removal: do not block the interface on network latency.
    setThreads((current) => current.filter((item) => item.id !== thread.id));
    try {
      await trashMessage(parsed.accountId, parsed.uid, thread.mailbox ?? "INBOX");
    } catch (error) {
      // Restore the message if the provider rejects the operation.
      setThreads((current) => current.some((item) => item.id === thread.id)
        ? current
        : [...current, thread].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)));
      throw error;
    }
  }, []);

  const actionThread = useCallback(async (thread: Thread, action: MessageAction) => {
    const parsed = parseLiveId(thread.id);
    if (!parsed) throw new Error("Message non synchronisé");
    await performMessageAction(parsed.accountId, parsed.uid, thread.mailbox ?? "INBOX", action);
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
