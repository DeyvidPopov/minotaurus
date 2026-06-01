// Safety guard for destructive scripts (demo seed, prisma reset). These wipe
// every row in the database, so they must never run against production or a
// remote/managed database. The check is a pure function over its inputs so it
// can be unit-tested; `assertDestructiveAllowed` is the env-reading wrapper the
// scripts call.
import { config as loadEnv } from "dotenv";

// Idempotent — dotenv does not override already-set vars. Ensures the CLI guard
// and the seed both see DATABASE_URL regardless of import order.
loadEnv();

export interface DestructiveSafetyInput {
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  /** ALLOW_DESTRUCTIVE_SEED=true — escape hatch for an unrecognized-but-local host. */
  allowOverride: boolean;
}

export interface DestructiveSafetyResult {
  allowed: boolean;
  /** Present when blocked — the specific reason, appended to the block message. */
  reason?: string;
  host?: string;
}

/** Exact prefix required by the audit spec; the specific reason is appended. */
export const DESTRUCTIVE_BLOCK_MESSAGE =
  "Refusing to run destructive seed against non-development database.";

// Hosts we treat as a safe local dev database.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

// Substrings that mark a managed/remote provider. Matched against the host.
const REMOTE_HINTS = [
  "railway",
  "neon.tech",
  "neon",
  "supabase",
  "amazonaws",
  "render.com",
  "render",
  "planetscale",
  "digitalocean",
  "azure",
];

/**
 * Best-effort host extraction from a Postgres connection string. Handles
 * `scheme://user:pass@host:port/db`, passwords containing `@` (takes the last
 * `@`), and bracketed IPv6 hosts (`[::1]`). Returns "" if it can't determine one.
 */
export function extractDbHost(databaseUrl: string): string {
  const afterScheme = databaseUrl.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const afterAuth = afterScheme.includes("@")
    ? afterScheme.slice(afterScheme.lastIndexOf("@") + 1)
    : afterScheme;
  if (afterAuth.startsWith("[")) {
    const end = afterAuth.indexOf("]");
    return end > 0 ? afterAuth.slice(1, end).trim() : "";
  }
  const host = afterAuth.split(/[:/?#]/)[0] ?? "";
  return host.trim();
}

/**
 * Decide whether a destructive script may run. Production and remote hosts are
 * hard blocks (not overridable). An unrecognized host can be allowed with the
 * explicit `allowOverride` escape hatch.
 */
export function checkDestructiveSafety(
  input: DestructiveSafetyInput,
): DestructiveSafetyResult {
  const { databaseUrl, nodeEnv, allowOverride } = input;

  // 1. Production is never destructible, regardless of host or override.
  if ((nodeEnv ?? "").trim().toLowerCase() === "production") {
    return { allowed: false, reason: "NODE_ENV is 'production'." };
  }

  if (!databaseUrl || databaseUrl.trim() === "") {
    return { allowed: false, reason: "DATABASE_URL is not set." };
  }

  const host = extractDbHost(databaseUrl);
  if (!host) {
    return {
      allowed: false,
      host,
      reason: "Could not determine the database host from DATABASE_URL.",
    };
  }

  const lowerHost = host.toLowerCase();

  // 2. Known remote/managed providers are a hard block (not overridable).
  const remoteHint = REMOTE_HINTS.find((h) => lowerHost.includes(h));
  if (remoteHint) {
    return {
      allowed: false,
      host,
      reason: `database host "${host}" looks remote (matched "${remoteHint}").`,
    };
  }

  // 3. Recognized local host — always allowed.
  if (LOCAL_HOSTS.has(lowerHost) || lowerHost.endsWith(".localhost")) {
    return { allowed: true, host };
  }

  // 4. Unrecognized host — allowed only with the explicit override.
  if (allowOverride) {
    return { allowed: true, host };
  }

  return {
    allowed: false,
    host,
    reason: `database host "${host}" is not a recognized local host (localhost / 127.0.0.1). Set ALLOW_DESTRUCTIVE_SEED=true to override for a known-local database.`,
  };
}

/**
 * Read the environment and throw if a destructive script must not run. The
 * thrown message starts with `DESTRUCTIVE_BLOCK_MESSAGE`. Never logs secrets
 * (the connection string is not included — only the parsed host).
 */
export function assertDestructiveAllowed(): void {
  const result = checkDestructiveSafety({
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    allowOverride: process.env.ALLOW_DESTRUCTIVE_SEED === "true",
  });
  if (!result.allowed) {
    throw new Error(`${DESTRUCTIVE_BLOCK_MESSAGE} ${result.reason}`);
  }
}
