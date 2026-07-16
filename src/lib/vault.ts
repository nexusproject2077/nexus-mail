/**
 * Client-side identity + encrypted-message store for Nexus Mail.
 *
 * - The OpenPGP identity (with its passphrase-encrypted private key) is
 *   persisted to localStorage. The passphrase itself is held only in memory
 *   for the duration of an unlocked session and is never written to disk.
 * - Encrypted messages composed by the user are kept in a local "Coffre-fort"
 *   (vault), demonstrating a full encrypt → store → decrypt round trip without
 *   any server. Only ciphertext is stored.
 *
 * Exposed as a tiny external store so components can subscribe via
 * `useVault()` (built on React's useSyncExternalStore).
 */

"use client";

import { useSyncExternalStore } from "react";
import type { Identity } from "./crypto";
import type { Thread } from "@/types/email";

const IDENTITY_KEY = "nexus.identity.v1";
const VAULT_KEY = "nexus.vault.v1";

interface VaultState {
  identity: Identity | null;
  /** In-memory only: present when the private key is unlocked this session. */
  passphrase: string | null;
  messages: Thread[];
}

let state: VaultState = {
  identity: null,
  passphrase: null,
  messages: [],
};

let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const rawId = window.localStorage.getItem(IDENTITY_KEY);
    const rawVault = window.localStorage.getItem(VAULT_KEY);
    state = {
      identity: rawId ? (JSON.parse(rawId) as Identity) : null,
      passphrase: null,
      messages: rawVault ? (JSON.parse(rawVault) as Thread[]) : [],
    };
  } catch {
    /* corrupt storage — start clean */
  }
}

function subscribe(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): VaultState {
  hydrate();
  return state;
}

// Server snapshot (static prerender): a stable empty state.
const SERVER_STATE: VaultState = {
  identity: null,
  passphrase: null,
  messages: [],
};
function getServerSnapshot(): VaultState {
  return SERVER_STATE;
}

/** Persist a new/updated identity and mark the session unlocked. */
export function saveIdentity(identity: Identity, passphrase: string) {
  hydrate();
  state = { ...state, identity, passphrase };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  }
  emit();
}

/** Drop the in-memory passphrase (lock) without deleting the identity. */
export function lockIdentity() {
  hydrate();
  state = { ...state, passphrase: null };
  emit();
}

/** Cache the passphrase for this session (after a successful unlock test). */
export function unlockIdentity(passphrase: string) {
  hydrate();
  state = { ...state, passphrase };
  emit();
}

/** Permanently remove the identity and lock. Vault messages are kept. */
export function deleteIdentity() {
  hydrate();
  state = { ...state, identity: null, passphrase: null };
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(IDENTITY_KEY);
  }
  emit();
}

/** Append an encrypted message thread to the vault. */
export function addVaultMessage(thread: Thread) {
  hydrate();
  const messages = [thread, ...state.messages];
  state = { ...state, messages };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(messages));
  }
  emit();
}

/** Reactive hook: current identity, unlock state, and vault messages. */
export function useVault() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    identity: snap.identity,
    isUnlocked: snap.passphrase !== null,
    passphrase: snap.passphrase,
    messages: snap.messages,
  };
}
