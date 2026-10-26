"use client";
import { useEffect, useState } from "react";
import { X, ChevronRight, Trash2 } from "lucide-react";

export type NexusSettings = {
  sync: "push" | "15" | "30" | "60" | "manual";
  signatures: Record<string, string>;
  notifications: boolean;
  categories: Record<string, boolean>;
  swipeLeft: "trash" | "archive" | "read";
  swipeRight: "archive" | "snooze" | "move";
  threads: boolean;
  biometric: boolean;
  attachments: "on-demand" | "always";
};
export const DEFAULT_SETTINGS: NexusSettings = {
  sync: "30", signatures: {}, notifications: false,
  categories: { Principale: true, Promotions: false, Réseaux: false, Notifications: false },
  swipeLeft: "trash", swipeRight: "archive", threads: true, biometric: false, attachments: "on-demand",
};
export const SETTINGS_KEY = "nexus-mail:settings:v1";
export function readSettings(): NexusSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...saved, signatures: { ...DEFAULT_SETTINGS.signatures, ...saved.signatures }, categories: { ...DEFAULT_SETTINGS.categories, ...saved.categories } };
  } catch { return DEFAULT_SETTINGS; }
}
export default function SettingsPanel({ open, onClose, onAccounts, onSecurity, accounts, onSettingsChange }: {
  open: boolean; onClose: () => void; onAccounts: () => void; onSecurity: () => void;
  accounts: { id: string; email: string }[]; onSettingsChange: (value: NexusSettings) => void;
}) {
  const [settings, setSettings] = useState<NexusSettings>(DEFAULT_SETTINGS);
  useEffect(() => { if (open) setSettings(readSettings()); }, [open]);
  const change = (next: NexusSettings) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("nexus-settings-change"));
    onSettingsChange(next);
  };
  const toggle = (value: boolean, onChange: (v: boolean) => void) =>
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${value ? "bg-[#34c759]" : "bg-[#555]"}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${value ? "translate-x-[3px]" : "-translate-x-[21px]"}`} />
    </button>;
  const group = (title: string, children: React.ReactNode) => <section className="space-y-2"><h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-nexus-text-muted">{title}</h3><div className="overflow-hidden rounded-2xl bg-nexus-surface divide-y divide-nexus-border">{children}</div></section>;
  const line = (label: string, control: React.ReactNode) => <div className="min-h-14 px-4 py-3 flex items-center justify-between gap-4"><span className="text-sm text-nexus-text">{label}</span>{control}</div>;
  const select = (value: string, options: [string,string][], onChange: (v: string) => void) => <select aria-label="Choisir une option" value={value} onChange={e => onChange(e.target.value)} className="max-w-[55%] bg-transparent text-right text-sm text-nexus-text-muted outline-none">{options.map(([v,l])=><option key={v} value={v} className="bg-[#222]">{l}</option>)}</select>;
  if (!open) return null;
  return <div className="fixed inset-0 z-[110] bg-nexus-bg text-nexus-text overflow-y-auto pb-[env(safe-area-inset-bottom)]">
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-nexus-border bg-nexus-bg/95 px-4 py-4 backdrop-blur-xl"><h2 className="font-semibold text-lg">Paramètres</h2><button aria-label="Fermer" onClick={onClose} className="rounded-full p-2 bg-nexus-surface"><X size={20}/></button></header>
    <main className="mx-auto max-w-xl space-y-7 px-4 py-6">
      {group("Comptes & synchronisation", <>
        <button className="w-full flex justify-between items-center px-4 py-4 text-sm" onClick={onAccounts}><span>Gérer les comptes ({accounts.length})</span><ChevronRight size={18}/></button>
        {line("Fréquence de synchronisation", select(settings.sync, [["push","Temps réel (actualisation 30 s)"],["15","15 minutes"],["30","30 minutes"],["60","60 minutes"],["manual","Manuelle"]], v => change({...settings,sync:v as NexusSettings["sync"]})) )}
        {accounts.map(account => <div key={account.id} className="px-4 py-3 space-y-2"><label htmlFor={`sig-${account.id}`} className="text-sm">{account.email} · Signature</label><textarea id={`sig-${account.id}`} rows={2} placeholder="Envoyé depuis Nexus Mail" value={settings.signatures[account.id] || ""} onChange={e=>change({...settings,signatures:{...settings.signatures,[account.id]:e.target.value}})} className="w-full rounded-xl border border-nexus-border bg-nexus-bg p-3 text-sm outline-none"/></div>)}
      </>)}
      {group("Notifications", <>
        {line("Alertes générales", toggle(settings.notifications,v=>change({...settings,notifications:v})))}
        {Object.entries(settings.categories).map(([category,enabled]) => <div key={category}>{line(category,toggle(enabled,v=>change({...settings,categories:{...settings.categories,[category]:v}})))}</div>)}
        <div className="px-4 py-3 space-y-2 text-xs text-nexus-text-muted">
          <p>Ces réglages enregistrent tes préférences. Ils n'activent pas encore les alertes en arrière-plan.</p>
          <p className="font-medium text-amber-300">Notifications push : en préparation. Garde Gmail installé tant que Nexus Mail ne confirme pas la réception des alertes lorsque l'application est fermée.</p>
          <p>Sur iPhone, les notifications Web Push nécessitent une application ajoutée à l'écran d'accueil, une autorisation explicite et un service push côté serveur.</p>
        </div>
      </>)}
      {group("Sécurité & chiffrement", <>
        <button onClick={onSecurity} className="w-full flex items-center justify-between px-4 py-4 text-sm">Clés de chiffrement E2EE <ChevronRight size={18}/></button>
        {line("Face ID / Touch ID", toggle(settings.biometric,v=>change({...settings,biometric:v})))}
        <p className="px-4 py-3 text-xs text-nexus-text-muted">Préférence uniquement : le verrouillage biométrique exige une intégration WebAuthn pour être actif.</p>
      </>)}
      {group("Interface & gestes", <>
        {line("Balayage gauche",select(settings.swipeLeft,[["trash","Corbeille"],["archive","Archiver"],["read","Marquer comme lu"]],v=>change({...settings,swipeLeft:v as NexusSettings["swipeLeft"]})))}
        {line("Balayage droit",select(settings.swipeRight,[["archive","Archiver"],["snooze","Mettre en attente"],["move","Déplacer"]],v=>change({...settings,swipeRight:v as NexusSettings["swipeRight"]})))}
        {line("Regrouper par conversation",toggle(settings.threads,v=>change({...settings,threads:v})))}
      </>)}
      {group("Stockage & cache", <>
        {line("Pièces jointes",select(settings.attachments,[["on-demand","À l'ouverture"],["always","Pré-télécharger"]],v=>change({...settings,attachments:v as NexusSettings["attachments"]})))}
        <button onClick={async()=>{if(!window.confirm("Effacer les fichiers temporaires en cache ?"))return; if("caches" in window){for(const key of await caches.keys()) await caches.delete(key);} window.alert("Cache navigateur supprimé. Les brouillons sont conservés.");}} className="w-full flex items-center gap-3 px-4 py-4 text-sm text-red-400"><Trash2 size={18}/> Vider le cache temporaire</button>
      </>)}
    </main>
  </div>;
}
