// seed-payload-testbed.ts — a DEDICATED, idempotent seed for validating the full
// API Payload Intelligence chain (API Spec → analyzer → Architecture Links →
// Workflow Impact → graph inferred edges → validation rules → PDF/analysis
// metrics → AI Review digest).
//
// Isolated + idempotent: it manages ONLY the "Payload Intelligence Testbed"
// project. It find-or-creates the demo user and never wipes other data, so it
// does NOT overwrite the main demo (seed-demo.ts). Re-running deletes and
// recreates only this project. Run with:  npm run seed:testbed
//
// The requested artifact types FRONTEND and DATABASE are not in the Prisma
// `ArtifactType` enum, so they map to the closest valid values:
//   FRONTEND → SERVICE        DATABASE → DATABASE_MODEL
// Relations use the closest valid `RelationType` enum values (USES / SECURES /
// DOCUMENTS). Intentionally-bad endpoints (e.g. /debug/leak-token) are kept so
// the validation rules have something to fire on.
//
// It also seeds two Quick Fix V1 fixtures so the Preview Fix → Apply workflow is
// testable end-to-end: "Empty Documentation Test" (a DOCUMENTATION artifact with
// no content → MISSING_DOCUMENTATION) and "Empty Diagram Test" (an empty FLOWCHART
// diagram → DIAGRAM_EMPTY). Re-running the seed RESETS both back to empty, which
// is exactly what you want for repeat testing of the fix.

