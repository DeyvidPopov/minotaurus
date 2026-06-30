// ─────────────────────────────────────────────────────────────────────────────
// seed-demo.ts — the thesis-defense "small world".
//
// Wipes the database and repopulates a deterministic three-project demo designed
// to light up every feature of Minotaurus:
//
//   1. "Online Shop Platform"      — HEALTHY  (target band A/B): clean graph, high
//                                     doc coverage, traced requirements, few findings.
//   2. "Healthcare Appointments"   — MESSY    (target band D, At Risk): orphans, an
//                                     over-coupled hub, a deprecated-but-referenced
//                                     service, undocumented services, an insecure API,
//                                     a broken FK, and a central+unstable (hub+churn)
//                                     artifact.
//   3. "Internal DevOps Portal"    — SMALL    (target band C, Fair): the middle ground.
//
// Hard rules honoured (see CLAUDE.md + the task brief):
//  • Built through the REAL engines — recordVersionEvent / runValidationForProject /
//    buildExportContent — plus controller-parity creates (normalizeArtifactTitle,
//    two-pass FK resolution). No engine/invariant is bypassed.
//  • Fully DETERMINISTIC: one SEED_NOW anchor, every backdate derived from it, no
//    Math.random(), no bare new Date() for data timestamps. Re-running reproduces the
//    same structure.
//  • Per-project build order is FIXED:
//      (a) create entities + relations
//      (b) write backdated VersionEvents (content history, weeks → days)
//      (c) runValidationForProject   ← VALIDATED event carries SEED_NOW (governance +25)
//      (d) set triage statuses       ← one finding IGNORED, one RESOLVED
//      (e) build exports (JSON + PDF) through buildExportContent
//  • No CRITICAL findings are fabricated — the messy band is reached with ERROR /
//    WARNING / INFO only (the catalog emits no CRITICAL today).
//  • Finding CODES are never hardcoded into the data — defects are built to trigger
//    the rules, and the summary PRINTS the actual emitted codes per project.
//  • deyvid@minotaurus.dev / minotaurus is preserved; all demo users use `minotaurus`.
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import {
  type ArtifactStatus,
  type ArtifactType,
  type DatabaseType,
  type DiagramType,
  type HttpMethod,
  type IssueSeverity,
  type Prisma,
  type ProjectRole,
  type RelationType,
  type UserRole,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { assertDestructiveAllowed } from "../src/lib/destructive-guard.js";
import { recordVersionEvent, type RecordEventInput } from "../src/modules/versions/versions.engine.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import { buildExportContent } from "../src/modules/exports/exports.engine.js";
import { analyzeExportSnapshot } from "../src/modules/exports/analysis/metrics.engine.js";
import { classifyFindingFromIssue } from "../src/modules/findings/finding-classifier.js";
import { normalizeArtifactTitle } from "../src/modules/artifacts/artifact-title.js";

const DEMO_EMAIL = "deyvid@minotaurus.dev";
const DEMO_PASSWORD = "minotaurus";

// ───────────────────── determinism anchor ─────────────────────
// The ONE clock reference. Every backdated timestamp is derived from this; the
// data structure is reproducible run-to-run (no randomness, no per-row new Date()).
// The only timestamps not anchored here are the engine-written createdAt of
// validation issues and the VALIDATED event — both intentionally "now" so the
// project reads as recently validated (governance +25). See build order step (c).
const SEED_NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

/** A backdated timestamp `daysAgo` before SEED_NOW, at a fixed UTC hour:minute. */
function at(daysAgo: number, hour = 12, minute = 0): Date {
  const d = new Date(SEED_NOW.getTime() - daysAgo * DAY_MS);
  d.setUTCHours(hour, minute % 60, 0, 0);
  return d;
}

// ───────────────────── documentation bodies ─────────────────────

const DOC_AUTH = `# Authentication Service

## Purpose
Issues and validates JSON Web Tokens for all first-party clients of the Online Shop
Platform. Every request that reaches a protected endpoint resolves identity here.

## Responsibilities
- Register, log in, and rotate credentials.
- Sign access tokens (15 min) and refresh tokens (7 days).
- Look users up against the **User Database**.
- Enforce the **JWT Security Policy** (HS256, audience scoping, token revocation list).

## Dependencies
- **User Database** — reads accounts and password hashes; writes the last-seen timestamp.
- **JWT Security Policy** — single source of truth for signing algorithm and TTLs.

## Security notes
- Passwords are hashed with bcrypt (cost ≥ 10).
- Tokens are signed with the secret resolved at boot from the platform secret store.
`;

const DOC_GATEWAY = `# API Gateway

## Purpose
The single ingress for all customer-facing HTTP traffic.

## Responsibilities
- Terminate TLS.
- Validate JWTs by calling the **Authentication Service**.
- Route by path: \`/auth/*\`, \`/products/*\`, \`/orders/*\`.
- Apply per-IP and per-user rate limits.

## Dependencies
- **Authentication Service** — token introspection and login proxying.
- **Product Catalog API** — read-side traffic for the storefront.
`;

const DOC_ORDER = `# Order Service

## Purpose
Owns the lifecycle of an order from cart submission to fulfilment.

## Responsibilities
- Validate cart contents against the **Product Catalog API**.
- Reserve inventory (best-effort).
- Create a payment intent against the **Payment Service**.

## Dependencies
- **Product Catalog API** — product existence, price, availability.
- **Payment Service** — modern integration.
- **Legacy Payment Service** — _deprecated._ Scheduled for removal.
`;

const DOC_ARCH = `# System Architecture Documentation

## Purpose
The high-level map of the Online Shop Platform.

## Responsibilities
- Describe how requests flow from the customer browser to the data stores.
- Document which service owns which database.
- Make every external dependency obvious.
- Call out known compromises (e.g. the legacy payment integration).
`;

/** Concise, deterministic doc body for the non-headline artifacts. */
function docBody(title: string, purpose: string, notes = "Maintained as part of the architecture SSOT."): string {
  return `# ${title}\n\n## Purpose\n${purpose}\n\n## Notes\n${notes}\n`;
}

// ───────────────────── declarative project model ─────────────────────

interface ArtifactDef {
  key: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  description: string;
  tags?: string[];
  gx: number;
  gy: number;
  /** daysAgo for createdAt + the auto CREATED event. */
  day: number;
  byKey: string;
  documentationContent?: string;
}

interface RelationDef {
  source: string;
  target: string;
  type: RelationType;
  description: string;
  byKey: string;
}

interface EndpointDef {
  path: string;
  method: HttpMethod;
  summary: string;
  requestSchema?: string;
  responseSchema?: string;
  requiresAuth?: boolean;
}

interface ApiSpecDef {
  key: string;
  title: string;
  version: string;
  baseUrl: string;
  description: string;
  artifactKey?: string;
  byKey: string;
  day: number;
  endpoints: EndpointDef[];
}

interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  /** `${entityKey}` — entity-level FK target (same model). */
  referencesEntityKey?: string;
  /** `${entityKey}.${fieldName}` — precise column FK target (same model). */
  referencesFieldKey?: string;
  description?: string;
}

interface EntityDef {
  key: string;
  name: string;
  description: string;
  fields: FieldDef[];
}

