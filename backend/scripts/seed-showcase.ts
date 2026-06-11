// seed-showcase.ts — additive, idempotent showcase seed.
//
// Creates a moderate set of demo *users*, each owning one well-developed project
// (artifacts, relations, an API spec, a database model with precise FKs, an
// architecture diagram, generated documentation, a ~2-week version-history
// timeline, a validation run, and JSON + Markdown exports), plus cross-project
// memberships so the collaboration features have real data.
//
// Unlike `npm run seed` (seed-demo.ts) this script is NON-destructive: it never
// calls deleteMany and never trips the destructive guard, so it is safe to run
// against a fresh production database to populate it. It is idempotent — users
// are upserted and a project that already exists (by owner + name) is skipped —
// so re-running only refreshes passwords and fills in anything missing.
//
// Each run generates a fresh unique strong password per user and writes them to
// DEMO_USERS.md + DEMO_USERS.json at the repo root (both gitignored — they hold
// plaintext credentials). Re-running rotates the passwords and rewrites the file.
//
// Run:  cd backend && npm run seed:showcase   (after `npm run seed`, or standalone)

import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import bcrypt from "bcryptjs";
import {
  ArtifactStatus,
  ArtifactType,
  DatabaseType,
  DiagramType,
  HttpMethod,
  ProjectRole,
  RelationType,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { recordVersionEvent } from "../src/modules/versions/versions.engine.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import { buildExportContent } from "../src/modules/exports/exports.engine.js";
import { normalizeArtifactTitle } from "../src/modules/artifacts/artifact-title.js";

// ───────────────────────────── spec types ─────────────────────────────

interface UserDef {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

interface ArtifactDef {
  key: string;
  title: string;
  type: ArtifactType;
  status?: ArtifactStatus;
  description: string;
  tags?: string[];
  /** When true (default for documentable types) a doc body is generated. */
  doc?: boolean;
}

interface RelationDef {
  from: string;
  to: string;
  type: RelationType;
  description?: string;
}

interface EndpointDef {
  method: HttpMethod;
  path: string;
  summary: string;
  requestSchema?: string;
  responseSchema?: string;
  requiresAuth?: boolean;
}

interface ApiSpecDef {
  title: string;
  artifactKey?: string;
  version?: string;
  baseUrl?: string;
  description?: string;
  endpoints: EndpointDef[];
}

interface FieldDef {
  name: string;
  type?: string;
  pk?: boolean;
  required?: boolean;
  fk?: { entity: string; field?: string };
  description?: string;
}

interface EntityDef {
  name: string;
  description?: string;
  fields: FieldDef[];
}

interface DbModelDef {
  title: string;
  artifactKey?: string;
  databaseType?: DatabaseType;
  description?: string;
  entities: EntityDef[];
}

interface MemberDef {
  userKey: string;
  role: ProjectRole;
}

interface ProjectDef {
  ownerKey: string;
  name: string;
  description: string;
  members: MemberDef[];
  artifacts: ArtifactDef[];
  relations: RelationDef[];
  apiSpecs: ApiSpecDef[];
  dbModels: DbModelDef[];
}

// ───────────────────────────── users ─────────────────────────────

const USERS: UserDef[] = [
  { key: "ava", email: "ava.chen@demo.minotaurus.dev", firstName: "Ava", lastName: "Chen", role: UserRole.ARCHITECT },
  { key: "leo", email: "leo.martins@demo.minotaurus.dev", firstName: "Leo", lastName: "Martins", role: UserRole.ENGINEER },
  { key: "priya", email: "priya.nair@demo.minotaurus.dev", firstName: "Priya", lastName: "Nair", role: UserRole.ARCHITECT },
  { key: "mateo", email: "mateo.silva@demo.minotaurus.dev", firstName: "Mateo", lastName: "Silva", role: UserRole.ENGINEER },
  { key: "sora", email: "sora.tan@demo.minotaurus.dev", firstName: "Sora", lastName: "Tan", role: UserRole.ENGINEER },
  { key: "nina", email: "nina.kowalski@demo.minotaurus.dev", firstName: "Nina", lastName: "Kowalski", role: UserRole.ARCHITECT },
  { key: "omar", email: "omar.haddad@demo.minotaurus.dev", firstName: "Omar", lastName: "Haddad", role: UserRole.ENGINEER },
  { key: "yara", email: "yara.costa@demo.minotaurus.dev", firstName: "Yara", lastName: "Costa", role: UserRole.ENGINEER },
];

// ───────────────────────────── project specs ─────────────────────────────

const SERVICE = ArtifactType.SERVICE;
const DBMODEL = ArtifactType.DATABASE_MODEL;
const EXTERNAL = ArtifactType.EXTERNAL_SYSTEM;
const POLICY = ArtifactType.SECURITY_POLICY;
const DOCS = ArtifactType.DOCUMENTATION;

const PROJECTS: ProjectDef[] = [
  // 1 ── ShopSphere (e-commerce)
  {
    ownerKey: "ava",
    name: "ShopSphere Commerce",
    description:
      "Cloud-native storefront platform: API gateway, identity, catalog, cart and checkout backed by an orders database and a third-party payment gateway.",
    members: [
      { userKey: "leo", role: ProjectRole.ARCHITECT },
      { userKey: "yara", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "gw", title: "API Gateway", type: SERVICE, description: "Single public ingress; routes traffic, validates JWTs and applies rate limits.", tags: ["gateway"] },
      { key: "identity", title: "Identity Service", type: SERVICE, description: "Issues and validates tokens; owns sign-up, login and session rotation.", tags: ["auth"] },
      { key: "catalog", title: "Catalog Service", type: SERVICE, description: "Read-mostly product, SKU and pricing service for the storefront.", tags: ["catalog"] },
      { key: "cart", title: "Cart Service", type: SERVICE, description: "Holds per-session carts and validates lines against the catalog.", tags: ["cart"] },
      { key: "checkout", title: "Checkout Service", type: SERVICE, description: "Orchestrates order placement, inventory reservation and payment intents.", tags: ["orders"] },
      { key: "payment", title: "Stripe Payment Gateway", type: EXTERNAL, description: "External PSP used for card authorization and capture.", tags: ["payments", "external"] },
      { key: "ordersDb", title: "Orders Database", type: DBMODEL, description: "Postgres — orders, line items and payment records.", tags: ["postgres"] },
      { key: "authPolicy", title: "Authentication Policy", type: POLICY, description: "Token algorithm, TTLs, audience scoping and rotation rules.", tags: ["security"] },
      { key: "archDoc", title: "Architecture Overview", type: DOCS, description: "High-level map of the ShopSphere platform." },
    ],
    relations: [
      { from: "gw", to: "identity", type: RelationType.COMMUNICATES_WITH, description: "Gateway delegates token checks to Identity." },
      { from: "gw", to: "catalog", type: RelationType.COMMUNICATES_WITH },
      { from: "gw", to: "cart", type: RelationType.COMMUNICATES_WITH },
      { from: "cart", to: "catalog", type: RelationType.USES, description: "Cart validates lines against the catalog." },
      { from: "checkout", to: "cart", type: RelationType.DEPENDS_ON },
      { from: "checkout", to: "payment", type: RelationType.DEPENDS_ON, description: "Creates and captures payment intents." },
      { from: "checkout", to: "ordersDb", type: RelationType.DEPENDS_ON },
      { from: "authPolicy", to: "identity", type: RelationType.SECURES },
      { from: "archDoc", to: "gw", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Storefront API",
        artifactKey: "gw",
        baseUrl: "/api",
        description: "Public storefront surface exposed through the gateway.",
        endpoints: [
          { method: HttpMethod.GET, path: "/products", summary: "List catalog products.", responseSchema: '{ "items": [{ "id": "string", "name": "string", "price": "number" }] }' },
          { method: HttpMethod.GET, path: "/products/:id", summary: "Fetch one product." },
          { method: HttpMethod.POST, path: "/cart/items", summary: "Add a line to the cart.", requestSchema: '{ "productId": "string", "qty": "number" }', requiresAuth: true },
          { method: HttpMethod.POST, path: "/checkout", summary: "Place an order from the cart.", requestSchema: '{ "cartId": "string", "paymentMethodId": "string" }', responseSchema: '{ "orderId": "string", "status": "string" }', requiresAuth: true },
          { method: HttpMethod.GET, path: "/orders/:id", summary: "Fetch an order by id.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Orders Database",
        artifactKey: "ordersDb",
        description: "Orders, line items and captured payments.",
        entities: [
          { name: "orders", description: "Customer orders.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "customer_id", type: "uuid", required: true },
            { name: "status", type: "text", required: true },
            { name: "total_cents", type: "integer", required: true },
            { name: "created_at", type: "timestamptz", required: true },
          ] },
          { name: "order_items", description: "Lines within an order.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "order_id", type: "uuid", required: true, fk: { entity: "orders", field: "id" } },
            { name: "sku", type: "text", required: true },
            { name: "qty", type: "integer", required: true },
            { name: "unit_price_cents", type: "integer", required: true },
          ] },
          { name: "payments", description: "Payment captures per order.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "order_id", type: "uuid", required: true, fk: { entity: "orders", field: "id" } },
            { name: "provider_ref", type: "text", required: true },
            { name: "amount_cents", type: "integer", required: true },
            { name: "captured_at", type: "timestamptz" },
          ] },
        ],
      },
    ],
  },

  // 2 ── NimbusPay (fintech / payments)
  {
    ownerKey: "leo",
    name: "NimbusPay Platform",
    description:
      "Payments-as-a-service backend: a charges API over a double-entry ledger, with fraud scoring, KYC, outbound webhooks and a bank connector — PCI-scoped.",
    members: [
      { userKey: "ava", role: ProjectRole.DEVELOPER },
      { userKey: "yara", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "api", title: "Payments API", type: SERVICE, description: "Public charges/refunds/payouts API; the system's front door.", tags: ["payments"] },
      { key: "ledger", title: "Ledger Service", type: SERVICE, description: "Double-entry ledger; the source of truth for balances.", tags: ["ledger"] },
      { key: "fraud", title: "Fraud Engine", type: SERVICE, description: "Real-time risk scoring of inbound charges.", tags: ["risk"] },
      { key: "kyc", title: "KYC Service", type: SERVICE, description: "Identity verification and sanctions screening for merchants.", tags: ["compliance"] },
      { key: "webhooks", title: "Webhook Dispatcher", type: SERVICE, description: "Signs and delivers event callbacks to merchants with retries.", tags: ["events"] },
      { key: "bank", title: "Bank Connector", type: EXTERNAL, description: "External ACH / card-network rails.", tags: ["external"] },
      { key: "ledgerDb", title: "Ledger Database", type: DBMODEL, description: "Postgres — accounts, transactions and entries.", tags: ["postgres"] },
      { key: "pci", title: "PCI-DSS Policy", type: POLICY, description: "Cardholder-data scope, tokenization and key-rotation rules.", tags: ["security", "pci"] },
      { key: "complianceDoc", title: "Compliance Handbook", type: DOCS, description: "How money movement and audit trails work end to end." },
    ],
    relations: [
      { from: "api", to: "ledger", type: RelationType.DEPENDS_ON },
      { from: "api", to: "fraud", type: RelationType.USES },
      { from: "api", to: "kyc", type: RelationType.USES },
      { from: "ledger", to: "ledgerDb", type: RelationType.DEPENDS_ON },
      { from: "api", to: "bank", type: RelationType.COMMUNICATES_WITH },
      { from: "webhooks", to: "api", type: RelationType.DEPENDS_ON },
      { from: "pci", to: "api", type: RelationType.SECURES },
      { from: "complianceDoc", to: "ledger", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Payments API",
        artifactKey: "api",
        baseUrl: "/v1",
        endpoints: [
          { method: HttpMethod.POST, path: "/charges", summary: "Authorize and capture a charge.", requestSchema: '{ "amount": "number", "currency": "string", "source": "string" }', responseSchema: '{ "id": "string", "status": "string" }', requiresAuth: true },
          { method: HttpMethod.POST, path: "/refunds", summary: "Refund a captured charge.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/charges/:id", summary: "Retrieve a charge.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/payouts", summary: "Initiate a payout to a bank account.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/balance", summary: "Current available and pending balance.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Ledger Database",
        artifactKey: "ledgerDb",
        description: "Double-entry accounts, transactions and entries.",
        entities: [
          { name: "accounts", description: "Ledger accounts (merchant, fee, reserve).", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "owner_id", type: "uuid", required: true },
            { name: "kind", type: "text", required: true },
            { name: "currency", type: "text", required: true },
          ] },
          { name: "transactions", description: "Atomic balanced transactions.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "account_id", type: "uuid", required: true, fk: { entity: "accounts", field: "id" } },
            { name: "kind", type: "text", required: true },
            { name: "created_at", type: "timestamptz", required: true },
          ] },
          { name: "entries", description: "Debit/credit legs of a transaction.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "transaction_id", type: "uuid", required: true, fk: { entity: "transactions", field: "id" } },
            { name: "account_id", type: "uuid", required: true, fk: { entity: "accounts", field: "id" } },
            { name: "amount_cents", type: "integer", required: true },
          ] },
        ],
      },
    ],
  },

  // 3 ── VitalLink (telemedicine / healthcare)
  {
    ownerKey: "priya",
    name: "VitalLink Telehealth",
    description:
      "Telemedicine platform: a patient portal, appointment scheduling, a WebRTC video bridge, EHR sync and notifications over a clinical database — HIPAA-scoped.",
    members: [
      { userKey: "mateo", role: ProjectRole.DEVELOPER },
      { userKey: "ava", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "portal", title: "Patient Portal", type: SERVICE, description: "Patient-facing web and mobile entry point.", tags: ["frontend"] },
      { key: "appt", title: "Appointment Service", type: SERVICE, description: "Scheduling, reminders and visit lifecycle.", tags: ["scheduling"] },
      { key: "video", title: "Video Bridge", type: SERVICE, description: "WebRTC signalling and TURN for live visits.", tags: ["realtime"] },
      { key: "ehr", title: "EHR Sync Service", type: SERVICE, description: "Bidirectional sync with the clinical record store.", tags: ["integration"] },
      { key: "notify", title: "Notification Service", type: SERVICE, description: "SMS/email reminders and visit links.", tags: ["notifications"] },
      { key: "pharmacy", title: "Pharmacy Gateway", type: EXTERNAL, description: "External e-prescription network.", tags: ["external"] },
      { key: "clinicalDb", title: "Clinical Database", type: DBMODEL, description: "Postgres — patients, appointments and prescriptions.", tags: ["postgres", "phi"] },
      { key: "hipaa", title: "HIPAA Data Policy", type: POLICY, description: "PHI handling, encryption-at-rest and access-audit rules.", tags: ["security", "hipaa"] },
      { key: "careDoc", title: "Care Flow Documentation", type: DOCS, description: "Describes the end-to-end visit flow." },
    ],
    relations: [
      { from: "portal", to: "appt", type: RelationType.USES },
      { from: "appt", to: "video", type: RelationType.USES },
      { from: "appt", to: "notify", type: RelationType.USES },
      { from: "portal", to: "ehr", type: RelationType.DEPENDS_ON },
      { from: "ehr", to: "clinicalDb", type: RelationType.DEPENDS_ON },
      { from: "appt", to: "pharmacy", type: RelationType.COMMUNICATES_WITH },
      { from: "hipaa", to: "portal", type: RelationType.SECURES },
      { from: "careDoc", to: "appt", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Care API",
        artifactKey: "portal",
        baseUrl: "/api",
        endpoints: [
          { method: HttpMethod.POST, path: "/appointments", summary: "Book an appointment.", requestSchema: '{ "patientId": "string", "providerId": "string", "slot": "string" }', requiresAuth: true },
          { method: HttpMethod.GET, path: "/appointments/:id", summary: "Fetch an appointment.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/visits/:id/start", summary: "Start a live video visit.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/patients/:id", summary: "Fetch a patient record.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/prescriptions", summary: "Issue an e-prescription.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Clinical Database",
        artifactKey: "clinicalDb",
        description: "Patients, appointments and prescriptions.",
        entities: [
          { name: "patients", description: "Enrolled patients.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "mrn", type: "text", required: true },
            { name: "full_name", type: "text", required: true },
            { name: "dob", type: "date", required: true },
          ] },
          { name: "appointments", description: "Scheduled visits.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "patient_id", type: "uuid", required: true, fk: { entity: "patients", field: "id" } },
            { name: "provider_id", type: "uuid", required: true },
            { name: "scheduled_at", type: "timestamptz", required: true },
            { name: "status", type: "text", required: true },
          ] },
          { name: "prescriptions", description: "Issued prescriptions.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "patient_id", type: "uuid", required: true, fk: { entity: "patients", field: "id" } },
            { name: "drug", type: "text", required: true },
            { name: "issued_at", type: "timestamptz", required: true },
          ] },
        ],
      },
    ],
  },

  // 4 ── FlowDesk (SaaS CRM)
  {
    ownerKey: "mateo",
    name: "FlowDesk CRM",
    description:
      "Multi-tenant SaaS CRM: a web app over a CRM core with sales-pipeline, email-sync and reporting services, third-party billing and a tenant-isolation policy.",
    members: [
      { userKey: "priya", role: ProjectRole.DEVELOPER },
      { userKey: "sora", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "web", title: "Web App", type: SERVICE, description: "Single-page CRM client served to all tenants.", tags: ["frontend"] },
      { key: "core", title: "CRM Core", type: SERVICE, description: "Contacts, accounts and activity timeline.", tags: ["core"] },
      { key: "pipeline", title: "Pipeline Service", type: SERVICE, description: "Deals, stages and forecasting.", tags: ["sales"] },
      { key: "emailSync", title: "Email Sync Service", type: SERVICE, description: "Two-way mailbox sync and logging.", tags: ["integration"] },
      { key: "reporting", title: "Reporting Service", type: SERVICE, description: "Aggregations and scheduled report exports.", tags: ["analytics"] },
      { key: "billing", title: "Billing Provider", type: EXTERNAL, description: "External subscription billing and invoicing.", tags: ["external"] },
      { key: "crmDb", title: "CRM Database", type: DBMODEL, description: "Postgres — tenants, contacts and deals.", tags: ["postgres", "multitenant"] },
      { key: "tenantPolicy", title: "Tenant Isolation Policy", type: POLICY, description: "Row-level tenant scoping and key segregation rules.", tags: ["security"] },
      { key: "onboardDoc", title: "Onboarding Guide", type: DOCS, description: "Tenant provisioning and first-run setup." },
    ],
    relations: [
      { from: "web", to: "core", type: RelationType.USES },
      { from: "core", to: "pipeline", type: RelationType.USES },
      { from: "core", to: "emailSync", type: RelationType.USES },
      { from: "reporting", to: "core", type: RelationType.DEPENDS_ON },
      { from: "core", to: "crmDb", type: RelationType.DEPENDS_ON },
      { from: "web", to: "billing", type: RelationType.COMMUNICATES_WITH },
      { from: "tenantPolicy", to: "core", type: RelationType.SECURES },
      { from: "onboardDoc", to: "web", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "CRM API",
        artifactKey: "core",
        baseUrl: "/api",
        endpoints: [
          { method: HttpMethod.GET, path: "/contacts", summary: "List contacts for the tenant.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/contacts", summary: "Create a contact.", requestSchema: '{ "name": "string", "email": "string" }', requiresAuth: true },
          { method: HttpMethod.GET, path: "/deals", summary: "List deals.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/deals", summary: "Create a deal.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/reports/pipeline", summary: "Pipeline summary report.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "CRM Database",
        artifactKey: "crmDb",
        description: "Tenants, contacts and deals.",
        entities: [
          { name: "tenants", description: "Customer organizations.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "name", type: "text", required: true },
            { name: "plan", type: "text", required: true },
          ] },
          { name: "contacts", description: "People within a tenant's CRM.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "tenant_id", type: "uuid", required: true, fk: { entity: "tenants", field: "id" } },
            { name: "name", type: "text", required: true },
            { name: "email", type: "text" },
          ] },
          { name: "deals", description: "Sales opportunities.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "contact_id", type: "uuid", required: true, fk: { entity: "contacts", field: "id" } },
            { name: "stage", type: "text", required: true },
            { name: "amount_cents", type: "integer" },
          ] },
        ],
      },
    ],
  },

  // 5 ── CityHop (ride-share / mobility)
  {
    ownerKey: "sora",
    name: "CityHop Mobility",
    description:
      "Ride-hailing backend: rider and driver gateways feeding a matching engine with dynamic pricing and a trip service, over a trips database and a maps provider.",
    members: [
      { userKey: "mateo", role: ProjectRole.VIEWER },
      { userKey: "omar", role: ProjectRole.DEVELOPER },
    ],
    artifacts: [
      { key: "rider", title: "Rider Gateway", type: SERVICE, description: "Rider app ingress: requests, tracking and receipts.", tags: ["gateway"] },
      { key: "driver", title: "Driver Gateway", type: SERVICE, description: "Driver app ingress: availability and offers.", tags: ["gateway"] },
      { key: "matching", title: "Matching Engine", type: SERVICE, description: "Assigns riders to nearby drivers.", tags: ["core"] },
      { key: "pricing", title: "Pricing Service", type: SERVICE, description: "Surge and fare estimation.", tags: ["pricing"] },
      { key: "trip", title: "Trip Service", type: SERVICE, description: "Trip lifecycle, state machine and fare finalization.", tags: ["trips"] },
      { key: "maps", title: "Maps Provider", type: EXTERNAL, description: "External routing, ETA and geocoding.", tags: ["external"] },
      { key: "tripsDb", title: "Trips Database", type: DBMODEL, description: "Postgres — riders, drivers and trips.", tags: ["postgres"] },
      { key: "geoPolicy", title: "Geo Privacy Policy", type: POLICY, description: "Location retention, precision and access rules.", tags: ["security", "privacy"] },
      { key: "dispatchDoc", title: "Dispatch Documentation", type: DOCS, description: "How matching and dispatch decisions are made." },
    ],
    relations: [
      { from: "rider", to: "matching", type: RelationType.USES },
      { from: "driver", to: "matching", type: RelationType.USES },
      { from: "matching", to: "pricing", type: RelationType.USES },
      { from: "matching", to: "trip", type: RelationType.DEPENDS_ON },
      { from: "trip", to: "tripsDb", type: RelationType.DEPENDS_ON },
      { from: "matching", to: "maps", type: RelationType.COMMUNICATES_WITH },
      { from: "geoPolicy", to: "trip", type: RelationType.SECURES },
      { from: "dispatchDoc", to: "matching", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Mobility API",
        artifactKey: "rider",
        baseUrl: "/api",
        endpoints: [
          { method: HttpMethod.POST, path: "/rides/request", summary: "Request a ride.", requestSchema: '{ "pickup": "string", "dropoff": "string" }', requiresAuth: true },
          { method: HttpMethod.POST, path: "/rides/:id/accept", summary: "Driver accepts a ride.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/rides/:id", summary: "Ride status and ETA.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/rides/:id/complete", summary: "Complete a ride and finalize fare.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/drivers/nearby", summary: "Nearby available drivers.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Trips Database",
        artifactKey: "tripsDb",
        description: "Riders, drivers and trips.",
        entities: [
          { name: "riders", description: "Rider accounts.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "name", type: "text", required: true },
            { name: "rating", type: "numeric" },
          ] },
          { name: "drivers", description: "Driver accounts.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "name", type: "text", required: true },
            { name: "vehicle", type: "text", required: true },
          ] },
          { name: "trips", description: "Completed and active trips.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "rider_id", type: "uuid", required: true, fk: { entity: "riders", field: "id" } },
            { name: "driver_id", type: "uuid", required: true, fk: { entity: "drivers", field: "id" } },
            { name: "fare_cents", type: "integer" },
            { name: "status", type: "text", required: true },
          ] },
        ],
      },
    ],
  },

  // 6 ── StreamForge (media / streaming) — includes a DEPRECATED service in use
  {
    ownerKey: "nina",
    name: "StreamForge Media",
    description:
      "Video streaming platform: an edge CDN over a streaming API with catalog, recommendations and transcoding (a legacy transcoder is still wired) — DRM-protected.",
    members: [
      { userKey: "sora", role: ProjectRole.DEVELOPER },
      { userKey: "omar", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "edge", title: "Edge CDN", type: SERVICE, description: "Caches and serves media manifests and segments.", tags: ["edge"] },
      { key: "api", title: "Streaming API", type: SERVICE, description: "Playback, entitlement and heartbeat surface.", tags: ["core"] },
      { key: "transcoder", title: "Transcoder", type: SERVICE, description: "Modern adaptive-bitrate transcoding pipeline.", tags: ["media"] },
      { key: "legacy", title: "Legacy Transcoder", type: SERVICE, status: ArtifactStatus.DEPRECATED, description: "Old transcoder kept for one codec profile — pending removal.", tags: ["legacy"] },
      { key: "recs", title: "Recommendation Service", type: SERVICE, description: "Personalized title ranking.", tags: ["ml"] },
      { key: "catalog", title: "Catalog Service", type: SERVICE, description: "Titles, seasons and availability windows.", tags: ["catalog"] },
      { key: "psp", title: "Subscription Payment Processor", type: EXTERNAL, description: "External recurring-billing processor.", tags: ["external"] },
      { key: "mediaDb", title: "Media Database", type: DBMODEL, description: "Postgres — titles, episodes and stream sessions.", tags: ["postgres"] },
      { key: "drm", title: "DRM Policy", type: POLICY, description: "License issuance, key rotation and output-protection rules.", tags: ["security", "drm"] },
      { key: "encDoc", title: "Encoding Documentation", type: DOCS, description: "Ladder profiles and packaging steps." },
    ],
    relations: [
      { from: "edge", to: "api", type: RelationType.DEPENDS_ON },
      { from: "api", to: "catalog", type: RelationType.USES },
      { from: "api", to: "recs", type: RelationType.USES },
      { from: "api", to: "transcoder", type: RelationType.DEPENDS_ON },
      { from: "api", to: "legacy", type: RelationType.DEPENDS_ON, description: "Still used for one legacy codec profile." },
      { from: "catalog", to: "mediaDb", type: RelationType.DEPENDS_ON },
      { from: "api", to: "psp", type: RelationType.COMMUNICATES_WITH },
      { from: "drm", to: "api", type: RelationType.SECURES },
      { from: "encDoc", to: "transcoder", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Streaming API",
        artifactKey: "api",
        baseUrl: "/api",
        endpoints: [
          { method: HttpMethod.GET, path: "/titles", summary: "Browse the catalog." },
          { method: HttpMethod.GET, path: "/titles/:id/manifest", summary: "Get an entitled playback manifest.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/playback/heartbeat", summary: "Report playback position.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/recommendations", summary: "Personalized recommendations.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/subscriptions", summary: "Start or change a subscription.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Media Database",
        artifactKey: "mediaDb",
        description: "Titles, episodes and stream sessions.",
        entities: [
          { name: "titles", description: "Movies and series.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "name", type: "text", required: true },
            { name: "kind", type: "text", required: true },
          ] },
          { name: "episodes", description: "Episodes of a series.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "title_id", type: "uuid", required: true, fk: { entity: "titles", field: "id" } },
            { name: "number", type: "integer", required: true },
            { name: "duration_s", type: "integer", required: true },
          ] },
          { name: "streams", description: "Active playback sessions.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "title_id", type: "uuid", required: true, fk: { entity: "titles", field: "id" } },
            { name: "user_id", type: "uuid", required: true },
            { name: "started_at", type: "timestamptz", required: true },
          ] },
        ],
      },
    ],
  },

  // 7 ── GridSense (IoT / energy)
  {
    ownerKey: "omar",
    name: "GridSense IoT",
    description:
      "Smart-metering platform: a device gateway and ingestion pipeline writing to a telemetry store, with a rules engine, alerting and a mobile API — device-auth scoped.",
    members: [
      { userKey: "nina", role: ProjectRole.ARCHITECT },
      { userKey: "leo", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "gateway", title: "Device Gateway", type: SERVICE, description: "MQTT/HTTP ingress for field devices.", tags: ["iot", "gateway"] },
      { key: "ingest", title: "Ingestion Pipeline", type: SERVICE, description: "Validates, batches and persists device readings.", tags: ["pipeline"] },
      { key: "telemetryDb", title: "Telemetry Store", type: DBMODEL, description: "Time-series store — devices, readings and alerts.", tags: ["timeseries"] },
      { key: "rules", title: "Rules Engine", type: SERVICE, description: "Threshold and anomaly rules over telemetry.", tags: ["rules"] },
      { key: "alerting", title: "Alerting Service", type: SERVICE, description: "Fans rule hits out to operators.", tags: ["alerts"] },
      { key: "mobile", title: "Mobile API", type: SERVICE, description: "Field-operator dashboards and acknowledgements.", tags: ["api"] },
      { key: "utility", title: "Utility Provider", type: EXTERNAL, description: "External grid-operator integration.", tags: ["external"] },
      { key: "deviceAuth", title: "Device Auth Policy", type: POLICY, description: "Per-device certificates and rotation rules.", tags: ["security"] },
      { key: "runbook", title: "Operations Runbook", type: DOCS, description: "Ingestion and alerting operational procedures." },
    ],
    relations: [
      { from: "gateway", to: "ingest", type: RelationType.DEPENDS_ON },
      { from: "ingest", to: "telemetryDb", type: RelationType.DEPENDS_ON },
      { from: "rules", to: "telemetryDb", type: RelationType.USES },
      { from: "rules", to: "alerting", type: RelationType.USES },
      { from: "mobile", to: "telemetryDb", type: RelationType.USES },
      { from: "gateway", to: "utility", type: RelationType.COMMUNICATES_WITH },
      { from: "deviceAuth", to: "gateway", type: RelationType.SECURES },
      { from: "runbook", to: "ingest", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Telemetry API",
        artifactKey: "mobile",
        baseUrl: "/api",
        endpoints: [
          { method: HttpMethod.POST, path: "/devices/:id/readings", summary: "Ingest a device reading.", requestSchema: '{ "metric": "string", "value": "number", "ts": "string" }', requiresAuth: true },
          { method: HttpMethod.GET, path: "/devices/:id/readings", summary: "Query recent readings.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/alerts", summary: "List open alerts.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/rules", summary: "Create an alerting rule.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/devices", summary: "List registered devices.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Telemetry Store",
        artifactKey: "telemetryDb",
        databaseType: DatabaseType.PostgreSQL,
        description: "Devices, readings and alerts.",
        entities: [
          { name: "devices", description: "Registered field devices.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "serial", type: "text", required: true },
            { name: "site", type: "text", required: true },
          ] },
          { name: "readings", description: "Time-series metric readings.", fields: [
            { name: "id", type: "bigint", pk: true, required: true },
            { name: "device_id", type: "uuid", required: true, fk: { entity: "devices", field: "id" } },
            { name: "metric", type: "text", required: true },
            { name: "value", type: "double precision", required: true },
            { name: "ts", type: "timestamptz", required: true },
          ] },
          { name: "alerts", description: "Triggered alerts.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "device_id", type: "uuid", required: true, fk: { entity: "devices", field: "id" } },
            { name: "severity", type: "text", required: true },
            { name: "opened_at", type: "timestamptz", required: true },
          ] },
        ],
      },
    ],
  },

  // 8 ── LearnLoop (edtech / LMS)
  {
    ownerKey: "yara",
    name: "LearnLoop LMS",
    description:
      "Learning platform: a learner web app over course, assessment and progress services with notifications and external video hosting — content-access scoped.",
    members: [
      { userKey: "omar", role: ProjectRole.DEVELOPER },
      { userKey: "priya", role: ProjectRole.VIEWER },
    ],
    artifacts: [
      { key: "web", title: "Learner Web", type: SERVICE, description: "Student-facing learning client.", tags: ["frontend"] },
      { key: "course", title: "Course Service", type: SERVICE, description: "Courses, modules and enrollment.", tags: ["core"] },
      { key: "assess", title: "Assessment Engine", type: SERVICE, description: "Quizzes, grading and item banks.", tags: ["assessment"] },
      { key: "progress", title: "Progress Tracker", type: SERVICE, description: "Completion, streaks and mastery state.", tags: ["progress"] },
      { key: "notify", title: "Notification Service", type: SERVICE, description: "Reminders, deadlines and nudges.", tags: ["notifications"] },
      { key: "video", title: "Video Hosting", type: EXTERNAL, description: "External lecture-video hosting and transcoding.", tags: ["external"] },
      { key: "learnDb", title: "Learning Database", type: DBMODEL, description: "Postgres — learners, courses and enrollments.", tags: ["postgres"] },
      { key: "accessPolicy", title: "Content Access Policy", type: POLICY, description: "Entitlement, cohort and licensing rules.", tags: ["security"] },
      { key: "pedagogyDoc", title: "Pedagogy Notes", type: DOCS, description: "Course structure and assessment philosophy." },
    ],
    relations: [
      { from: "web", to: "course", type: RelationType.USES },
      { from: "course", to: "assess", type: RelationType.USES },
      { from: "course", to: "progress", type: RelationType.USES },
      { from: "assess", to: "progress", type: RelationType.DEPENDS_ON },
      { from: "course", to: "learnDb", type: RelationType.DEPENDS_ON },
      { from: "web", to: "video", type: RelationType.COMMUNICATES_WITH },
      { from: "course", to: "notify", type: RelationType.USES },
      { from: "accessPolicy", to: "course", type: RelationType.SECURES },
      { from: "pedagogyDoc", to: "course", type: RelationType.DOCUMENTS },
    ],
    apiSpecs: [
      {
        title: "Learning API",
        artifactKey: "course",
        baseUrl: "/api",
        endpoints: [
          { method: HttpMethod.GET, path: "/courses", summary: "List available courses." },
          { method: HttpMethod.GET, path: "/courses/:id", summary: "Course detail with modules." },
          { method: HttpMethod.POST, path: "/enrollments", summary: "Enroll the learner in a course.", requiresAuth: true },
          { method: HttpMethod.POST, path: "/assessments/:id/submit", summary: "Submit an assessment attempt.", requiresAuth: true },
          { method: HttpMethod.GET, path: "/progress/:userId", summary: "Learner progress summary.", requiresAuth: true },
        ],
      },
    ],
    dbModels: [
      {
        title: "Learning Database",
        artifactKey: "learnDb",
        description: "Learners, courses and enrollments.",
        entities: [
          { name: "learners", description: "Enrolled students.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "name", type: "text", required: true },
            { name: "email", type: "text", required: true },
          ] },
          { name: "courses", description: "Published courses.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "title", type: "text", required: true },
            { name: "level", type: "text", required: true },
          ] },
          { name: "enrollments", description: "Learner ↔ course enrollment.", fields: [
            { name: "id", type: "uuid", pk: true, required: true },
            { name: "learner_id", type: "uuid", required: true, fk: { entity: "learners", field: "id" } },
            { name: "course_id", type: "uuid", required: true, fk: { entity: "courses", field: "id" } },
            { name: "progress_pct", type: "integer", required: true },
          ] },
        ],
      },
    ],
  },
];