import bcrypt from "bcryptjs";
import type { ArtifactType, DiagramType, HttpMethod, RelationType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { assertDestructiveAllowed } from "../src/lib/destructive-guard.js";
import { recordVersionEvent } from "../src/modules/versions/versions.engine.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import { buildExportContent } from "../src/modules/exports/exports.engine.js";
import { analyzeExportSnapshot } from "../src/modules/exports/analysis/metrics.engine.js";
import { analyzeProjectApiIntel } from "../src/modules/api-intel/payload-analyzer.js";
import type { AnalyzerInput } from "../src/modules/api-intel/api-intel.types.js";
import { normalizeArtifactTitle } from "../src/modules/artifacts/artifact-title.js";
import { candidatesForOrphan } from "../src/modules/findings/relation-remediation.js";

const PROJECT_NAME = "Payload Intelligence Testbed";
const DEMO_EMAIL = "deyvid@minotaurus.dev";
const DEMO_PASSWORD = "minotaurus";
const BASE_TS = new Date("2026-06-01T09:00:00.000Z").getTime();
const json = (o: unknown) => JSON.stringify(o, null, 2);

// ───────────────────────────── data definitions ─────────────────────────────

interface ArtifactDef { key: string; title: string; type: ArtifactType; gx: number; gy: number; documentationContent?: string; }
const ARTIFACTS: ArtifactDef[] = [
  { key: "webApp", title: "Public Web App", type: "SERVICE", gx: 0, gy: -260 }, // FRONTEND → SERVICE
  { key: "gateway", title: "API Gateway", type: "SERVICE", gx: 0, gy: -140 },
  { key: "authSvc", title: "Authentication Service", type: "SERVICE", gx: -360, gy: 0 },
  { key: "patientSvc", title: "Patient Service", type: "SERVICE", gx: -120, gy: 0 },
  { key: "apptSvc", title: "Appointment Service", type: "SERVICE", gx: 120, gy: 0 },
  { key: "billingSvc", title: "Billing Service", type: "SERVICE", gx: 360, gy: 0 },
  { key: "notifySvc", title: "Notification Service", type: "SERVICE", gx: 560, gy: 0 },
  { key: "userDb", title: "User Database", type: "DATABASE_MODEL", gx: -360, gy: 140 }, // DATABASE → DATABASE_MODEL
  { key: "patientDb", title: "Patient Database", type: "DATABASE_MODEL", gx: -120, gy: 140 },
  { key: "apptDb", title: "Appointment Database", type: "DATABASE_MODEL", gx: 120, gy: 140 },
  { key: "billingDb", title: "Billing Database", type: "DATABASE_MODEL", gx: 360, gy: 140 },
  { key: "authPolicy", title: "Authentication Policy", type: "SECURITY_POLICY", gx: -540, gy: -80 },
  { key: "hipaaPolicy", title: "HIPAA Policy", type: "SECURITY_POLICY", gx: 0, gy: -80 },
  { key: "patientFlow", title: "Patient Registration Flow", type: "DOCUMENTATION", gx: -120, gy: 260 },
  { key: "apptFlow", title: "Appointment Booking Flow", type: "DOCUMENTATION", gx: 120, gy: 260 },
  { key: "billingFlow", title: "Billing Flow", type: "DOCUMENTATION", gx: 360, gy: 260 },
  // Quick Fix V1 fixture: empty DOCUMENTATION artifact → MISSING_DOCUMENTATION.
  // documentationContent is never set on creation (column is nullable), so it is
  // null/empty and the rule fires. Linked below so it is not also an orphan.
  { key: "emptyDocTest", title: "Empty Documentation Test", type: "DOCUMENTATION", gx: 560, gy: 260 },
  // MISSING_DOCUMENTATION (Option B) fixture: an ACTIVE SERVICE with no own docs
  // and no incoming DOCUMENTS relation → flagged by the broadened rule and exposes
  // the doc-template Quick Fix. (Given an incoming USES relation below so it is not
  // also flagged as an orphan.)
  { key: "undocSvc", title: "Undocumented Service Test", type: "SERVICE", gx: 760, gy: 0 },
  // Relation Remediation (REVIEW-required) fixtures:
  // SECURITY_POLICY_NOT_LINKED — a policy with no SECURES relation. Documented by
  // an incoming DOCUMENTS edge (below) so it is NOT also an orphan / missing-doc;
  // its title token-matches "Billing Service"/"Billing Database" → SECURES candidates.
  { key: "billingSecNotes", title: "Billing Security Notes", type: "DOCUMENTATION", gx: 560, gy: 140 },
  { key: "billingSecPolicy", title: "Billing Security Policy", type: "SECURITY_POLICY", gx: 360, gy: -80 },
  // Candidate-bearing ORPHAN_ARTIFACT fixture: a SERVICE with NO relations (→
  // ORPHAN_ARTIFACT) whose title token-matches the existing "Patient …" artifacts,
  // so the Review Fix picker offers deterministic, forward-direction candidates
  // (Patient Service → DEPENDS_ON, Patient Database → USES) — not just the manual
  // fallback. The "Patient Registration Flow" DOCUMENTATION match is intentionally
  // skipped by the remediation generator (no backwards DOCUMENTS edge). It carries
  // its own documentation so it does NOT also trip MISSING_DOCUMENTATION — a clean
  // single-finding fixture.
  {
    key: "patientPortal",
    title: "Patient Portal",
    type: "SERVICE",
    gx: 760,
    gy: 140,
    documentationContent: "# Patient Portal\n\nPatient-facing portal (testbed fixture — intentionally left unlinked to demonstrate the ORPHAN_ARTIFACT Review Fix picker).",
  },
];

interface RelationDef { source: string; target: string; type: RelationType; }
const RELATIONS: RelationDef[] = [
  { source: "webApp", target: "gateway", type: "USES" },
  { source: "gateway", target: "authSvc", type: "USES" },
  { source: "gateway", target: "patientSvc", type: "USES" },
  { source: "gateway", target: "apptSvc", type: "USES" },
  { source: "gateway", target: "billingSvc", type: "USES" },
  { source: "authSvc", target: "userDb", type: "USES" },
  { source: "patientSvc", target: "patientDb", type: "USES" },
  { source: "apptSvc", target: "apptDb", type: "USES" },
  { source: "billingSvc", target: "billingDb", type: "USES" },
  { source: "authPolicy", target: "authSvc", type: "SECURES" },
  { source: "hipaaPolicy", target: "patientSvc", type: "SECURES" },
  { source: "hipaaPolicy", target: "apptSvc", type: "SECURES" },
  { source: "patientFlow", target: "patientSvc", type: "DOCUMENTS" },
  { source: "apptFlow", target: "apptSvc", type: "DOCUMENTS" },
  { source: "billingFlow", target: "billingSvc", type: "DOCUMENTS" },
  // Keeps the Quick Fix doc fixture out of ORPHAN_ARTIFACT so the only finding it
  // raises is MISSING_DOCUMENTATION (clean single-finding fixture).
  { source: "emptyDocTest", target: "gateway", type: "DOCUMENTS" },
  // Routes the gateway to the undocumented-service fixture: gives it an incoming
  // relation (not an orphan) WITHOUT documenting it (USES, not DOCUMENTS), so the
  // broadened MISSING_DOCUMENTATION rule fires on it.
  { source: "gateway", target: "undocSvc", type: "USES" },
  // Documents the security-policy fixture: incoming DOCUMENTS keeps it out of
  // ORPHAN_ARTIFACT and MISSING_DOCUMENTATION, so the ONLY finding on it is
  // SECURITY_POLICY_NOT_LINKED (clean Relation Remediation fixture).
  { source: "billingSecNotes", target: "billingSecPolicy", type: "DOCUMENTS" },
];

interface FieldDef { name: string; type: string; pk?: boolean; fk?: string; }
interface EntityDef { name: string; fields: FieldDef[]; }
interface ModelDef { key: string; artifactKey: string; title: string; entities: EntityDef[]; }
const MODELS: ModelDef[] = [
  {
    key: "userDb", artifactKey: "userDb", title: "User Database",
    entities: [
      { name: "User", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "email", type: "text" },
        { name: "passwordHash", type: "text" }, { name: "role", type: "text" }, { name: "createdAt", type: "timestamptz" },
      ] },
      { name: "Session", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "userId", type: "uuid", fk: "User" },
        { name: "accessTokenHash", type: "text" }, { name: "expiresAt", type: "timestamptz" },
      ] },
    ],
  },
  {
    key: "patientDb", artifactKey: "patientDb", title: "Patient Database",
    entities: [
      { name: "Patient", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "fullName", type: "text" }, { name: "email", type: "text" },
        { name: "dateOfBirth", type: "date" }, { name: "phone", type: "text" }, { name: "createdAt", type: "timestamptz" },
      ] },
      { name: "PatientCredential", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "patientId", type: "uuid", fk: "Patient" },
        { name: "passwordHash", type: "text" }, { name: "createdAt", type: "timestamptz" },
      ] },
    ],
  },
  {
    key: "apptDb", artifactKey: "apptDb", title: "Appointment Database",
    entities: [
      { name: "Appointment", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "patientId", type: "uuid", fk: "Patient" },
        { name: "doctorId", type: "uuid" }, { name: "slotId", type: "uuid" },
        { name: "status", type: "text" }, { name: "createdAt", type: "timestamptz" },
      ] },
      { name: "AvailabilitySlot", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "doctorId", type: "uuid" },
        { name: "startsAt", type: "timestamptz" }, { name: "endsAt", type: "timestamptz" }, { name: "isBooked", type: "boolean" },
      ] },
    ],
  },
  {
    key: "billingDb", artifactKey: "billingDb", title: "Billing Database",
    entities: [
      { name: "Invoice", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "patientId", type: "uuid", fk: "Patient" },
        { name: "amountCents", type: "integer" }, { name: "status", type: "text" }, { name: "createdAt", type: "timestamptz" },
      ] },
      { name: "Payment", fields: [
        { name: "id", type: "uuid", pk: true }, { name: "invoiceId", type: "uuid", fk: "Invoice" },
        { name: "paymentToken", type: "text" }, { name: "status", type: "text" }, { name: "createdAt", type: "timestamptz" },
      ] },
    ],
  },
];