interface DbModelDef {
  key: string;
  title: string;
  databaseType: DatabaseType;
  description: string;
  artifactKey?: string;
  byKey: string;
  day: number;
  entities: EntityDef[];
}

interface DiagramDef {
  key: string;
  title: string;
  type: DiagramType;
  mermaidSource: string;
  description: string;
  artifactKey?: string;
  byKey: string;
  day: number;
}

interface MemberDef {
  userKey: string;
  role: ProjectRole;
}

interface TriageDef {
  status: "IGNORED" | "RESOLVED";
  /** Mark the first (message-sorted) OPEN issue whose message contains this. */
  messageIncludes: string;
}

type SeedEvent = Omit<RecordEventInput, "projectId">;

interface ProjectDef {
  key: string;
  name: string;
  description: string;
  ownerKey: string;
  day: number; // project createdAt + CREATED event
  members: MemberDef[];
  artifacts: ArtifactDef[];
  relations: RelationDef[];
  apiSpecs: ApiSpecDef[];
  dbModels: DbModelDef[];
  diagrams: DiagramDef[];
  /** Extra hand-authored events (churn UPDATEDs etc.); creation events are auto-generated. */
  extraEvents?: (ctx: EventCtx) => SeedEvent[];
  triage?: TriageDef[];
}

interface EventCtx {
  a: Record<string, string>; // artifact key → id
  spec: Record<string, string>; // api-spec key → id
  model: Record<string, string>; // db-model key → id
  diagram: Record<string, string>; // diagram key → id
  uid: Record<string, string>; // user key → id
}

// ───────────────────── users ─────────────────────

