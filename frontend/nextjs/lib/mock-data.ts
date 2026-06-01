// lib/mock-data.ts — placeholder dataset used while backend isn't wired.
// Replace by calls to /lib/api/* once the API is available.

import type {
  Artifact, Project, Relation, User,
  ValidationIssue, VersionEntry,
} from "./types";

const daysAgo = (n: number) => {
  const d = new Date("2026-05-26T12:00:00Z");
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export const CURRENT_USER: User = {
  id: "u_1",
  firstName: "Deyvid", lastName: "Popov",
  email: "deyvid@minotaurus.dev",
  role: "ADMIN", initials: "DP", defaultProjectId: null,
};

export const USERS: User[] = [
  CURRENT_USER,
  { id: "u_2", firstName: "Maya",  lastName: "Lindberg", email: "maya@minotaurus.dev", role: "ENGINEER",  initials: "ML", defaultProjectId: null },
  { id: "u_3", firstName: "Ren",   lastName: "Okafor",   email: "ren@minotaurus.dev",  role: "ENGINEER",  initials: "RO", defaultProjectId: null },
  { id: "u_4", firstName: "Iris",  lastName: "Chen",     email: "iris@minotaurus.dev", role: "ARCHITECT", initials: "IC", defaultProjectId: null },
];

export const PROJECTS: Project[] = [
  { id: "p_helix",  name: "Helix Commerce",      slug: "helix-commerce",      description: "Headless commerce — auth, orders, payments, inventory, search.", artifactCount: 32, validationIssueCount: 7, members: 12, updatedAt: daysAgo(0),  starred: true,  color: "#3b82f6" },
  { id: "p_atlas",  name: "Atlas Analytics",     slug: "atlas-analytics",     description: "Customer event pipeline, warehousing and dashboards.",            artifactCount: 18, validationIssueCount: 2, members: 6,  updatedAt: daysAgo(2),  starred: true,  color: "#8b5cf6" },
  { id: "p_pulse",  name: "Pulse Notifications", slug: "pulse-notifications", description: "Transactional and marketing notification service.",              artifactCount: 11, validationIssueCount: 0, members: 4,  updatedAt: daysAgo(6),  starred: false, color: "#10b981" },
  { id: "p_loom",   name: "Loom Identity",       slug: "loom-identity",       description: "Shared SSO + RBAC across the org.",                                artifactCount: 9,  validationIssueCount: 1, members: 3,  updatedAt: daysAgo(14), starred: false, color: "#f59e0b" },
];

const a = (
  id: string,
  title: string,
  type: Artifact["type"],
  status: Artifact["status"],
  description: string,
  gx: number,
  gy: number,
  tags: string[] = [],
): Artifact => ({
  id, title, type, status, description, tags, gx, gy,
  createdAt: daysAgo(60 - id.length * 3),
  updatedAt: daysAgo(id.charCodeAt(2) % 28),
  author: USERS[(id.charCodeAt(0) + id.length) % USERS.length]!,
});

export const ARTIFACTS: Artifact[] = [
  // Services
  a("svc-auth",      "Authentication Service", "SERVICE", "ACTIVE",     "Issues JWTs, handles login, refresh, MFA.",                 -260,  20, ["auth"]),
  a("svc-user",      "User Service",           "SERVICE", "ACTIVE",     "User profiles, preferences, RBAC enforcement.",             -100,  30),
  a("svc-orders",    "Orders Service",         "SERVICE", "ACTIVE",     "Order lifecycle, line items, fulfillment hooks.",             60,  20, ["orders"]),
  a("svc-payments",  "Payments Service",       "SERVICE", "ACTIVE",     "Stripe + Adyen orchestration, refunds, ledgers.",            220,  30, ["payments"]),
  a("svc-inventory", "Inventory Service",      "SERVICE", "ACTIVE",     "Stock levels, reservations, restock pipeline.",             -180, 130),
  a("svc-search",    "Search Service",         "SERVICE", "DRAFT",      "Catalog search index, typo-tolerant ranking.",                20, 130),
  a("svc-notifs",    "Notifications Service",  "SERVICE", "ACTIVE",     "Transactional email + push fanout.",                          160, 140),
  a("svc-webhooks",  "Webhooks Service",       "SERVICE", "DEPRECATED", "Legacy outbound webhook delivery.",                           300, 140),
  // DBs
  a("db-users",      "users_db",     "DATABASE_MODEL", "ACTIVE", "Postgres — accounts, sessions, MFA.",                              -260, 260),
  a("db-orders",     "orders_db",    "DATABASE_MODEL", "ACTIVE", "Postgres — orders, line items, fulfillment.",                        40, 280),
  a("db-payments",   "payments_db",  "DATABASE_MODEL", "ACTIVE", "Postgres — payment intents, transactions, ledger.",                220, 270),
  a("db-inventory",  "inventory_kv", "DATABASE_MODEL", "ACTIVE", "Redis — stock levels and short-lived reservations.",               -110, 260),
  a("db-catalog",    "catalog_search","DATABASE_MODEL","ACTIVE", "Elasticsearch — product catalog index.",                            -20, 380),
  // APIs
  a("api-auth",      "Authentication API",     "API_SPEC", "ACTIVE", "OpenAPI 3.1 — login, refresh, /me.",                          -260, -110),
  a("api-orders",    "Orders API",             "API_SPEC", "ACTIVE", "OpenAPI 3.1 — orders, lines, fulfillment.",                     50, -110),
  a("api-payments",  "Payments API",           "API_SPEC", "DRAFT",  "OpenAPI 3.1 — intents, refunds, webhooks.",                   220, -100),
  a("api-public",    "Public Storefront API",  "API_SPEC", "ACTIVE", "GraphQL gateway used by web + mobile.",                       -100, -210),
  // Documentation
  a("doc-arch",      "Architecture Overview",  "DOCUMENTATION", "ACTIVE", "How the services fit together.",                          430,  20),
  a("doc-auth",      "Authentication Guide",   "DOCUMENTATION", "ACTIVE", "Token lifecycle, refresh, session revocation.",           430,  90),
  a("doc-payments",  "Payments Runbook",       "DOCUMENTATION", "DRAFT",  "On-call procedures for failed charges.",                  430, 160),
  // Diagrams
  a("dia-flow-auth", "Login Sequence",         "DIAGRAM", "ACTIVE", "Sequence diagram for the login flow.",                          330, -40),
  a("dia-arch",      "System Architecture",    "DIAGRAM", "ACTIVE", "Component diagram.",                                            330, 230),
  // Requirements / Security
  a("req-pci",       "PCI-DSS Compliance",     "REQUIREMENT", "ACTIVE", "Cardholder data must not transit our services.",          -420, 130),
  a("sec-mfa",       "Mandatory MFA",          "SECURITY_POLICY", "ACTIVE", "Admin accounts must use TOTP MFA.",                    -420,  40),
  // Environments / External
  a("env-prod",      "production",             "ENVIRONMENT", "ACTIVE", "Production cluster on AWS eu-west-1.",                      160, 380),
  a("env-stage",     "staging",                "ENVIRONMENT", "ACTIVE", "Staging cluster mirroring production.",                      40, 380),
  a("ext-stripe",    "Stripe",                 "EXTERNAL_SYSTEM", "ACTIVE", "Card processor.",                                       360,  90),
  a("ext-sendgrid",  "SendGrid",               "EXTERNAL_SYSTEM", "ACTIVE", "Email delivery.",                                       280, 200),
];

export const BY_ID: Record<string, Artifact> = Object.fromEntries(ARTIFACTS.map((x) => [x.id, x]));

const r = (s: string, t: string, type: Relation["type"], description?: string): Relation => ({
  id: `r_${s}__${t}__${type}`, source: s, target: t, type, description,
});

export const RELATIONS: Relation[] = [
  r("svc-auth", "db-users", "USES"),
  r("svc-user", "db-users", "USES"),
  r("svc-orders", "db-orders", "USES"),
  r("svc-payments", "db-payments", "USES"),
  r("svc-inventory", "db-inventory", "USES"),
  r("svc-search", "db-catalog", "USES"),
  r("api-auth", "svc-auth", "EXPOSES"),
  r("api-orders", "svc-orders", "EXPOSES"),
  r("api-payments", "svc-payments", "EXPOSES"),
  r("api-public", "svc-orders", "EXPOSES"),
  r("api-public", "svc-user", "EXPOSES"),
  r("api-public", "svc-search", "EXPOSES"),
  r("svc-orders", "svc-inventory", "DEPENDS_ON", "Reserves stock at checkout"),
  r("svc-orders", "svc-payments", "DEPENDS_ON", "Creates payment intent"),
  r("svc-orders", "svc-notifs", "COMMUNICATES_WITH"),
  r("svc-payments", "svc-notifs", "COMMUNICATES_WITH"),
  r("svc-user", "svc-auth", "DEPENDS_ON"),
  r("svc-orders", "svc-user", "DEPENDS_ON"),
  r("svc-payments", "ext-stripe", "COMMUNICATES_WITH"),
  r("svc-notifs", "ext-sendgrid", "COMMUNICATES_WITH"),
  r("doc-arch", "svc-orders", "DOCUMENTS"),
  r("doc-auth", "svc-auth", "DOCUMENTS"),
  r("doc-payments", "svc-payments", "DOCUMENTS"),
  r("dia-flow-auth", "svc-auth", "DOCUMENTS"),
  r("dia-arch", "svc-orders", "DOCUMENTS"),
  r("sec-mfa", "svc-auth", "SECURES"),
  r("req-pci", "svc-payments", "VALIDATES"),
  r("svc-orders", "env-prod", "DEPLOYED_TO"),
  r("svc-auth", "env-prod", "DEPLOYED_TO"),
  r("svc-payments", "env-prod", "DEPLOYED_TO"),
  r("svc-search", "env-stage", "DEPLOYED_TO"),
];

// derive counts
ARTIFACTS.forEach((art) => {
  art.relationCount = RELATIONS.filter((rel) => rel.source === art.id || rel.target === art.id).length;
});

export const ISSUES: ValidationIssue[] = [
  { id: "vi_1", severity: "CRITICAL", category: "SECURITY",      message: "Payments API spec marked DRAFT but service is ACTIVE in production.", artifactId: "api-payments", status: "OPEN",    createdAt: daysAgo(1) },
  { id: "vi_2", severity: "ERROR",    category: "DOCUMENTATION", message: "Search Service has no linked documentation.",                          artifactId: "svc-search",   status: "OPEN",    createdAt: daysAgo(1) },
  { id: "vi_3", severity: "WARNING",  category: "API",           message: "POST /payments/intents has no request schema example.",                artifactId: "api-payments", status: "OPEN",    createdAt: daysAgo(2) },
  { id: "vi_4", severity: "WARNING",  category: "ARCHITECTURE",  message: "Webhooks Service is DEPRECATED but still receives traffic.",           artifactId: "svc-webhooks", status: "OPEN",    createdAt: daysAgo(3) },
  { id: "vi_5", severity: "WARNING",  category: "RELATIONSHIP",  message: "Orders depends on Inventory but no SLA documented.",                   artifactId: "svc-orders",   status: "OPEN",    createdAt: daysAgo(3) },
  { id: "vi_6", severity: "INFO",     category: "VERSIONING",    message: "Authentication Guide hasn't been updated in 28 days.",                 artifactId: "doc-auth",     status: "OPEN",    createdAt: daysAgo(5) },
  { id: "vi_7", severity: "INFO",     category: "DATABASE",      message: "users_db has 1 column without explicit NOT NULL constraint.",          artifactId: "db-users",     status: "OPEN",    createdAt: daysAgo(6) },
];

export const VERSIONS: VersionEntry[] = [
  { id: "v_1",  entityType: "ARTIFACT", entityId: "svc-search",   changeType: "UPDATED", oldValue: { status: "ACTIVE" }, newValue: { status: "DRAFT" }, changedBy: USERS[2]!, createdAt: daysAgo(0) },
  { id: "v_3",  entityType: "DOCUMENTATION", entityId: "doc-payments", changeType: "UPDATED", oldValue: null, newValue: { length: 1840 }, changedBy: USERS[1]!, createdAt: daysAgo(1) },
  { id: "v_5",  entityType: "ARTIFACT", entityId: "svc-webhooks", changeType: "UPDATED", oldValue: { status: "ACTIVE" }, newValue: { status: "DEPRECATED" }, changedBy: USERS[0]!, createdAt: daysAgo(2) },
  { id: "v_6",  entityType: "ARTIFACT", entityId: "doc-payments", changeType: "CREATED", oldValue: null, newValue: { type: "DOCUMENTATION" }, changedBy: USERS[1]!, createdAt: daysAgo(3) },
  { id: "v_8",  entityType: "ARTIFACT", entityId: "api-public",   changeType: "CREATED", oldValue: null, newValue: { type: "API_SPEC" }, changedBy: USERS[3]!, createdAt: daysAgo(7) },
];

export const TYPE_INFO: Record<Artifact["type"], { label: string; color: string }> = {
  SERVICE:          { label: "Service",         color: "#3b82f6" },
  API_SPEC:         { label: "API Spec",        color: "#8b5cf6" },
  API_ENDPOINT:     { label: "Endpoint",        color: "#a78bfa" },
  DATABASE_MODEL:   { label: "Database",        color: "#10b981" },
  DATABASE_ENTITY:  { label: "Entity",          color: "#34d399" },
  DOCUMENTATION:    { label: "Documentation",   color: "#f59e0b" },
  DIAGRAM:          { label: "Diagram",         color: "#ec4899" },
  REQUIREMENT:      { label: "Requirement",     color: "#06b6d4" },
  SECURITY_POLICY:  { label: "Security Policy", color: "#ef4444" },
  ENVIRONMENT:      { label: "Environment",     color: "#64748b" },
  EXTERNAL_SYSTEM:  { label: "External",        color: "#94a3b8" },
};

export const RELATION_TYPES: Relation["type"][] = [
  "DEPENDS_ON","DOCUMENTS","IMPLEMENTS","USES","EXPOSES","BELONGS_TO","SECURES","VALIDATES","GENERATES","DEPLOYED_TO","COMMUNICATES_WITH",
];

export const ARTIFACT_TYPES: Artifact["type"][] = Object.keys(TYPE_INFO) as Artifact["type"][];

export const EDGE_COLOR: Record<Relation["type"], string> = {
  DEPENDS_ON: "#3b82f6", COMMUNICATES_WITH: "#06b6d4", USES: "#10b981",
  EXPOSES: "#8b5cf6", BELONGS_TO: "#a78bfa", DOCUMENTS: "#f59e0b",
  SECURES: "#ef4444", VALIDATES: "#ec4899", DEPLOYED_TO: "#64748b",
  GENERATES: "#22c55e", IMPLEMENTS: "#0ea5e9",
};