interface EndpointDef { method: HttpMethod; path: string; summary: string; requiresAuth: boolean; request: unknown; response: unknown; }
interface SpecDef { title: string; artifactKey: string; baseUrl: string; endpoints: EndpointDef[]; }
const SPECS: SpecDef[] = [
  {
    title: "Patient API", artifactKey: "patientSvc", baseUrl: "/api/v1/patients",
    endpoints: [
      { method: "POST", path: "/patients/register", requiresAuth: false, summary: "Register a new patient account.",
        request: { email: "string (email)", password: "string (min 8)", firstName: "string", lastName: "string", dateOfBirth: "string (YYYY-MM-DD)", phone: "string" },
        response: { id: "string (uuid)", email: "string (email)", role: "PATIENT", createdAt: "string (ISO 8601)" } },
      { method: "GET", path: "/patients/{id}", requiresAuth: true, summary: "Retrieve patient profile.",
        request: "", response: { id: "string (uuid)", fullName: "string", email: "string", dateOfBirth: "string", phone: "string" } },
      { method: "PATCH", path: "/patients/{id}", requiresAuth: true, summary: "Update patient profile.",
        request: { firstName: "string", lastName: "string", phone: "string" }, response: { id: "string (uuid)", fullName: "string", phone: "string" } },
    ],
  },
  {
    title: "Authentication API", artifactKey: "authSvc", baseUrl: "/api/v1/auth",
    endpoints: [
      { method: "POST", path: "/auth/login", requiresAuth: false, summary: "Authenticate a user and start a session.",
        request: { email: "string", password: "string" }, response: { accessToken: "string", user: { id: "string (uuid)", email: "string" } } },
      { method: "POST", path: "/auth/refresh", requiresAuth: false, summary: "Refresh access token.",
        request: { refreshToken: "string" }, response: { accessToken: "string" } },
      { method: "POST", path: "/debug/leak-token", requiresAuth: false, summary: "Unsafe debug endpoint leaking a token.",
        request: { userId: "string (uuid)" }, response: { accessToken: "string", apiSecret: "string" } },
    ],
  },
  {
    title: "Appointment API", artifactKey: "apptSvc", baseUrl: "/api/v1/appointments",
    endpoints: [
      { method: "POST", path: "/appointments", requiresAuth: true, summary: "Create appointment booking.",
        request: { patientId: "string (uuid)", doctorId: "string (uuid)", slotId: "string (uuid)" },
        response: { id: "string (uuid)", patientId: "string (uuid)", doctorId: "string (uuid)", slotId: "string (uuid)", status: "BOOKED" } },
      { method: "PATCH", path: "/appointments/{id}/reschedule", requiresAuth: true, summary: "Reschedule an appointment.",
        request: { rescheduleSlotId: "string (uuid)" }, response: { id: "string (uuid)", slotId: "string (uuid)", status: "RESCHEDULED" } },
      { method: "DELETE", path: "/appointments/{id}", requiresAuth: true, summary: "Cancel appointment.",
        request: "", response: { id: "string (uuid)", status: "CANCELLED" } },
    ],
  },
  {
    title: "Billing API", artifactKey: "billingSvc", baseUrl: "/api/v1/billing",
    endpoints: [
      { method: "POST", path: "/invoices", requiresAuth: true, summary: "Create invoice for patient.",
        request: { patientId: "string (uuid)", amount: "number", currency: "string" },
        response: { invoiceId: "string (uuid)", patientId: "string (uuid)", amountCents: "integer", status: "OPEN" } },
      { method: "POST", path: "/invoices/{id}/pay", requiresAuth: true, summary: "Pay an invoice.",
        request: { paymentToken: "string", amount: "number" }, response: { paymentId: "string (uuid)", invoiceId: "string (uuid)", status: "PAID" } },
      { method: "POST", path: "/invoices/{id}/refund", requiresAuth: true, summary: "Refund invoice payment.",
        request: { refundId: "string (uuid)", reason: "string" }, response: { invoiceId: "string (uuid)", status: "REFUNDED" } },
    ],
  },
];

