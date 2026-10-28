"use client";

import { Package, PackageCheck, Truck, AlertCircle, ChevronRight } from "lucide-react";
import type { Thread } from "@/types/email";

type Status = "ordered" | "shipped" | "out" | "ready" | "delivered" | "issue";
type Parcel = { thread: Thread; status: Status; carrier: string | null; tracking: string | null; date: string | null; trackingKey: string | null; orderKey: string | null; relatedCount: number };

// Require transaction-specific evidence, not marketing language or generic delivery terms.
const carrierTerms = /\b(?:colissimo|chronopost|mondial relay|dhl|ups|fedex|dpd|gls|la poste)\b/i;
const promotionalTerms = /\b(?:promo(?:tion)?s?|offres?|réductions?|remises?|codes? promo|coupons?|discounts?|deals?|soldes|newsletter|profitez|économisez|livraison gratuite|free delivery|special offer|save \d+|off \d+%|bons? plans?)\b|\d+\s*[€$]\s*de réduction|\d+\s*%\s*de réduction/i;
const explicitOrder = /\b(?:commande|order)\s*(?:n[°o.]?\s*|#\s*|:\s*)([A-Z0-9][A-Z0-9-]{5,24})\b/i;
const explicitTracking = /\b(?:numéro|n°|référence|number|tracking)\s*(?:de\s*)?(?:suivi|colis|tracking)?\s*[:#-]\s*([A-Z0-9][A-Z0-9 -]{7,28})\b/i;
const transactionalSubject = /\b(?:confirmation de (?:votre )?commande|commande (?:confirmée|expédiée|livrée)|votre commande (?:est|a été)|votre colis (?:est|a été)|colis (?:expédié|livré|en transit)|expédition de votre commande|livraison de votre commande|shipment confirmation|order confirmation|your order (?:has been|is)|your package (?:has been|is)|out for delivery|ready for pickup)\b/i;
const transactionalBody = /\b(?:nous avons (?:reçu|expédié) votre commande|votre commande (?:a été confirmée|a été expédiée|est en route)|votre colis (?:a été expédié|est en route|a été livré)|your order (?:has shipped|has been confirmed)|your package (?:has shipped|is on its way))\b/i;

function parseParcel(thread: Thread): Parcel | null {
  const message = thread.messages[thread.messages.length - 1];
  const subject = thread.subject ?? "";
  const sender = [message?.senderEmail ?? "", message?.senderName ?? ""].join(" ");
  const text = [subject, thread.snippet, message?.body ?? ""].join(" ").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp);/gi, " ");
  const orderMatch = text.match(explicitOrder);
  const trackingMatch = text.match(explicitTracking);
  const tracking = trackingMatch?.[1]?.trim() ?? null;
  const trackingKey = tracking?.replace(/[^A-Z0-9]/gi, "").toUpperCase() ?? null;
  const orderKey = orderMatch?.[1]?.toUpperCase() ?? null;
  const isPromotion = promotionalTerms.test(subject) || (promotionalTerms.test(text) && !transactionalSubject.test(subject));
  if (isPromotion) return null;
  // Sender recognition helps explain a shipment but is never sufficient by itself.
  const carrierSender = carrierTerms.test(sender);
  const evidence = Boolean(orderKey || (trackingKey && trackingKey.length >= 8) || transactionalSubject.test(subject) || (carrierSender && transactionalBody.test(text)));
  if (!evidence) return null;
  const status: Status = /échec de livraison|livraison impossible|delivery failed|incident de livraison/i.test(text) ? "issue"
    : /disponible (?:en|au) point relais|prêt à être retiré|ready for pickup/i.test(text) ? "ready"
    : /a été livré|est livré|colis livré|livraison effectuée|delivered/i.test(text) ? "delivered"
    : /en cours de livraison|livraison aujourd.hui|out for delivery/i.test(text) ? "out"
    : /expédi|en transit|acheminement|shipped|pris en charge/i.test(text) ? "shipped" : "ordered";
  const carrier = text.match(carrierTerms)?.[0] ?? (carrierSender ? sender.match(carrierTerms)?.[0] ?? null : null);
  const date = text.match(/(?:livraison (?:prévue|estimée|attendue)|arrivée prévue)\s*(?:le|pour le|:)?\s*(\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?)/i)?.[1] ?? null;
  return { thread, status, carrier, tracking, date, trackingKey: trackingKey && trackingKey.length >= 8 ? trackingKey : null, orderKey, relatedCount: 1 };
}

