// project-access.ts — shared membership + role helpers.
// Replaces the per-controller `ownerId === userId` checks now that projects
// have a real ProjectMember table. The legacy `ownerId` field is kept as the
// "creator" pointer and is treated as an implicit OWNER membership when no
// row exists in ProjectMember yet (covers projects from before Phase 7 / any
// future code path that forgets to create the owner row).

import type { Project, ProjectRole } from "@prisma/client";
import type { NextFunction, Response } from "express";
import { prisma } from "./prisma.js";
import { fail } from "../utils/response.js";
import type { AuthedRequest } from "../middleware/auth.js";

export interface ProjectAccess {
  status: "ok" | "not_found" | "forbidden";
  role?: ProjectRole;
  // The loaded project row (present whenever the project exists), so callers
  // that already ran the access check don't re-`findUnique` the same row.
  project?: Project;
}

const ROLE_ORDER: Record<ProjectRole, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ARCHITECT: 2,
  OWNER: 3,
};

export function hasAtLeast(role: ProjectRole, min: ProjectRole): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}

export async function getProjectAccess(
  projectId: string,
  userId: string,
): Promise<ProjectAccess> {
  // The project load and membership lookup are independent — run them
  // concurrently instead of serially (this check is on every project-scoped
  // request). not_found still takes priority; a membership row for a
  // nonexistent project simply comes back null.
  const [project, membership] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    }),
  ]);
  if (!project) return { status: "not_found" };
  if (membership) return { status: "ok", role: membership.role, project };
  if (project.ownerId === userId) return { status: "ok", role: "OWNER", project };
  return { status: "forbidden" };
}

/**
 * Status-only access check with role gating: returns "ok" once the user meets
 * `minRole`, otherwise the raw "not_found"/"forbidden" status. For controllers
 * that branch on the status string directly rather than taking the response
 * shortcut the `assert*` helpers provide.
 */
export async function projectAccessStatus(
  projectId: string,
  userId: string,
  minRole: ProjectRole = "VIEWER",
): Promise<"ok" | "not_found" | "forbidden"> {
  const access = await getProjectAccess(projectId, userId);
  if (access.status !== "ok") return access.status;
  return hasAtLeast(access.role!, minRole) ? "ok" : "forbidden";
}

export function requireProjectMembership() {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const projectId = req.params.projectId;
    if (!projectId) return fail(res, 400, "VALIDATION_ERROR", "projectId required");
    const access = await getProjectAccess(projectId, req.user!.userId);
    if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
    if (access.status === "forbidden") return fail(res, 403, "FORBIDDEN", "Not a member of this project");
    (req as AuthedRequest & { projectRole?: ProjectRole }).projectRole = access.role;
    return next();
  };
}

/**
 * Helper for controllers: verifies the user has at least the given role on the
 * project. Sends the appropriate error response and returns null if denied;
 * otherwise returns the actual role.
 */
export async function assertProjectRole(
  projectId: string,
  userId: string,
  res: Response,
  minRole: ProjectRole = "VIEWER",
): Promise<ProjectRole | null> {
  const access = await getProjectAccess(projectId, userId);
  if (access.status === "not_found") {
    fail(res, 404, "NOT_FOUND", "Project not found");
    return null;
  }
  if (access.status !== "ok" || !access.role) {
    fail(res, 403, "FORBIDDEN", "Not a member of this project");
    return null;
  }
  if (!hasAtLeast(access.role, minRole)) {
    fail(res, 403, "INSUFFICIENT_ROLE", `Requires ${minRole} or higher`);
    return null;
  }
  return access.role;
}

/** Shorthand: mutation operations require at least DEVELOPER (VIEWERs are read-only). */
export function assertCanMutate(projectId: string, userId: string, res: Response) {
  return assertProjectRole(projectId, userId, res, "DEVELOPER");
}

export function requireProjectRole(minRole: ProjectRole) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const projectId = req.params.projectId;
    if (!projectId) return fail(res, 400, "VALIDATION_ERROR", "projectId required");
    const access = await getProjectAccess(projectId, req.user!.userId);
    if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
    if (access.status !== "ok" || !access.role) {
      return fail(res, 403, "FORBIDDEN", "Not a member of this project");
    }
    if (!hasAtLeast(access.role, minRole)) {
      return fail(res, 403, "INSUFFICIENT_ROLE", `Requires ${minRole} or higher`);
    }
    (req as AuthedRequest & { projectRole?: ProjectRole }).projectRole = access.role;
    return next();
  };
}