// Quick Fix V1 diagram fixture. The testbed otherwise has no diagrams.
// FLOWCHART (not ARCHITECTURE) so an unlinked-vs-linked architecture-only rule
// (DIAGRAM_UNLINKED) can't also fire — the ONLY finding is DIAGRAM_EMPTY. Empty
// mermaidSource triggers the rule; the `graph TD` starter the fix writes is valid
// for FLOWCHART, so Apply truly clears the finding on the rerun.
interface DiagramDef { key: string; title: string; type: DiagramType; artifactKey: string | null; mermaidSource: string; }
const DIAGRAMS: DiagramDef[] = [
  { key: "emptyDiagram", title: "Empty Diagram Test", type: "FLOWCHART", artifactKey: "webApp", mermaidSource: "" },
  // DIAGRAM_UNLINKED (Relation Remediation): an ARCHITECTURE diagram with no
  // artifactId. Valid Mermaid (so it does NOT also trip DIAGRAM_INVALID). Node labels
  // match artifact titles → MERMAID_NODE_MATCH (+30) each; the diagram TITLE shares
  // "billing" with Billing Service / Billing Database → +TOKEN_MATCH (20). "Billing
  // Service" is also contained verbatim in "Billing Service Architecture" →
  // +PHRASE_TITLE_MATCH (25) = 75, so it ranks ABOVE Billing Database (50), and both
  // above API Gateway / HIPAA Policy (30/LOW). The fix sets diagram.artifactId.
  {
    key: "unlinkedArch",
    title: "Billing Service Architecture",
    type: "ARCHITECTURE",
    artifactKey: null,
    mermaidSource: `graph LR

API_Gateway["API Gateway"]
Billing_Service["Billing Service"]
Billing_Database["Billing Database"]
HIPAA_Policy["HIPAA Policy"]

API_Gateway --> Billing_Service
Billing_Service --> Billing_Database
HIPAA_Policy -.secures.-> Billing_Service`,
  },
];