function groupParcels(items: Parcel[]): Parcel[] {
  const groups: Parcel[][] = [];
  for (const parcel of items) {
    const match = groups.find(group => group.some(previous =>
      (parcel.trackingKey !== null && parcel.trackingKey === previous.trackingKey) ||
      (parcel.orderKey !== null && parcel.orderKey === previous.orderKey &&
        (!parcel.trackingKey || !previous.trackingKey || parcel.trackingKey === previous.trackingKey))
    ));
    if (match) match.push(parcel);
    else groups.push([parcel]);
  }
  return groups.map(group => {
    const latest = [...group].sort((a, b) => (Date.parse(b.thread.date) || 0) - (Date.parse(a.thread.date) || 0))[0];
    return {
      ...latest,
      carrier: latest.carrier ?? group.find(item => item.carrier)?.carrier ?? null,
      tracking: latest.tracking ?? group.find(item => item.tracking)?.tracking ?? null,
      date: latest.date ?? group.find(item => item.date)?.date ?? null,
      relatedCount: group.length,
    };
  }).sort((a, b) => (Date.parse(b.thread.date) || 0) - (Date.parse(a.thread.date) || 0));
}

const statusLabel: Record<Status, string> = { ordered: "Commande confirmée", shipped: "Expédié", out: "En livraison", ready: "Disponible au relais", delivered: "Livré", issue: "Livraison à vérifier" };
const progress: Record<Status, number> = { ordered: 1, shipped: 2, out: 3, ready: 3, delivered: 4, issue: 2 };

export default function DeliveriesPanel({ threads, onOpen }: { threads: Thread[]; onOpen: (thread: Thread) => void }) {
  const parcels = groupParcels(threads.map(parseParcel).filter((item): item is Parcel => item !== null));
  const active = parcels.filter(item => item.status !== "delivered");
  const delivered = parcels.filter(item => item.status === "delivered");
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-nexus-bg px-4 py-5 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-nexus-text">Mes livraisons</h1>
          <p className="mt-1 text-sm text-nexus-text-muted">Détectées dans vos e-mails · statuts non vérifiés auprès des transporteurs</p>
        </div>
        {parcels.length === 0 && (
          <div className="rounded-2xl border border-nexus-border bg-nexus-surface p-8 text-center">
            <Package size={32} className="mx-auto mb-3 text-nexus-text-muted" />
            <p className="font-medium text-nexus-text">Aucune livraison détectée</p>
            <p className="mt-2 text-sm text-nexus-text-muted">Les confirmations d'expédition et les avis de livraison apparaîtront ici à mesure que vos e-mails seront chargés.</p>
          </div>
        )}
        {([{ title: "En cours", items: active }, { title: "Livrés", items: delivered }] as const).map(group => group.items.length > 0 && (
          <section key={group.title} className="space-y-3">
            <h2 className="text-sm font-semibold text-nexus-text-muted">{group.title}</h2>
            {group.items.map(({ thread, status, carrier, tracking, date, relatedCount }) => (
              <button type="button" key={thread.id} onClick={() => onOpen(thread)} className="w-full rounded-2xl border border-nexus-border bg-nexus-surface p-4 text-left transition-colors hover:bg-nexus-surface-hover">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    {status === "delivered" ? <PackageCheck size={22} /> : status === "issue" ? <AlertCircle size={22} /> : status === "out" ? <Truck size={22} /> : <Package size={22} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-nexus-text">{thread.subject}</p>
                    <p className="mt-0.5 text-xs text-nexus-text-muted">{carrier ?? "Transporteur non identifié"} · {statusLabel[status]}{relatedCount > 1 ? ` · ${relatedCount} e-mails regroupés` : ""}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-nexus-text-muted" />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-1" aria-label={statusLabel[status]}>
                  {[1, 2, 3, 4].map(step => <div key={step} className={`h-1 rounded-full ${step <= progress[status] ? "bg-white" : "bg-white/15"}`} />)}
                </div>
                {(date || tracking) && <p className="mt-3 text-xs text-nexus-text-muted">{date ? `Livraison annoncée : ${date}` : ""}{date && tracking ? " · " : ""}{tracking ? `Suivi indiqué : ${tracking}` : ""}</p>}
              </button>
            ))}
          </section>
        ))}
        <p className="text-xs leading-relaxed text-nexus-text-dim">Informations extraites des e-mails chargés. Les messages sont regroupés uniquement lorsqu’un identifiant de suivi ou de commande commun est détecté. Ouvrez le message pour consulter le suivi officiel.</p>
      </div>
    </div>
  );
}
