"use client";

import {
  Inbox,
  Package,
  Star,
  Send,
  FileEdit,
  Trash2,
  ChevronDown,
  ShieldCheck,
  Lock,
  Settings,
} from "lucide-react";
import type { AccountLabel } from "@/lib/api";
import type { Folder } from "@/types/email";

const folderIcons: Record<string, React.ReactNode> = {
  inbox: <Inbox size={18} />,
  starred: <Star size={18} />,
  sent: <Send size={18} />,
  drafts: <FileEdit size={18} />,
  trash: <Trash2 size={18} />,
  vault: <Lock size={18} />,
  deliveries: <Package size={18} />,
};

const folderLabels: Record<string, string> = {
  inbox: "Boîte de réception",
  starred: "Favoris",
  sent: "Messages envoyés",
  drafts: "Brouillons",
  trash: "Corbeille",
  vault: "Coffre-fort",
  deliveries: "Livraisons",
};

interface SidebarProps {
  activeFolder: Folder;
  onFolderChange: (folder: Folder) => void;
  onOpenSecurity: () => void;
  onOpenSettings: () => void;
  unreadCount: number;
  vaultCount: number;
  labels: Array<AccountLabel & { accountId: string; accountEmail: string }>;
  activeAccountId: string | null;
  selectedLabel: { accountId: string; id: string } | null;
  onSelectLabel: (label: { accountId: string; id: string; name: string }) => void;
}

export default function Sidebar({
  activeFolder,
  onFolderChange,
  onOpenSecurity,
  onOpenSettings,
  unreadCount,
  vaultCount,
  labels,
  activeAccountId,
  selectedLabel,
  onSelectLabel,
}: SidebarProps) {
  const folders: Folder[] = ["inbox", "deliveries", "starred", "sent", "drafts", "vault", "trash"];
  const userLabels = labels;

  return (
    <aside className="w-full h-full min-h-0 flex flex-col bg-nexus-surface lg:border-r lg:border-nexus-border">
      <div
        className="flex shrink-0 items-center border-b border-nexus-border/50"
        style={{ padding: "calc(env(safe-area-inset-top) + 16px) 16px 16px 24px" }}
      >
        <div className="flex items-center gap-3">
          <svg
            className="h-8 w-8 stroke-current text-white"
            viewBox="0 0 64 64"
            aria-label="NEXUS HUB"
            role="img"
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path className="opacity-90" d="M 33 11 L 16 27 L 33 43" />
            <path className="opacity-90" d="M 35 25 L 51 41 L 35 57" />
          </svg>
          <span className="text-xl font-bold tracking-wide text-white">Mail</span>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 space-y-0.5">
        {folders.map((folder) => (
          <button
            key={folder}
            onClick={() => onFolderChange(folder)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              activeFolder === folder
                ? "bg-nexus-primary/15 text-nexus-primary-light font-medium"
                : "text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text"
            }`}
          >
            <span
              className={
                activeFolder === folder
                  ? "text-nexus-primary-light"
                  : "text-nexus-text-dim"
              }
            >
              {folderIcons[folder]}
            </span>
            <span className="flex-1 text-left">{folderLabels[folder]}</span>
            {folder === "inbox" && unreadCount > 0 && (
              <span className="text-xs font-semibold bg-nexus-primary/20 text-nexus-primary-light px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
            {folder === "vault" && vaultCount > 0 && (
              <span className="text-xs font-semibold bg-nexus-primary/20 text-nexus-primary-light px-2 py-0.5 rounded-full">
                {vaultCount}
              </span>
            )}
          </button>
        ))}

        <div className="pt-4 pb-2 px-3">
          <div className="flex items-center justify-between text-xs text-nexus-text-dim uppercase tracking-wider font-medium">
            <span>Labels</span>
            <ChevronDown size={14} />
          </div>
        </div>

        {userLabels.length === 0 && (
          <p className="px-3 py-2 text-xs text-nexus-text-dim">Aucun libellé personnalisé</p>
        )}
        {userLabels.map((label) => (
          <button
            key={`${label.accountId}:${label.id}`}
            onClick={() => onSelectLabel({ accountId: label.accountId, id: label.id, name: label.name })}
            aria-pressed={selectedLabel?.accountId === label.accountId && selectedLabel?.id === label.id}
            title={`${label.name} — ${label.accountEmail}`}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${selectedLabel?.accountId === label.accountId && selectedLabel?.id === label.id ? "bg-nexus-primary/15 text-nexus-primary-light font-medium" : "text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text"}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: label.color || "#64748b" }}
            />
            <span className="flex-1 text-left truncate">{label.name}</span>
            {activeAccountId === "all" && <span className="max-w-20 truncate text-[10px] text-nexus-text-dim">{label.accountEmail.split("@")[0]}</span>}
          </button>
        ))}
      </nav>

      <div className="px-2 pb-2">
        <button
          onClick={onOpenSecurity}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text transition-all"
        >
          <span className="text-nexus-primary-light">
            <ShieldCheck size={18} />
          </span>
          <span className="flex-1 text-left">Sécurité &amp; clés</span>
        </button>
      </div>

      <div className="px-2 pb-2">
        <button type="button" onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-nexus-text-muted hover:bg-nexus-surface-hover hover:text-nexus-text transition-colors">
          <Settings size={18} aria-hidden="true" />
          <span className="flex-1 text-left">Paramètres</span>
        </button>
      </div>

      <div className="p-4 border-t border-nexus-border">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-nexus-primary flex items-center justify-center text-xs font-bold text-black">
            MK
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">Meric Koken</div>
            <div className="text-xs text-nexus-text-dim truncate">
              merickoken54@gmail.com
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
