"use client";

import { Search, SlidersHorizontal } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative w-full min-w-0 max-w-2xl">
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-nexus-text-dim"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher..."
        className="w-full min-w-0 pl-9 sm:pl-10 pr-3 sm:pr-10 py-2.5 bg-nexus-surface-hover border border-nexus-border rounded-xl text-sm text-nexus-text placeholder:text-nexus-text-dim outline-none focus:border-nexus-primary/50 focus:ring-1 focus:ring-nexus-primary/25 transition-all"
      />
      <button className="hidden sm:block absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-nexus-surface-active text-nexus-text-dim hover:text-nexus-text transition-colors">
        <SlidersHorizontal size={14} />
      </button>
    </div>
  );
}
