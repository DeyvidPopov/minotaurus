import bcrypt from "bcryptjs";
import {
  db,
  persist,
  resetDbForTests,
  type ApiEndpointRow,
  type ApiSpecRow,
  type ArtifactRow,
  type ArtifactStatus,
  type ArtifactType,
  type DatabaseEntityRow,
  type DatabaseFieldRow,
  type DatabaseModelRow,
  type DiagramRow,
  type ExportPackageRow,
  type HttpMethod,
  type ProjectRow,
  type RelationRow,
  type RelationType,
  type UserRow,
} from "../src/db/json-db.js";
import { newId } from "../src/utils/ids.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import {
  buildExportContent,
  type ExportFormat,
} from "../src/modules/exports/exports.engine.js";

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
- Internally talks to the User Database over the private subnet.

## Security notes
- Passwords are hashed with bcrypt (cost ≥ 10).
- Tokens are signed with the secret resolved at boot from the platform secret store.
- All credential errors return a uniform \`INVALID_CREDENTIALS\` response to avoid user enumeration.

## Future improvements
- Add WebAuthn / passkeys.
- Move to short-lived asymmetric (Ed25519) signing keys with JWKS rotation.
- Surface admin-impersonation audit logs.
`;

const DOC_GATEWAY = `# API Gateway

## Purpose
The single ingress for all customer-facing HTTP traffic. Performs routing, JWT
validation, rate limiting, and request shaping before forwarding to backend services.

## Responsibilities
- Terminate TLS.
- Validate JWTs by calling the **Authentication Service** (or verifying signature locally with the cached JWKS in the future).
- Route by path: \`/auth/*\`, \`/products/*\`, \`/orders/*\`.
- Apply per-IP and per-user rate limits.
- Emit access logs with correlation IDs.

## Dependencies
- **Authentication Service** — token introspection and login proxying.
- **Product Catalog API** — read-side traffic for the storefront.

## API / communication
- Public ingress: \`https://api.shop.example.com\`.
- Communicates with internal services over HTTP/2 on the private subnet.

## Security notes
- Strips inbound \`Authorization\` headers from public IPs that don't match the allowed-origin list.
- Adds a server-side request ID; never trusts client-supplied tracing headers.
- Denies all routes that aren't explicitly whitelisted.

## Future improvements
- Switch JWT verification to local JWKS to avoid the auth hop.
- Move config to a hot-reloadable source so route changes don't require restarts.
- Add tenant-aware quota tracking.
`;

const DOC_ORDER = `# Order Service

## Purpose
Owns the lifecycle of an order from cart submission to fulfilment. The source of
truth for everything an internal team needs to know about a customer's purchase.

## Responsibilities
- Validate cart contents against the **Product Catalog API**.
- Reserve inventory (best-effort — soft reservation, not a lock).
- Create a payment intent against the **Payment Service**.
- Persist the resulting order and emit an event for downstream consumers.

## Dependencies
- **Product Catalog API** — product existence, price, availability.
- **Payment Service** — the modern integration; preferred for all new orders.
- **Legacy Payment Service** — _deprecated._ Still wired up for one in-flight
  customer cohort and will trigger a validation error until the migration is complete.

## API / communication
- \`POST /orders\` (via the API Gateway): create order.
- \`GET /orders/:id\`: fetch by id.
- Emits \`order.created\` and \`order.fulfilled\` events on the internal bus.

## Security notes
- Never accepts price from the client; always re-reads from the Product Catalog API.
- Idempotency keys are required on \`POST /orders\` to make retries safe.

## Future improvements
- Finish the Legacy Payment Service migration and remove the dependency edge.
- Move inventory reservation from soft to a strong lock backed by Redis.
- Split fulfilment hooks into a separate, queue-driven worker.
`;

const DOC_ARCH = `# System Architecture Documentation

## Purpose
The high-level map of the Online Shop Platform — the document architects, on-call
engineers, and new joiners read first.

## Responsibilities
- Describe how requests flow from the customer browser to the data stores.
- Document which service owns which database.
- Make every external dependency obvious.
- Call out known compromises (e.g. the legacy payment integration).

## Dependencies
- This document references every artifact in the project via \`DOCUMENTS\` relations.
  It does not depend on running services.

## API / communication
N/A — this is a document, not a service. It is regenerated from the SSOT export.

## Security notes
- Do not include real customer data in examples.
- Treat the architecture diagram as internal — share with vendors only after redaction.

## Future improvements
- Add a sequence diagram for the order-creation flow.
- Add a runbook section linked from each service artifact.
- Auto-publish to the internal documentation site on every SSOT export.
`;

