"use client";
import { useCallback, useEffect, useState } from "react";
import { getMailSubscriptions, type MailSubscription } from "@/lib/api";

type Item = MailSubscription & { accountId: string };
export default function SubscriptionsPanel({ accountIds }: { accountIds: string[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    const result = await Promise.allSettled(accountIds.map(async accountId =>
      (await getMailSubscriptions(accountId)).map(item => ({ ...item, accountId }))));
    setItems(result.flatMap(entry => entry.status === "fulfilled" ? entry.value : []).sort((a,b) => b.count - a.count));
    if (result.some(entry => entry.status === "rejected")) setError("Impossible de consulter les abonnements de certains comptes.");
    setLoading(false);
  }, [accountIds.join(",")]);
  useEffect(() => { void refresh(); }, [refresh]);
  const unsubscribe = (item: Item) => {
    if (!window.confirm(`Ouvrir la procédure de désabonnement de ${item.sender} ? Vérifie l'adresse avant de confirmer sur le site.`)) return;
    const target = item.unsubscribeUrl ?? item.mailto;
    if (!target) return;
    if (target.startsWith("https://")) window.open(target, "_blank", "noopener,noreferrer");
    else if (target.startsWith("mailto:")) window.location.href = target;
  };
  return <section className="h-full overflow-y-auto px-4 py-4 text-white">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Gérer les abonnements</h2>
      <button type="button" onClick={() => void refresh()} className="rounded-xl bg-white/10 px-3 py-2 text-sm">Actualiser</button>
    </div>
    <p className="mb-4 text-xs text-white/60">Expéditeurs identifiés grâce aux en-têtes de désabonnement des 200 derniers messages analysés par compte (90 jours pour Gmail). Les liens s'ouvrent pour confirmation ; aucun désabonnement n'est envoyé automatiquement.</p>
    {loading && <p className="text-sm text-white/60">Analyse des newsletters…</p>}
    {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
    {!loading && !items.length && <p className="text-sm text-white/60">Aucun abonnement détecté dans les messages analysés.</p>}
    <div className="space-y-2">{items.map((item,index) => <article key={item.accountId + item.sender + index} className="flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{item.name || item.sender}</p>
        <p className="truncate text-xs text-white/60">{item.sender}</p>
        <p className="mt-1 text-xs text-white/50">{item.count} message{item.count > 1 ? "s" : ""} détecté{item.count > 1 ? "s" : ""}</p>
      </div>
      <button type="button" onClick={() => unsubscribe(item)} disabled={!item.unsubscribeUrl && !item.mailto}
        className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium disabled:opacity-40">Se désabonner</button>
    </article>)}</div>
  </section>;
}
