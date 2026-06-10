// lib/api/dashboard.ts — read-only cross-project dashboard summary.
// All trends are derived server-side from real entity creation timestamps.
import { apiClient } from "./client";

export interface DashboardTrendStat {
  total: number;
  delta: number;
  /** Period the `delta` covers, for the "+N this week/month" label. */
  deltaUnit: "week" | "month";
  /** Cumulative per-day series ending at `total`. */
  spark: number[];
}

export interface DashboardChangesStat {
  /** Version events in the trailing window. */
  total: number;
  windowDays: number;
  spark: number[];
}

export interface DashboardStats {
  projects: DashboardTrendStat;
  artifacts: DashboardTrendStat;
  openIssues: DashboardTrendStat;
  changes: DashboardChangesStat;
}

export interface ValidationByProject {
  projectId: string;
  open: number;
  critical: number;
  error: number;
  warning: number;
  info: number;
}

export interface DashboardSummary {
  stats: DashboardStats;
  validationByProject: ValidationByProject[];
}

export const dashboardApi = {
  summary: () => apiClient.get<DashboardSummary>("/dashboard/summary"),
};
