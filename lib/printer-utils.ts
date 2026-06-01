import type { PrinterStatus } from "@/components/dashboard/printer-card";

export function normalizeStatus(raw: string | null | undefined): PrinterStatus {
  if (raw === "printing") return "printing";
  if (raw === "error") return "error";
  return "idle";
}

export function formatTime(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "—";
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

export function formatFilament(level: number | null): string {
  if (level === null || Number.isNaN(level)) return "—";
  return `${Math.max(0, Math.min(100, Math.round(level)))}%`;
}

export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export interface SortableWaiter {
  id: string;
  createdAt: string | null;
}

export function sortQueueByTime<T extends SortableWaiter>(waiters: T[]): T[] {
  return [...waiters].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER;
    const tb = b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER;
    return ta === tb ? a.id.localeCompare(b.id) : ta - tb;
  });
}
