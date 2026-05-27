import type { Response } from "express";
import { z } from "zod";
import { ProjectRole, type ProjectMember, type User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { created, fail, ok } from "../../utils/response.js";
import type { AuthedRequest } from "../../middleware/auth.js";
import { getProjectAccess } from "../../lib/project-access.js";
import { recordVersionEvent } from "../versions/versions.engine.js";

const ROLE_VALUES = [
  ProjectRole.OWNER,
  ProjectRole.ARCHITECT,
  ProjectRole.DEVELOPER,
  ProjectRole.VIEWER,
] as const;

const addSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ARCHITECT", "DEVELOPER", "VIEWER"]).default("VIEWER"),
});

const updateSchema = z.object({
  role: z.enum(["OWNER", "ARCHITECT", "DEVELOPER", "VIEWER"]),
});

type MemberWithUser = ProjectMember & { user: Pick<User, "id" | "email" | "firstName" | "lastName" | "role"> };

function serializeMember(m: MemberWithUser) {
  const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").trim();
  const initials = `${m.user.firstName.charAt(0)}${m.user.lastName.charAt(0)}`.toUpperCase();
  return {
    id: m.id,
    projectId: m.projectId,
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    user: {
      id: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      name: name || null,
      initials: initials || null,
      globalRole: m.user.role,
    },
  };
}

export async function listMembers(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
  });
  return ok(res, members.map(serializeMember), "OK");
}

export async function addMember(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok" || access.role !== "OWNER") {
    return fail(res, 403, "FORBIDDEN", "Only OWNER can add members");
  }
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  if (!ROLE_VALUES.includes(parsed.data.role as ProjectRole)) {
    return fail(res, 400, "VALIDATION_ERROR", "Invalid role");
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return fail(res, 404, "USER_NOT_FOUND", `No user with email ${parsed.data.email}`);

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (existing) return fail(res, 409, "ALREADY_MEMBER", "User is already a member of this project");

  const member = await prisma.projectMember.create({
    data: { projectId, userId: user.id, role: parsed.data.role as ProjectRole },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
  });

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
  await recordVersionEvent({
    projectId,
    entityType: "PROJECT",
    entityId: projectId,
    action: "LINKED",
    title: `${fullName} joined project as ${member.role}`,
    description: "Member added",
    triggeredBy: req.user!.userId,
    metadata: { memberId: member.id, memberUserId: user.id, role: member.role, email: user.email },
  });

  return created(res, serializeMember(member), "Member added");
}

export async function updateMember(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const memberId = req.params.memberId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok" || access.role !== "OWNER") {
    return fail(res, 403, "FORBIDDEN", "Only OWNER can change roles");
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
  });
  if (!member || member.projectId !== projectId) {
    return fail(res, 404, "NOT_FOUND", "Member not found in this project");
  }

  const newRole = parsed.data.role as ProjectRole;
  if (member.role === "OWNER" && newRole !== "OWNER") {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return fail(res, 400, "LAST_OWNER", "Cannot demote the last OWNER of the project");
    }
  }

  const previousRole = member.role;
  const updated = await prisma.projectMember.update({
    where: { id: memberId },
    data: { role: newRole },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
  });

  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim() || member.user.email;
  await recordVersionEvent({
    projectId,
    entityType: "PROJECT",
    entityId: projectId,
    action: "UPDATED",
    title: `${fullName} role changed: ${previousRole} → ${newRole}`,
    description: "Role updated",
    triggeredBy: req.user!.userId,
    metadata: {
      memberId: member.id,
      memberUserId: member.userId,
      previousRole,
      newRole,
    },
  });

  return ok(res, serializeMember(updated), "Member updated");
}

export async function removeMember(req: AuthedRequest, res: Response) {
  const projectId = req.params.projectId;
  const memberId = req.params.memberId;
  const access = await getProjectAccess(projectId, req.user!.userId);
  if (access.status === "not_found") return fail(res, 404, "NOT_FOUND", "Project not found");
  if (access.status !== "ok") return fail(res, 403, "FORBIDDEN", "Not a member of this project");

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
    },
  });
  if (!member || member.projectId !== projectId) {
    return fail(res, 404, "NOT_FOUND", "Member not found in this project");
  }

  const isSelf = member.userId === req.user!.userId;
  if (!isSelf && access.role !== "OWNER") {
    return fail(res, 403, "FORBIDDEN", "Only OWNER can remove other members");
  }

  if (member.role === "OWNER") {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return fail(res, 400, "LAST_OWNER", "Cannot remove the last OWNER of the project");
    }
  }

  await prisma.projectMember.delete({ where: { id: memberId } });

  const fullName = [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim() || member.user.email;
  await recordVersionEvent({
    projectId,
    entityType: "PROJECT",
    entityId: projectId,
    action: "UNLINKED",
    title: isSelf
      ? `${fullName} left project`
      : `${fullName} removed from project`,
    description: "Member removed",
    triggeredBy: req.user!.userId,
    metadata: {
      memberId: member.id,
      memberUserId: member.userId,
      previousRole: member.role,
    },
  });

  return ok(res, null, "Member removed");
}
