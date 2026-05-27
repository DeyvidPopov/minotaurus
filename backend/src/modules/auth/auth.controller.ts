import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, persist, type UserRow } from "../../db/json-db.js";
import { newId } from "../../utils/ids.js";
import { signToken } from "../../middleware/auth.js";
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

function toPublicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    initials: `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase(),
  };
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const { email, password, firstName, lastName } = parsed.data;
  const state = db();
  if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return fail(res, 409, "EMAIL_TAKEN", "Email is already registered");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user: UserRow = {
    id: newId(),
    email,
    passwordHash,
    firstName,
    lastName,
    role: state.users.length === 0 ? "ADMIN" : "ENGINEER",
    createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  persist();
  const token = signToken({ userId: user.id, email: user.email });
  return created(
    res,
    { token, user: toPublicUser(user) },
    "Account created",
  );
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "VALIDATION_ERROR", parsed.error.message);
  }
  const { email, password } = parsed.data;
  const user = db().users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (!user) return fail(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  const okPw = await bcrypt.compare(password, user.passwordHash);
  if (!okPw) return fail(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  const token = signToken({ userId: user.id, email: user.email });
  return ok(res, { token, user: toPublicUser(user) }, "Login successful");
}

export function me(req: Request, res: Response) {
  const userId = (req as Request & { user?: { userId: string } }).user?.userId;
  const user = db().users.find((u) => u.id === userId);
  if (!user) return fail(res, 401, "UNAUTHORIZED", "User not found");
  return ok(res, { user: toPublicUser(user) }, "OK");
}

export { toPublicUser };