// ───────────────────── helpers ─────────────────────

function makeArtifact(
  user: UserRow,
  project: ProjectRow,
  now: string,
  spec: {
    title: string;
    type: ArtifactType;
    status: ArtifactStatus;
    description: string;
    tags?: string[];
    gx: number;
    gy: number;
    documentationContent?: string;
  },
): ArtifactRow {
  return {
    id: newId(),
    projectId: project.id,
    title: spec.title,
    type: spec.type,
    status: spec.status,
    description: spec.description,
    tags: spec.tags ?? [],
    gx: spec.gx,
    gy: spec.gy,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
    documentationContent: spec.documentationContent,
  };
}

function makeRelation(
  user: UserRow,
  now: string,
  source: ArtifactRow,
  target: ArtifactRow,
  type: RelationType,
  description = "",
): RelationRow {
  return {
    id: newId(),
    sourceArtifactId: source.id,
    targetArtifactId: target.id,
    relationType: type,
    description,
    createdBy: user.id,
    createdAt: now,
  };
}

function makeExport(
  user: UserRow,
  project: ProjectRow,
  format: ExportFormat,
  sections: string[],
): ExportPackageRow {
  return {
    id: newId(),
    projectId: project.id,
    format,
    sections,
    content: buildExportContent(project.id, format, sections),
    createdBy: user.id,
    createdAt: new Date().toISOString(),
  };
}

// ───────────────────── seed ─────────────────────