// ───────────────────────────────── seeding ─────────────────────────────────

async function findOrCreateUser(): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      firstName: "Deyvid",
      lastName: "Popov",
      role: "ADMIN",
      emailVerifiedAt: new Date(BASE_TS),
    },
    select: { id: true },
  });
}

/** Idempotency: remove only THIS project + its children (scoped, ordered). */
async function deleteTestbed(): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME }, select: { id: true } });
  if (!existing) return;
  const projectId = existing.id;
  await prisma.validationIssue.deleteMany({ where: { projectId } });
  await prisma.versionEvent.deleteMany({ where: { projectId } });
  await prisma.exportPackage.deleteMany({ where: { projectId } });
  await prisma.aiSession.deleteMany({ where: { projectId } });
  await prisma.databaseField.deleteMany({ where: { entity: { databaseModel: { projectId } } } });
  await prisma.databaseEntity.deleteMany({ where: { databaseModel: { projectId } } });
  await prisma.databaseModel.deleteMany({ where: { projectId } });
  await prisma.apiEndpoint.deleteMany({ where: { apiSpec: { projectId } } });
  await prisma.apiSpec.deleteMany({ where: { projectId } });
  await prisma.diagram.deleteMany({ where: { projectId } });
  await prisma.artifactRelation.deleteMany({
    where: { OR: [{ sourceArtifact: { projectId } }, { targetArtifact: { projectId } }] },
  });
  await prisma.artifact.deleteMany({ where: { projectId } });
  await prisma.projectMember.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
}

