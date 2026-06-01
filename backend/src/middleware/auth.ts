import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { fail } from "../utils/response.js";
import { getJwtSecret } from "../config/env.js";

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return fail(res, 401, "UNAUTHORIZED", "Missing bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return fail(res, 401, "UNAUTHORIZED", "User no longer exists");
    req.user = { userId: user.id, email: user.email };
    return next();
  } catch {
    return fail(res, 401, "UNAUTHORIZED", "Invalid or expired token");
  }
}
