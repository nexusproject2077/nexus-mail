"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiConfigured,
  getAccounts,
  getMessages,
  getMessage,
  type PublicAccount,
  type MessageSummary,
} from "./api";
import type { Thread, Email } from "@/types/email";

const ACTIVE_ACCOUNT_STORAGE_KEY = "nexus-mail:active-account-id";

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
  loading: boolean;
  error: string | null;
  refreshAccounts: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  loadDetail: (thread: Thread) => Promise<Thread>;
}

/** Loads accounts and the active account's inbox from the backend. */
export function useMail(): UseMail {
  const configured = apiConfigured();
  const [accounts, setAccounts] = useState<PublicAccount[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const activeAccountRef = useRef<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    if (!configured) return;
    try {
      const list = await getAccounts();
      setAccounts(list);
      setActiveAccountIdState((cur) => {
        const saved = window.localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
        const next = [cur, saved].find(
          (id): id is string => !!id && list.some((account) => account.id === id),
        ) ?? list[0]?.id ?? null;
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
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const msgs = await getMessages(activeAccountId);
      if (activeAccountRef.current === activeAccountId) {
        setThreads(msgs.map((m) => summaryToThread(activeAccountId, m)));
        setError(null);
      }
    } catch (e) {
      if (activeAccountRef.current === activeAccountId) {
        setError((e as Error).message);
      }
    } finally {
      pending.current = false;
      setLoading(false);
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

  const setActiveAccountId = useCallback((id: string | null) => {
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
    loading,
    error,
    refreshAccounts,
    refreshMessages,
    loadDetail,
  };
}
