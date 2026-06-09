// modules/dashboard/dashboard.engine.ts
// Pure, deterministic trend math for the dashboard summary. No IO / clock /
// randomness — the caller passes `nowMs`, so the same inputs always produce a
// deep-equal result (mirrors the determinism convention of the other engines).
// Every trend here is derived from real entity creation timestamps; nothing is
// fabricated or estimated.

const DAY_MS = 86_400_000;

/** Per-day counts of `timestampsMs` over the last `days` days ending at `nowMs`. */
export function dailyCounts(timestampsMs: number[], days: number, nowMs: number): number[] {
  const out: number[] = new Array(Math.max(0, days)).fill(0);
  if (days <= 0) return out;
  const start = nowMs - days * DAY_MS;
  for (const t of timestampsMs) {
    if (t < start || t > nowMs) continue;
    const idx = Math.min(days - 1, Math.floor((t - start) / DAY_MS));
    out[idx] += 1;
  }
  return out;
}

export interface TrendStat {
  total: number;
  delta: number;
  spark: number[];
}

/**
 * Build a trend stat from creation timestamps:
 *  - total: the true total (passed in; entities created before the window still
 *    count toward it)
 *  - delta: how many were created within the last `deltaDays`
 *  - spark: cumulative running count across `windowDays`, ending exactly at
 *    `total` (a recent-growth curve). Items older than the window are folded
 *    into the starting offset so the line still terminates at the real total.
 */
export function trendStat(
  timestampsMs: number[],
  total: number,
  opts: { nowMs: number; windowDays: number; deltaDays: number },
): TrendStat {
  const { nowMs, windowDays, deltaDays } = opts;
  const deltaStart = nowMs - deltaDays * DAY_MS;
  const delta = timestampsMs.reduce((n, t) => (t >= deltaStart && t <= nowMs ? n + 1 : n), 0);

  const perDay = dailyCounts(timestampsMs, windowDays, nowMs);
  const createdInWindow = perDay.reduce((a, b) => a + b, 0);
  let run = total - createdInWindow; // entities that already existed before the window
  const spark = perDay.map((c) => (run += c));
  return { total, delta, spark };
}

export type SeverityKey = "critical" | "error" | "warning" | "info";

/** Bucket issue severities into the four UI columns (case-insensitive; unknowns ignored). */
export function countBySeverity(severities: string[]): Record<SeverityKey, number> {
  const out: Record<SeverityKey, number> = { critical: 0, error: 0, warning: 0, info: 0 };
  for (const s of severities) {
    const k = String(s).toLowerCase();
    if (k === "critical") out.critical += 1;
    else if (k === "error") out.error += 1;
    else if (k === "warning") out.warning += 1;
    else if (k === "info") out.info += 1;
  }
  return out;
}
