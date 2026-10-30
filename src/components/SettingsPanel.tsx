"use client";
import { useEffect, useState } from "react";
import { X, ChevronRight, Trash2 } from "lucide-react";
import { clearBiometric, enrollBiometric } from "@/lib/biometric";

export type NexusSettings = {
  sync: "push" | "15" | "30" | "60" | "manual";
  signatures: Record<string, string>;
  notifications: boolean;
  categories: Record<string, boolean>;
  swipeLeft: "trash" | "archive" | "read";
  swipeRight: "archive" | "snooze" | "read";
  threads: boolean;
  biometric: boolean;
  biometricTimeout: 0 | 30 | 60 | 120 | 300;
  attachments: "on-demand" | "always";
};
export const DEFAULT_SETTINGS: NexusSettings = {
  sync: "30", signatures: {}, notifications: false,
  categories: { Principale: true, Promotions: false, Réseaux: false, Notifications: false },
  swipeLeft: "trash", swipeRight: "archive", threads: true, biometric: false, biometricTimeout: 120, attachments: "on-demand",
};
export const SETTINGS_KEY = "nexus-mail:settings:v1";
export function readSettings(): NexusSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...saved, swipeRight: saved.swipeRight === "move" ? "archive" : saved.swipeRight ?? DEFAULT_SETTINGS.swipeRight, signatures: { ...DEFAULT_SETTINGS.signatures, ...saved.signatures }, categories: { ...DEFAULT_SETTINGS.categories, ...saved.categories } };
  } catch { return DEFAULT_SETTINGS; }
}
export default function SettingsPanel({ open, onClose, onAccounts, onAliases, onSecurity, accounts, onSettingsChange }: {
  open: boolean; onClose: () => void; onAccounts: () => void; onAliases: () => void; onSecurity: () => void;
  accounts: { id: string; email: string }[]; onSettingsChange: (value: NexusSettings) => void;
}) {
  const [settings, setSettings] = useState<NexusSettings>(DEFAULT_SETTINGS);
  const [notificationError, setNotificationError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => { if (open) setSettings(readSettings()); }, [open]);
  const change = (next: NexusSettings) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("nexus-settings-change"));
    onSettingsChange(next);
  };
  const setNotifications = async (enabled: boolean) => {
    setNotificationError("");
    if (enabled && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setNotificationError("L’autorisation des notifications a été refusée par le navigateur."); return; }
    }
    if (enabled && typeof Notification === "undefined") { setNotificationError("Les notifications ne sont pas prises en charge par ce navigateur."); return; }
    change({ ...settings, notifications: enabled });
  };
  const setBiometric = async (enabled: boolean) => {
    setNotificationError("");
    try {
      if (enabled) await enrollBiometric();
      else clearBiometric();
      change({ ...settings, biometric: enabled });
    } catch (error) { setNotificationError((error as Error).message); }
  };
  const toggle = (value: boolean, onChange: (v: boolean) => void) =>
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary focus-visible:ring-offset-2 focus-visible:ring-offset-nexus-surface ${value ? "bg-[#34c759]" : "bg-[#555]"}`}>
      <span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-0"}`} />
    </button>;
  const group = (title: string, children: React.ReactNode, className = "") => <section className={`min-w-0 space-y-2.5 ${className}`}><h3 className="px-1 text-xs font-semibold uppercase tracking-[0.11em] text-nexus-text-muted sm:px-2">{title}</h3><div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-nexus-surface shadow-sm divide-y divide-nexus-border">{children}</div></section>;
  const line = (label: string, control: React.ReactNode) => <div className="min-h-16 px-4 py-3 flex items-center justify-between gap-3 sm:px-5"><span className="min-w-0 text-sm text-nexus-text">{label}</span>{control}</div>;
  const select = (value: string, options: [string,string][], onChange: (v: string) => void) => <select aria-label="Choisir une option" value={value} onChange={e => onChange(e.target.value)} className="min-h-10 max-w-[62%] rounded-lg bg-nexus-bg/50 px-2 text-right text-sm text-nexus-text-muted outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary sm:max-w-[58%]">{options.map(([v,l])=><option key={v} value={v} className="bg-[#222]">{l}</option>)}</select>;
  if (!open) return null;
  return <div className="nexus-pwa-overlay fixed inset-0 z-[110] flex flex-col bg-nexus-bg text-nexus-text">
    <header className="nexus-pwa-header shrink-0 z-10 border-b border-nexus-border bg-nexus-bg/95 backdrop-blur-xl"><div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"><div><h2 className="text-lg font-semibold sm:text-xl">Paramètres</h2><p className="mt-0.5 text-xs text-nexus-text-dim sm:text-sm">Personnalisez Nexus Mail et vos comptes</p></div><button aria-label="Fermer les paramètres" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-nexus-surface transition-colors hover:bg-nexus-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary"><X size={21}/></button></div></header>
    <main className="nexus-pwa-scroll flex-1 mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-3 py-5 sm:gap-6 sm:px-6 sm:py-8 lg:grid-cols-12 lg:items-start lg:gap-7 lg:px-8">
      {group("Comptes & synchronisation", <>
        <button className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm transition-colors hover:bg-nexus-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nexus-primary sm:px-5" onClick={onAccounts}><span>Gérer les comptes ({accounts.length})</span><ChevronRight className="shrink-0" size={18}/></button>
        <button className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm transition-colors hover:bg-nexus-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nexus-primary sm:px-5" onClick={onAliases}><span>Adresses protégées et jetables</span><ChevronRight className="shrink-0" size={18}/></button>
        {advancedOpen && line("Fréquence de synchronisation", select(settings.sync, [["push","Temps réel (actualisation 30 s)"],["15","15 minutes"],["30","30 minutes"],["60","60 minutes"],["manual","Manuelle"]], v => change({...settings,sync:v as NexusSettings["sync"]})) )}
        {advancedOpen && accounts.map(account => <div key={account.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[minmax(11rem,0.8fr)_minmax(0,1.65fr)] sm:items-start sm:gap-5 sm:px-5"><label htmlFor={`sig-${account.id}`} className="pt-1 text-sm font-medium text-nexus-text"><span className="block truncate" title={account.email}>{account.email}</span><span className="mt-0.5 block text-xs font-normal text-nexus-text-muted">Signature</span></label><textarea id={`sig-${account.id}`} rows={3} placeholder="Envoyé depuis Nexus Mail" value={settings.signatures[account.id] || ""} onChange={e=>change({...settings,signatures:{...settings.signatures,[account.id]:e.target.value}})} className="min-h-24 w-full resize-y rounded-xl border border-nexus-border bg-nexus-bg p-3 text-sm outline-none transition-colors placeholder:text-nexus-text-dim focus:border-nexus-primary focus:ring-2 focus:ring-nexus-primary/30"/></div>)}
      </>, "lg:col-span-7")}
      {group("Notifications", <>
        {line("Alertes générales", toggle(settings.notifications,setNotifications))}
        {advancedOpen && Object.entries(settings.categories).map(([category,enabled]) => <div key={category}>{line(category,toggle(enabled,v=>change({...settings,categories:{...settings.categories,[category]:v}})))}</div>)}
        <div className="px-4 py-3 space-y-2 text-xs text-nexus-text-muted">
          {notificationError && <p role="alert" className="font-medium text-red-300">{notificationError}</p>}
          <p>Les alertes utilisent les notifications du navigateur pour les nouveaux messages reçus pendant que Nexus Mail est ouvert.</p>
          <p className="font-medium text-amber-300">Les alertes lorsque l’application est fermée nécessitent encore un service push installé sur le serveur.</p>
          <p>Sur iPhone, autorise les notifications après avoir ajouté Nexus Mail à l’écran d’accueil.</p>
        </div>
      </>, "lg:col-span-5")}
      {group("Confidentialité & sécurité", <>
        {advancedOpen && <button onClick={onSecurity} className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm transition-colors hover:bg-nexus-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nexus-primary sm:px-5"><span>Clés de chiffrement E2EE</span><ChevronRight className="shrink-0" size={18}/></button>}
        {line("Face ID / Touch ID", toggle(settings.biometric,setBiometric))}
        {advancedOpen && settings.biometric && line("Demander Face ID après une absence de", select(String(settings.biometricTimeout), [["0","Immédiatement"],["30","30 secondes"],["60","1 minute"],["120","2 minutes"],["300","5 minutes"]], value => change({ ...settings, biometricTimeout: Number(value) as NexusSettings["biometricTimeout"] })))}
        {advancedOpen && settings.biometric && <p className="px-4 py-3 text-xs text-nexus-text-muted">Le délai commence quand Nexus Mail passe en arrière-plan. Un retour rapide depuis un lien ne redemande pas Face ID.</p>}

        {advancedOpen && <p className="px-4 py-3 text-xs text-nexus-text-muted">À l’activation, Nexus Mail crée une clé WebAuthn protégée par Face ID, Touch ID ou le verrouillage de l’appareil. Elle reste uniquement sur cet appareil.</p>}
      </>, "lg:col-span-5")}
      <div className="lg:col-span-12"><button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(value => !value)} className="w-full rounded-xl border border-nexus-border/50 bg-nexus-surface px-4 py-3 text-left text-sm text-nexus-text-muted hover:text-nexus-text">{advancedOpen ? "Masquer les options avancées" : "Afficher les options avancées"}</button></div>
      {advancedOpen && group("Interface & gestes", <>
        {line("Balayage gauche",select(settings.swipeLeft,[["trash","Corbeille"],["archive","Archiver"],["read","Marquer comme lu"]],v=>change({...settings,swipeLeft:v as NexusSettings["swipeLeft"]})))}
        {line("Balayage droit",select(settings.swipeRight,[["archive","Archiver"],["snooze","Mettre en attente"],["read","Marquer comme lu"]],v=>change({...settings,swipeRight:v as NexusSettings["swipeRight"]})))}
        {line("Regrouper par conversation",toggle(settings.threads,v=>change({...settings,threads:v})))}
      </>, "lg:col-span-7")}
      {advancedOpen && group("Stockage & cache", <>
        {line("Pièces jointes",select(settings.attachments,[["on-demand","À l'ouverture"],["always","Pré-télécharger"]],v=>change({...settings,attachments:v as NexusSettings["attachments"]})))}
        <button onClick={async()=>{if(!window.confirm("Effacer les fichiers temporaires en cache ?"))return; if("caches" in window){for(const key of await caches.keys()) await caches.delete(key);} window.alert("Cache navigateur supprimé. Les brouillons sont conservés.");}} className="flex min-h-16 w-full items-center gap-3 px-4 py-4 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400 sm:px-5"><Trash2 className="shrink-0" size={18}/> Vider le cache temporaire</button>
      </>, "lg:col-span-5")}
    </main>
  </div>;
}
