"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiConfigured,
  getAccounts,
  getMessages,
  getMessage,
  getAccountLabels,
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

function summaryToThread(accountId: string, s: MessageSummary): Thread {
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
    labelIds: ["INBOX", ...(s.seen ? [] : ["UNREAD"])],
    isUnread: !s.seen,
    isStarred: s.flagged,
    isImportant: s.flagged,
  };
  return {
    id,
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
  labels: Array<AccountLabel & { accountId: string; accountEmail: string }>;
  loading: boolean;
  error: string | null;
  refreshAccounts: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  loadDetail: (thread: Thread) => Promise<Thread>;
  trashThread: (thread: Thread) => Promise<void>;
}

/** Loads accounts and the active account's inbox from the backend. */
export function useMail(): UseMail {
  const configured = apiConfigured();
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [labels, setLabels] = useState<Array<AccountLabel & { accountId: string; accountEmail: string }>>([]);
  const [loading, setLoading] = useState(false);
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

  const refreshMessages = useCallback(async () => {
    if (!configured || !activeAccountId) {
      setThreads([]);
      return;
    }
    const currentRequest = ++requestId.current;
    const ids = activeAccountId === ALL_ACCOUNTS
      ? accountsRef.current.map((account) => account.id)
      : [activeAccountId];
    setLoading(true);
    try {
      const selectedAccounts = accountsRef.current.filter((account) => ids.includes(account.id));
      const labelResults = await Promise.allSettled(selectedAccounts.map(async (account) => ({
        account,
        labels: await getAccountLabels(account.id),
      })));
      if (requestId.current !== currentRequest || activeAccountRef.current !== activeAccountId) return;
      setLabels(labelResults.flatMap((result) => result.status === "fulfilled"
        ? result.value.labels.map((label) => ({ ...label, accountId: result.value.account.id, accountEmail: result.value.account.email }))
        : []));
      const results = await Promise.allSettled(ids.map(async (id) => ({
        id,
        messages: await getMessages(id),
      })));
      if (requestId.current !== currentRequest || activeAccountRef.current !== activeAccountId) return;
      const combined = results.flatMap((result) =>
        result.status === "fulfilled"
          ? result.value.messages.map((m) => summaryToThread(result.value.id, m))
          : [],
      );
      combined.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      setThreads(combined);
      const failures = results.filter((result) => result.status === "rejected");
      setError(failures.length ? `Impossible de synchroniser ${failures.length} compte(s) sur ${ids.length}.` : null);
    } catch (e) {
      if (requestId.current === currentRequest) setError((e as Error).message);
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [configured, activeAccountId]);

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
      const detail = await getMessage(parsed.accountId, parsed.uid);
      if (thread.isUnread) await markMessageRead(parsed.accountId, parsed.uid);
      setThreads((current) => current.map((item) => item.id === thread.id
        ? { ...item, isUnread: false, labels: item.labels.filter((label) => label !== "UNREAD"),
            messages: item.messages.map((message) => ({ ...message, isUnread: false, labelIds: message.labelIds.filter((label) => label !== "UNREAD") })) }
        : item));
      const msg = thread.messages[0];
      const enrichedMsg: Email = {
        ...msg,
        body: detail.text,
        htmlBody: detail.html ?? undefined,
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
    await trashMessage(parsed.accountId, parsed.uid);
    setThreads((current) => current.filter((item) => item.id !== thread.id));
  }, []);

  const setActiveAccountId = useCallback((id: string | null) => {
    activeAccountRef.current = id;
    requestId.current += 1;
    setThreads([]);
    setLabels([]);
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
    labels,
    loading,
    error,
    refreshAccounts,
    refreshMessages,
    loadDetail,
    trashThread,
  };
}
