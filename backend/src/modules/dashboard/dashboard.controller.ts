// modules/dashboard/dashboard.controller.ts
// Read-only, cross-project dashboard summary for the authenticated user. Scopes
// to the user's accessible projects (same membership rule as listProjects) and
// aggregates real creation timestamps into trend stats + a per-project
// validation breakdown. Computes no scores and writes nothing.

import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { trendStat, dailyCounts, countBySeverity } from "./dashboard.engine.js";

const DAY_MS = 86_400_000;

function emptySummary() {
  const zeroTrend = { total: 0, delta: 0, spark: [] as number[] };
  return {
    stats: {
      projects: { ...zeroTrend, deltaUnit: "month" as const },
      artifacts: { ...zeroTrend, deltaUnit: "week" as const },
      openIssues: { ...zeroTrend, deltaUnit: "week" as const },
      changes: { total: 0, windowDays: 7, spark: [] as number[] },
    },
    validationByProject: [] as unknown[],
  };
}

export async function getDashboardSummary(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const nowMs = Date.now();

  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: { id: true, createdAt: true },
  });
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) return ok(res, emptySummary(), "OK");

  const [artifacts, openIssues, events] = await Promise.all([
    prisma.artifact.findMany({ where: { projectId: { in: ids } }, select: { createdAt: true } }),
    prisma.validationIssue.findMany({
      where: { projectId: { in: ids }, status: "OPEN" },
      select: { createdAt: true, severity: true, projectId: true },
    }),
    prisma.versionEvent.findMany({
      where: { projectId: { in: ids }, createdAt: { gte: new Date(nowMs - 7 * DAY_MS) } },
      select: { createdAt: true },
    }),
  ]);

  const ms = (d: Date) => d.getTime();
  const projectsStat = trendStat(projects.map((p) => ms(p.createdAt)), projects.length, { nowMs, windowDays: 14, deltaDays: 30 });
  const artifactsStat = trendStat(artifacts.map((a) => ms(a.createdAt)), artifacts.length, { nowMs, windowDays: 14, deltaDays: 7 });
  const issuesStat = trendStat(openIssues.map((i) => ms(i.createdAt)), openIssues.length, { nowMs, windowDays: 14, deltaDays: 7 });
  const changesSpark = dailyCounts(events.map((e) => ms(e.createdAt)), 7, nowMs);

  // Per-project severity breakdown for every accessible project (incl. zero-issue ones).
  const sevByProject = new Map<string, string[]>();
  for (const id of ids) sevByProject.set(id, []);
  for (const iss of openIssues) sevByProject.get(iss.projectId)?.push(String(iss.severity));
  const validationByProject = ids.map((id) => {
    const sevs = sevByProject.get(id) ?? [];
    return { projectId: id, open: sevs.length, ...countBySeverity(sevs) };
  });

  return ok(res, {
    stats: {
      projects: { ...projectsStat, deltaUnit: "month" },
      artifacts: { ...artifactsStat, deltaUnit: "week" },
      openIssues: { ...issuesStat, deltaUnit: "week" },
      changes: { total: changesSpark.reduce((a, b) => a + b, 0), windowDays: 7, spark: changesSpark },
    },
    validationByProject,
  }, "OK");
}