interface UserDef {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

const USER_DEFS: UserDef[] = [
  { key: "deyvid", email: DEMO_EMAIL, firstName: "Deyvid", lastName: "Popov", role: "ADMIN" },
  { key: "iris", email: "iris@helix.dev", firstName: "Iris", lastName: "Lindholm", role: "ARCHITECT" },
  { key: "maya", email: "maya@helix.dev", firstName: "Maya", lastName: "Okafor", role: "ENGINEER" },
  { key: "ren", email: "ren@helix.dev", firstName: "Ren", lastName: "Tanaka", role: "ENGINEER" },
  { key: "tomas", email: "tomas@helix.dev", firstName: "Tomas", lastName: "Varga", role: "ENGINEER" },
  { key: "aisha", email: "aisha@helix.dev", firstName: "Aisha", lastName: "Khan", role: "ARCHITECT" },
];

// ───────────────────── project 1: HEALTHY ─────────────────────

const HEALTHY: ProjectDef = {
  key: "shop",
  name: "Online Shop Platform",
  description:
    "Reference e-commerce architecture: gateway, auth, catalog, orders, payments. The healthy walkthrough project — clean graph, documented, traced.",
  ownerKey: "deyvid",
  day: 28,
  members: [
    { userKey: "deyvid", role: "OWNER" },
    { userKey: "iris", role: "ARCHITECT" },
    { userKey: "maya", role: "DEVELOPER" },
    { userKey: "ren", role: "VIEWER" },
  ],
  artifacts: [
    { key: "policy", title: "JWT Security Policy", type: "SECURITY_POLICY", status: "ACTIVE", description: "Signing algorithm, TTLs, audience scoping and revocation rules for JWTs.", tags: ["security"], gx: -340, gy: -160, day: 26, byKey: "deyvid", documentationContent: docBody("JWT Security Policy", "Defines HS256 signing, 15-minute access tokens, 7-day refresh tokens, audience scoping and the token revocation list.") },
    { key: "reqAuth", title: "Secure Login Requirement", type: "REQUIREMENT", status: "ACTIVE", description: "Users must authenticate with email + password and receive a short-lived signed token.", tags: ["requirement"], gx: -520, gy: -40, day: 26, byKey: "iris", documentationContent: docBody("Secure Login Requirement", "Authentication must use industry-standard hashing and signed, expiring tokens.") },
    { key: "userDb", title: "User Database", type: "DATABASE_MODEL", status: "ACTIVE", description: "Postgres — accounts, hashed credentials, last-seen.", tags: ["postgres"], gx: -340, gy: 80, day: 25, byKey: "maya", documentationContent: docBody("User Database", "Stores accounts, hashed credentials and session rows for the platform.") },
    { key: "auth", title: "Authentication Service", type: "SERVICE", status: "ACTIVE", description: "Issues JWTs and validates credentials for all first-party clients.", tags: ["auth"], gx: -160, gy: -40, day: 24, byKey: "deyvid", documentationContent: DOC_AUTH },
    { key: "gateway", title: "API Gateway", type: "SERVICE", status: "ACTIVE", description: "Single public ingress. Routes traffic, validates JWTs, applies rate limits.", tags: ["gateway"], gx: 0, gy: -160, day: 23, byKey: "iris", documentationContent: DOC_GATEWAY },
    { key: "catalog", title: "Product Catalog API", type: "API_ENDPOINT", status: "ACTIVE", description: "Read-mostly catalog API for the storefront and internal services.", tags: ["rest"], gx: 180, gy: -40, day: 22, byKey: "iris", documentationContent: docBody("Product Catalog API", "Serves product, SKU, price and availability reads to the storefront and the Order Service.") },
    { key: "reqCheckout", title: "Checkout Flow Requirement", type: "REQUIREMENT", status: "ACTIVE", description: "A customer must be able to submit a cart and pay in a single flow.", tags: ["requirement"], gx: 360, gy: 240, day: 22, byKey: "iris", documentationContent: docBody("Checkout Flow Requirement", "Cart submission validates inventory and creates a payment intent atomically.") },
    { key: "prodDb", title: "Product Database", type: "DATABASE_MODEL", status: "ACTIVE", description: "Postgres — products, SKUs, prices, stock counters.", tags: ["postgres"], gx: 360, gy: 80, day: 21, byKey: "iris", documentationContent: docBody("Product Database", "Holds products, SKUs, prices and stock counters read by the catalog API.") },
    { key: "order", title: "Order Service", type: "SERVICE", status: "ACTIVE", description: "Owns the order lifecycle. Talks to catalog and payment services.", tags: ["orders"], gx: 100, gy: 160, day: 20, byKey: "iris", documentationContent: DOC_ORDER },
    { key: "payment", title: "Payment Service", type: "SERVICE", status: "ACTIVE", description: "Modern payment integration — Stripe-backed, used for all new orders.", tags: ["payments"], gx: 260, gy: 240, day: 19, byKey: "maya", documentationContent: docBody("Payment Service", "Stripe-backed payment intents for all new orders. Replaces the legacy integration.") },
    { key: "legacy", title: "Legacy Payment Service", type: "SERVICE", status: "DEPRECATED", description: "Old payment integration. Scheduled for removal once the last cohort migrates.", tags: ["legacy"], gx: -40, gy: 240, day: 18, byKey: "deyvid" },
    { key: "archDoc", title: "System Architecture Documentation", type: "DOCUMENTATION", status: "ACTIVE", description: "High-level map of the Online Shop Platform.", tags: ["docs"], gx: 340, gy: -200, day: 17, byKey: "maya", documentationContent: DOC_ARCH },
  ],
  relations: [
    { source: "auth", target: "userDb", type: "DEPENDS_ON", description: "Auth Service reads/writes user records.", byKey: "iris" },
    { source: "policy", target: "auth", type: "SECURES", description: "JWT policy governs the Authentication Service.", byKey: "deyvid" },
    { source: "gateway", target: "auth", type: "COMMUNICATES_WITH", description: "Gateway delegates token checks to Auth.", byKey: "iris" },
    { source: "gateway", target: "catalog", type: "COMMUNICATES_WITH", description: "Gateway routes /products/* to the catalog API.", byKey: "iris" },
    { source: "catalog", target: "prodDb", type: "DEPENDS_ON", description: "Catalog API reads product rows from Postgres.", byKey: "iris" },
    { source: "order", target: "catalog", type: "USES", description: "Order Service validates carts against the catalog.", byKey: "iris" },
    { source: "order", target: "payment", type: "DEPENDS_ON", description: "Modern payment integration — preferred.", byKey: "maya" },
    { source: "order", target: "legacy", type: "DEPENDS_ON", description: "Legacy integration kept for one cohort — pending migration.", byKey: "deyvid" },
    { source: "archDoc", target: "gateway", type: "DOCUMENTS", description: "Architecture doc covers the gateway.", byKey: "maya" },
    { source: "archDoc", target: "order", type: "DOCUMENTS", description: "Architecture doc covers the order flow.", byKey: "maya" },
    { source: "auth", target: "reqAuth", type: "IMPLEMENTS", description: "Auth Service fulfils the secure-login requirement.", byKey: "iris" },
    { source: "order", target: "reqCheckout", type: "IMPLEMENTS", description: "Order Service fulfils the checkout-flow requirement.", byKey: "iris" },
  ],
  apiSpecs: [
    {
      key: "authSpec", title: "Authentication API", version: "1.0.0", baseUrl: "/api/auth",
      description: "Public ingress for credential exchange and identity introspection.",
      artifactKey: "auth", byKey: "maya", day: 16,
      endpoints: [
        { path: "/auth/login", method: "POST", summary: "Issue a token for valid credentials.", requestSchema: '{ "email": "string", "password": "string" }', responseSchema: '{ "token": "string", "user": { "id": "string", "email": "string" } }', requiresAuth: false },
        { path: "/auth/register", method: "POST", summary: "Create an account and return a token.", requestSchema: '{ "email": "string", "password": "string", "firstName": "string", "lastName": "string" }', responseSchema: '{ "token": "string", "user": { "id": "string" } }', requiresAuth: false },
        { path: "/auth/me", method: "GET", summary: "Return the authenticated user.", requestSchema: "", responseSchema: '{ "user": { "id": "string", "email": "string" } }', requiresAuth: true },
      ],
    },
  ],
  dbModels: [
    {
      key: "userMgmt", title: "User Management Database", databaseType: "PostgreSQL",
      description: "Accounts, sessions and roles for the platform.",
      artifactKey: "userDb", byKey: "maya", day: 24,
      entities: [
        { key: "users", name: "users", description: "End-user accounts.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          { name: "email", type: "text", required: true, description: "UNIQUE" },
          { name: "password_hash", type: "text", required: true },
          { name: "created_at", type: "timestamptz", required: true },
        ] },
        { key: "sessions", name: "sessions", description: "Active and revoked refresh-token sessions per user.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          { name: "user_id", type: "uuid", required: true, isForeignKey: true, referencesEntityKey: "users", referencesFieldKey: "users.id", description: "Owning user" },
          { name: "expires_at", type: "timestamptz", required: true },
          { name: "revoked_at", type: "timestamptz" },
        ] },
        { key: "roles", name: "roles", description: "Role identifiers assignable to users.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          { name: "name", type: "text", required: true },
        ] },
      ],
    },
  ],
  diagrams: [
    {
      key: "arch", title: "Architecture Overview", type: "ARCHITECTURE", artifactKey: "gateway", byKey: "iris", day: 15,
      description: "High-level request flow through the Online Shop Platform.",
      mermaidSource: `flowchart TD
  Client["Client browser"] --> API_Gateway["API Gateway"]
  API_Gateway --> Auth_Service["Authentication Service"]
  API_Gateway --> Product_Service["Product Catalog API"]
  Auth_Service --> User_DB[("User Database")]
  Product_Service --> Product_DB[("Product Database")]
  Order_Service["Order Service"] --> Product_Service
  Order_Service --> Payment_Service["Payment Service"]
  Order_Service --> Legacy_Payment_Service["Legacy Payment Service"]`,
    },
    {
      key: "userErd", title: "User Database ERD", type: "ERD", artifactKey: "userDb", byKey: "maya", day: 14,
      description: "Entity-relationship diagram for the user-management schema.",
      mermaidSource: `erDiagram
  users ||--o{ sessions : has
  users {
    uuid id PK
    text email
    text password_hash
  }
  sessions {
    uuid id PK
    uuid user_id FK
    timestamptz expires_at
  }
  roles {
    uuid id PK
    text name
  }`,
    },
  ],
  extraEvents: (c) => [
    { entityType: "ARTIFACT", entityId: c.a.auth, action: "UPDATED", title: "Authentication Service", description: "status, tags", triggeredBy: c.uid.deyvid, metadata: { changed: ["status", "tags"] }, at: at(4, 14, 0) },
    { entityType: "ARTIFACT", entityId: c.a.gateway, action: "UPDATED", title: "API Gateway", description: "description", triggeredBy: c.uid.iris, metadata: { changed: ["description"] }, at: at(3, 9, 0) },
    { entityType: "DATABASE_MODEL", entityId: c.model.userMgmt, action: "UPDATED", title: "User Management Database", description: "description", triggeredBy: c.uid.maya, metadata: { changed: ["description"] }, at: at(2, 9, 30) },
  ],
  // One ERROR (DEPENDS_ON_DEPRECATED on order→legacy) is left OPEN as live tech-debt
  // deyvid (OWNER) can triage in the UI; no seed-set triage needed for the healthy project.
};

// ───────────────────── project 2: MESSY ─────────────────────

