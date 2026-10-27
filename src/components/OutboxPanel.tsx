"use client";
import { useCallback, useEffect, useState } from "react";
import { cancelQueuedMail, rescheduleQueuedMail, getQueuedMail, type QueuedMail } from "@/lib/api";

export default function OutboxPanel({ accountIds, scheduled }: { accountIds: string[]; scheduled: boolean }) {
  const [items, setItems] = useState<QueuedMail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<QueuedMail | null>(null);
  const [editDate, setEditDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const openEditor = (item: QueuedMail) => {
    const date = new Date(item.scheduledAt);
    setEditDate(new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setEditError("");
    setEditing(item);
  };
  const refresh = useCallback(async () => {
    if (!accountIds.length) { setItems([]); return; }
    setLoading(true);
    try {
      const pages = await Promise.allSettled(accountIds.map(getQueuedMail));
      const failed = pages.filter(p => p.status === "rejected");
      setError(failed.length ? "Certains comptes n'ont pas pu être chargés." : "");
      setItems(pages.flatMap(p => p.status === "fulfilled" ? p.value : [])
        .sort((a,b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt)));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [accountIds.join(",")]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const visible = items.filter(item => scheduled ? item.status === "pending" : item.status !== "pending");
  return (
    <div className="h-full overflow-y-auto px-4 py-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{scheduled ? "Envois programmés" : "Boîte d'envoi"}</h2>
        <button type="button" onClick={() => void refresh()} className="rounded-xl bg-white/10 px-3 py-2 text-sm">Actualiser</button>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
      {loading && <p className="mb-3 text-sm text-white/60">Synchronisation…</p>}
      {!loading && visible.length === 0 && <p className="text-sm text-white/60">Aucun message dans ce dossier.</p>}
      <div className="space-y-2">
        {visible.map(item => (
          <article key={item.id} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.subject || "(Sans objet)"}</p>
                <p className="truncate text-sm text-white/60">À : {item.to}</p>
                <p className="mt-1 text-xs text-white/50">{new Date(item.scheduledAt).toLocaleString("fr-FR")}</p>
                <p className="mt-1 text-xs text-white/70">{item.status === "pending" ? "Programmé" : item.status === "sending" ? "Envoi en cours" : item.status === "sent" ? "Envoyé" : item.status === "failed" ? "Échec — vérification nécessaire" : "Annulé"}</p>
                {item.error && <p className="mt-1 text-xs text-red-300">{item.error}</p>}
              </div>
              {item.status === "pending" && <div className="flex shrink-0 flex-col gap-2"><button type="button" onClick={() => openEditor(item)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black">Modifier</button><button type="button" className="rounded-xl bg-white/10 px-3 py-2 text-xs"
                onClick={async () => { try { await cancelQueuedMail(item.accountId, item.id); await refresh(); } catch(e) { setError((e as Error).message); } }}>
                Annuler
              </button></div>}
            </div>
          </article>
        ))}
      </div>
      {editing && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-5">
        <section role="dialog" aria-modal="true" aria-labelledby="reschedule-title" className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#151515] p-5 shadow-2xl">
          <h3 id="reschedule-title" className="mb-2 text-lg font-semibold">Modifier l'envoi programmé</h3>
          <p className="mb-4 truncate text-sm text-white/60">{editing.subject || "(Sans objet)"}</p>
          <label htmlFor="reschedule-at" className="mb-2 block text-sm">Nouvelle date et heure</label>
          <input id="reschedule-at" type="datetime-local" value={editDate} onChange={e => setEditDate(e.target.value)} className="w-full rounded-xl border border-white/20 bg-[#252525] px-3 py-3 text-white [color-scheme:dark]" />
          <p className="mt-2 text-xs text-white/50">Heure locale. Modification enregistrée sur le serveur.</p>
          {editError && <p role="alert" className="mt-3 text-sm text-red-300">{editError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-xl bg-white/10 px-4 py-2 text-sm">Retour</button>
            <button type="button" disabled={saving} onClick={async () => {
              const when = new Date(editDate);
              if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 60000) { setEditError("Choisis une date au moins 1 minute dans le futur."); return; }
              setSaving(true); setEditError("");
              try { await rescheduleQueuedMail(editing.accountId, editing.id, when.toISOString()); setEditing(null); await refresh(); }
              catch (e) { setEditError((e as Error).message); }
              finally { setSaving(false); }
            }} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