async function main() {
  // Guard: refuse to run against production / a remote managed DB (this deletes
  // and recreates a project). Same convention as the main seed + prisma:reset.
  assertDestructiveAllowed();

  const user = await findOrCreateUser();
  await deleteTestbed();

  const project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      description:
        "Synthetic project exercising the full API Payload Intelligence chain. Contains intentionally-bad endpoints (e.g. /debug/leak-token) to prove the validation rules fire.",
      ownerId: user.id,
    },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "OWNER" } });

  // Artifacts
  const aid: Record<string, string> = {};
  for (const def of ARTIFACTS) {
    const created = await prisma.artifact.create({
      data: {
        projectId: project.id,
        title: def.title,
        normalizedTitle: normalizeArtifactTitle(def.title),
        type: def.type,
        status: "ACTIVE",
        description: `${def.title} — testbed artifact.`,
        documentationContent: def.documentationContent ?? null,
        tags: [],
        gx: def.gx,
        gy: def.gy,
        createdById: user.id,
      },
    });
    aid[def.key] = created.id;
  }

  // Relations
  const relIds: { id: string; source: string; target: string; type: RelationType }[] = [];
  for (const r of RELATIONS) {
    const created = await prisma.artifactRelation.create({
      data: { sourceArtifactId: aid[r.source], targetArtifactId: aid[r.target], relationType: r.type, description: "", createdById: user.id },
    });
    relIds.push({ id: created.id, source: r.source, target: r.target, type: r.type });
  }

  // Database models — entities first, then fields (to resolve cross-model FKs).
  const entityIdByName = new Map<string, string>();
  const modelIds: { id: string; title: string }[] = [];
  for (const m of MODELS) {
    const model = await prisma.databaseModel.create({
      data: {
        projectId: project.id,
        artifactId: aid[m.artifactKey],
        title: m.title,
        databaseType: "PostgreSQL",
        description: `${m.title} — testbed model.`,
        createdById: user.id,
      },
    });
    modelIds.push({ id: model.id, title: m.title });
    for (const e of m.entities) {
      const entity = await prisma.databaseEntity.create({ data: { databaseModelId: model.id, name: e.name, description: "" } });
      entityIdByName.set(e.name, entity.id);
    }
  }
  for (const m of MODELS) {
    for (const e of m.entities) {
      let pos = 0;
      for (const f of e.fields) {
        const ref = f.fk ? entityIdByName.get(f.fk) ?? null : null;
        await prisma.databaseField.create({
          data: {
            entityId: entityIdByName.get(e.name)!,
            name: f.name,
            type: f.type,
            required: !!f.pk,
            isPrimaryKey: !!f.pk,
            isForeignKey: !!f.fk,
            referencesEntityId: ref,
            position: pos++,
          },
        });
      }
    }
  }

  // API specs + endpoints
  const specIds: { id: string; title: string; endpoints: { id: string; method: HttpMethod; path: string }[] }[] = [];
  for (const s of SPECS) {
    const spec = await prisma.apiSpec.create({
      data: {
        projectId: project.id,
        artifactId: aid[s.artifactKey],
        title: s.title,
        version: "1.0.0",
        baseUrl: s.baseUrl,
        description: `${s.title} — testbed spec.`,
        createdById: user.id,
      },
    });
    const eps: { id: string; method: HttpMethod; path: string }[] = [];
    for (const ep of s.endpoints) {
      const created = await prisma.apiEndpoint.create({
        data: {
          apiSpecId: spec.id,
          path: ep.path,
          method: ep.method,
          summary: ep.summary,
          requestSchema: typeof ep.request === "string" ? ep.request : json(ep.request),
          responseSchema: typeof ep.response === "string" ? ep.response : json(ep.response),
          requiresAuth: ep.requiresAuth,
        },
      });
      eps.push({ id: created.id, method: created.method, path: created.path });
    }
    specIds.push({ id: spec.id, title: s.title, endpoints: eps });
  }

  // Diagrams — incl. the Quick Fix V1 "Empty Diagram Test" fixture (empty source).
  const diagramIds: { id: string; title: string }[] = [];
  for (const d of DIAGRAMS) {
    const created = await prisma.diagram.create({
      data: {
        projectId: project.id,
        artifactId: d.artifactKey ? aid[d.artifactKey] : null,
        title: d.title,
        type: d.type,
        mermaidSource: d.mermaidSource,
        description: `${d.title} — testbed diagram.`,
        createdById: user.id,
      },
    });
    diagramIds.push({ id: created.id, title: created.title });
  }

  // Version events (deterministic timestamps; origin metadata).
  let i = 0;
  const at = () => new Date(BASE_TS + i++ * 1000);
  const ev = recordVersionEvent;
  await ev({ projectId: project.id, entityType: "PROJECT", entityId: project.id, action: "CREATED", title: project.name, description: "Testbed project created", triggeredBy: user.id, metadata: { origin: "SEED", source: "PAYLOAD_TESTBED" }, at: at() });
  for (const def of ARTIFACTS) await ev({ projectId: project.id, entityType: "ARTIFACT", entityId: aid[def.key], action: "CREATED", title: def.title, description: def.type, triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const m of modelIds) await ev({ projectId: project.id, entityType: "DATABASE_MODEL", entityId: m.id, action: "CREATED", title: m.title, description: "PostgreSQL", triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const s of specIds) await ev({ projectId: project.id, entityType: "API_SPEC", entityId: s.id, action: "CREATED", title: s.title, description: "Testbed spec", triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const d of diagramIds) await ev({ projectId: project.id, entityType: "DIAGRAM", entityId: d.id, action: "CREATED", title: d.title, description: "Testbed diagram", triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const r of relIds) await ev({ projectId: project.id, entityType: "RELATION", entityId: r.id, action: "LINKED", title: `${r.source} → ${r.target}`, description: r.type, triggeredBy: user.id, metadata: { origin: "SEED", relationType: r.type }, at: at() });

  // ── Self-verification: run validation + the analysis chain, print outcomes ──
  console.log(`\n✓ Seeded "${PROJECT_NAME}" (${project.id})`);
  console.log(`  ${ARTIFACTS.length} artifacts · ${RELATIONS.length} relations · ${MODELS.length} db models · ${SPECS.length} api specs · ${SPECS.reduce((n, s) => n + s.endpoints.length, 0)} endpoints · ${DIAGRAMS.length} diagrams`);

  const { issues } = await runValidationForProject(project.id, user.id);
  const apiIssues = issues.filter((iss) => /^(API_FIELD_UNMAPPED|PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD|USER_SCOPED_ENDPOINT_WITHOUT_AUTH|RESPONSE_EXPOSES_TOKEN_OR_SECRET) ·/.test(iss.message));
  console.log(`\n── Validation: ${issues.length} total issues; ${apiIssues.length} from API Payload rules ──`);
  for (const iss of apiIssues) console.log(`  [${iss.severity}/${iss.category}] ${iss.message}`);

  // Quick Fix V1 fixtures — prove the findings fire (these expose Preview Fix actions).
  const quickFixIssues = issues.filter((iss) => /"(Empty Documentation Test|Empty Diagram Test|Undocumented Service Test)"/.test(iss.message));
  console.log(`\n── Quick Fix V1 fixtures: ${quickFixIssues.length} issue(s) (expect MISSING_DOCUMENTATION ×2 + DIAGRAM_EMPTY) ──`);
  for (const iss of quickFixIssues) console.log(`  [${iss.severity}/${iss.category}] ${iss.message}`);

  // Option B broadening — how many MISSING_DOCUMENTATION the rule now produces.
  const missingDocs = issues.filter((iss) => iss.category === "DOCUMENTATION" && /no documentation content/.test(iss.message));
  console.log(`\n── MISSING_DOCUMENTATION (Option B): ${missingDocs.length} total ──`);

  // Relation Remediation (REVIEW-required) fixtures — these expose the "Review Fix" picker.
  const remediationIssues = issues.filter(
    (iss) =>
      /not linked to an artifact/.test(iss.message) || // DIAGRAM_UNLINKED
      /no SECURES outgoing relation/.test(iss.message) || // SECURITY_POLICY_NOT_LINKED
      /orphaned/.test(iss.message), // ORPHAN_ARTIFACT
  );
  console.log(`\n── Relation Remediation fixtures: ${remediationIssues.length} (DIAGRAM_UNLINKED + SECURITY_POLICY_NOT_LINKED + ORPHAN_ARTIFACT) ──`);
  for (const iss of remediationIssues) console.log(`  [${iss.severity}/${iss.category}] ${iss.message}`);

  const content = await buildExportContent(project.id, "JSON", ["ARTIFACTS", "RELATIONS", "API_SPECS", "DATABASE_MODELS", "VALIDATION", "TEAM"]);
  const analysis = analyzeExportSnapshot(content);
  console.log("\n── apiIntel metrics ──");
  console.log(json({ ...analysis.apiIntel, sensitiveExposures: `(${analysis.apiIntel.sensitiveExposures.length})`, risks: `(${analysis.apiIntel.risks.length})` }));

  // Per-endpoint intel (architecture links + workflow) over the live data.
  const input = await buildAnalyzerInput(project.id);
  const intel = analyzeProjectApiIntel(input);
  console.log(`\n── Inferred graph edges (overlay): ${intel.inferredEdges.length} ──`);
  const titleById = new Map(Object.entries(aid).map(([k, id]) => [id, ARTIFACTS.find((x) => x.key === k)!.title]));
  for (const e of intel.inferredEdges) console.log(`  ${titleById.get(e.source) ?? e.source} ⤳${e.kind}→ ${titleById.get(e.target) ?? e.target}`);

  // ORPHAN_ARTIFACT Review Fix preview — proves which orphans have deterministic
  // candidates (the picker) vs. only the manual fallback. Mirrors what the
  // remediation preview endpoint computes.
  const rArtifacts = ARTIFACTS.map((d) => ({ id: aid[d.key], title: d.title, type: d.type as string, status: "ACTIVE" }));
  const rRelations = RELATIONS.map((r) => ({ sourceArtifactId: aid[r.source], targetArtifactId: aid[r.target], relationType: r.type as string }));
  const rEdges = intel.inferredEdges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, confidence: e.confidence, basis: e.basis }));
  console.log("\n── ORPHAN_ARTIFACT Review Fix candidates ──");
  for (const d of ARTIFACTS) {
    const isOrphan = !RELATIONS.some((r) => r.source === d.key || r.target === d.key);
    if (!isOrphan) continue;
    const cands = candidatesForOrphan({ id: aid[d.key], title: d.title, type: d.type, status: "ACTIVE" }, rArtifacts, rRelations, rEdges);
    const desc = cands.length
      ? cands.map((c) => `${c.targetTitle} → ${c.relationType} (${c.confidence} ${c.score}/100; ${c.evidence.map((e) => e.type).join("+")})`).join("; ")
      : "no candidates → manual fallback";
    console.log(`  ${d.title}: ${desc}`);
  }
}

