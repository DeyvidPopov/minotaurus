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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Locale-independent absolute date, e.g. "Jun 6, 2026". Deliberately does NOT use
 * `toLocaleDateString()` — that picks up the host OS locale and leaks suffixes like
 * the Bulgarian "г." into an otherwise-English UI. Keep one English format everywhere.
 */
export function formatDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Narrow, conservative filler markers. Substrings only match obvious seed/placeholder
// copy; exact tokens cover the common one-word fillers. Kept intentionally small so a
// real description is never mistaken for a placeholder.
const PLACEHOLDER_PHRASES = ["testbed artifact", "lorem ipsum", "sample artifact", "placeholder description", "placeholder text"];
const PLACEHOLDER_EXACT = new Set(["todo", "tbd", "n/a", "na", "none", "no description"]);

/**
 * True when a description is empty or obvious filler that shouldn't occupy prime
 * header space. Matches only known filler phrases, a few exact one-word fillers, or
 * a description that merely restates the title. Conservative by design.
 */
export function isPlaceholderDescription(description?: string | null, title?: string) {
  const norm = (description ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return true;
  const stripped = norm.replace(/[.\s]+$/, "");
  if (PLACEHOLDER_EXACT.has(stripped)) return true;
  if (PLACEHOLDER_PHRASES.some((m) => norm.includes(m))) return true;
  if (title && norm === title.trim().toLowerCase()) return true;
  return false;
}