const MESSY: ProjectDef = {
  key: "health",
  name: "Healthcare Appointments",
  description:
    "Appointment booking for a clinic network. The at-risk project: an over-coupled + unstable hub, a deprecated billing adapter still in use, undocumented services, an insecure patient API, a broken foreign key, and floating orphans.",
  ownerKey: "maya",
  day: 27,
  members: [
    { userKey: "maya", role: "OWNER" },
    { userKey: "deyvid", role: "VIEWER" },
    { userKey: "tomas", role: "DEVELOPER" },
    { userKey: "aisha", role: "VIEWER" },
  ],
  artifacts: [
    { key: "gateway", title: "Appointments Gateway", type: "SERVICE", status: "ACTIVE", description: "Public ingress for the patient and clinician apps.", tags: ["gateway"], gx: -40, gy: -220, day: 25, byKey: "maya", documentationContent: docBody("Appointments Gateway", "Routes patient/clinician traffic and forwards to the Appointment Service.") },
    { key: "appt", title: "Appointment Service", type: "SERVICE", status: "ACTIVE", description: "Books, reschedules and cancels appointments. The system's central — and most frequently changed — service.", tags: ["core"], gx: 120, gy: -40, day: 24, byKey: "maya" },
    { key: "patient", title: "Patient Service", type: "SERVICE", status: "ACTIVE", description: "Owns patient demographics and contact data; a second high-degree hub.", tags: ["core"], gx: -200, gy: 40, day: 24, byKey: "tomas", documentationContent: docBody("Patient Service", "Owns patient demographics, contact details and consent flags.") },
    { key: "scheduling", title: "Scheduling Service", type: "SERVICE", status: "ACTIVE", description: "Clinician availability and slot allocation. Currently being rewritten — high churn.", tags: ["scheduling"], gx: 320, gy: 80, day: 23, byKey: "tomas" },
    { key: "notify", title: "Notification Service", type: "SERVICE", status: "ACTIVE", description: "SMS/email appointment reminders.", tags: ["notify"], gx: 360, gy: -120, day: 22, byKey: "tomas" },
    { key: "billing", title: "Billing Service", type: "SERVICE", status: "ACTIVE", description: "Issues invoices for completed appointments.", tags: ["billing"], gx: 300, gy: 240, day: 21, byKey: "maya" },
    { key: "billingLegacy", title: "Legacy Billing Adapter", type: "SERVICE", status: "DEPRECATED", description: "Old clearinghouse adapter. Marked for removal but still wired into three services.", tags: ["legacy"], gx: 80, gy: 260, day: 20, byKey: "maya" },
    { key: "patientDb", title: "Patient Records Database", type: "DATABASE_MODEL", status: "ACTIVE", description: "Postgres — patients, appointments, and an unresolved foreign key.", tags: ["postgres"], gx: -220, gy: 220, day: 20, byKey: "tomas" },
    { key: "apptApi", title: "Appointments API", type: "API_SPEC", status: "ACTIVE", description: "Patient-facing API. Contains an endpoint that leaks credentials without auth.", tags: ["rest"], gx: 200, gy: 160, day: 19, byKey: "tomas" },
    { key: "ehr", title: "External EHR System", type: "EXTERNAL_SYSTEM", status: "ACTIVE", description: "Third-party electronic health record system reminders sync into.", tags: ["external"], gx: 540, gy: -120, day: 18, byKey: "maya" },
    { key: "policy", title: "PHI Access Policy", type: "SECURITY_POLICY", status: "ACTIVE", description: "How protected health information may be accessed — but it is wired to nothing.", tags: ["security"], gx: -420, gy: -160, day: 17, byKey: "maya" },
    { key: "reqHipaa", title: "HIPAA Compliance Requirement", type: "REQUIREMENT", status: "ACTIVE", description: "PHI access must be authenticated, authorized and audited.", tags: ["requirement"], gx: -420, gy: 60, day: 16, byKey: "aisha", documentationContent: docBody("HIPAA Compliance Requirement", "All PHI access must be authenticated, role-checked and written to an audit log.") },
    { key: "reqReminders", title: "Appointment Reminders Requirement", type: "REQUIREMENT", status: "ACTIVE", description: "Patients should receive a reminder 24h before an appointment.", tags: ["requirement"], gx: 540, gy: 60, day: 15, byKey: "aisha" },
    { key: "orphanReport", title: "Quarterly Ops Report", type: "DOCUMENTATION", status: "DRAFT", description: "A one-off operations report nobody linked into the architecture.", tags: ["report"], gx: -480, gy: 260, day: 12, byKey: "tomas" },
    { key: "orphanSandbox", title: "Sandbox Environment", type: "ENVIRONMENT", status: "DRAFT", description: "An experimental environment left disconnected from everything.", tags: ["sandbox"], gx: 560, gy: 260, day: 10, byKey: "tomas" },
  ],
  relations: [
    // Appointment Service = over-coupled hub (degree 8): 1 incoming + 7 outgoing.
    { source: "gateway", target: "appt", type: "COMMUNICATES_WITH", description: "Gateway forwards booking traffic.", byKey: "maya" },
    { source: "appt", target: "patient", type: "DEPENDS_ON", description: "Reads patient demographics.", byKey: "maya" },
    { source: "appt", target: "scheduling", type: "DEPENDS_ON", description: "Allocates clinician slots.", byKey: "maya" },
    { source: "appt", target: "notify", type: "USES", description: "Triggers reminders.", byKey: "maya" },
    { source: "appt", target: "billing", type: "DEPENDS_ON", description: "Bills completed appointments.", byKey: "maya" },
    { source: "appt", target: "billingLegacy", type: "DEPENDS_ON", description: "Falls back to the legacy clearinghouse.", byKey: "maya" },
    { source: "appt", target: "patientDb", type: "DEPENDS_ON", description: "Persists appointment rows.", byKey: "maya" },
    { source: "appt", target: "apptApi", type: "EXPOSES", description: "Appointment Service exposes the patient API.", byKey: "tomas" },
    // Patient Service = second over-coupled hub (degree 7), but stable (no churn).
    { source: "gateway", target: "patient", type: "COMMUNICATES_WITH", description: "Gateway forwards patient lookups.", byKey: "maya" },
    { source: "patient", target: "patientDb", type: "DEPENDS_ON", description: "Reads/writes patient rows.", byKey: "tomas" },
    { source: "patient", target: "notify", type: "USES", description: "Sends consent-update notices.", byKey: "tomas" },
    { source: "patient", target: "billing", type: "USES", description: "Shares billing contact details.", byKey: "tomas" },
    { source: "patient", target: "ehr", type: "COMMUNICATES_WITH", description: "Syncs demographics to the EHR.", byKey: "tomas" },
    { source: "scheduling", target: "patient", type: "USES", description: "Looks up patient preferences.", byKey: "tomas" },
    // Deprecated-but-still-referenced (legacy billing has 3 incoming from ACTIVE services).
    { source: "billing", target: "billingLegacy", type: "DEPENDS_ON", description: "Still proxies refunds through the legacy adapter.", byKey: "maya" },
    { source: "scheduling", target: "billingLegacy", type: "USES", description: "Legacy slot-fee lookups.", byKey: "tomas" },
    // Reminders sync.
    { source: "notify", target: "ehr", type: "COMMUNICATES_WITH", description: "Writes reminder receipts to the EHR.", byKey: "tomas" },
    // Traceability: HIPAA requirement is implemented; reminders requirement is NOT.
    { source: "patient", target: "reqHipaa", type: "IMPLEMENTS", description: "Patient Service enforces PHI access controls.", byKey: "aisha" },
    // (policy has NO SECURES edge; reqReminders/orphanReport/orphanSandbox have NO edges.)
  ],
  apiSpecs: [
    {
      key: "apptApiSpec", title: "Appointments API", version: "0.4.0", baseUrl: "/api",
      description: "Patient-facing booking API. Several endpoints predate the security review.",
      artifactKey: "apptApi", byKey: "tomas", day: 18,
      endpoints: [
        // Public + sensitive field in request + user-scoped path + token in response → fires
        // the public-sensitive / user-scoped / response-token rules (no SECURES policy linked).
        { path: "/patients/{id}/records", method: "POST", summary: "Update a patient's record (legacy, public).", requestSchema: '{ "patientId": "string", "password": "string", "diagnosis": "string" }', responseSchema: '{ "patientId": "string", "token": "string", "record": { "id": "string" } }', requiresAuth: false },
        { path: "/appointments", method: "POST", summary: "Book an appointment.", requestSchema: '{ "patientId": "string", "clinicianId": "string", "startsAt": "string" }', responseSchema: '{ "id": "string", "status": "string" }', requiresAuth: true },
        { path: "/appointments/{id}", method: "GET", summary: "Fetch an appointment.", requestSchema: "", responseSchema: '{ "id": "string", "patientId": "string", "startsAt": "string" }', requiresAuth: true },
      ],
    },
  ],
  dbModels: [
    {
      key: "patientModel", title: "Patient Records Database", databaseType: "PostgreSQL",
      description: "Patients and appointments — with a foreign key that points at nothing.",
      artifactKey: "patientDb", byKey: "tomas", day: 19,
      entities: [
        { key: "patients", name: "patients", description: "Patient demographics.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          { name: "mrn", type: "text", required: true, description: "Medical record number (UNIQUE)" },
          { name: "full_name", type: "text", required: true },
        ] },
        { key: "appointments", name: "appointments", description: "Booked appointments.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          // Clean precise FK → patients.id (no finding).
          { name: "patient_id", type: "uuid", required: true, isForeignKey: true, referencesEntityKey: "patients", referencesFieldKey: "patients.id", description: "Owning patient" },
          // BROKEN / unresolved FK: declared as a foreign key but with no target entity.
          { name: "clinician_id", type: "uuid", required: true, isForeignKey: true, description: "Should reference a clinician — target never modelled" },
          { name: "starts_at", type: "timestamptz", required: true },
        ] },
        // Entity with NO primary key → DB_ENTITY_NO_PK.
        { key: "auditLog", name: "audit_log", description: "Append-only PHI access log — but it has no primary key.", fields: [
          { name: "patient_id", type: "uuid", required: true },
          { name: "accessed_at", type: "timestamptz", required: true },
          { name: "actor", type: "text", required: true },
        ] },
      ],
    },
  ],
  diagrams: [
    {
      key: "apptArch", title: "Appointments Architecture", type: "ARCHITECTURE", byKey: "tomas", day: 13,
      // Intentionally UNLINKED (no artifactKey) → DIAGRAM_UNLINKED (INFO).
      description: "Service map for the appointments platform (not linked to an artifact).",
      mermaidSource: `flowchart TD
  Gateway["Appointments Gateway"] --> Appointment["Appointment Service"]
  Appointment --> Patient["Patient Service"]
  Appointment --> Scheduling["Scheduling Service"]
  Appointment --> Billing["Billing Service"]
  Appointment --> Legacy["Legacy Billing Adapter"]
  Patient --> EHR["External EHR System"]`,
    },
    {
      key: "patientErd", title: "Patient Records ERD", type: "ERD", artifactKey: "patientDb", byKey: "tomas", day: 12,
      description: "Entity-relationship diagram for the patient schema.",
      mermaidSource: `erDiagram
  patients ||--o{ appointments : books
  patients {
    uuid id PK
    text mrn
    text full_name
  }
  appointments {
    uuid id PK
    uuid patient_id FK
    uuid clinician_id FK
    timestamptz starts_at
  }`,
    },
  ],
  extraEvents: (c) => {
    const ev: SeedEvent[] = [];
    // Combined hub + churn: Appointment Service changed 6 times inside the 7-day
    // window → HIGH_CHURN, and it is also the degree-8 hub → HIGH_FAN_OUT.
    for (let i = 0; i < 6; i++) {
      ev.push({ entityType: "ARTIFACT", entityId: c.a.appt, action: "UPDATED", title: "Appointment Service", description: i % 2 === 0 ? "description" : "tags", triggeredBy: c.uid.maya, metadata: { changed: [i % 2 === 0 ? "description" : "tags"] }, at: at(6 - i, 10, i * 3) });
    }
    // Plain high-churn (not a hub): Scheduling Service rewrite, 6 updates in 7 days.
    for (let i = 0; i < 6; i++) {
      ev.push({ entityType: "ARTIFACT", entityId: c.a.scheduling, action: "UPDATED", title: "Scheduling Service", description: "rewrite in progress", triggeredBy: c.uid.tomas, metadata: { changed: ["description"] }, at: at(6 - i, 15, i * 3) });
    }
    return ev;
  },
  triage: [
    // One waived finding (accepted — it's a one-off report) and one marked fixed.
    { status: "IGNORED", messageIncludes: "Quarterly Ops Report" },
    { status: "RESOLVED", messageIncludes: "Patient Records Database" },
  ],
};

