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
  Check,
} from "lucide-react";
import {
  addAccount,
  deleteAccount,
  apiConfigured,
  checkBackend,
  login,
  logout,
  connectGoogle,
  restoreSession,
  type PublicAccount,
  type NewAccount,
} from "@/lib/api";

interface AccountsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: PublicAccount[];
  activeAccountId: string | null;
  onSelectAccount: (id: string) => void;
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
  activeAccountId,
  onSelectAccount,
  onChanged,
}: AccountsPanelProps) {
  const [form, setForm] = useState<NewAccount>(empty);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void checkBackend().then((online) => {
      if (!cancelled) setBackendOnline(online);
    });
    void restoreSession().then((ok) => { if (!cancelled) setAuthenticated(ok); });
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

  const handleLogin = async () => {
    setError(null); setBusy(true);
    try { await login(username, password); setPassword(""); setAuthenticated(true); await onChanged(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const handleLogout = async () => {
    await logout(); setAuthenticated(false); setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer ce compte ?")) return;
    await deleteAccount(id);
    await onChanged();
  };

  const handleGoogle = async () => {
    setError(null); setBusy(true);
    try { await connectGoogle(); } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const handleSelect = (id: string) => {
    onSelectAccount(id);
    setError(null);
    onClose();
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
              Connexion sécurisée via votre backend auto-hébergé
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

          {apiConfigured() && backendOnline === true && !authenticated && (
            <div className="mb-4 space-y-2 rounded-xl border border-nexus-border bg-nexus-bg p-3">
              <p className="text-xs text-nexus-text">Connexion requise pour accéder aux comptes.</p>
              <Input label="Identifiant" value={username} onChange={setUsername} />
              <Input label="Mot de passe" type="password" value={password} onChange={setPassword} />
              <button onClick={handleLogin} disabled={busy || !username || !password} className="w-full py-2 bg-nexus-primary disabled:opacity-40 text-white rounded-lg text-sm">
                {busy ? "Connexion…" : "Se connecter"}
              </button>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Existing accounts */}
          {authenticated && <div className="space-y-2 mb-4">
            {accounts.length > 1 && (
              <>
                <p className="px-1 text-xs text-nexus-text-dim">
                  Consultez tous vos messages ensemble ou choisissez un compte.
                </p>
                <button
                  type="button"
                  onClick={() => handleSelect("all")}
                  aria-pressed={activeAccountId === "all"}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${activeAccountId === "all" ? "border-nexus-primary bg-nexus-primary/10" : "border-nexus-border bg-nexus-bg hover:border-nexus-primary/60"}`}
                >
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-nexus-primary/15 text-nexus-primary-light flex items-center justify-center">
                    <Mail size={16} />
                  </div>
                  <span className="flex-1 text-sm font-medium text-nexus-text">Toutes les boîtes</span>
                  {activeAccountId === "all" && <Check size={16} className="text-nexus-primary-light" />}
                </button>
              </>
            )}
            {accounts.length === 0 && (
              <p className="text-xs text-nexus-text-dim">
                Aucun compte connecté pour le moment.
              </p>
            )}
            {accounts.map((a) => {
              const isActive = a.id === activeAccountId;
              return (
              <div
                key={a.id}
                className={`flex items-center gap-2 rounded-xl border p-1 transition-colors ${
                  isActive
                    ? "border-nexus-primary bg-nexus-primary/10"
                    : "border-nexus-border bg-nexus-bg hover:border-nexus-primary/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(a.id)}
                  aria-pressed={isActive}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary"
                >
                  <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${isActive ? "bg-nexus-primary text-white" : "bg-nexus-primary/15 text-nexus-primary-light"}`}>
                    {isActive ? <Check size={16} /> : <Mail size={15} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-nexus-text truncate">
                        {a.label}
                      </span>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-nexus-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                          Actif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-nexus-text-dim truncate">
                      {a.email} · {a.authType === "google_oauth" ? "Google OAuth" : a.imapHost}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  aria-label={`Supprimer ${a.label}`}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-nexus-text-dim hover:text-red-400 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              );
            })}
          </div>}

          {!showForm ? (
            <div className="space-y-2">
              <button onClick={handleGoogle} disabled={!apiConfigured() || backendOnline !== true || !authenticated || busy} className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 rounded-xl text-sm font-medium transition-colors">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Se connecter avec Google
              </button>
              <button onClick={() => setShowForm(true)} disabled={!apiConfigured() || backendOnline !== true || !authenticated} className="w-full flex items-center justify-center gap-2 py-2.5 border border-nexus-border hover:bg-nexus-surface-hover disabled:opacity-40 text-nexus-text rounded-xl text-sm font-medium transition-colors">
                <Plus size={16} /> Ajouter un compte IMAP / SMTP
              </button>
            </div>
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
                Pour Gmail, utilisez plutôt « Se connecter avec Google » : aucun mot de passe d&apos;application n&apos;est nécessaire. Les comptes IMAP / SMTP restent disponibles et leurs identifiants sont chiffrés au repos (AES-256-GCM).
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
          {authenticated && <button onClick={handleLogout} className="mt-3 w-full py-2 text-xs text-nexus-text-dim hover:text-red-400">Se déconnecter</button>}
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
