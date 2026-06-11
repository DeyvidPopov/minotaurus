// advisor.controller.ts — thin HTTP layer for the AI Architecture Advisor (the
// "Advisor / Next Steps" mode of AI Review). Role check + envelope + error
// mapping only; orchestration lives in advisor.service.ts. There is NO
// mutation/apply endpoint by design — the Advisor never writes architecture
// state, only its own AiSession(ADVISOR) audit row. The generate endpoint goes
// through the shared mode dispatcher; the GETs reuse persisted advisories with no
// AI call (cheap deterministic staleness recompute only) — mirroring AI Review.

import type { Response } from "express";
import { ok, fail } from "../../../utils/response.js";
import type { AuthedRequest } from "../../../middleware/auth.js";
import { assertProjectRole } from "../../../lib/project-access.js";
import { respondAiError } from "../ai.error-map.js";
import { generateAiArchitectureAnalysis } from "../architecture/generate.js";
import { getLatestAdvisor, getAdvisorById, listAdvisors } from "./advisor.service.js";

export async function advisorEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  // DEVELOPER+: the advisory is read-only and developers already see the full
  // project architecture. (Same tier as AI Review — nothing is written to the
  // SSOT, so this stays below the ARCHITECT export/validation tier.)
  if (!(await assertProjectRole(projectId, req.user!.userId, res, "DEVELOPER"))) return;

  try {
    const result = await generateAiArchitectureAnalysis({ mode: "ADVISOR", projectId, userId: req.user!.userId });
    return ok(res, result, "Architecture advisory generated");
  } catch (err) {
    if (respondAiError(res, err, "The project is large; increase AI_ADVISOR_MAX_TOKENS or narrow the project scope.")) return;
    throw err;
  }
}

// ── Read endpoints — reuse persisted advisories; NO AI call, NO mutation ──

export async function latestAdvisorEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  if (!(await assertProjectRole(projectId, req.user!.userId, res, "DEVELOPER"))) return;
  const result = await getLatestAdvisor(projectId);
  if (!result) return fail(res, 404, "AI_ADVISOR_NOT_FOUND", "No AI advisory has been generated for this project yet.");
  return ok(res, result, "Latest advisory");
}

export async function advisorHistoryEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  if (!(await assertProjectRole(projectId, req.user!.userId, res, "DEVELOPER"))) return;
  const items = await listAdvisors(projectId);
  return ok(res, items, "Advisory history");
}

export async function advisorByIdEndpoint(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  if (!(await assertProjectRole(projectId, req.user!.userId, res, "DEVELOPER"))) return;
  const result = await getAdvisorById(projectId, req.params.advisorId);
  if (!result) return fail(res, 404, "AI_ADVISOR_NOT_FOUND", "Advisory not found.");
  return ok(res, result, "Advisory");
}
