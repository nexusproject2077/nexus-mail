"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiConfigured,
  getAccounts,
  getMessages,
  getMessage,
  type PublicAccount,
  type MessageSummary,
} from "./api";
import type { Thread, Email } from "@/types/email";

/** Encode account + IMAP uid into an opaque thread id. */
export function liveId(accountId: string, uid: number): string {
  return `live:${accountId}:${uid}`;
}
export function parseLiveId(
  id: string,
): { accountId: string; uid: number } | null {
  const m = id.match(/^live:(.+):(\d+)$/);
  return m ? { accountId: m[1], uid: Number(m[2]) } : null;
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
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    if (!configured) return;
    try {
      const list = await getAccounts();
      setAccounts(list);
      setActiveAccountId((cur) =>
        cur && list.some((a) => a.id === cur) ? cur : (list[0]?.id ?? null),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [configured]);

  const refreshMessages = useCallback(async () => {
    if (!configured || !activeAccountId) {
      setThreads([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const msgs = await getMessages(activeAccountId);
      setThreads(msgs.map((m) => summaryToThread(activeAccountId, m)));
    } catch (e) {
      setError((e as Error).message);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [configured, activeAccountId]);

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

  const loadDetail = useCallback(
    async (thread: Thread): Promise<Thread> => {
      const parsed = parseLiveId(thread.id);
      if (!parsed) return thread;
      const detail = await getMessage(parsed.accountId, parsed.uid);
      const msg = thread.messages[0];
      const enrichedMsg: Email = {
        ...msg,
        body: detail.text,
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
