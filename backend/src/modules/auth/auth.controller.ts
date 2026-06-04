import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { signToken } from "../../middleware/auth.js";
import { getProjectAccess } from "../../lib/project-access.js";
import { created, fail, ok } from "../../utils/response.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function toPublicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    initials: `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase(),
    defaultProjectId: u.defaultProjectId,
  };
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const { password, firstName, lastName } = parsed.data;
  // Normalize on write so duplicate detection (and the verified flow's lookups)
  // are consistently case-insensitive; login already matches insensitively.
  const email = parsed.data.email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    return fail(res, 409, "EMAIL_TAKEN", "Email is already registered");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const userCount = await prisma.user.count();
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role: userCount === 0 ? "ADMIN" : "ENGINEER",
    },
  });
  const token = signToken({ userId: user.id, email: user.email });
  return created(res, { token, user: toPublicUser(user) }, "Account created");
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const { email, password } = parsed.data;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) return fail(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  const okPw = await bcrypt.compare(password, user.passwordHash);
  if (!okPw) return fail(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  const token = signToken({ userId: user.id, email: user.email });
  return ok(res, { token, user: toPublicUser(user) }, "Login successful");
}

export async function me(req: Request, res: Response) {
  const userId = (req as Request & { user?: { userId: string } }).user?.userId;
  if (!userId) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail(res, 401, "UNAUTHORIZED", "User not found");
  return ok(res, { user: toPublicUser(user) }, "OK");
}

const updateMeSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    // null = clear the default workspace (land on the dashboard).
    defaultProjectId: z.string().min(1).nullable().optional(),
  })
  .refine(
    (v) =>
      v.firstName !== undefined ||
      v.lastName !== undefined ||
      v.email !== undefined ||
      v.defaultProjectId !== undefined,
    { message: "At least one field is required" },
  );

export async function updateMe(req: Request, res: Response) {
  const userId = (req as Request & { user?: { userId: string } }).user?.userId;
  if (!userId) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail(res, 401, "UNAUTHORIZED", "User not found");

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }

  if (parsed.data.email && parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
    const taken = await prisma.user.findFirst({
      where: {
        id: { not: user.id },
        email: { equals: parsed.data.email, mode: "insensitive" },
      },
    });
    if (taken) return fail(res, 409, "EMAIL_TAKEN", "Email is already registered");
  }

  // A non-null default workspace must be a project the user can actually access,
  // otherwise we'd store a reference that resolves to a "project unavailable" page.
  if (parsed.data.defaultProjectId) {
    const access = await getProjectAccess(parsed.data.defaultProjectId, user.id);
    if (access.status !== "ok") {
      return fail(res, 400, "INVALID_DEFAULT_PROJECT", "You don't have access to that project");
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(parsed.data.email ? { email: parsed.data.email } : {}),
      ...(parsed.data.firstName ? { firstName: parsed.data.firstName } : {}),
      ...(parsed.data.lastName ? { lastName: parsed.data.lastName } : {}),
      ...(parsed.data.defaultProjectId !== undefined
        ? { defaultProjectId: parsed.data.defaultProjectId }
        : {}),
    },
  });
  return ok(res, { user: toPublicUser(updated) }, "Profile updated");
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function changePassword(req: Request, res: Response) {
  const userId = (req as Request & { user?: { userId: string } }).user?.userId;
  if (!userId) return fail(res, 401, "UNAUTHORIZED", "User not found");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail(res, 401, "UNAUTHORIZED", "User not found");

  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const okPw = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!okPw) return fail(res, 401, "INVALID_CREDENTIALS", "Current password is incorrect");

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  return ok(res, { user: toPublicUser(updated) }, "Password updated");
}
