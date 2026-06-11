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
  assertProductionCors();
}

/**
 * In production, refuse to start without an explicit CORS allow-list. With
 * `CORS_ORIGIN` unset the cors() middleware falls back to reflecting ANY origin
 * with credentials — fine for local dev, a misconfiguration in production. We
 * fail fast rather than silently allow-all. Outside production this is a no-op.
 */
function assertProductionCors(): void {
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  if (!isProd) return;
  const origin = (process.env.CORS_ORIGIN || "").trim();
  if (origin === "") {
    throw new ConfigError(
      "CORS_ORIGIN is not set. In production it must be the explicit frontend " +
        "origin(s), e.g. CORS_ORIGIN=https://minotaurus.dev — refusing to start " +
        "with an allow-all CORS policy.",
    );
  }
}

// ────────────────────────────── Email configuration ──────────────────────────────
//
// Email config is intentionally OPTIONAL and is NOT part of validateConfig():
// the app must run locally with zero email credentials (the dev provider just
// logs a masked code). A real provider is selected with EMAIL_PROVIDER=resend
// (RESEND_API_KEY) or EMAIL_PROVIDER=smtp (SMTP_* vars) plus MAIL_FROM; if the
// required creds are missing the provider surfaces a 503 EMAIL_NOT_CONFIGURED at
// send time rather than blocking startup.

export type EmailProvider = "dev" | "smtp" | "resend";

export interface EmailConfig {
  provider: EmailProvider;
  smtp: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
  };
  resend: {
    apiKey?: string;
  };
  /** From address; falls back to a non-routable dev default. */
  from: string;
}

/** Resolve email configuration from the environment. Never throws. */
export function getEmailConfig(): EmailConfig {
  const raw = (process.env.EMAIL_PROVIDER || "dev").trim().toLowerCase();
  const provider: EmailProvider =
    raw === "resend" ? "resend" : raw === "smtp" ? "smtp" : "dev";
  const portRaw = process.env.SMTP_PORT;
  const port = portRaw && portRaw.trim() !== "" ? Number(portRaw) : undefined;
  return {
    provider,
    smtp: {
      host: process.env.SMTP_HOST?.trim() || undefined,
      port: Number.isFinite(port) ? port : undefined,
      user: process.env.SMTP_USER?.trim() || undefined,
      pass: process.env.SMTP_PASS || undefined,
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY?.trim() || undefined,
    },
    from: process.env.MAIL_FROM?.trim() || "Minotaurus Team <noreply@minotaurus.dev>",
  };
}

/** True only outside production — gates the dev provider's plaintext code logging. */
export function isDevEmailLoggingAllowed(): boolean {
  return (process.env.NODE_ENV || "development").toLowerCase() !== "production";
}

/**
 * Optional public base URL of the frontend app (e.g. `https://app.minotaurus.dev`),
 * used to build absolute links in outbound emails. Optional and never throws —
 * when unset, emails fall back to a relative route hint. Trailing slashes are
 * trimmed so callers can append `/projects/...` safely.
 */
export function getAppBaseUrl(): string | null {
  const raw = (process.env.APP_BASE_URL || process.env.FRONTEND_URL || "").trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}