async function main() {
  resetDbForTests();
  const state = db();
  const now = new Date().toISOString();

  // user
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user: UserRow = {
    id: newId(),
    email: DEMO_EMAIL,
    passwordHash,
    firstName: "Deyvid",
    lastName: "Popov",
    role: "ADMIN",
    createdAt: now,
  };
  state.users.push(user);

  // project
  const project: ProjectRow = {
    id: newId(),
    name: "Online Shop Platform",
    description:
      "Reference e-commerce architecture: gateway, auth, catalog, orders, payments. Used as the thesis walkthrough demo.",
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  };
  state.projects.push(project);

  // artifacts — laid out on a rough grid so the graph view is readable
  const auth      = makeArtifact(user, project, now, { title: "Authentication Service",    type: "SERVICE",          status: "ACTIVE",     description: "Issues JWTs and validates credentials for all first-party clients.",                  tags: ["auth"],         gx: -160, gy: -40,  documentationContent: DOC_AUTH });
  const userDb    = makeArtifact(user, project, now, { title: "User Database",              type: "DATABASE_MODEL",   status: "ACTIVE",     description: "Postgres — accounts, hashed credentials, last-seen.",                                  tags: ["postgres"],     gx: -340, gy:  80 });
  const catalog   = makeArtifact(user, project, now, { title: "Product Catalog API",        type: "API_ENDPOINT",     status: "ACTIVE",     description: "Read-mostly catalog API for the storefront and internal services.",                    tags: ["rest"],         gx:  180, gy: -40 });
  const prodDb    = makeArtifact(user, project, now, { title: "Product Database",           type: "DATABASE_MODEL",   status: "ACTIVE",     description: "Postgres — products, SKUs, prices, stock counters.",                                   tags: ["postgres"],     gx:  360, gy:  80 });
  const order     = makeArtifact(user, project, now, { title: "Order Service",              type: "SERVICE",          status: "ACTIVE",     description: "Owns the order lifecycle. Talks to catalog and payment services.",                     tags: ["orders"],       gx:  100, gy: 160,  documentationContent: DOC_ORDER });
  const payment   = makeArtifact(user, project, now, { title: "Payment Service",            type: "SERVICE",          status: "ACTIVE",     description: "Modern payment integration — Stripe-backed, used for all new orders.",                 tags: ["payments"],     gx:  260, gy: 240 });
  const legacy    = makeArtifact(user, project, now, { title: "Legacy Payment Service",     type: "SERVICE",          status: "DEPRECATED", description: "Old payment integration. Scheduled for removal once the last cohort migrates.",        tags: ["legacy"],       gx:  -40, gy: 240 });
  const policy    = makeArtifact(user, project, now, { title: "JWT Security Policy",        type: "SECURITY_POLICY",  status: "ACTIVE",     description: "Signing algorithm, TTLs, audience scoping and revocation rules for JWTs.",            tags: ["security"],     gx: -340, gy: -160 });
  const gateway   = makeArtifact(user, project, now, { title: "API Gateway",                type: "SERVICE",          status: "ACTIVE",     description: "Single public ingress. Routes traffic, validates JWTs, applies rate limits.",          tags: ["gateway"],      gx:    0, gy: -160, documentationContent: DOC_GATEWAY });
  const archDoc   = makeArtifact(user, project, now, { title: "System Architecture Documentation", type: "DOCUMENTATION", status: "ACTIVE", description: "High-level map of the Online Shop Platform.",                                          tags: ["docs"],         gx:  340, gy: -200, documentationContent: DOC_ARCH });

  state.artifacts.push(
    auth, userDb, catalog, prodDb, order, payment, legacy, policy, gateway, archDoc,
  );

  // relations (10)
  // API spec — Authentication API linked to the Auth Service, with three endpoints
  const authSpec: ApiSpecRow = {
    id: newId(),
    projectId: project.id,
    artifactId: auth.id,
    title: "Authentication API",
    version: "1.0.0",
    baseUrl: "/api/auth",
    description: "Public ingress for credential exchange and identity introspection.",
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  state.apiSpecs.push(authSpec);

  const makeEndpoint = (
    path: string,
    method: HttpMethod,
    summary: string,
    requestSchema: string,
    responseSchema: string,
    requiresAuth: boolean,
  ): ApiEndpointRow => ({
    id: newId(),
    apiSpecId: authSpec.id,
    path,
    method,
    summary,
    requestSchema,
    responseSchema,
    requiresAuth,
    createdAt: now,
    updatedAt: now,
  });
  state.apiEndpoints.push(
    makeEndpoint("/auth/login",    "POST", "Issue a token for valid credentials.", '{ "email": "string", "password": "string" }', '{ "token": "string", "user": { "id": "string", "email": "string" } }', false),
    makeEndpoint("/auth/register", "POST", "Create an account and return a token.", '{ "email": "string", "password": "string", "firstName": "string", "lastName": "string" }', '{ "token": "string", "user": { ... } }', false),
    makeEndpoint("/auth/me",       "GET",  "Return the authenticated user.",        "",                                                                                  '{ "user": { "id": "string", "email": "string" } }',  true),
  );

  // Database model — User Management Database linked to the User Database artifact
  const dbModel: DatabaseModelRow = {
    id: newId(),
    projectId: project.id,
    artifactId: userDb.id,
    title: "User Management Database",
    databaseType: "PostgreSQL",
    description: "Accounts, sessions and roles for the platform.",
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  state.databaseModels.push(dbModel);

  const makeEntity = (name: string, description: string): DatabaseEntityRow => ({
    id: newId(),
    databaseModelId: dbModel.id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  });
  const usersEntity = makeEntity("users", "End-user accounts.");
  const sessionsEntity = makeEntity("sessions", "Active and revoked refresh-token sessions per user.");
  const rolesEntity = makeEntity("roles", "Role identifiers assignable to users.");
  state.databaseEntities.push(usersEntity, sessionsEntity, rolesEntity);

  const makeField = (
    entity: DatabaseEntityRow,
    name: string,
    type: string,
    opts: Partial<Omit<DatabaseFieldRow, "id" | "entityId" | "name" | "type">> = {},
  ): DatabaseFieldRow => ({
    id: newId(),
    entityId: entity.id,
    name,
    type,
    required: opts.required ?? false,
    isPrimaryKey: opts.isPrimaryKey ?? false,
    isForeignKey: opts.isForeignKey ?? !!opts.referencesEntityId,
    referencesEntityId: opts.referencesEntityId ?? null,
    description: opts.description ?? "",
  });

  // Architecture Overview diagram linked to the API Gateway
  const archDiagram: DiagramRow = {
    id: newId(),
    projectId: project.id,
    artifactId: gateway.id,
    title: "Architecture Overview",
    type: "ARCHITECTURE",
    mermaidSource: `flowchart TD
  Client[Client browser] --> API_Gateway[API Gateway]
  API_Gateway --> Auth_Service[Authentication Service]
  API_Gateway --> Product_Service[Product Catalog API]
  Auth_Service --> User_DB[(User Database)]
  Product_Service --> Product_DB[(Product Database)]
  Order_Service[Order Service] --> Product_Service
  Order_Service --> Payment_Service[Payment Service]
  Order_Service --> Legacy_Payment_Service[Legacy Payment Service]`,
    description: "High-level request flow through the Online Shop Platform.",
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  state.diagrams.push(archDiagram);

  state.databaseFields.push(
    // users
    makeField(usersEntity, "id",            "uuid",        { isPrimaryKey: true, required: true }),
    makeField(usersEntity, "email",         "text",        { required: true }),
    makeField(usersEntity, "password_hash", "text",        { required: true }),
    makeField(usersEntity, "created_at",    "timestamptz", { required: true }),
    // sessions
    makeField(sessionsEntity, "id",          "uuid",        { isPrimaryKey: true, required: true }),
    makeField(sessionsEntity, "user_id",     "uuid",        { isForeignKey: true, referencesEntityId: usersEntity.id, required: true, description: "Owning user" }),
    makeField(sessionsEntity, "expires_at",  "timestamptz", { required: true }),
    makeField(sessionsEntity, "revoked_at",  "timestamptz"),
    // roles
    makeField(rolesEntity, "id",   "uuid", { isPrimaryKey: true, required: true }),
    makeField(rolesEntity, "name", "text", { required: true }),
  );

  state.relations.push(
    makeRelation(user, now, auth,    userDb,  "DEPENDS_ON",        "Auth Service reads/writes user records."),
    makeRelation(user, now, policy,  auth,    "SECURES",           "JWT policy governs the Authentication Service."),
    makeRelation(user, now, gateway, auth,    "COMMUNICATES_WITH", "Gateway delegates token checks to Auth."),
    makeRelation(user, now, gateway, catalog, "COMMUNICATES_WITH", "Gateway routes /products/* to the catalog API."),
    makeRelation(user, now, catalog, prodDb,  "DEPENDS_ON",        "Catalog API reads product rows from Postgres."),
    makeRelation(user, now, order,   catalog, "USES",              "Order Service validates carts against the catalog."),
    makeRelation(user, now, order,   payment, "DEPENDS_ON",        "Modern payment integration — preferred."),
    makeRelation(user, now, order,   legacy,  "DEPENDS_ON",        "Legacy integration kept for one cohort — pending migration."),
    makeRelation(user, now, archDoc, gateway, "DOCUMENTS",         "Architecture doc covers the gateway."),
    makeRelation(user, now, archDoc, order,   "DOCUMENTS",         "Architecture doc covers the order flow."),
  );

  persist();

  // validation — runs against the artifacts/relations we just persisted
  const issues = runValidationForProject(project.id);

  // exports (one rich JSON, one Markdown for human reading)
  const jsonExport = makeExport(user, project, "JSON", [
    "ARTIFACTS",
    "RELATIONS",
    "API_SPECS",
    "DATABASE_MODELS",
    "DIAGRAMS",
    "GRAPH",
    "VALIDATION_REPORT",
  ]);
  const markdownExport = makeExport(user, project, "MARKDOWN", [
    "ARTIFACTS",
    "API_SPECS",
    "DATABASE_MODELS",
    "DIAGRAMS",
    "RELATIONS",
    "VALIDATION_REPORT",
  ]);
  state.exports.push(jsonExport, markdownExport);

  persist();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        demoUser: { email: DEMO_EMAIL, password: DEMO_PASSWORD, id: user.id },
        project: { id: project.id, name: project.name },
        artifacts: state.artifacts.map((a) => ({ id: a.id, title: a.title, status: a.status })),
        relations: state.relations.map((r) => r.id),
        apiSpecs: state.apiSpecs.map((s) => ({ id: s.id, title: s.title, endpointCount: state.apiEndpoints.filter((e) => e.apiSpecId === s.id).length })),
        databaseModels: state.databaseModels.map((m) => ({
          id: m.id,
          title: m.title,
          entityCount: state.databaseEntities.filter((e) => e.databaseModelId === m.id).length,
        })),
        diagrams: state.diagrams.map((d) => ({ id: d.id, title: d.title, type: d.type })),
        validation: {
          issueCount: issues.length,
          severities: issues.reduce<Record<string, number>>((acc, v) => {
            acc[v.severity] = (acc[v.severity] || 0) + 1;
            return acc;
          }, {}),
        },
        exports: [
          { id: jsonExport.id, format: jsonExport.format, sections: jsonExport.sections },
          { id: markdownExport.id, format: markdownExport.format, sections: markdownExport.sections },
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
