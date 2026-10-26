"use client";
import { useCallback, useEffect, useState } from "react";
import { cancelQueuedMail, getQueuedMail, type QueuedMail } from "@/lib/api";

export default function OutboxPanel({ accountIds, scheduled }: { accountIds: string[]; scheduled: boolean }) {
  const [items, setItems] = useState<QueuedMail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
              {item.status === "pending" && <button type="button" className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs"
                onClick={async () => { try { await cancelQueuedMail(item.accountId, item.id); await refresh(); } catch(e) { setError((e as Error).message); } }}>
                Annuler
              </button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
