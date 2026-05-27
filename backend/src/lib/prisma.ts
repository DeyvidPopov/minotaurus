// PrismaClient singleton. Reused across all controllers so we don't open a
// new connection pool per request.
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma__ ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}

// Convenience: load `.env` from cwd via dotenv if available (Prisma handles
// schema env loading; this helps tsx-run scripts pick up DATABASE_URL).
import { config as loadEnv } from "dotenv";
loadEnv();