// ───────────────────────────── helpers ─────────────────────────────

const DOCUMENTABLE = new Set<ArtifactType>([SERVICE, POLICY, DOCS, DBMODEL, ArtifactType.API_SPEC]);

/** A strong, URL-safe random password (~24 chars). */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

/** Deterministic-ish loose grid position from an index. */
function gridPos(i: number): { gx: number; gy: number } {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return { gx: col * 260 - 260, gy: row * 170 - 170 };
}

/** Sanitize an artifact title into a Mermaid node id. */
function nodeId(title: string): string {
  return title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "n";
}

/** Build an ARCHITECTURE Mermaid flowchart from the artifacts + relations. */
function buildArchMermaid(
  artifacts: ArtifactDef[],
  relations: RelationDef[],
  titleOf: (key: string) => string,
): string {
  const lines = ["flowchart TD"];
  for (const a of artifacts) {
    lines.push(`  ${nodeId(a.title)}["${a.title}"]`);
  }
  for (const r of relations) {
    lines.push(`  ${nodeId(titleOf(r.from))} --> ${nodeId(titleOf(r.to))}`);
  }
  return lines.join("\n");
}

/** Generate a documentation body for a documentable artifact from its relations. */
function buildDoc(
  a: ArtifactDef,
  outgoing: { type: RelationType; toTitle: string }[],
  incoming: { type: RelationType; fromTitle: string }[],
): string {
  const deps = outgoing.filter((r) => r.type === RelationType.DEPENDS_ON || r.type === RelationType.USES);
  const secures = incoming.filter((r) => r.type === RelationType.SECURES);
  const depLines = deps.length
    ? deps.map((d) => `- **${d.toTitle}** — ${d.type === RelationType.DEPENDS_ON ? "hard dependency" : "used at runtime"}.`).join("\n")
    : "- No outbound runtime dependencies.";
  const secLines = secures.length
    ? secures.map((s) => `- Governed by **${s.fromTitle}**.`).join("\n")
    : "- No dedicated security policy linked yet.";
  return `# ${a.title}

## Purpose
${a.description}

## Responsibilities
- Own its slice of the domain and expose a stable contract to callers.
- Validate inputs and emit version events on every change.
- Fail closed and surface actionable errors.

## Dependencies
${depLines}

## Security
${secLines}

## Notes
- Type: ${a.type}. Status: ${a.status ?? ArtifactStatus.ACTIVE}.
`;
}