// ───────────────────── project 3: SMALL ─────────────────────

const SMALL: ProjectDef = {
  key: "devops",
  name: "Internal DevOps Portal",
  description:
    "An early-stage internal portal for CI/CD and deployments. Partly documented, a few loose ends — the fair-band middle ground.",
  ownerKey: "iris",
  day: 21,
  members: [
    { userKey: "iris", role: "OWNER" },
    { userKey: "deyvid", role: "ARCHITECT" },
    { userKey: "aisha", role: "DEVELOPER" },
  ],
  artifacts: [
    { key: "portal", title: "DevOps Portal UI", type: "SERVICE", status: "ACTIVE", description: "Web UI for triggering pipelines and viewing deploys.", tags: ["ui"], gx: -120, gy: -80, day: 19, byKey: "iris", documentationContent: docBody("DevOps Portal UI", "Single pane for triggering CI pipelines, watching deployments and reading metrics.") },
    { key: "ci", title: "CI Pipeline Service", type: "SERVICE", status: "ACTIVE", description: "Runs build + test pipelines on push.", tags: ["ci"], gx: 80, gy: -40, day: 17, byKey: "aisha", documentationContent: docBody("CI Pipeline Service", "Executes build and test pipelines triggered by repository pushes.") },
    { key: "deploy", title: "Deployment Orchestrator", type: "SERVICE", status: "ACTIVE", description: "Rolls out artifacts to environments. Not documented yet.", tags: ["cd"], gx: 240, gy: 60, day: 15, byKey: "aisha" },
    { key: "metricsDb", title: "Metrics Database", type: "DATABASE_MODEL", status: "ACTIVE", description: "Time-series store for build + deploy metrics.", tags: ["postgres"], gx: 240, gy: 220, day: 14, byKey: "iris", documentationContent: docBody("Metrics Database", "Time-series store for pipeline durations and deployment outcomes.") },
    { key: "portalApi", title: "Portal API", type: "API_SPEC", status: "ACTIVE", description: "REST API behind the portal UI (not yet linked to a service artifact).", tags: ["rest"], gx: -40, gy: 120, day: 12, byKey: "aisha" },
    { key: "reqRbac", title: "RBAC Requirement", type: "REQUIREMENT", status: "ACTIVE", description: "Only authorized engineers may trigger production deploys — not yet implemented.", tags: ["requirement"], gx: -300, gy: 80, day: 10, byKey: "deyvid" },
    { key: "orphanRunbook", title: "Incident Runbook", type: "DOCUMENTATION", status: "DRAFT", description: "A runbook draft that hasn't been linked to anything yet.", tags: ["runbook"], gx: 320, gy: -140, day: 6, byKey: "iris" },
  ],
  relations: [
    { source: "portal", target: "ci", type: "USES", description: "Portal triggers CI pipelines.", byKey: "iris" },
    { source: "portal", target: "deploy", type: "USES", description: "Portal triggers deployments.", byKey: "iris" },
    { source: "ci", target: "deploy", type: "DEPENDS_ON", description: "Successful builds hand off to the orchestrator.", byKey: "aisha" },
    { source: "deploy", target: "metricsDb", type: "DEPENDS_ON", description: "Writes deployment outcomes to metrics.", byKey: "aisha" },
    { source: "portal", target: "portalApi", type: "EXPOSES", description: "Portal UI is backed by the Portal API.", byKey: "aisha" },
    // (reqRbac unimplemented + orphan; orphanRunbook orphan.)
  ],
  apiSpecs: [
    {
      key: "portalApiSpec", title: "Portal API", version: "0.2.0", baseUrl: "/api",
      description: "Endpoints for the DevOps portal.",
      // Deliberately UNLINKED (no artifactKey) → lowers resource linkage (traceability).
      byKey: "aisha", day: 12,
      endpoints: [
        { path: "/pipelines/{id}/trigger", method: "POST", summary: "Trigger a pipeline run.", requestSchema: '{ "ref": "string" }', responseSchema: '{ "runId": "string", "status": "string" }', requiresAuth: true },
        { path: "/deployments", method: "GET", summary: "List recent deployments.", requestSchema: "", responseSchema: '{ "deployments": [] }', requiresAuth: true },
      ],
    },
  ],
  dbModels: [
    {
      key: "metricsModel", title: "Metrics Database", databaseType: "PostgreSQL",
      description: "Pipeline and deployment metrics.",
      artifactKey: "metricsDb", byKey: "iris", day: 13,
      entities: [
        { key: "pipelineRuns", name: "pipeline_runs", description: "One row per CI run.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          { name: "status", type: "text", required: true },
          { name: "duration_ms", type: "integer", required: true },
        ] },
        { key: "deployments", name: "deployments", description: "One row per deployment.", fields: [
          { name: "id", type: "uuid", isPrimaryKey: true, required: true },
          { name: "run_id", type: "uuid", required: true, isForeignKey: true, referencesEntityKey: "pipelineRuns", referencesFieldKey: "pipelineRuns.id", description: "Originating CI run" },
          { name: "environment", type: "text", required: true },
        ] },
      ],
    },
  ],
  diagrams: [
    {
      key: "portalArch", title: "Portal Architecture", type: "ARCHITECTURE", byKey: "iris", day: 9,
      // UNLINKED → DIAGRAM_UNLINKED (INFO) + lowers resource linkage.
      description: "How the portal, CI and deploy services fit together (not linked yet).",
      mermaidSource: `flowchart TD
  UI["DevOps Portal UI"] --> CI["CI Pipeline Service"]
  UI --> Deploy["Deployment Orchestrator"]
  CI --> Deploy
  Deploy --> Metrics[("Metrics Database")]`,
    },
    {
      key: "metricsErd", title: "Metrics ERD", type: "ERD", artifactKey: "metricsDb", byKey: "iris", day: 8,
      description: "Entity-relationship diagram for the metrics schema.",
      mermaidSource: `erDiagram
  pipeline_runs ||--o{ deployments : produces
  pipeline_runs {
    uuid id PK
    text status
  }
  deployments {
    uuid id PK
    uuid run_id FK
    text environment
  }`,
    },
  ],
  extraEvents: (c) => [
    { entityType: "ARTIFACT", entityId: c.a.deploy, action: "UPDATED", title: "Deployment Orchestrator", description: "tags", triggeredBy: c.uid.aisha, metadata: { changed: ["tags"] }, at: at(4, 11, 0) },
  ],
  // deyvid is ARCHITECT here → can run validation / triage live on the small project.
};

