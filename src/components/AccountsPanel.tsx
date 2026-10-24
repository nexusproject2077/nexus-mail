"use client";

import { useEffect, useState } from "react";
import {
  X,
  Mail,
  Plus,
  Trash2,
  Loader2,
  ServerCog,
  ShieldAlert,
  Info,
} from "lucide-react";
import {
  addAccount,
  deleteAccount,
  apiConfigured,
  checkBackend,
  type PublicAccount,
  type NewAccount,
} from "@/lib/api";

interface AccountsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: PublicAccount[];
  onChanged: () => Promise<void> | void;
}

const GMAIL_PRESET = {
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
};

const empty: NewAccount = {
  label: "",
  email: "",
  imapHost: "",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  username: "",
  password: "",
};

export default function AccountsPanel({
  isOpen,
  onClose,
  accounts,
  onChanged,
}: AccountsPanelProps) {
  const [form, setForm] = useState<NewAccount>(empty);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void checkBackend().then((online) => {
      if (!cancelled) setBackendOnline(online);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (patch: Partial<NewAccount>) =>
    setForm((f) => ({ ...f, ...patch }));

  const applyGmail = () =>
    set({
      ...GMAIL_PRESET,
      label: form.label || "Gmail",
      username: form.username || form.email,
    });

  const handleAdd = async () => {
    setError(null);
    setBusy(true);
    try {
      await addAccount({ ...form, username: form.username || form.email });
      await onChanged();
      setForm(empty);
      setShowForm(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer ce compte ?")) return;
    await deleteAccount(id);
    await onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-lg bg-nexus-surface border border-nexus-border rounded-2xl shadow-2xl shadow-black/50 flex flex-col max-h-[95dvh] sm:max-h-[85dvh] min-w-0">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-nexus-border">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nexus-primary to-purple-500 flex items-center justify-center">
            <ServerCog size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-nexus-text">
              Comptes de messagerie
            </h2>
            <p className="text-xs text-nexus-text-dim">
              IMAP / SMTP via votre backend auto-hébergé
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-nexus-surface-hover text-nexus-text-dim hover:text-nexus-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-3 sm:p-5 min-h-0 overflow-y-auto">
          {!apiConfigured() && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-xs text-yellow-400">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                Aucun backend configuré. Définissez{" "}
                <code className="font-mono">NEXT_PUBLIC_API_URL</code> pour
                connecter un compte réel (voir le README / docker-compose).
              </span>
            </div>
          )}

          {apiConfigured() && (
            <div role="status" className="mb-4 rounded-xl border border-nexus-border bg-nexus-bg px-3 py-2 text-xs text-nexus-text">
              {backendOnline === null
                ? "Vérification du serveur de messagerie…"
                : backendOnline
                  ? "Serveur de messagerie joignable. Vous pouvez configurer un compte IMAP."
                  : "Serveur de messagerie inaccessible. Vérifiez NEXT_PUBLIC_API_URL, HTTPS et le déploiement du backend avant de connecter un compte."}
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Existing accounts */}
          <div className="space-y-2 mb-4">
            {accounts.length === 0 && (
              <p className="text-xs text-nexus-text-dim">
                Aucun compte connecté pour le moment.
              </p>
            )}
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-nexus-border bg-nexus-bg p-3"
              >
                <div className="w-8 h-8 rounded-lg bg-nexus-primary/15 flex items-center justify-center">
                  <Mail size={15} className="text-nexus-primary-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-nexus-text truncate">
                    {a.label}
                  </div>
                  <div className="text-xs text-nexus-text-dim truncate">
                    {a.email} · {a.imapHost}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-nexus-text-dim hover:text-red-400 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              disabled={!apiConfigured() || backendOnline !== true}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Ajouter un compte
            </button>
          ) : (
            <div className="space-y-3 border-t border-nexus-border pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-nexus-text">
                  Nouveau compte
                </span>
                <button
                  onClick={applyGmail}
                  className="text-[11px] text-nexus-primary-light hover:underline"
                >
                  Préremplir pour Gmail
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input label="Nom" value={form.label} onChange={(v) => set({ label: v })} />
                <Input
                  label="Adresse e-mail"
                  value={form.email}
                  onChange={(v) => set({ email: v, username: form.username || v })}
                />
                <Input label="Hôte IMAP" value={form.imapHost} onChange={(v) => set({ imapHost: v })} />
                <Input
                  label="Port IMAP"
                  value={String(form.imapPort)}
                  onChange={(v) => set({ imapPort: Number(v) || 0 })}
                />
                <Input label="Hôte SMTP" value={form.smtpHost} onChange={(v) => set({ smtpHost: v })} />
                <Input
                  label="Port SMTP"
                  value={String(form.smtpPort)}
                  onChange={(v) => set({ smtpPort: Number(v) || 0 })}
                />
                <Input
                  label="Identifiant"
                  value={form.username}
                  onChange={(v) => set({ username: v })}
                />
                <Input
                  label="Mot de passe / app password"
                  type="password"
                  value={form.password}
                  onChange={(v) => set({ password: v })}
                />
              </div>

              <p className="text-[11px] text-nexus-text-dim leading-relaxed">
                Pour Gmail, activez la validation en 2 étapes puis créez un{" "}
                <em>mot de passe d&apos;application</em> — le mot de passe normal
                ne fonctionnera pas en IMAP. Les identifiants sont chiffrés au
                repos (AES-256-GCM) côté backend.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={busy || !form.email || !form.password || !form.imapHost}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-nexus-primary hover:bg-nexus-primary-dark disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {busy ? "Connexion…" : "Connecter"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="px-4 py-2.5 bg-nexus-surface-hover hover:bg-nexus-surface-active text-nexus-text rounded-xl text-sm transition-colors border border-nexus-border"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-nexus-text-dim mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-nexus-bg border border-nexus-border rounded-lg px-2.5 py-1.5 text-sm text-nexus-text outline-none focus:border-nexus-primary transition-colors"
      />
    </label>
  );
}
