// text.ts — pure string heuristics shared by the payload analyzer and workflow
// inference. No state, no IO, fully deterministic.

/** lowercase, strip everything but a-z0-9. "date_of_birth" → "dateofbirth". */
export function normalizeToken(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Naive singularization on a normalized token. "patients" → "patient". */
export function singularize(s: string): string {
  if (s.length > 3 && s.endsWith("ies")) return `${s.slice(0, -3)}y`;
  if (s.length > 3 && s.endsWith("ses")) return s.slice(0, -2);
  if (s.length > 2 && s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

/** Title-case a normalized/lower token for display. "timeslot" → "Time Slot" is
 *  beyond naive casing; we just capitalize. Prefer the real entity name when known. */
export function titleCase(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Referent stem of an id-like field, or null if not id-like.
 * "patientId" → "patient", "doctor_id" → "doctor", "patientIds" → "patient".
 * "id" alone → null (the resource's own key). "valid"/"paid" → null (no boundary).
 */
export function idStem(name: string): string | null {
  if (/^id$/i.test(name)) return null;
  let m = name.match(/^(.+?)Ids?$/); // camelCase boundary: patientId / patientIds
  if (m && /[a-z]/.test(m[1])) return m[1];
  m = name.match(/^(.+?)_ids?$/i); // snake boundary: patient_id
  if (m) return m[1];
  return null;
}

export interface ParsedPath {
  /** literal path tokens in order (params stripped). */
  literals: string[];
  /** primary resource token (last non-action literal), normalized. */
  resource: string | null;
  /** parent resource for nested routes (/parent/{id}/child), normalized. */
  parent: string | null;
  /** action keyword (login, register, pay…), normalized, if the trailing literal is one. */
  action: string | null;
  /** "collection" (no trailing {id}) or "single" (operates on one {id}). */
  scope: "collection" | "single";
}

const ACTION_SET = new Set([
  "login",
  "signin",
  "logout",
  "signout",
  "register",
  "signup",
  "pay",
  "refund",
  "verify",
  "verifyemail",
  "refresh",
  "reset",
  "resetpassword",
  "forgotpassword",
  "search",
]);

/**
 * Auth-mechanism actions. These endpoints legitimately handle credentials/tokens
 * in the open (login returns a token, register sets a password, reset/forgot
 * rotate them), so the security validators allow-list them — a public auth
 * endpoint is NOT a control gap. Path segments are normalized first, so
 * "forgot-password" → "forgotpassword".
 */
export const AUTH_ACTIONS = new Set([
  "login",
  "signin",
  "logout",
  "signout",
  "register",
  "signup",
  "refresh",
  "reset",
  "resetpassword",
  "forgotpassword",
  "verify",
  "verifyemail",
  "token",
]);

/** True when the endpoint path is an auth-mechanism endpoint (allow-listed). */
export function isAuthActionPath(path: string): boolean {
  const action = parsePath(path).action;
  return action != null && AUTH_ACTIONS.has(action);
}

/** Parse "/doctors/{id}/slots" into its structural parts deterministically. */
export function parsePath(path: string): ParsedPath {
  const segs = (path ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const isParam = (s: string) => /^[:{].*\}?$/.test(s) || /^\{.*\}$/.test(s) || s.startsWith(":");
  const literals = segs.filter((s) => !isParam(s)).map((s) => s.toLowerCase());
  const lastSeg = segs[segs.length - 1] ?? "";
  const scope: ParsedPath["scope"] = isParam(lastSeg) ? "single" : "collection";

  const action =
    literals.length > 0 && ACTION_SET.has(normalizeToken(literals[literals.length - 1]))
      ? normalizeToken(literals[literals.length - 1])
      : null;

  // Resource = last literal that is not the action keyword.
  const resourceLiterals = action ? literals.slice(0, -1) : literals;
  const resource =
    resourceLiterals.length > 0
      ? singularize(normalizeToken(resourceLiterals[resourceLiterals.length - 1]))
      : null;
  const parent =
    resourceLiterals.length > 1
      ? singularize(normalizeToken(resourceLiterals[resourceLiterals.length - 2]))
      : null;

  return { literals, resource, parent, action, scope };
}
