// api-intel.constants.ts — deterministic lexicons + heuristics for the API
// Payload Intelligence analyzer. All matching is rule-based; no AI.

import type { Confidence, WorkflowKind } from "./api-intel.types.js";

/** Credential-class field tokens (substring match on normalized field name). */
export const CREDENTIAL_TOKENS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "accesskey",
  "privatekey",
  "clientsecret",
  "otp",
  "passcode",
  "credential",
];

/** PII-class field tokens. */
export const PII_TOKENS = ["ssn", "socialsecurity", "creditcard", "cardnumber", "cvv", "passport"];

/**
 * Generic field names that must NOT drive an entity match (every entity has an
 * `id`/`status`/timestamps). Normalized (lowercase, alnum-only).
 */
export const GENERIC_FIELDS = new Set([
  "id",
  "ids",
  "name",
  "title",
  "type",
  "status",
  "kind",
  "value",
  "data",
  "description",
  "createdat",
  "updatedat",
  "deletedat",
  "issuedat",
  "processedat",
  "timestamp",
  "count",
  "total",
  "page",
  "pagesize",
  "limit",
  "offset",
  "message",
  "success",
  "error",
  "role",
  "currency",
  "amount",
]);

/** Generic tokens that must NOT match an entity name (too broad). */
export const ENTITY_TOKEN_STOP = new Set([
  "id",
  "data",
  "item",
  "items",
  "list",
  "info",
  "detail",
  "details",
  "record",
  "object",
  "result",
]);

/** Words dropped when token-matching an artifact title (so "patient" matches "Patient Service"). */
export const TITLE_TOKEN_STOP = new Set([
  "service",
  "services",
  "api",
  "apis",
  "gateway",
  "database",
  "db",
  "system",
  "module",
  "management",
  "manager",
  "app",
  "application",
  "platform",
  "the",
  "and",
  "of",
  "policy",
  "compliance",
]);

/** Tokens dropped from free-text payloads (type words, not field names). */
export const FREETEXT_STOP = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "null",
  "true",
  "false",
  "int",
  "integer",
  "float",
  "uuid",
  "date",
  "datetime",
  "iso",
  "email",
  "optional",
  "required",
  "nullable",
]);

/** Stems whose id-like fields indicate a user-scoped (auth-sensitive) endpoint. */
export const USER_SCOPED_STEMS = new Set([
  "user",
  "patient",
  "account",
  "customer",
  "member",
  "owner",
  "doctor",
]);

/**
 * Path action keywords → ADDITIVE workflow signals (layered on top of the
 * method-derived CRUD signal). `nonCrud: true` suppresses the generic
 * Create/Update so e.g. POST /auth/login does not read as "Creates Auth".
 */
export interface ActionVerb {
  kind: WorkflowKind;
  /** Build the label; `obj` is the resolved primary object (Title Case). */
  label: (obj: string) => string;
  confidence: Confidence;
  basis: string;
  nonCrud?: boolean;
}

export const ACTION_VERBS: Record<string, ActionVerb> = {
  login: { kind: "AUTHENTICATE", label: () => "Authenticates User", confidence: "medium", basis: "login action endpoint", nonCrud: true },
  signin: { kind: "AUTHENTICATE", label: () => "Authenticates User", confidence: "medium", basis: "sign-in action endpoint", nonCrud: true },
  logout: { kind: "END", label: () => "Ends User Session", confidence: "medium", basis: "logout action endpoint", nonCrud: true },
  signout: { kind: "END", label: () => "Ends User Session", confidence: "medium", basis: "sign-out action endpoint", nonCrud: true },
  register: { kind: "START", label: (o) => `Starts ${o} Onboarding`, confidence: "low", basis: "register action endpoint" },
  signup: { kind: "START", label: (o) => `Starts ${o} Onboarding`, confidence: "low", basis: "sign-up action endpoint" },
  pay: { kind: "GENERATE", label: () => "Processes Payment", confidence: "medium", basis: "pay action endpoint", nonCrud: true },
  refund: { kind: "GENERATE", label: () => "Issues Refund", confidence: "medium", basis: "refund action endpoint", nonCrud: true },
  verify: { kind: "TRIGGER", label: () => "Triggers Verification", confidence: "low", basis: "verify action endpoint", nonCrud: true },
  refresh: { kind: "GENERATE", label: () => "Generates Access Token", confidence: "medium", basis: "refresh action endpoint", nonCrud: true },
  reset: { kind: "TRIGGER", label: () => "Resets Credentials", confidence: "low", basis: "reset action endpoint", nonCrud: true },
  search: { kind: "READ", label: (o) => `Searches ${o}`, confidence: "low", basis: "search action endpoint", nonCrud: true },
};

/** Fixed render order for workflow signals (deterministic output). */
export const WORKFLOW_KIND_ORDER: WorkflowKind[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "REFERENCE",
  "READ",
  "AUTHENTICATE",
  "GENERATE",
  "START",
  "TRIGGER",
  "REQUIRE",
  "END",
];
