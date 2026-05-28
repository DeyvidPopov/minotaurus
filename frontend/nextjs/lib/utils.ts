// lib/utils.ts — tiny shared helpers

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class merger — `cn("p-2", condition && "bg-red-500")` */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Human-readable "x ago" from an ISO timestamp (assumes app-clock 2026-05-26). */
export function timeAgo(iso: string) {
  // Compare against the actual current time. Earlier prototypes pinned this
  // to a constant for mock data; the value is real now, so use `Date.now()`.
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "—";
  const ms = Date.now() - target;
  // Future timestamps (clock skew / recently-created records) → "just now".
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
