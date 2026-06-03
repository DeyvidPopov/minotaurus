// src/data.jsx — mock dataset for Helix Commerce reference project.
// Hard-coded so the prototype feels realistic and deterministic.

// ───── helpers ──────────────────────────────────────────────────
const daysAgo = (n) => {
  const d = new Date("2026-05-26T12:00:00Z");
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const rel = (id) => `2026-05-${String(26 - id).padStart(2, "0")}T${10 + (id % 12)}:${String((id * 7) % 60).padStart(2, "0")}:00Z`;

// ───── current user ─────────────────────────────────────────────
const CURRENT_USER = {
  id: "u_1",
  firstName: "Deyvid",
  lastName: "Popov",
  email: "deyvid@helix.dev",
  role: "ADMIN",
  initials: "DP",
};

const USERS = [
  CURRENT_USER,
  { id: "u_2", firstName: "Maya",  lastName: "Lindberg",  email: "maya@helix.dev",  role: "ENGINEER", initials: "ML" },
  { id: "u_3", firstName: "Ren",   lastName: "Okafor",    email: "ren@helix.dev",   role: "ENGINEER", initials: "RO" },
  { id: "u_4", firstName: "Iris",  lastName: "Chen",      email: "iris@helix.dev",  role: "ARCHITECT", initials: "IC" },
  { id: "u_5", firstName: "Theo",  lastName: "Martin",    email: "theo@helix.dev",  role: "ENGINEER", initials: "TM" },
];

// ───── projects ─────────────────────────────────────────────────
const PROJECTS = [
  {
    id: "p_helix",
    name: "Helix Commerce",
    slug: "helix-commerce",
    description: "Headless commerce platform — auth, orders, payments, inventory, search.",
    artifactCount: 32,
    validationIssueCount: 7,
    members: 12,
    updatedAt: daysAgo(0),
    starred: true,
    color: "#3b82f6",
  },
  {
    id: "p_atlas",
    name: "Atlas Analytics",
    slug: "atlas-analytics",
    description: "Customer event pipeline, warehousing and dashboards.",
    artifactCount: 18,
    validationIssueCount: 2,
    members: 6,
    updatedAt: daysAgo(2),
    starred: true,
    color: "#8b5cf6",
  },
  {
    id: "p_pulse",
    name: "Pulse Notifications",
    slug: "pulse-notifications",
    description: "Transactional and marketing notification service.",
    artifactCount: 11,
    validationIssueCount: 0,
    members: 4,
    updatedAt: daysAgo(6),
    starred: false,
    color: "#10b981",
  },
  {
    id: "p_loom",
    name: "Loom Identity",
    slug: "loom-identity",
    description: "Shared SSO + RBAC across the org.",
    artifactCount: 9,
    validationIssueCount: 1,
    members: 3,
    updatedAt: daysAgo(14),
    starred: false,
    color: "#f59e0b",
  },
];

// ───── artifacts for Helix Commerce ─────────────────────────────
// Hand-laid out coordinates so the knowledge graph looks intentional.
//
//                  [API specs / endpoints layer]   (top)
//                  ────────────────────────────────
//                  [Services cluster]
//                  ────────────────────────────────
//                  [Databases below services]
//
//   Documentation drifts to the right.
//   Security / Requirements / Environment / External anchor outer ring.

const A = (id, title, type, status, description, gx, gy, tags = [], extra = {}) => ({
  id, title, type, status, description, tags, gx, gy,
  createdAt: daysAgo(60 - (id.length * 3)),
  updatedAt: daysAgo((id.charCodeAt(2) % 28)),
  author: USERS[(id.charCodeAt(0) + id.length) % USERS.length],
  ...extra,
});

const ARTIFACTS = [
  // Services
  A("svc-auth",        "Authentication Service",   "SERVICE", "ACTIVE",     "Issues JWTs, handles login, refresh, MFA.",                   -260,  20, ["auth","jwt","security"]),
  A("svc-user",        "User Service",             "SERVICE", "ACTIVE",     "User profiles, preferences, RBAC enforcement.",               -100,  30, ["user","profile"]),
  A("svc-orders",      "Orders Service",           "SERVICE", "ACTIVE",     "Order lifecycle, line items, fulfillment hooks.",              60,  20, ["orders","commerce"]),
  A("svc-payments",    "Payments Service",         "SERVICE", "ACTIVE",     "Stripe + Adyen orchestration, refunds, ledgers.",             220,  30, ["payments","stripe"]),
  A("svc-inventory",   "Inventory Service",        "SERVICE", "ACTIVE",     "Stock levels, reservations, restock pipeline.",              -180, 130, ["inventory"]),
  A("svc-search",      "Search Service",           "SERVICE", "DRAFT",      "Catalog search index, typo-tolerant ranking.",                 20, 130, ["search","catalog"]),
  A("svc-notifs",      "Notifications Service",    "SERVICE", "ACTIVE",     "Transactional email + push fanout.",                          160, 140, ["notifications"]),
  A("svc-webhooks",    "Webhooks Service",         "SERVICE", "DEPRECATED", "Legacy outbound webhook delivery — being phased out.",        300, 140, ["webhooks"]),

  // Databases
  A("db-users",        "users_db",                 "DATABASE_MODEL", "ACTIVE", "Postgres — accounts, sessions, MFA.",                     -260, 260, ["postgres"]),
  A("db-orders",       "orders_db",                "DATABASE_MODEL", "ACTIVE", "Postgres — orders, line items, fulfillment events.",       40, 280, ["postgres"]),
  A("db-payments",     "payments_db",              "DATABASE_MODEL", "ACTIVE", "Postgres — payment intents, transactions, ledger.",       220, 270, ["postgres","ledger"]),
  A("db-inventory",    "inventory_kv",             "DATABASE_MODEL", "ACTIVE", "Redis — stock levels and short-lived reservations.",      -110, 260, ["redis","kv"]),
  A("db-catalog",      "catalog_search",           "DATABASE_MODEL", "ACTIVE", "Elasticsearch — product catalog index.",                   -20, 380, ["elasticsearch"]),

  // API specs
  A("api-auth",        "Authentication API",       "API_SPEC", "ACTIVE", "OpenAPI 3.1 — login, refresh, /me.",                            -260, -110, ["openapi"]),
  A("api-orders",      "Orders API",               "API_SPEC", "ACTIVE", "OpenAPI 3.1 — orders, lines, fulfillment.",                       50, -110, ["openapi"]),
  A("api-payments",    "Payments API",             "API_SPEC", "DRAFT",  "OpenAPI 3.1 — intents, refunds, webhooks.",                     220, -100, ["openapi"]),
  A("api-search",      "Search API",               "API_SPEC", "DRAFT",  "OpenAPI 3.1 — catalog search.",                                  20, -210, ["openapi"]),
  A("api-public",      "Public Storefront API",    "API_SPEC", "ACTIVE", "GraphQL gateway used by web + mobile.",                        -100, -210, ["graphql","gateway"]),

  // Endpoints (representative — one per spec)
  A("ep-login",        "POST /auth/login",         "API_ENDPOINT", "ACTIVE",  "User login with email + password.",                        -340, -200, [], { method: "POST" }),
  A("ep-refresh",      "POST /auth/refresh",       "API_ENDPOINT", "ACTIVE",  "Refresh access token.",                                    -190, -200, [], { method: "POST" }),
  A("ep-create-order", "POST /orders",             "API_ENDPOINT", "ACTIVE",  "Create a new order from a cart.",                            130, -200, [], { method: "POST" }),
  A("ep-pay",          "POST /payments/intents",   "API_ENDPOINT", "DRAFT",   "Create payment intent for an order.",                        290, -200, [], { method: "POST" }),

  // Documentation
  A("doc-arch",        "Architecture Overview",    "DOCUMENTATION", "ACTIVE", "How the services fit together; entry point for new hires.",  430,  20, ["onboarding"]),
  A("doc-auth",        "Authentication Guide",     "DOCUMENTATION", "ACTIVE", "Token lifecycle, refresh, session revocation.",              430,  90, []),
  A("doc-payments",    "Payments Runbook",         "DOCUMENTATION", "DRAFT",  "On-call procedures for failed charges.",                     430, 160, []),
  A("doc-data",        "Data Model Reference",     "DOCUMENTATION", "ACTIVE", "Tables, fields, invariants.",                                430, 230, []),

  // Diagrams
  A("dia-flow-auth",   "Login Sequence",           "DIAGRAM", "ACTIVE", "Mermaid sequence diagram for the login flow.",                     330, -40, ["mermaid","sequence"], { diagramType: "SEQUENCE" }),
  A("dia-arch",        "System Architecture",      "DIAGRAM", "ACTIVE", "Mermaid component diagram.",                                       330, 230, ["mermaid"], { diagramType: "ARCHITECTURE_FLOW" }),

  // Requirements
  A("req-pci",         "PCI-DSS Compliance",       "REQUIREMENT", "ACTIVE", "Cardholder data must not transit our services.",            -420, 130, ["pci","compliance"]),
  A("req-gdpr",        "GDPR Right to Erasure",    "REQUIREMENT", "ACTIVE", "Users must be able to delete their account.",               -420, 200, ["gdpr"]),

  // Security policies
  A("sec-mfa",         "Mandatory MFA",            "SECURITY_POLICY", "ACTIVE", "Admin accounts must use TOTP MFA.",                     -420,  40, ["mfa"]),
  A("sec-secrets",     "Secrets in Vault",         "SECURITY_POLICY", "ACTIVE", "No secrets in repos or env files.",                      -420, -30, ["secrets","vault"]),

  // Environments
  A("env-prod",        "production",               "ENVIRONMENT", "ACTIVE", "Production cluster on AWS eu-west-1.",                       160, 380, ["aws"]),
  A("env-stage",       "staging",                  "ENVIRONMENT", "ACTIVE", "Staging cluster mirroring production.",                       40, 380, []),

  // External systems
  A("ext-stripe",      "Stripe",                   "EXTERNAL_SYSTEM", "ACTIVE", "Card processor.",                                         360,  90, ["payments"]),
  A("ext-sendgrid",    "SendGrid",                 "EXTERNAL_SYSTEM", "ACTIVE", "Email delivery.",                                         280, 200, ["email"]),
];

const BY_ID = Object.fromEntries(ARTIFACTS.map(a => [a.id, a]));

// ───── relations ────────────────────────────────────────────────
const R = (s, t, type, description = "") => ({
  id: `r_${s}__${t}__${type}`, source: s, target: t, type, description,
});

const RELATIONS = [
  // services → databases
  R("svc-auth",       "db-users",      "USES",            "Stores accounts and sessions"),
  R("svc-user",       "db-users",      "USES"),
  R("svc-orders",     "db-orders",     "USES"),
  R("svc-payments",   "db-payments",   "USES"),
  R("svc-inventory",  "db-inventory",  "USES"),
  R("svc-search",     "db-catalog",    "USES"),

  // api specs → services
  R("api-auth",       "svc-auth",      "EXPOSES"),
  R("api-orders",     "svc-orders",    "EXPOSES"),
  R("api-payments",   "svc-payments",  "EXPOSES"),
  R("api-search",     "svc-search",    "EXPOSES"),
  R("api-public",     "svc-orders",    "EXPOSES",         "Gateway proxies to orders"),
  R("api-public",     "svc-user",      "EXPOSES"),
  R("api-public",     "svc-search",    "EXPOSES"),

  // endpoints → specs
  R("ep-login",       "api-auth",      "BELONGS_TO"),
  R("ep-refresh",     "api-auth",      "BELONGS_TO"),
  R("ep-create-order","api-orders",    "BELONGS_TO"),
  R("ep-pay",         "api-payments",  "BELONGS_TO"),

  // service → service
  R("svc-orders",     "svc-inventory", "DEPENDS_ON",      "Reserves stock at checkout"),
  R("svc-orders",     "svc-payments",  "DEPENDS_ON",      "Creates payment intent"),
  R("svc-orders",     "svc-notifs",    "COMMUNICATES_WITH","Sends order confirmations"),
  R("svc-payments",   "svc-notifs",    "COMMUNICATES_WITH"),
  R("svc-user",       "svc-auth",      "DEPENDS_ON"),
  R("svc-orders",     "svc-user",      "DEPENDS_ON"),

  // external
  R("svc-payments",   "ext-stripe",    "COMMUNICATES_WITH","Card capture and refunds"),
  R("svc-notifs",     "ext-sendgrid",  "COMMUNICATES_WITH"),

  // documentation
  R("doc-arch",       "svc-orders",    "DOCUMENTS"),
  R("doc-arch",       "svc-auth",      "DOCUMENTS"),
  R("doc-arch",       "svc-payments",  "DOCUMENTS"),
  R("doc-auth",       "svc-auth",      "DOCUMENTS"),
  R("doc-payments",   "svc-payments",  "DOCUMENTS"),
  R("doc-data",       "db-users",      "DOCUMENTS"),
  R("doc-data",       "db-orders",     "DOCUMENTS"),

  // diagrams
  R("dia-flow-auth",  "svc-auth",      "DOCUMENTS"),
  R("dia-arch",       "svc-orders",    "DOCUMENTS"),

  // security / compliance
  R("sec-mfa",        "svc-auth",      "SECURES"),
  R("sec-secrets",    "svc-payments",  "SECURES"),
  R("req-pci",        "svc-payments",  "VALIDATES"),
  R("req-gdpr",       "svc-user",      "VALIDATES"),

  // environments
  R("svc-orders",     "env-prod",      "DEPLOYED_TO"),
  R("svc-auth",       "env-prod",      "DEPLOYED_TO"),
  R("svc-payments",   "env-prod",      "DEPLOYED_TO"),
  R("svc-user",       "env-prod",      "DEPLOYED_TO"),
  R("svc-inventory",  "env-prod",      "DEPLOYED_TO"),
  R("svc-notifs",     "env-prod",      "DEPLOYED_TO"),
  R("svc-search",     "env-stage",     "DEPLOYED_TO"),
];

// derive counts
ARTIFACTS.forEach(a => {
  a.relationCount = RELATIONS.filter(r => r.source === a.id || r.target === a.id).length;
});

// ───── validation issues ────────────────────────────────────────
const ISSUES = [
  { id: "vi_1", severity: "CRITICAL", category: "SECURITY",       message: "Payments API spec marked DRAFT but Payments Service is ACTIVE in production.",  artifactId: "api-payments",   status: "OPEN",     createdAt: daysAgo(1) },
  { id: "vi_2", severity: "ERROR",    category: "DOCUMENTATION",  message: "Search Service has no linked documentation.",                                    artifactId: "svc-search",     status: "OPEN",     createdAt: daysAgo(1) },
  { id: "vi_3", severity: "WARNING",  category: "API",            message: "POST /payments/intents has no request schema example.",                          artifactId: "ep-pay",         status: "OPEN",     createdAt: daysAgo(2) },
  { id: "vi_4", severity: "WARNING",  category: "ARCHITECTURE",   message: "Webhooks Service is DEPRECATED but still receives traffic in production.",      artifactId: "svc-webhooks",   status: "OPEN",     createdAt: daysAgo(3) },
  { id: "vi_5", severity: "WARNING",  category: "RELATIONSHIP",   message: "Orders Service depends on Inventory but no SLA documented.",                     artifactId: "svc-orders",     status: "OPEN",     createdAt: daysAgo(3) },
  { id: "vi_6", severity: "INFO",     category: "VERSIONING",     message: "Authentication Guide hasn't been updated in 28 days.",                           artifactId: "doc-auth",       status: "OPEN",     createdAt: daysAgo(5) },
  { id: "vi_7", severity: "INFO",     category: "DATABASE",       message: "users_db has 1 column without explicit NOT NULL constraint.",                    artifactId: "db-users",       status: "OPEN",     createdAt: daysAgo(6) },
  { id: "vi_8", severity: "ERROR",    category: "API",            message: "POST /auth/login response schema missing 'mfaRequired' field.",                  artifactId: "ep-login",       status: "RESOLVED", createdAt: daysAgo(10) },
  { id: "vi_9", severity: "WARNING",  category: "SECURITY",       message: "Sensitive field 'phone' on users table is not encrypted at rest.",               artifactId: "db-users",       status: "IGNORED",  createdAt: daysAgo(14) },
];

// ───── version history ──────────────────────────────────────────
const VERSIONS = [
  { id: "v_1",  entityType: "ARTIFACT",      entityId: "svc-search",     changeType: "UPDATED", oldValue: { status: "ACTIVE" },    newValue: { status: "DRAFT" },     changedBy: USERS[2], createdAt: daysAgo(0) },
  { id: "v_2",  entityType: "RELATION",      entityId: "r_svc-orders__svc-notifs__COMMUNICATES_WITH", changeType: "LINKED", oldValue: null, newValue: { type: "COMMUNICATES_WITH" }, changedBy: USERS[1], createdAt: daysAgo(0) },
  { id: "v_3",  entityType: "DOCUMENTATION", entityId: "doc-payments",   changeType: "UPDATED", oldValue: null, newValue: { length: 1840 }, changedBy: USERS[1], createdAt: daysAgo(1) },
  { id: "v_4",  entityType: "ARTIFACT",      entityId: "api-payments",   changeType: "VALIDATED", oldValue: null, newValue: { issuesFound: 3 }, changedBy: USERS[3], createdAt: daysAgo(1) },
  { id: "v_5",  entityType: "ARTIFACT",      entityId: "svc-webhooks",   changeType: "UPDATED", oldValue: { status: "ACTIVE" },    newValue: { status: "DEPRECATED" }, changedBy: USERS[0], createdAt: daysAgo(2) },
  { id: "v_6",  entityType: "ARTIFACT",      entityId: "doc-payments",   changeType: "CREATED", oldValue: null, newValue: { type: "DOCUMENTATION", status: "DRAFT" }, changedBy: USERS[1], createdAt: daysAgo(3) },
  { id: "v_7",  entityType: "RELATION",      entityId: "r_req-pci__svc-payments__VALIDATES", changeType: "LINKED", oldValue: null, newValue: { type: "VALIDATES" }, changedBy: USERS[3], createdAt: daysAgo(4) },
  { id: "v_8",  entityType: "ARTIFACT",      entityId: "api-public",     changeType: "CREATED", oldValue: null, newValue: { type: "API_SPEC", status: "ACTIVE" }, changedBy: USERS[3], createdAt: daysAgo(7) },
  { id: "v_9",  entityType: "EXPORT",        entityId: "exp_2",          changeType: "EXPORTED", oldValue: null, newValue: { format: "PDF", sections: 8 }, changedBy: USERS[0], createdAt: daysAgo(9) },
  { id: "v_10", entityType: "ARTIFACT",      entityId: "svc-orders",     changeType: "UPDATED", oldValue: { status: "DRAFT" }, newValue: { status: "ACTIVE" }, changedBy: USERS[0], createdAt: daysAgo(12) },
];

// ───── activity feed (recent) ───────────────────────────────────
const ACTIVITY = [
  { id: "ac_1", who: USERS[2], action: "edited",   target: "Search Service",     targetId: "svc-search",   at: "12m ago" },
  { id: "ac_2", who: USERS[1], action: "linked",   target: "Orders ↔ Notifications", targetId: "svc-orders", at: "1h ago" },
  { id: "ac_3", who: USERS[3], action: "ran validation on", target: "Helix Commerce", targetId: null,        at: "3h ago" },
  { id: "ac_4", who: USERS[1], action: "updated docs",      target: "Payments Runbook",   targetId: "doc-payments", at: "yesterday" },
  { id: "ac_5", who: USERS[0], action: "deprecated",        target: "Webhooks Service",   targetId: "svc-webhooks", at: "2d ago" },
  { id: "ac_6", who: USERS[3], action: "imported API spec", target: "Public Storefront API", targetId: "api-public", at: "1w ago" },
];

// ───── previous exports ─────────────────────────────────────────
const EXPORTS = [
  { id: "exp_1", format: "PDF",      sections: 8, size: "2.4 MB", createdBy: USERS[0], createdAt: daysAgo(0), status: "READY" },
  { id: "exp_2", format: "MARKDOWN", sections: 6, size: "412 KB", createdBy: USERS[0], createdAt: daysAgo(9), status: "READY" },
  { id: "exp_3", format: "JSON",     sections: 9, size: "880 KB", createdBy: USERS[3], createdAt: daysAgo(22), status: "READY" },
];

// ───── docs content (markdown samples) ──────────────────────────
const DOC_CONTENT = {
  "doc-arch": `# Architecture Overview

The Helix Commerce platform is a set of focused services behind a public GraphQL gateway. Each service owns its own database and is reachable only through its own API.

## Services

- **Authentication Service** — issues JWTs and refresh tokens. Owns the \`users_db\`.
- **User Service** — profiles, preferences, RBAC enforcement.
- **Orders Service** — orders and fulfillment.
- **Payments Service** — Stripe + Adyen orchestration, ledger.
- **Inventory Service** — stock levels, reservations.
- **Search Service** — typo-tolerant product search.

## Request flow

\`\`\`text
Web/Mobile ──► Public Storefront API ──► [services] ──► [databases]
                                          │
                                          └─► [Stripe, SendGrid]
\`\`\`

> All inter-service calls flow over the internal mesh and carry a signed service identity token. Cross-service reads bypass the gateway.

## Where to go next

- See the [Authentication Guide](#) for token lifecycle.
- The Payments Runbook covers failed-charge recovery.
`,
  "doc-auth": `# Authentication Guide

## Token lifecycle

1. Client posts credentials to \`POST /auth/login\`.
2. On success, server returns a short-lived **access token** (15 min) and a long-lived **refresh token** (30 days, rotated).
3. Clients use the access token on every request.
4. When the access token expires, clients call \`POST /auth/refresh\` with the refresh token.

## Revocation

Sessions can be revoked from the User Service \`DELETE /sessions/:id\` endpoint.

\`\`\`mermaid
sequenceDiagram
  User->>Frontend: enter credentials
  Frontend->>AuthService: POST /auth/login
  AuthService->>UsersDB: verify password
  AuthService-->>Frontend: { accessToken, refreshToken }
\`\`\`
`,
  "doc-payments": `# Payments Runbook

## When a charge fails

1. Check Stripe dashboard for the error code.
2. If \`card_declined\` — surface a friendly message; no action.
3. If \`network_error\` — retry up to 3× with exponential backoff.

## Reconciliation

Daily ledger reconciliation runs at 02:00 UTC. Mismatches page the on-call engineer.
`,
  "doc-data": `# Data Model Reference

Source of truth for table shapes across all owned databases.

## users_db.users

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | PK |
| email | varchar | UNIQUE |
| password_hash | varchar | argon2id |
| created_at | timestamptz | default now() |
`,
};

// ───── API spec details ─────────────────────────────────────────
const API_ENDPOINTS_BY_SPEC = {
  "api-auth": [
    { id: "ep-login",   method: "POST", path: "/auth/login",   summary: "Email + password login", auth: false, linkedArtifactId: "svc-auth", status: "OK" },
    { id: "ep-refresh", method: "POST", path: "/auth/refresh", summary: "Refresh access token",   auth: true,  linkedArtifactId: "svc-auth", status: "OK" },
    { id: "ep-me",      method: "GET",  path: "/auth/me",      summary: "Current user",            auth: true,  linkedArtifactId: "svc-auth", status: "OK" },
    { id: "ep-logout",  method: "POST", path: "/auth/logout",  summary: "Revoke current session",  auth: true,  linkedArtifactId: "svc-auth", status: "OK" },
  ],
  "api-orders": [
    { id: "ep-create-order", method: "POST",  path: "/orders",      summary: "Create order from cart", auth: true, linkedArtifactId: "svc-orders", status: "OK" },
    { id: "ep-list-orders",  method: "GET",   path: "/orders",      summary: "List user's orders",      auth: true, linkedArtifactId: "svc-orders", status: "OK" },
    { id: "ep-get-order",    method: "GET",   path: "/orders/:id",  summary: "Fetch order by id",       auth: true, linkedArtifactId: "svc-orders", status: "OK" },
    { id: "ep-cancel-order", method: "POST",  path: "/orders/:id/cancel", summary: "Cancel order",      auth: true, linkedArtifactId: "svc-orders", status: "WARN" },
  ],
  "api-payments": [
    { id: "ep-pay",         method: "POST",  path: "/payments/intents",      summary: "Create payment intent", auth: true, linkedArtifactId: "svc-payments", status: "WARN" },
    { id: "ep-pay-confirm", method: "POST",  path: "/payments/intents/:id/confirm", summary: "Confirm payment intent", auth: true, linkedArtifactId: "svc-payments", status: "WARN" },
    { id: "ep-refund",      method: "POST",  path: "/payments/:id/refund",   summary: "Refund a payment",      auth: true, linkedArtifactId: "svc-payments", status: "WARN" },
  ],
  "api-search": [
    { id: "ep-search",  method: "GET", path: "/search",          summary: "Search catalog",        auth: false, linkedArtifactId: "svc-search", status: "WARN" },
    { id: "ep-suggest", method: "GET", path: "/search/suggest",  summary: "Type-ahead suggestions", auth: false, linkedArtifactId: "svc-search", status: "WARN" },
  ],
  "api-public": [
    { id: "ep-gql",     method: "POST", path: "/graphql",         summary: "GraphQL gateway",       auth: true,  linkedArtifactId: "svc-orders", status: "OK" },
  ],
};

// ───── Database entities ────────────────────────────────────────
const DB_ENTITIES = {
  "db-users": [
    { name: "users", type: "TABLE", fields: [
      { name: "id",            type: "uuid",       pk: true,  nullable: false },
      { name: "email",         type: "varchar",    unique: true, nullable: false },
      { name: "password_hash", type: "varchar",    nullable: false },
      { name: "phone",         type: "varchar",    nullable: true, warn: "Not encrypted at rest" },
      { name: "created_at",    type: "timestamptz", nullable: false, default: "now()" },
    ]},
    { name: "sessions", type: "TABLE", fields: [
      { name: "id",        type: "uuid",        pk: true, nullable: false },
      { name: "user_id",   type: "uuid",        fk: "users.id", nullable: false },
      { name: "token_hash",type: "varchar",     nullable: false },
      { name: "expires_at",type: "timestamptz", nullable: false },
    ]},
  ],
  "db-orders": [
    { name: "orders", type: "TABLE", fields: [
      { name: "id",         type: "uuid",        pk: true, nullable: false },
      { name: "user_id",    type: "uuid",        fk: "users.id", nullable: false },
      { name: "status",     type: "enum",        nullable: false },
      { name: "total_cents",type: "bigint",      nullable: false },
      { name: "created_at", type: "timestamptz", nullable: false },
    ]},
    { name: "order_lines", type: "TABLE", fields: [
      { name: "id",       type: "uuid",   pk: true },
      { name: "order_id", type: "uuid",   fk: "orders.id" },
      { name: "sku",      type: "varchar" },
      { name: "qty",      type: "int" },
    ]},
  ],
  "db-payments": [
    { name: "payment_intents", type: "TABLE", fields: [
      { name: "id",            type: "uuid",   pk: true },
      { name: "order_id",      type: "uuid",   fk: "orders.id" },
      { name: "amount_cents",  type: "bigint" },
      { name: "provider",      type: "varchar" },
      { name: "status",        type: "enum" },
    ]},
    { name: "ledger_entries", type: "TABLE", fields: [
      { name: "id",      type: "uuid", pk: true },
      { name: "intent_id", type: "uuid", fk: "payment_intents.id" },
      { name: "amount",  type: "bigint" },
      { name: "kind",    type: "enum" },
    ]},
  ],
  "db-inventory": [
    { name: "stock", type: "COLLECTION", fields: [
      { name: "sku",       type: "string" },
      { name: "available", type: "int" },
      { name: "reserved",  type: "int" },
    ]},
  ],
  "db-catalog": [
    { name: "products", type: "INDEX", fields: [
      { name: "sku",   type: "keyword" },
      { name: "title", type: "text" },
      { name: "price_cents", type: "long" },
      { name: "tags",  type: "keyword[]" },
    ]},
  ],
};

// ───── Diagrams (mermaid source) ────────────────────────────────
const DIAGRAM_SOURCE = {
  "dia-flow-auth": `sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant AS as AuthService
  participant DB as users_db
  U->>FE: enter credentials
  FE->>AS: POST /auth/login
  AS->>DB: verify password
  DB-->>AS: ok
  AS-->>FE: { accessToken, refreshToken }
  FE-->>U: redirect to dashboard`,
  "dia-arch": `flowchart LR
  Web[Web]
  Mobile[Mobile]
  GW(Public Gateway)
  Auth[[Auth Service]]
  Orders[[Orders Service]]
  Payments[[Payments Service]]
  Stripe((Stripe))
  Web --> GW
  Mobile --> GW
  GW --> Auth
  GW --> Orders
  Orders --> Payments
  Payments --> Stripe`,
};

// ───── meta: type info ──────────────────────────────────────────
const TYPE_INFO = {
  SERVICE:           { label: "Service",          icon: "Service",     color: "#3b82f6" },
  API_SPEC:          { label: "API Spec",         icon: "ApiSpec",     color: "#8b5cf6" },
  API_ENDPOINT:      { label: "Endpoint",         icon: "ApiEndpoint", color: "#a78bfa" },
  DATABASE_MODEL:    { label: "Database",         icon: "Database",    color: "#10b981" },
  DATABASE_ENTITY:   { label: "Entity",           icon: "Cube",        color: "#34d399" },
  DOCUMENTATION:     { label: "Documentation",    icon: "Doc",         color: "#f59e0b" },
  DIAGRAM:           { label: "Diagram",          icon: "Diagram",     color: "#ec4899" },
  REQUIREMENT:       { label: "Requirement",      icon: "Req",         color: "#06b6d4" },
  SECURITY_POLICY:   { label: "Security Policy",  icon: "Sec",         color: "#ef4444" },
  ENVIRONMENT:       { label: "Environment",      icon: "Env",         color: "#64748b" },
  EXTERNAL_SYSTEM:   { label: "External",         icon: "Ext",         color: "#94a3b8" },
};

const RELATION_TYPES = [
  "DEPENDS_ON", "DOCUMENTS", "IMPLEMENTS", "USES", "EXPOSES",
  "BELONGS_TO", "SECURES", "VALIDATES", "GENERATES", "DEPLOYED_TO", "COMMUNICATES_WITH",
];

const ARTIFACT_TYPES = Object.keys(TYPE_INFO);

const SEVERITIES = {
  CRITICAL: { color: "var(--c-danger)", icon: "Crit",  badge: "danger" },
  ERROR:    { color: "var(--c-danger)", icon: "Error", badge: "danger" },
  WARNING:  { color: "var(--c-warning)",icon: "Warn",  badge: "warning" },
  INFO:     { color: "var(--c-info)",   icon: "Info",  badge: "info" },
};

const CATEGORIES = ["DOCUMENTATION","API","DATABASE","SECURITY","ARCHITECTURE","RELATIONSHIP","VERSIONING"];

Object.assign(window, {
  CURRENT_USER, USERS, PROJECTS, ARTIFACTS, BY_ID, RELATIONS, ISSUES, VERSIONS, ACTIVITY, EXPORTS,
  DOC_CONTENT, API_ENDPOINTS_BY_SPEC, DB_ENTITIES, DIAGRAM_SOURCE,
  TYPE_INFO, RELATION_TYPES, ARTIFACT_TYPES, SEVERITIES, CATEGORIES,
});
