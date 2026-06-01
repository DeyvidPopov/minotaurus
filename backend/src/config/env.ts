// Validated runtime configuration.
//
// Security: the JWT secret has NO fallback. A missing or placeholder secret
// makes every issued token forgeable, so we fail fast (refuse startup) rather
// than silently signing with a guessable key. Both token signing and token
// verification read the secret through `getJwtSecret()` so they can never
// diverge onto different sources.
import { config as loadEnv } from "dotenv";

// Idempotent: dotenv does not override already-set vars, so loading here (in
// addition to prisma.ts) just makes config robust to import order.
loadEnv();

/** Thrown for invalid/insecure configuration. Surfaced as a fatal startup error. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// Known placeholder / example secrets that must never reach production. Matched
// case-insensitively against the trimmed value. Includes the historical
// fallbacks and the value shipped in .env.example so an unedited copy fails.
const PLACEHOLDER_JWT_SECRETS = new Set([
  "dev-secret-change-me",
  "change-me-in-production",
  "replace-with-a-long-random-secret",
  "changeme",
  "change-me",
  "secret",
  "jwt-secret",
  "your-secret",
  "your-secret-here",
]);

const MIN_JWT_SECRET_LENGTH = 16;

/**
 * Resolve and validate the JWT secret. Throws `ConfigError` (never logging the
 * secret itself) if it is missing, a known placeholder, or too short to be safe.
 * Used by both signing and verification, so they share one validated source.
 */
export function getJwtSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (raw === undefined || raw.trim() === "") {
    throw new ConfigError(
      "JWT_SECRET is not set. Set JWT_SECRET to a long, random secret before starting the backend.",
    );
  }
  const value = raw.trim();
  if (PLACEHOLDER_JWT_SECRETS.has(value.toLowerCase())) {
    throw new ConfigError(
      "JWT_SECRET is set to a known placeholder value. Replace it with a long, random secret before starting the backend.",
    );
  }
  if (value.length < MIN_JWT_SECRET_LENGTH) {
    throw new ConfigError(
      `JWT_SECRET is too weak (must be at least ${MIN_JWT_SECRET_LENGTH} characters). Replace it with a long, random secret.`,
    );
  }
  return raw;
}

/**
 * Validate all required configuration at startup. Call before binding the
 * server; on failure the caller should print the message and exit non-zero.
 */
export function validateConfig(): void {
  getJwtSecret();
}