async function buildAnalyzerInput(projectId: string): Promise<AnalyzerInput> {
  const [specs, models, artifacts, relations, endpoints] = await Promise.all([
    prisma.apiSpec.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true } }),
    prisma.databaseModel.findMany({ where: { projectId }, select: { id: true, artifactId: true, title: true, entities: { select: { id: true, name: true, fields: { select: { name: true } } } } } }),
    prisma.artifact.findMany({ where: { projectId }, select: { id: true, title: true, type: true, status: true } }),
    prisma.artifactRelation.findMany({ where: { sourceArtifact: { projectId } }, select: { sourceArtifactId: true, targetArtifactId: true, relationType: true } }),
    prisma.apiEndpoint.findMany({ where: { apiSpec: { projectId } }, select: { id: true, apiSpecId: true, method: true, path: true, summary: true, requestSchema: true, responseSchema: true, requiresAuth: true } }),
  ]);
  const bySpec = new Map<string, AnalyzerInput["specs"][number]["endpoints"]>();
  for (const e of endpoints) { const l = bySpec.get(e.apiSpecId) ?? []; l.push(e); bySpec.set(e.apiSpecId, l); }
  return {
    specs: specs.map((s) => ({ id: s.id, artifactId: s.artifactId, title: s.title, endpoints: bySpec.get(s.id) ?? [] })),
    models: models.map((m) => ({ id: m.id, artifactId: m.artifactId, title: m.title, entities: m.entities })),
    artifacts,
    relations,
  };
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
