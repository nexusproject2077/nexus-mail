"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const filters = [["Expéditeur", "from:"], ["Pièce jointe", "has:attachment"], ["Non lus", "is:unread"], ["Favoris", "is:starred"], ["Après", "after:2026/01/01"], ["Avant", "before:2026/12/31"]];
  const addFilter = (token: string) => { onChange(`${value.trim()} ${token}`.trim()); setFocused(false); };
  return (
    <div className="relative w-full min-w-0 max-w-2xl">
      <Search
        size={19}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-nexus-text-dim"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={e => { if (e.key === "Escape" || e.key === "Enter") { setFocused(false); e.currentTarget.blur(); } }}
        placeholder="Rechercher dans Mail"
        className="w-full min-w-0 h-12 pl-11 sm:pl-10 pr-3 sm:pr-10 bg-[#1a1a1a] border border-white/10 rounded-2xl text-base text-nexus-text placeholder:text-[#888] outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all"
      />
      {focused && <div className="absolute top-full left-0 right-0 z-50 mt-2 rounded-xl border border-nexus-border bg-nexus-surface shadow-xl p-2"><div className="flex items-center justify-between mb-2 px-1"><span className="text-xs text-nexus-text-muted">Filtres de recherche</span><button type="button" aria-label="Fermer les filtres" onClick={() => setFocused(false)}><X size={16}/></button></div><div className="flex gap-2 overflow-x-auto pb-1">{filters.map(([label, token]) => <button key={token} type="button" onMouseDown={e => e.preventDefault()} onClick={() => addFilter(token)} className="shrink-0 rounded-full border border-nexus-border bg-nexus-surface-hover px-3 py-2 text-xs text-nexus-text">{label}</button>)}</div></div>}
      <button type="button" aria-label="Afficher les filtres de recherche" aria-expanded={focused} onClick={() => setFocused(current => !current)} className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-nexus-surface-active text-nexus-text-dim hover:text-nexus-text transition-colors">
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