const PROJECT_DEFS: ProjectDef[] = [HEALTHY, MESSY, SMALL];

// ───────────────────── builder ─────────────────────

const FULL_SECTIONS = [
  "TEAM", "ARTIFACTS", "RELATIONS", "API_SPECS", "DATABASE_MODELS",
  "DIAGRAMS", "GRAPH", "VALIDATION_REPORT", "VERSION_HISTORY", "IMPACT_ANALYSIS",
];
const MD_SECTIONS = [
  "TEAM", "ARTIFACTS", "API_SPECS", "DATABASE_MODELS", "DIAGRAMS",
  "RELATIONS", "VALIDATION_REPORT", "VERSION_HISTORY",
];

interface ProjectSummary {
  name: string;
  band: string;
  deyvidRole: string;
  health: number | null;
  grade: string;
  label: string;
  counts: Record<string, number>;
  codesBySeverity: Record<string, Record<string, number>>;
  ignored: number;
  resolved: number;
}

async function buildProject(def: ProjectDef, uid: Record<string, string>): Promise<ProjectSummary> {
  const ownerId = uid[def.ownerKey];

  // ── (a) create entities + relations ──
  const project = await prisma.project.create({
    data: { name: def.name, description: def.description, ownerId, createdAt: at(def.day, 8, 0) },
  });

  await prisma.projectMember.createMany({
    data: def.members.map((m) => ({ projectId: project.id, userId: uid[m.userKey], role: m.role, joinedAt: at(def.day, 8, 0) })),
  });

  const a: Record<string, string> = {}; // artifact key → id
  const titleOf: Record<string, string> = {}; // artifact key → title
  for (const art of def.artifacts) {
    const created = await prisma.artifact.create({
      data: {
        projectId: project.id,
        title: art.title,
        normalizedTitle: normalizeArtifactTitle(art.title),
        type: art.type,
        status: art.status,
        description: art.description,
        tags: art.tags ?? [],
        gx: art.gx,
        gy: art.gy,
        createdById: uid[art.byKey],
        documentationContent: art.documentationContent,
        createdAt: at(art.day, 9, 0),
      },
    });
    a[art.key] = created.id;
    titleOf[art.key] = created.title;
  }

  const relKey = (s: string, t: string) => `${s}->${t}`;
  const relId: Record<string, string> = {};
  for (const r of def.relations) {
    const created = await prisma.artifactRelation.create({
      data: {
        sourceArtifactId: a[r.source],
        targetArtifactId: a[r.target],
        relationType: r.type,
        description: r.description,
        createdById: uid[r.byKey],
        createdAt: at(def.artifacts.find((x) => x.key === r.source)?.day ?? def.day, 13, 0),
      },
    });
    relId[relKey(r.source, r.target)] = created.id;
  }

  const spec: Record<string, string> = {};
  const endpointIds: { specKey: string; id: string; method: HttpMethod; path: string; day: number }[] = [];
  for (const s of def.apiSpecs) {
    const created = await prisma.apiSpec.create({
      data: {
        projectId: project.id,
        artifactId: s.artifactKey ? a[s.artifactKey] : null,
        title: s.title,
        version: s.version,
        baseUrl: s.baseUrl,
        description: s.description,
        createdById: uid[s.byKey],
        createdAt: at(s.day, 11, 0),
      },
    });
    spec[s.key] = created.id;
    for (const ep of s.endpoints) {
      const e = await prisma.apiEndpoint.create({
        data: {
          apiSpecId: created.id,
          path: ep.path,
          method: ep.method,
          summary: ep.summary,
          requestSchema: ep.requestSchema ?? "",
          responseSchema: ep.responseSchema ?? "",
          requiresAuth: ep.requiresAuth ?? false,
        },
      });
      endpointIds.push({ specKey: s.key, id: e.id, method: ep.method, path: ep.path, day: s.day });
    }
  }

  const model: Record<string, string> = {};
  const entityIdsForEvents: { modelKey: string; id: string; name: string; day: number }[] = [];
  for (const m of def.dbModels) {
    const createdModel = await prisma.databaseModel.create({
      data: {
        projectId: project.id,
        artifactId: m.artifactKey ? a[m.artifactKey] : null,
        title: m.title,
        databaseType: m.databaseType,
        description: m.description,
        createdById: uid[m.byKey],
        createdAt: at(m.day, 11, 0),
      },
    });
    model[m.key] = createdModel.id;

    // Pass 1: entities.
    const entityId: Record<string, string> = {};
    for (const e of m.entities) {
      const ent = await prisma.databaseEntity.create({
        data: { databaseModelId: createdModel.id, name: e.name, description: e.description },
      });
      entityId[e.key] = ent.id;
      entityIdsForEvents.push({ modelKey: m.key, id: ent.id, name: e.name, day: m.day });
    }
    // Pass 2: fields (resolve entity-level FK target now; precise column target in pass 3).
    const fieldId: Record<string, string> = {}; // `${entityKey}.${fieldName}` → id
    for (const e of m.entities) {
      let pos = 0;
      for (const f of e.fields) {
        const isFk = f.isForeignKey ?? (!!f.referencesEntityKey || !!f.referencesFieldKey);
        const created = await prisma.databaseField.create({
          data: {
            entityId: entityId[e.key],
            name: f.name,
            type: f.type,
            required: f.required ?? false,
            isPrimaryKey: f.isPrimaryKey ?? false,
            isForeignKey: isFk,
            referencesEntityId: f.referencesEntityKey ? entityId[f.referencesEntityKey] : null,
            description: f.description ?? "",
            position: pos++,
          },
        });
        fieldId[`${e.key}.${f.name}`] = created.id;
      }
    }
    // Pass 3: precise column FK targets (referencesFieldId), now that all fields exist.
    for (const e of m.entities) {
      for (const f of e.fields) {
        if (!f.referencesFieldKey) continue;
        const targetId = fieldId[f.referencesFieldKey];
        if (targetId) {
          await prisma.databaseField.update({
            where: { id: fieldId[`${e.key}.${f.name}`] },
            data: { referencesFieldId: targetId },
          });
        }
      }
    }
  }

  const diagram: Record<string, string> = {};
  for (const d of def.diagrams) {
    const created = await prisma.diagram.create({
      data: {
        projectId: project.id,
        artifactId: d.artifactKey ? a[d.artifactKey] : null,
        title: d.title,
        type: d.type,
        mermaidSource: d.mermaidSource,
        description: d.description,
        createdById: uid[d.byKey],
        createdAt: at(d.day, 16, 0),
      },
    });
    diagram[d.key] = created.id;
  }

  // ── (b) backdated VersionEvents: auto creation history + hand-authored extras ──
  const events: SeedEvent[] = [];

  events.push({ entityType: "PROJECT", entityId: project.id, action: "CREATED", title: project.name, description: "Project created", triggeredBy: ownerId, at: at(def.day, 8, 0) });
  def.members.forEach((m, i) => {
    if (m.userKey === def.ownerKey) return;
    const u = USER_DEFS.find((x) => x.key === m.userKey)!;
    events.push({ entityType: "PROJECT", entityId: project.id, action: "LINKED", title: `${u.firstName} ${u.lastName} joined project as ${m.role}`, description: "Member added", triggeredBy: ownerId, metadata: { memberUserId: uid[m.userKey], role: m.role }, at: at(def.day, 8, i + 1) });
  });
  def.artifacts.forEach((art, i) => {
    events.push({ entityType: "ARTIFACT", entityId: a[art.key], action: "CREATED", title: art.title, description: `${art.type} (${art.status})`, triggeredBy: uid[art.byKey], at: at(art.day, 9, (i % 50) + 1) });
  });
  def.relations.forEach((r, i) => {
    events.push({ entityType: "RELATION", entityId: relId[relKey(r.source, r.target)], action: "LINKED", title: `${titleOf[r.source]} → ${titleOf[r.target]}`, description: r.type, triggeredBy: uid[r.byKey], metadata: { relationType: r.type, sourceArtifactId: a[r.source], targetArtifactId: a[r.target] }, at: at(def.artifacts.find((x) => x.key === r.source)?.day ?? def.day, 13, (i % 50) + 1) });
  });
  for (const s of def.apiSpecs) {
    events.push({ entityType: "API_SPEC", entityId: spec[s.key], action: "CREATED", title: s.title, description: `v${s.version} · ${s.baseUrl}`, triggeredBy: uid[s.byKey], metadata: { version: s.version }, at: at(s.day, 11, 0) });
  }
  endpointIds.forEach((e, i) => {
    const s = def.apiSpecs.find((x) => x.key === e.specKey)!;
    events.push({ entityType: "API_ENDPOINT", entityId: e.id, action: "CREATED", title: `${e.method} ${e.path}`, description: `Added to "${s.title}"`, triggeredBy: uid[s.byKey], metadata: { specId: spec[e.specKey] }, at: at(e.day, 11, (i % 50) + 1) });
  });
  for (const m of def.dbModels) {
    events.push({ entityType: "DATABASE_MODEL", entityId: model[m.key], action: "CREATED", title: m.title, description: m.databaseType, triggeredBy: uid[m.byKey], metadata: { databaseType: m.databaseType }, at: at(m.day, 11, 0) });
  }
  entityIdsForEvents.forEach((e, i) => {
    const m = def.dbModels.find((x) => x.key === e.modelKey)!;
    events.push({ entityType: "DATABASE_ENTITY", entityId: e.id, action: "CREATED", title: e.name, description: `Added to ${m.title}`, triggeredBy: uid[m.byKey], metadata: { databaseModelId: model[e.modelKey] }, at: at(e.day, 11, (i % 50) + 10) });
  });
  for (const d of def.diagrams) {
    events.push({ entityType: "DIAGRAM", entityId: diagram[d.key], action: "CREATED", title: d.title, description: d.type, triggeredBy: uid[d.byKey], metadata: { type: d.type }, at: at(d.day, 16, 0) });
  }
  if (def.extraEvents) events.push(...def.extraEvents({ a, spec, model, diagram, uid }));

  for (const e of events) await recordVersionEvent({ projectId: project.id, ...e });

  // ── (c) run validation (VALIDATED event is stamped "now" by the engine) ──
  const { issues } = await runValidationForProject(project.id, ownerId);

  // ── (d) triage: mark one finding IGNORED and one RESOLVED (deterministic) ──
  let ignored = 0;
  let resolved = 0;
  for (const t of def.triage ?? []) {
    const match = issues
      .filter((v) => v.status === "OPEN" && v.message.includes(t.messageIncludes))
      .sort((x, y) => (x.message < y.message ? -1 : x.message > y.message ? 1 : 0))[0];
    if (match) {
      await prisma.validationIssue.update({ where: { id: match.id }, data: { status: t.status } });
      match.status = t.status; // keep our in-memory copy aligned for the summary
      if (t.status === "IGNORED") ignored++;
      else resolved++;
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[seed] triage rule matched no OPEN issue: "${t.messageIncludes}" in ${def.name}`);
    }
  }

  // ── (e) exports through buildExportContent (JSON + PDF) ──
  const jsonContent = await buildExportContent(project.id, "JSON", FULL_SECTIONS);
  await prisma.exportPackage.create({
    data: { projectId: project.id, format: "JSON", sections: FULL_SECTIONS, content: jsonContent as Prisma.InputJsonValue, createdById: ownerId, createdAt: at(0, 9, 0) },
  });
  const pdfContent = await buildExportContent(project.id, "PDF", FULL_SECTIONS);
  await prisma.exportPackage.create({
    data: { projectId: project.id, format: "PDF", sections: FULL_SECTIONS, content: pdfContent as Prisma.InputJsonValue, createdById: ownerId, createdAt: at(0, 9, 5) },
  });
  // A Markdown export too, for completeness (mirrors the original demo).
  const mdContent = await buildExportContent(project.id, "MARKDOWN", MD_SECTIONS);
  await prisma.exportPackage.create({
    data: { projectId: project.id, format: "MARKDOWN", sections: MD_SECTIONS, content: mdContent as Prisma.InputJsonValue, createdById: ownerId, createdAt: at(0, 9, 10) },
  });
  await recordVersionEvent({ projectId: project.id, entityType: "EXPORT", entityId: project.id, action: "EXPORTED", title: `${def.name} export`, description: "JSON + PDF + Markdown", triggeredBy: ownerId, metadata: { formats: ["JSON", "PDF", "MARKDOWN"] } });

  // ── summary: compute the ACTUAL health score + actual emitted finding codes ──
  const scoringSnap = await buildExportContent(project.id, "JSON", FULL_SECTIONS);
  const analysis = analyzeExportSnapshot(scoringSnap);

  const finalIssues = await prisma.validationIssue.findMany({ where: { projectId: project.id } });
  const codesBySeverity: Record<string, Record<string, number>> = {};
  for (const v of finalIssues) {
    if (v.status !== "OPEN") continue; // open findings drive the score
    const code = classifyFindingFromIssue({ category: v.category, message: v.message });
    const sev = v.severity as IssueSeverity;
    (codesBySeverity[sev] ??= {});
    codesBySeverity[sev][code] = (codesBySeverity[sev][code] ?? 0) + 1;
  }

  const counts = {
    artifacts: def.artifacts.length,
    relations: def.relations.length,
    apiSpecs: def.apiSpecs.length,
    endpoints: endpointIds.length,
    dbModels: def.dbModels.length,
    entities: entityIdsForEvents.length,
    fields: def.dbModels.reduce((n, m) => n + m.entities.reduce((k, e) => k + e.fields.length, 0), 0),
    diagrams: def.diagrams.length,
    members: def.members.length,
    versionEvents: await prisma.versionEvent.count({ where: { projectId: project.id } }),
    openIssues: analysis.validation.openCount,
  };

  return {
    name: def.name,
    band: def.key === "shop" ? "HEALTHY (target A/B)" : def.key === "health" ? "MESSY (target D)" : "SMALL (target C)",
    deyvidRole: def.members.find((m) => m.userKey === "deyvid")?.role ?? "—",
    health: analysis.health.score,
    grade: analysis.health.grade,
    label: analysis.health.label,
    counts,
    codesBySeverity,
    ignored,
    resolved,
  };
}

// ───────────────────── main ─────────────────────

async function main() {
  // Safety gate: refuse to wipe production or a remote/managed database. Runs
  // BEFORE any delete. Throws (caught below → exit 1) if the target is unsafe.
  assertDestructiveAllowed();

  // Wipe in dependency-safe order. Postgres FK cascades would handle most of it,
  // but explicit deletes keep the seed re-runnable.
  await prisma.$transaction([
    prisma.versionEvent.deleteMany(),
    prisma.exportPackage.deleteMany(),
    prisma.validationIssue.deleteMany(),
    prisma.diagram.deleteMany(),
    prisma.databaseField.deleteMany(),
    prisma.databaseEntity.deleteMany(),
    prisma.databaseModel.deleteMany(),
    prisma.apiEndpoint.deleteMany(),
    prisma.apiSpec.deleteMany(),
    prisma.artifactRelation.deleteMany(),
    prisma.artifact.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.aiSession.deleteMany(),
    prisma.ingestionRecord.deleteMany(),
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── users (pre-verified, all password `minotaurus`) ──
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const verifiedAt = at(30, 8, 0);
  const uid: Record<string, string> = {};
  for (const u of USER_DEFS) {
    const created = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        emailVerifiedAt: verifiedAt,
        createdAt: at(30, 8, 0),
      },
    });
    uid[u.key] = created.id;
  }

  const summaries: ProjectSummary[] = [];
  for (const def of PROJECT_DEFS) {
    summaries.push(await buildProject(def, uid));
  }

  // ── console summary ──
  const line = "─".repeat(72);
  /* eslint-disable no-console */
  console.log(`\n${line}`);
  console.log("MINOTAURUS SEED — small world rebuilt");
  console.log(line);
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Users (${USER_DEFS.length}, all password "${DEMO_PASSWORD}"): ${USER_DEFS.map((u) => `${u.firstName} ${u.lastName} <${u.email}> [${u.role}]`).join(", ")}`);

  for (const s of summaries) {
    console.log(`\n${line}`);
    console.log(`■ ${s.name} — ${s.band}`);
    console.log(line);
    console.log(`  Deyvid's role:  ${s.deyvidRole}`);
    console.log(`  Health score:   ${s.health ?? "N/A"}  (${s.grade} · ${s.label})`);
    console.log(`  Counts:         ${Object.entries(s.counts).map(([k, v]) => `${k}=${v}`).join("  ")}`);
    console.log(`  Triage:         IGNORED=${s.ignored}  RESOLVED=${s.resolved}`);
    console.log("  Open findings (actual emitted codes, by severity):");
    const order: IssueSeverity[] = ["CRITICAL", "ERROR", "WARNING", "INFO"];
    let any = false;
    for (const sev of order) {
      const codes = s.codesBySeverity[sev];
      if (!codes) continue;
      any = true;
      const total = Object.values(codes).reduce((n, k) => n + k, 0);
      const detail = Object.entries(codes).sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([c, n]) => `${c}×${n}`).join(", ");
      console.log(`    ${sev.padEnd(8)} (${total}): ${detail}`);
    }
    if (!any) console.log("    (none)");
  }
  console.log(`\n${line}`);
  console.log("Target bands: Healthy = A/B · Messy = D (At Risk) · Small = C (Fair)");
  console.log(line + "\n");
  /* eslint-enable no-console */
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
