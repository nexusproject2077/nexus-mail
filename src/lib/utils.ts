import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";

export function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Hier";
  return format(date, "d MMM", { locale: fr });
}

export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, "d MMMM yyyy 'à' HH:mm", { locale: fr });
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function getAvatarColor(email: string): string {
  const colors = [
    "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
    "#ec4899", "#f43f5e", "#ef4444", "#f97316",
    "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
    "#3b82f6", "#2563eb",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getLabelInfo(labelId: string): { name: string; color: string } | null {
  const map: Record<string, { name: string; color: string }> = {
    Label_7: { name: "Très important", color: "#ef4444" },
    Label_8: { name: "Important", color: "#eab308" },
    Label_9: { name: "Normal", color: "#94a3b8" },
  };
  return map[labelId] || null;
}