// ───────────────────────────── build one project ─────────────────────────────

interface BuildResult {
  projectId: string;
  artifactCount: number;
  relationCount: number;
  endpointCount: number;
  entityCount: number;
  diagramCount: number;
  issueCount: number;
  eventCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function buildProject(
  def: ProjectDef,
  userIds: Record<string, string>,
  nowMs: number,
): Promise<BuildResult | null> {
  const ownerId = userIds[def.ownerKey];

  // Idempotency: if this owner already has a project with this name, skip the
  // (heavy) build. Re-runs only refresh passwords + the credentials file.
  const existing = await prisma.project.findFirst({
    where: { name: def.name, ownerId },
    select: { id: true },
  });
  if (existing) {
    return null;
  }

  const project = await prisma.project.create({
    data: { name: def.name, description: def.description, ownerId },
  });

  // Members: owner (OWNER) + cross-members.
  const memberRows: { projectId: string; userId: string; role: ProjectRole }[] = [
    { projectId: project.id, userId: ownerId, role: ProjectRole.OWNER },
  ];
  for (const m of def.members) {
    const uid = userIds[m.userKey];
    if (uid && uid !== ownerId) memberRows.push({ projectId: project.id, userId: uid, role: m.role });
  }
  await prisma.projectMember.createMany({ data: memberRows, skipDuplicates: true });

  // Actor pool: owner first, then members — used to attribute events round-robin.
  const actorIds = [ownerId, ...def.members.map((m) => userIds[m.userKey]).filter(Boolean)];
  const actor = (i: number): string => actorIds[i % actorIds.length] ?? ownerId;

  const titleOf = (key: string): string => {
    const a = def.artifacts.find((x) => x.key === key);
    if (!a) throw new Error(`${def.name}: unknown artifact key "${key}"`);
    return a.title;
  };

  // Pre-compute relation views per artifact for the doc generator.
  const outByKey = new Map<string, { type: RelationType; toTitle: string }[]>();
  const inByKey = new Map<string, { type: RelationType; fromTitle: string }[]>();
  for (const r of def.relations) {
    (outByKey.get(r.from) ?? outByKey.set(r.from, []).get(r.from)!).push({ type: r.type, toTitle: titleOf(r.to) });
    (inByKey.get(r.to) ?? inByKey.set(r.to, []).get(r.to)!).push({ type: r.type, fromTitle: titleOf(r.from) });
  }

  const events: Parameters<typeof recordVersionEvent>[0][] = [];
  let dayCursor = Math.min(16, 6 + def.artifacts.length); // spread start
  const at = (hour = 11, minute = 0): Date => {
    const d = new Date(nowMs - dayCursor * DAY_MS);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };

  // Project + membership events.
  events.push({ projectId: project.id, entityType: "PROJECT", entityId: project.id, action: "CREATED", title: project.name, description: "Project created", triggeredBy: ownerId, at: at(8, 0) });
  let mi = 0;
  for (const m of def.members) {
    const uid = userIds[m.userKey];
    const u = USERS.find((x) => x.key === m.userKey);
    if (!uid || !u) continue;
    events.push({ projectId: project.id, entityType: "PROJECT", entityId: project.id, action: "LINKED", title: `${u.firstName} ${u.lastName} joined as ${m.role}`, description: "Member added", triggeredBy: ownerId, metadata: { memberUserId: uid, role: m.role }, at: at(8, 10 + mi * 3) });
    mi++;
  }
  dayCursor--;

  // ── artifacts ──
  const artIds: Record<string, { id: string; title: string; type: ArtifactType; doc: string | null }> = {};
  let ai = 0;
  for (const a of def.artifacts) {
    const wantsDoc = (a.doc ?? DOCUMENTABLE.has(a.type)) && a.type !== ArtifactType.API_SPEC;
    const docBody = wantsDoc
      ? buildDoc(a, outByKey.get(a.key) ?? [], inByKey.get(a.key) ?? [])
      : null;
    const { gx, gy } = gridPos(ai);
    const created = await prisma.artifact.create({
      data: {
        projectId: project.id,
        title: a.title,
        normalizedTitle: normalizeArtifactTitle(a.title),
        type: a.type,
        status: a.status ?? ArtifactStatus.ACTIVE,
        description: a.description,
        tags: a.tags ?? [],
        gx,
        gy,
        createdById: actor(ai),
        documentationContent: docBody,
      },
    });
    artIds[a.key] = { id: created.id, title: created.title, type: created.type, doc: docBody };
    events.push({ projectId: project.id, entityType: "ARTIFACT", entityId: created.id, action: "CREATED", title: created.title, description: `${a.type} (${a.status ?? ArtifactStatus.ACTIVE})`, triggeredBy: actor(ai), at: at(9 + (ai % 6), (ai * 7) % 60) });
    if (docBody) {
      events.push({ projectId: project.id, entityType: "DOCUMENTATION", entityId: created.id, action: "CREATED", title: created.title, description: "Documentation created", triggeredBy: actor(ai + 1), metadata: { length: docBody.length }, at: at(13, (ai * 5) % 60) });
    }
    ai++;
    if (ai % 3 === 0 && dayCursor > 3) dayCursor--;
  }

  // ── relations ──
  let ri = 0;
  for (const r of def.relations) {
    const src = artIds[r.from];
    const tgt = artIds[r.to];
    const created = await prisma.artifactRelation.create({
      data: {
        sourceArtifactId: src.id,
        targetArtifactId: tgt.id,
        relationType: r.type,
        description: r.description ?? "",
        createdById: actor(ri),
      },
    });
    events.push({ projectId: project.id, entityType: "RELATION", entityId: created.id, action: "LINKED", title: `${src.title} → ${tgt.title}`, description: r.type, triggeredBy: actor(ri), metadata: { relationType: r.type, sourceArtifactId: src.id, targetArtifactId: tgt.id }, at: at(10 + (ri % 6), (ri * 11) % 60) });
    ri++;
  }
  if (dayCursor > 2) dayCursor--;

  // ── API specs + endpoints ──
  let endpointCount = 0;
  for (const spec of def.apiSpecs) {
    const apiSpec = await prisma.apiSpec.create({
      data: {
        projectId: project.id,
        artifactId: spec.artifactKey ? artIds[spec.artifactKey]?.id : null,
        title: spec.title,
        version: spec.version ?? "1.0.0",
        baseUrl: spec.baseUrl ?? "",
        description: spec.description ?? "",
        createdById: ownerId,
      },
    });
    events.push({ projectId: project.id, entityType: "API_SPEC", entityId: apiSpec.id, action: "CREATED", title: apiSpec.title, description: `v${apiSpec.version} · ${apiSpec.baseUrl}`, triggeredBy: actor(1), metadata: { version: apiSpec.version }, at: at(11, 0) });
    for (const ep of spec.endpoints) {
      const created = await prisma.apiEndpoint.create({
        data: {
          apiSpecId: apiSpec.id,
          path: ep.path,
          method: ep.method,
          summary: ep.summary,
          requestSchema: ep.requestSchema ?? "",
          responseSchema: ep.responseSchema ?? "",
          requiresAuth: ep.requiresAuth ?? false,
        },
      });
      endpointCount++;
      events.push({ projectId: project.id, entityType: "API_ENDPOINT", entityId: created.id, action: "CREATED", title: `${ep.method} ${ep.path}`, description: `Added to "${apiSpec.title}"`, triggeredBy: actor(1), metadata: { specId: apiSpec.id }, at: at(11, (endpointCount * 4) % 60) });
    }
  }
  if (dayCursor > 2) dayCursor--;

  // ── database models (2-pass FK resolution: entities → fields → precise FK) ──
  let entityCount = 0;
  for (const model of def.dbModels) {
    const dbModel = await prisma.databaseModel.create({
      data: {
        projectId: project.id,
        artifactId: model.artifactKey ? artIds[model.artifactKey]?.id : null,
        title: model.title,
        databaseType: model.databaseType ?? DatabaseType.PostgreSQL,
        description: model.description ?? "",
        createdById: ownerId,
      },
    });
    events.push({ projectId: project.id, entityType: "DATABASE_MODEL", entityId: dbModel.id, action: "CREATED", title: dbModel.title, description: model.databaseType ?? "PostgreSQL", triggeredBy: actor(2), metadata: { databaseType: model.databaseType ?? "PostgreSQL" }, at: at(12, 0) });

    // Pass 1: entities.
    const entityIds: Record<string, string> = {};
    for (const e of model.entities) {
      const ent = await prisma.databaseEntity.create({
        data: { databaseModelId: dbModel.id, name: e.name, description: e.description ?? "" },
      });
      entityIds[e.name] = ent.id;
      entityCount++;
      events.push({ projectId: project.id, entityType: "DATABASE_ENTITY", entityId: ent.id, action: "CREATED", title: e.name, description: `Added to ${dbModel.title}`, triggeredBy: actor(2), metadata: { databaseModelId: dbModel.id }, at: at(12, (entityCount * 6) % 60) });
    }

    // Pass 2: fields (entity-level FK target resolvable now).
    for (const e of model.entities) {
      let pos = 0;
      for (const f of e.fields) {
        await prisma.databaseField.create({
          data: {
            entityId: entityIds[e.name],
            name: f.name,
            type: f.type ?? "text",
            required: f.required ?? false,
            isPrimaryKey: f.pk ?? false,
            isForeignKey: !!f.fk,
            referencesEntityId: f.fk ? entityIds[f.fk.entity] ?? null : null,
            description: f.description ?? "",
            position: pos++,
          },
        });
      }
    }

    // Pass 3: precise column FK (referencesFieldId) once all fields exist.
    for (const e of model.entities) {
      for (const f of e.fields) {
        if (!f.fk) continue;
        const targetEntityId = entityIds[f.fk.entity];
        if (!targetEntityId) continue;
        // Prefer the explicitly named column, else the target entity's single PK.
        let targetField = null as { id: string } | null;
        if (f.fk.field) {
          targetField = await prisma.databaseField.findFirst({
            where: { entityId: targetEntityId, name: f.fk.field },
            select: { id: true },
          });
        }
        if (!targetField) {
          const pks = await prisma.databaseField.findMany({
            where: { entityId: targetEntityId, isPrimaryKey: true },
            select: { id: true },
          });
          if (pks.length === 1) targetField = pks[0];
        }
        if (targetField) {
          await prisma.databaseField.updateMany({
            where: { entityId: entityIds[e.name], name: f.name },
            data: { referencesFieldId: targetField.id },
          });
        }
      }
    }
  }
  if (dayCursor > 2) dayCursor--;

  // ── architecture diagram (auto-generated from the graph) ──
  const archArtifactKey = def.artifacts.find((a) => a.type === SERVICE)?.key ?? def.artifacts[0].key;
  const diagram = await prisma.diagram.create({
    data: {
      projectId: project.id,
      artifactId: artIds[archArtifactKey]?.id ?? null,
      title: `${def.name} — Architecture Overview`,
      type: DiagramType.ARCHITECTURE,
      mermaidSource: buildArchMermaid(def.artifacts, def.relations, titleOf),
      description: `Auto-generated request/dependency map for ${def.name}.`,
      createdById: ownerId,
    },
  });
  events.push({ projectId: project.id, entityType: "DIAGRAM", entityId: diagram.id, action: "CREATED", title: diagram.title, description: diagram.type, triggeredBy: actor(1), metadata: { type: diagram.type }, at: at(14, 0) });

  // A couple of UPDATED events for realistic churn.
  const firstArtifact = def.artifacts[0];
  events.push({ projectId: project.id, entityType: "ARTIFACT", entityId: artIds[firstArtifact.key].id, action: "UPDATED", title: firstArtifact.title, description: "description", triggeredBy: ownerId, metadata: { changed: ["description"] }, at: at(15, 0) });

  // Persist all version events (chronological order is enforced by their `at`).
  for (const ev of events) await recordVersionEvent(ev);

  // ── validation ──
  const { issues } = await runValidationForProject(project.id, ownerId);

  // ── exports (JSON + Markdown) ──
  const jsonSections = ["TEAM", "ARTIFACTS", "RELATIONS", "API_SPECS", "DATABASE_MODELS", "DIAGRAMS", "GRAPH", "VALIDATION_REPORT", "VERSION_HISTORY", "IMPACT_ANALYSIS"];
  const mdSections = ["TEAM", "ARTIFACTS", "API_SPECS", "DATABASE_MODELS", "DIAGRAMS", "RELATIONS", "VALIDATION_REPORT", "VERSION_HISTORY"];
  const jsonContent = await buildExportContent(project.id, "JSON", jsonSections);
  const mdContent = await buildExportContent(project.id, "MARKDOWN", mdSections);
  await prisma.exportPackage.create({ data: { projectId: project.id, format: "JSON", sections: jsonSections, content: jsonContent as Prisma.InputJsonValue, createdById: ownerId } });
  await prisma.exportPackage.create({ data: { projectId: project.id, format: "MARKDOWN", sections: mdSections, content: mdContent as Prisma.InputJsonValue, createdById: ownerId } });

  return {
    projectId: project.id,
    artifactCount: def.artifacts.length,
    relationCount: def.relations.length,
    endpointCount,
    entityCount,
    diagramCount: 1,
    issueCount: issues.length,
    eventCount: events.length,
  };
}

// ───────────────────────────── main ─────────────────────────────

interface CredentialRow {
  name: string;
  email: string;
  password: string;
  userRole: UserRole;
  ownsProject: string;
}

async function main() {
  const nowMs = Date.now();
  const verifiedAt = new Date(nowMs);

  // Upsert the 8 demo users with a fresh strong password each run. These live in
  // an isolated @demo.minotaurus.dev namespace so they never collide with the
  // main demo seed's accounts.
  const userIds: Record<string, string> = {};
  const credentials: Record<string, { def: UserDef; password: string }> = {};
  for (const u of USERS) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, firstName: u.firstName, lastName: u.lastName, role: u.role, emailVerifiedAt: verifiedAt },
      create: { email: u.email, passwordHash, firstName: u.firstName, lastName: u.lastName, role: u.role, emailVerifiedAt: verifiedAt },
    });
    userIds[u.key] = row.id;
    credentials[u.key] = { def: u, password };
  }

  // Build each project (skips silently if already present).
  const summaries: { name: string; owner: string; result: BuildResult | null }[] = [];
  for (const def of PROJECTS) {
    const result = await buildProject(def, userIds, nowMs);
    summaries.push({ name: def.name, owner: def.ownerKey, result });
  }

  // Compose the credentials rows (owner → project).
  const ownerProject: Record<string, string> = {};
  for (const def of PROJECTS) ownerProject[def.ownerKey] = def.name;
  const rows: CredentialRow[] = USERS.map((u) => ({
    name: `${u.firstName} ${u.lastName}`,
    email: u.email,
    password: credentials[u.key].password,
    userRole: u.role,
    ownsProject: ownerProject[u.key] ?? "—",
  }));

  // Write DEMO_USERS.{md,json} at the repo root (both gitignored — plaintext).
  // Resolve the repo root from cwd: `npm run seed:showcase` runs with cwd=backend,
  // so the parent is the repo root; running directly from the root also works.
  const repoRoot = basename(process.cwd()) === "backend" ? resolve(process.cwd(), "..") : process.cwd();
  const mdPath = resolve(repoRoot, "DEMO_USERS.md");
  const jsonPath = resolve(repoRoot, "DEMO_USERS.json");
  const generatedAt = new Date(nowMs).toISOString();

  const md = [
    "# Minotaurus — Demo Users",
    "",
    `_Generated by \`npm run seed:showcase\` on ${generatedAt}._`,
    "",
    "> ⚠️ These are real, loginable accounts with the passwords below. This file is",
    "> gitignored — never commit it. Re-running the seed rotates every password.",
    "> All accounts live on the `@demo.minotaurus.dev` namespace and are pre-verified.",
    "",
    "| Name | Email | Password | App role | Owns project |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.name} | \`${r.email}\` | \`${r.password}\` | ${r.userRole} | ${r.ownsProject} |`),
    "",
    "## Projects",
    "",
    ...PROJECTS.map((p) => `- **${p.name}** — owner ${credentials[p.ownerKey].def.firstName} ${credentials[p.ownerKey].def.lastName}; ${p.artifacts.length} artifacts, ${p.relations.length} relations. ${p.description}`),
    "",
    "Each owner is also a member (VIEWER/DEVELOPER/ARCHITECT) on one or two other",
    "projects, so the team / collaboration views have cross-project data.",
    "",
  ].join("\n");

  const json = {
    generatedAt,
    note: "Plaintext demo credentials. Gitignored. Re-running the seed rotates passwords.",
    users: rows,
    projects: PROJECTS.map((p) => ({ name: p.name, owner: credentials[p.ownerKey].def.email, artifacts: p.artifacts.length, relations: p.relations.length })),
  };

  writeFileSync(mdPath, md, "utf8");
  writeFileSync(jsonPath, JSON.stringify(json, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        users: rows.length,
        projectsBuilt: summaries.filter((s) => s.result).length,
        projectsSkipped: summaries.filter((s) => !s.result).map((s) => s.name),
        summaries: summaries.map((s) => ({ name: s.name, ...(s.result ?? { skipped: true }) })),
        credentialsFile: mdPath,
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
