"use client";

import { useEffect } from "react";

export default function MailtoComposeRedirect() {
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get("to") ?? "";
    const mailto = incoming.replace(/^mailto:/i, "");
    const [address, query = ""] = mailto.split("?");
    const params = new URLSearchParams(query);
    const destination = new URL("/", window.location.origin);
    destination.searchParams.set("compose", "1");
    if (address) destination.searchParams.set("to", address);
    if (params.get("subject")) destination.searchParams.set("subject", params.get("subject")!);
    if (params.get("body")) destination.searchParams.set("body", params.get("body")!);
    window.location.replace(destination.toString());
  }, []);
  return <main className="min-h-dvh bg-black text-white flex items-center justify-center">Ouverture de la rédaction…</main>;
}
