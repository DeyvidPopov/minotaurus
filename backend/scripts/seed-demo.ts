import bcrypt from "bcryptjs";
import {
  ArtifactStatus,
  ArtifactType,
  DatabaseType,
  DiagramType,
  HttpMethod,
  RelationType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { recordVersionEvent } from "../src/modules/versions/versions.engine.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import { buildExportContent } from "../src/modules/exports/exports.engine.js";

const DEMO_EMAIL = "deyvid@minotaurus.dev";
const DEMO_PASSWORD = "minotaurus";

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

## API / communication
- Exposed to clients through the **API Gateway** at \`POST /auth/login\`, \`POST /auth/register\`, \`GET /auth/me\`.

## Security notes
- Passwords are hashed with bcrypt (cost ≥ 10).
- Tokens are signed with the secret resolved at boot from the platform secret store.

## Future improvements
- Add WebAuthn / passkeys.
- Move to short-lived asymmetric (Ed25519) signing keys with JWKS rotation.
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

## Future improvements
- Switch JWT verification to local JWKS to avoid the auth hop.
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

## Future improvements
- Finish the Legacy Payment Service migration and remove the dependency edge.
`;

const DOC_ARCH = `# System Architecture Documentation

## Purpose
The high-level map of the Online Shop Platform.

## Responsibilities
- Describe how requests flow from the customer browser to the data stores.
- Document which service owns which database.
- Make every external dependency obvious.
- Call out known compromises (e.g. the legacy payment integration).

## Future improvements
- Add a sequence diagram for the order-creation flow.
- Auto-publish to the internal documentation site on every SSOT export.
`;

// ───────────────────── helpers ─────────────────────

interface ArtifactSpec {
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  description: string;
  tags?: string[];
  gx: number;
  gy: number;
  documentationContent?: string;
}

async function main() {
  // Wipe in dependency-safe order. Postgres FK cascades will handle most of
  // it, but explicit deletes keep the seed re-runnable.
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
    prisma.project.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── users ──
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      firstName: "Deyvid",
      lastName: "Popov",
      role: "ADMIN",
    },
  });

  const teamPasswordHash = await bcrypt.hash("minotaurus", 10);
  const maya = await prisma.user.create({
    data: { email: "maya@helix.dev",  passwordHash: teamPasswordHash, firstName: "Maya", lastName: "Okafor",  role: "ENGINEER"  },
  });
  const iris = await prisma.user.create({
    data: { email: "iris@helix.dev",  passwordHash: teamPasswordHash, firstName: "Iris", lastName: "Lindholm", role: "ARCHITECT" },
  });
  const ren = await prisma.user.create({
    data: { email: "ren@helix.dev",   passwordHash: teamPasswordHash, firstName: "Ren",  lastName: "Tanaka",   role: "ENGINEER"  },
  });

  // ── project ──
  const project = await prisma.project.create({
    data: {
      name: "Online Shop Platform",
      description:
        "Reference e-commerce architecture: gateway, auth, catalog, orders, payments. Used as the thesis walkthrough demo.",
      ownerId: user.id,
    },
  });

  // ── memberships ──
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: user.id, role: "OWNER" },
      { projectId: project.id, userId: iris.id, role: "ARCHITECT" },
      { projectId: project.id, userId: maya.id, role: "DEVELOPER" },
      { projectId: project.id, userId: ren.id,  role: "VIEWER" },
    ],
  });

  // ── artifacts ──
  const specs: Record<string, ArtifactSpec> = {
    auth:    { title: "Authentication Service",         type: "SERVICE",          status: "ACTIVE",     description: "Issues JWTs and validates credentials for all first-party clients.", tags: ["auth"],       gx: -160, gy: -40, documentationContent: DOC_AUTH },
    userDb:  { title: "User Database",                  type: "DATABASE_MODEL",   status: "ACTIVE",     description: "Postgres — accounts, hashed credentials, last-seen.",                tags: ["postgres"],   gx: -340, gy:  80 },
    catalog: { title: "Product Catalog API",            type: "API_ENDPOINT",     status: "ACTIVE",     description: "Read-mostly catalog API for the storefront and internal services.",  tags: ["rest"],       gx:  180, gy: -40 },
    prodDb:  { title: "Product Database",               type: "DATABASE_MODEL",   status: "ACTIVE",     description: "Postgres — products, SKUs, prices, stock counters.",                tags: ["postgres"],   gx:  360, gy:  80 },
    order:   { title: "Order Service",                  type: "SERVICE",          status: "ACTIVE",     description: "Owns the order lifecycle. Talks to catalog and payment services.",  tags: ["orders"],     gx:  100, gy: 160, documentationContent: DOC_ORDER },
    payment: { title: "Payment Service",                type: "SERVICE",          status: "ACTIVE",     description: "Modern payment integration — Stripe-backed, used for all new orders.", tags: ["payments"], gx:  260, gy: 240 },
    legacy:  { title: "Legacy Payment Service",         type: "SERVICE",          status: "DEPRECATED", description: "Old payment integration. Scheduled for removal once the last cohort migrates.", tags: ["legacy"], gx: -40, gy: 240 },
    policy:  { title: "JWT Security Policy",            type: "SECURITY_POLICY",  status: "ACTIVE",     description: "Signing algorithm, TTLs, audience scoping and revocation rules for JWTs.", tags: ["security"], gx: -340, gy: -160 },
    gateway: { title: "API Gateway",                    type: "SERVICE",          status: "ACTIVE",     description: "Single public ingress. Routes traffic, validates JWTs, applies rate limits.", tags: ["gateway"], gx: 0, gy: -160, documentationContent: DOC_GATEWAY },
    archDoc: { title: "System Architecture Documentation", type: "DOCUMENTATION", status: "ACTIVE",     description: "High-level map of the Online Shop Platform.",                       tags: ["docs"],       gx:  340, gy: -200, documentationContent: DOC_ARCH },
  };

  const artifactRows: Record<string, { id: string; title: string; type: ArtifactType; status: ArtifactStatus; documentationContent: string | null }> = {};
  for (const [key, s] of Object.entries(specs)) {
    const created = await prisma.artifact.create({
      data: {
        projectId: project.id,
        title: s.title,
        type: s.type,
        status: s.status,
        description: s.description,
        tags: s.tags ?? [],
        gx: s.gx,
        gy: s.gy,
        createdById: user.id,
        documentationContent: s.documentationContent,
      },
    });
    artifactRows[key] = {
      id: created.id,
      title: created.title,
      type: created.type,
      status: created.status,
      documentationContent: created.documentationContent,
    };
  }

  const a = artifactRows;

  // ── relations ──
  const relationSpecs: { source: string; target: string; type: RelationType; description: string }[] = [
    { source: "auth",    target: "userDb",  type: "DEPENDS_ON",        description: "Auth Service reads/writes user records." },
    { source: "policy",  target: "auth",    type: "SECURES",           description: "JWT policy governs the Authentication Service." },
    { source: "gateway", target: "auth",    type: "COMMUNICATES_WITH", description: "Gateway delegates token checks to Auth." },
    { source: "gateway", target: "catalog", type: "COMMUNICATES_WITH", description: "Gateway routes /products/* to the catalog API." },
    { source: "catalog", target: "prodDb",  type: "DEPENDS_ON",        description: "Catalog API reads product rows from Postgres." },
    { source: "order",   target: "catalog", type: "USES",              description: "Order Service validates carts against the catalog." },
    { source: "order",   target: "payment", type: "DEPENDS_ON",        description: "Modern payment integration — preferred." },
    { source: "order",   target: "legacy",  type: "DEPENDS_ON",        description: "Legacy integration kept for one cohort — pending migration." },
    { source: "archDoc", target: "gateway", type: "DOCUMENTS",         description: "Architecture doc covers the gateway." },
    { source: "archDoc", target: "order",   type: "DOCUMENTS",         description: "Architecture doc covers the order flow." },
  ];
  const relationRows: { id: string; sourceArtifactId: string; targetArtifactId: string; relationType: RelationType; sourceKey: string; targetKey: string }[] = [];
  for (const r of relationSpecs) {
    const created = await prisma.artifactRelation.create({
      data: {
        sourceArtifactId: a[r.source].id,
        targetArtifactId: a[r.target].id,
        relationType: r.type,
        description: r.description,
        createdById: user.id,
      },
    });
    relationRows.push({
      id: created.id,
      sourceArtifactId: created.sourceArtifactId,
      targetArtifactId: created.targetArtifactId,
      relationType: created.relationType,
      sourceKey: r.source,
      targetKey: r.target,
    });
  }

  // ── API spec ──
  const authSpec = await prisma.apiSpec.create({
    data: {
      projectId: project.id,
      artifactId: a.auth.id,
      title: "Authentication API",
      version: "1.0.0",
      baseUrl: "/api/auth",
      description: "Public ingress for credential exchange and identity introspection.",
      createdById: user.id,
    },
  });

  const endpointSpecs: { path: string; method: HttpMethod; summary: string; requestSchema: string; responseSchema: string; requiresAuth: boolean }[] = [
    { path: "/auth/login",    method: "POST", summary: "Issue a token for valid credentials.", requestSchema: '{ "email": "string", "password": "string" }', responseSchema: '{ "token": "string", "user": { "id": "string", "email": "string" } }', requiresAuth: false },
    { path: "/auth/register", method: "POST", summary: "Create an account and return a token.", requestSchema: '{ "email": "string", "password": "string", "firstName": "string", "lastName": "string" }', responseSchema: '{ "token": "string", "user": { ... } }', requiresAuth: false },
    { path: "/auth/me",       method: "GET",  summary: "Return the authenticated user.",        requestSchema: "",                                                                                  responseSchema: '{ "user": { "id": "string", "email": "string" } }',  requiresAuth: true  },
  ];
  const endpointRows: { id: string; path: string; method: HttpMethod }[] = [];
  for (const ep of endpointSpecs) {
    const created = await prisma.apiEndpoint.create({
      data: { apiSpecId: authSpec.id, ...ep },
    });
    endpointRows.push({ id: created.id, path: created.path, method: created.method });
  }

  // ── Database model ──
  const dbModel = await prisma.databaseModel.create({
    data: {
      projectId: project.id,
      artifactId: a.userDb.id,
      title: "User Management Database",
      databaseType: "PostgreSQL",
      description: "Accounts, sessions and roles for the platform.",
      createdById: user.id,
    },
  });
  const usersEntity = await prisma.databaseEntity.create({
    data: { databaseModelId: dbModel.id, name: "users", description: "End-user accounts." },
  });
  const sessionsEntity = await prisma.databaseEntity.create({
    data: { databaseModelId: dbModel.id, name: "sessions", description: "Active and revoked refresh-token sessions per user." },
  });
  const rolesEntity = await prisma.databaseEntity.create({
    data: { databaseModelId: dbModel.id, name: "roles", description: "Role identifiers assignable to users." },
  });

  await prisma.databaseField.createMany({
    data: [
      { entityId: usersEntity.id,    name: "id",            type: "uuid",        isPrimaryKey: true, required: true },
      { entityId: usersEntity.id,    name: "email",         type: "text",        required: true },
      { entityId: usersEntity.id,    name: "password_hash", type: "text",        required: true },
      { entityId: usersEntity.id,    name: "created_at",    type: "timestamptz", required: true },
      { entityId: sessionsEntity.id, name: "id",            type: "uuid",        isPrimaryKey: true, required: true },
      { entityId: sessionsEntity.id, name: "user_id",       type: "uuid",        isForeignKey: true, referencesEntityId: usersEntity.id, required: true, description: "Owning user" },
      { entityId: sessionsEntity.id, name: "expires_at",    type: "timestamptz", required: true },
      { entityId: sessionsEntity.id, name: "revoked_at",    type: "timestamptz" },
      { entityId: rolesEntity.id,    name: "id",            type: "uuid",        isPrimaryKey: true, required: true },
      { entityId: rolesEntity.id,    name: "name",          type: "text",        required: true },
    ],
  });

  // ── Diagram ──
  const archDiagram = await prisma.diagram.create({
    data: {
      projectId: project.id,
      artifactId: a.gateway.id,
      title: "Architecture Overview",
      type: "ARCHITECTURE",
      mermaidSource: `flowchart TD
  Client["Client browser"] --> API_Gateway["API Gateway"]
  API_Gateway --> Auth_Service["Authentication Service"]
  API_Gateway --> Product_Service["Product Catalog API"]
  Auth_Service --> User_DB[("User Database")]
  Product_Service --> Product_DB[("Product Database")]
  Order_Service["Order Service"] --> Product_Service
  Order_Service --> Payment_Service["Payment Service"]
  Order_Service --> Legacy_Payment_Service["Legacy Payment Service"]`,
      description: "High-level request flow through the Online Shop Platform.",
      createdById: user.id,
    },
  });

  // ── Version history: backfill realistic events spanning ~12 days ──
  const baseTime = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number, hour = 12, minute = 0) => {
    const t = baseTime - daysAgo * dayMs;
    const d = new Date(t);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };

  const events: Parameters<typeof recordVersionEvent>[0][] = [
    // Day 13 — David spins up the project and invites the team
    { projectId: project.id, entityType: "PROJECT",         entityId: project.id,      action: "CREATED", title: project.name,    description: "Project created",                     triggeredBy: user.id,  at: at(13, 8, 0) },
    { projectId: project.id, entityType: "PROJECT",         entityId: project.id,      action: "LINKED",  title: "Iris Lindholm joined project as ARCHITECT", description: "Member added", triggeredBy: user.id, metadata: { memberUserId: iris.id, role: "ARCHITECT" }, at: at(13, 8, 30) },
    { projectId: project.id, entityType: "PROJECT",         entityId: project.id,      action: "LINKED",  title: "Maya Okafor joined project as DEVELOPER",   description: "Member added", triggeredBy: user.id, metadata: { memberUserId: maya.id, role: "DEVELOPER" }, at: at(13, 8, 32) },
    { projectId: project.id, entityType: "PROJECT",         entityId: project.id,      action: "LINKED",  title: "Ren Tanaka joined project as VIEWER",       description: "Member added", triggeredBy: user.id, metadata: { memberUserId: ren.id,  role: "VIEWER" },    at: at(13, 8, 35) },
    // Day 12 — David lays down the security-critical artifacts
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.auth.id,       action: "CREATED", title: a.auth.title,    description: "SERVICE (ACTIVE)",                    triggeredBy: user.id,  at: at(12, 9, 14) },
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.userDb.id,     action: "CREATED", title: a.userDb.title,  description: "DATABASE_MODEL",                      triggeredBy: user.id,  at: at(12, 9, 32) },
    // Day 11 — Maya models the user database
    { projectId: project.id, entityType: "DATABASE_MODEL",  entityId: dbModel.id,      action: "CREATED", title: dbModel.title,   description: "PostgreSQL",                          triggeredBy: maya.id,  metadata: { databaseType: "PostgreSQL" }, at: at(11, 11, 5) },
    { projectId: project.id, entityType: "DATABASE_ENTITY", entityId: usersEntity.id,  action: "CREATED", title: usersEntity.name,    description: "Added to User Management Database", triggeredBy: maya.id,  metadata: { databaseModelId: dbModel.id }, at: at(11, 11, 10) },
    { projectId: project.id, entityType: "DATABASE_ENTITY", entityId: sessionsEntity.id, action: "CREATED", title: sessionsEntity.name, description: "Added to User Management Database", triggeredBy: maya.id,  metadata: { databaseModelId: dbModel.id }, at: at(11, 11, 12) },
    { projectId: project.id, entityType: "DATABASE_ENTITY", entityId: rolesEntity.id,  action: "CREATED", title: rolesEntity.name, description: "Added to User Management Database", triggeredBy: maya.id,  metadata: { databaseModelId: dbModel.id }, at: at(11, 11, 14) },
    // Day 10 — Iris adds the catalog + product DB
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.catalog.id,    action: "CREATED", title: a.catalog.title, description: "API_ENDPOINT",                        triggeredBy: iris.id,  at: at(10, 14, 2) },
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.prodDb.id,     action: "CREATED", title: a.prodDb.title,  description: "DATABASE_MODEL",                      triggeredBy: iris.id,  at: at(10, 14, 10) },
    // Day 9 — Iris designs gateway + order + payment
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.gateway.id,    action: "CREATED", title: a.gateway.title, description: "SERVICE",                             triggeredBy: iris.id,  at: at(9,  10, 0) },
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.order.id,      action: "CREATED", title: a.order.title,   description: "SERVICE",                             triggeredBy: iris.id,  at: at(9,  10, 20) },
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.payment.id,    action: "CREATED", title: a.payment.title, description: "SERVICE",                             triggeredBy: iris.id,  at: at(9,  10, 40) },
    // Day 8 — David flags the legacy service for removal
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.legacy.id,     action: "CREATED", title: a.legacy.title,  description: "SERVICE (DEPRECATED)",                triggeredBy: user.id,  at: at(8,  9, 30) },
    // Day 7 — Maya writes the auth API spec + its endpoints
    { projectId: project.id, entityType: "API_SPEC",        entityId: authSpec.id,     action: "CREATED", title: authSpec.title,  description: `v${authSpec.version} · ${authSpec.baseUrl}`, triggeredBy: maya.id,  metadata: { version: authSpec.version }, at: at(7, 13, 15) },
    { projectId: project.id, entityType: "API_ENDPOINT",    entityId: endpointRows[0].id, action: "CREATED", title: `${endpointRows[0].method} ${endpointRows[0].path}`, description: `Added to "${authSpec.title}"`, triggeredBy: maya.id,  metadata: { specId: authSpec.id }, at: at(7, 13, 16) },
    { projectId: project.id, entityType: "API_ENDPOINT",    entityId: endpointRows[1].id, action: "CREATED", title: `${endpointRows[1].method} ${endpointRows[1].path}`, description: `Added to "${authSpec.title}"`, triggeredBy: maya.id,  metadata: { specId: authSpec.id }, at: at(7, 13, 17) },
    { projectId: project.id, entityType: "API_ENDPOINT",    entityId: endpointRows[2].id, action: "CREATED", title: `${endpointRows[2].method} ${endpointRows[2].path}`, description: `Added to "${authSpec.title}"`, triggeredBy: maya.id,  metadata: { specId: authSpec.id }, at: at(7, 13, 18) },
    // Day 6 — Iris wires the dependency edges
    { projectId: project.id, entityType: "RELATION",        entityId: relationRows[0].id, action: "LINKED",  title: `${a.auth.title} → ${a.userDb.title}`, description: "DEPENDS_ON",        triggeredBy: iris.id,  metadata: { relationType: "DEPENDS_ON", sourceArtifactId: a.auth.id, targetArtifactId: a.userDb.id }, at: at(6, 11, 0) },
    { projectId: project.id, entityType: "RELATION",        entityId: relationRows[2].id, action: "LINKED",  title: `${a.gateway.title} → ${a.auth.title}`, description: "COMMUNICATES_WITH", triggeredBy: iris.id,  metadata: { relationType: "COMMUNICATES_WITH", sourceArtifactId: a.gateway.id, targetArtifactId: a.auth.id }, at: at(6, 11, 5) },
    // Day 5 — Iris draws the architecture overview
    { projectId: project.id, entityType: "DIAGRAM",         entityId: archDiagram.id,    action: "CREATED", title: archDiagram.title, description: archDiagram.type, triggeredBy: iris.id,  metadata: { type: archDiagram.type }, at: at(5, 16, 30) },
    // Day 4 — Maya writes the docs
    { projectId: project.id, entityType: "DOCUMENTATION",   entityId: a.auth.id,         action: "CREATED", title: a.auth.title,    description: "Documentation created", triggeredBy: maya.id,  metadata: { length: (a.auth.documentationContent ?? "").length }, at: at(4, 10, 0) },
    { projectId: project.id, entityType: "DOCUMENTATION",   entityId: a.gateway.id,      action: "CREATED", title: a.gateway.title, description: "Documentation created", triggeredBy: maya.id,  metadata: { length: (a.gateway.documentationContent ?? "").length }, at: at(4, 10, 30) },
    { projectId: project.id, entityType: "DOCUMENTATION",   entityId: a.order.id,        action: "CREATED", title: a.order.title,   description: "Documentation created", triggeredBy: maya.id,  metadata: { length: (a.order.documentationContent ?? "").length }, at: at(4, 11, 0) },
    { projectId: project.id, entityType: "DOCUMENTATION",   entityId: a.archDoc.id,      action: "CREATED", title: a.archDoc.title, description: "Documentation created", triggeredBy: maya.id,  metadata: { length: (a.archDoc.documentationContent ?? "").length }, at: at(4, 11, 30) },
    // Day 3 — David updates auth status, Iris promotes Maya, Ren reviews
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.auth.id,         action: "UPDATED", title: a.auth.title,    description: "status, tags",          triggeredBy: user.id,  metadata: { changed: ["status", "tags"] }, at: at(3, 14, 0) },
    // Day 2 — Iris tweaks the gateway description, Maya polishes the DB model
    { projectId: project.id, entityType: "ARTIFACT",        entityId: a.gateway.id,      action: "UPDATED", title: a.gateway.title, description: "description",          triggeredBy: iris.id,  metadata: { changed: ["description"] },   at: at(2, 9, 0) },
    { projectId: project.id, entityType: "DATABASE_MODEL",  entityId: dbModel.id,        action: "UPDATED", title: dbModel.title,   description: "description",          triggeredBy: maya.id,  metadata: { changed: ["description"] },   at: at(2, 9, 30) },
  ];

  for (const e of events) await recordVersionEvent(e);

  // ── Validation ──
  const issues = await runValidationForProject(project.id, user.id);

  // ── Exports ──
  const jsonSections = [
    "TEAM",
    "ARTIFACTS",
    "RELATIONS",
    "API_SPECS",
    "DATABASE_MODELS",
    "DIAGRAMS",
    "GRAPH",
    "VALIDATION_REPORT",
    "VERSION_HISTORY",
    "IMPACT_ANALYSIS",
  ];
  const mdSections = [
    "TEAM",
    "ARTIFACTS",
    "API_SPECS",
    "DATABASE_MODELS",
    "DIAGRAMS",
    "RELATIONS",
    "VALIDATION_REPORT",
    "VERSION_HISTORY",
  ];
  const jsonContent = await buildExportContent(project.id, "JSON", jsonSections);
  const mdContent = await buildExportContent(project.id, "MARKDOWN", mdSections);
  await prisma.exportPackage.create({
    data: {
      projectId: project.id,
      format: "JSON",
      sections: jsonSections,
      content: jsonContent as Prisma.InputJsonValue,
      createdById: user.id,
    },
  });
  await prisma.exportPackage.create({
    data: {
      projectId: project.id,
      format: "MARKDOWN",
      sections: mdSections,
      content: mdContent as Prisma.InputJsonValue,
      createdById: user.id,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        demoUser: { email: DEMO_EMAIL, password: DEMO_PASSWORD, id: user.id },
        project: { id: project.id, name: project.name },
        artifacts: Object.values(artifactRows).map((x) => ({ id: x.id, title: x.title, status: x.status })),
        relationCount: relationRows.length,
        apiSpec: { id: authSpec.id, endpointCount: endpointRows.length },
        dbModel: { id: dbModel.id, entityCount: 3 },
        diagrams: [{ id: archDiagram.id, type: archDiagram.type }],
        validationIssueCount: issues.length,
        versionEventCount: await prisma.versionEvent.count({ where: { projectId: project.id } }),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
