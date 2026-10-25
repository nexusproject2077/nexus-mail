"use client";

import { useState } from "react";
import {
  X,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  Lock,
  Unlock,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  generateIdentity,
  verifyPassphrase,
  inspectPublicKey,
} from "@/lib/crypto";
import {
  useVault,
  saveIdentity,
  unlockIdentity,
  lockIdentity,
  deleteIdentity,
} from "@/lib/vault";

interface SecurityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "generate" | "import";

export default function SecurityPanel({ isOpen, onClose }: SecurityPanelProps) {
  const { identity, isUnlocked } = useVault();

  const [tab, setTab] = useState<Tab>("generate");
  const [name, setName] = useState("Meric Koken");
  const [email, setEmail] = useState("merickoken54@gmail.com");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [unlockPass, setUnlockPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setError(null);
    if (passphrase.length < 8) {
      setError("La phrase secrète doit contenir au moins 8 caractères.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Les phrases secrètes ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const id = await generateIdentity(name.trim(), email.trim(), passphrase);
      saveIdentity(id, passphrase);
      setPassphrase("");
      setConfirm("");
    } catch (e) {
      setError(`Échec de la génération : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    if (!identity) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await verifyPassphrase(identity, unlockPass);
      if (!ok) {
        setError("Phrase secrète incorrecte.");
        return;
      }
      unlockIdentity(unlockPass);
      setUnlockPass("");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPublicKey = async () => {
    if (!identity) return;
    await navigator.clipboard.writeText(identity.publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDelete = () => {
    if (
      window.confirm(
        "Supprimer définitivement votre identité ? Les messages chiffrés vers cette clé deviendront illisibles.",
      )
    ) {
      deleteIdentity();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-nexus-surface border border-nexus-border rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/50 flex flex-col h-[min(90dvh,850px)] sm:h-auto sm:max-h-[85dvh] min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 px-4 sm:px-5 py-4 border-b border-nexus-border">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nexus-primary to-purple-500 flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-nexus-text">
              Chiffrement de bout en bout
            </h2>
            <p className="text-sm leading-snug text-nexus-text-muted">
              Zero-Access · vos clés ne quittent jamais cet appareil
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer" className="shrink-0 p-2 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-muted hover:text-nexus-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-5 pb-[max(32px,env(safe-area-inset-bottom))] sm:p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!identity ? (
            <>
              {/* Tabs */}
              <div className="grid grid-cols-2 gap-1 mb-5 p-1 bg-nexus-bg rounded-xl">
                {(["generate", "import"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      setError(null);
                    }}
                    className={`min-w-0 px-2 py-3 rounded-lg text-sm font-medium leading-snug transition-all duration-[250ms] ease-out active:scale-[0.97] ${
                      tab === t
                        ? "bg-nexus-primary text-black"
                        : "text-nexus-text-dim hover:text-nexus-text"
                    }`}
                  >
                    {t === "generate" ? "Générer une identité" : "Importer une clé"}
                  </button>
                ))}
              </div>

              {tab === "generate" ? (
                <div className="space-y-3">
                  <Field label="Nom">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Adresse e-mail">
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Phrase secrète (protège votre clé privée)">
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Au moins 8 caractères"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Confirmer la phrase secrète">
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <button
                    onClick={handleGenerate}
                    disabled={busy}
                    className="w-full min-h-12 flex items-center justify-center gap-2 px-3 py-3 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 text-black rounded-xl text-sm font-semibold transition-all duration-[250ms] ease-out active:scale-[0.97]"
                  >
                    {busy ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <KeyRound size={16} />
                    )}
                    {busy ? "Génération…" : "Générer ma paire de clés"}
                  </button>
                  <p className="text-sm text-nexus-text-muted leading-relaxed">
                    Une paire de clés Curve25519 est créée localement. La clé
                    privée est chiffrée par votre phrase secrète et stockée
                    uniquement dans ce navigateur.
                  </p>
                </div>
              ) : (
                <ImportForm
                  onError={setError}
                  onImported={(id, pass) => saveIdentity(id, pass)}
                />
              )}
            </>
          ) : (
            /* Existing identity */
            <div className="space-y-4">
              <div className="rounded-xl border border-nexus-border bg-nexus-bg p-4">
                <div className="flex items-center gap-2 mb-3">
                  {isUnlocked ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
                      <Unlock size={13} /> Déverrouillée
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
                      <Lock size={13} /> Verrouillée
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium text-nexus-text">
                  {identity.name}
                </div>
                <div className="text-xs text-nexus-text-dim">{identity.email}</div>
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-nexus-text-dim mb-1">
                    Empreinte de la clé
                  </div>
                  <code className="block text-[11px] font-mono text-nexus-primary-light break-all leading-relaxed">
                    {identity.fingerprint}
                  </code>
                </div>
              </div>

              {!isUnlocked && (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={unlockPass}
                    onChange={(e) => setUnlockPass(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                    placeholder="Phrase secrète pour déverrouiller"
                    className={inputCls}
                  />
                  <button
                    onClick={handleUnlock}
                    disabled={busy || !unlockPass}
                    className="flex items-center gap-1.5 px-4 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 text-black rounded-xl text-sm font-medium transition-colors"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopyPublicKey}
                  className="flex items-center gap-2 px-3 py-2 bg-nexus-surface-hover hover:bg-nexus-surface-active text-nexus-text rounded-xl text-xs font-medium transition-colors border border-nexus-border"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  {copied ? "Copiée" : "Copier ma clé publique"}
                </button>
                {isUnlocked && (
                  <button
                    onClick={lockIdentity}
                    className="flex items-center gap-2 px-3 py-2 bg-nexus-surface-hover hover:bg-nexus-surface-active text-nexus-text rounded-xl text-xs font-medium transition-colors border border-nexus-border"
                  >
                    <Lock size={14} /> Verrouiller
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-medium transition-colors border border-red-500/30"
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
              <p className="text-[11px] text-nexus-text-dim leading-relaxed">
                Partagez votre clé publique pour recevoir des messages chiffrés.
                Déverrouillez votre identité pour lire les messages qui vous sont
                destinés et signer vos envois.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "block min-w-0 w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-base text-nexus-text outline-none focus:border-nexus-primary transition-colors placeholder:text-nexus-text-muted";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-nexus-text-muted mb-2">{label}</span>
      {children}
    </label>
  );
}

function ImportForm({
  onError,
  onImported,
}: {
  onError: (m: string | null) => void;
  onImported: (id: import("@/lib/crypto").Identity, pass: string) => void;
}) {
  const [armored, setArmored] = useState("");
  const [pubArmored, setPubArmored] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    onError(null);
    setBusy(true);
    try {
      const info = await inspectPublicKey(pubArmored.trim());
      const [name, email] = parseUserId(info.userId);
      onImported(
        {
          privateKey: armored.trim(),
          publicKey: pubArmored.trim(),
          fingerprint: info.fingerprint,
          name,
          email,
          createdAt: new Date().toISOString(),
        },
        pass,
      );
    } catch (e) {
      onError(`Import impossible : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Clé privée (armored)">
        <textarea
          value={armored}
          onChange={(e) => setArmored(e.target.value)}
          placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
          className={`${inputCls} font-mono text-[11px] h-24 resize-none`}
        />
      </Field>
      <Field label="Clé publique (armored)">
        <textarea
          value={pubArmored}
          onChange={(e) => setPubArmored(e.target.value)}
          placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
          className={`${inputCls} font-mono text-[11px] h-24 resize-none`}
        />
      </Field>
      <Field label="Phrase secrète de la clé privée">
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          className={inputCls}
        />
      </Field>
      <button
        onClick={handleImport}
        disabled={busy || !armored || !pubArmored}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-50 text-black rounded-xl text-sm font-medium transition-colors"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
        Importer l&apos;identité
      </button>
    </div>
  );
}

function parseUserId(userId: string): [string, string] {
  const m = userId.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return [m[1].trim(), m[2].trim()];
  return [userId, ""];
}
