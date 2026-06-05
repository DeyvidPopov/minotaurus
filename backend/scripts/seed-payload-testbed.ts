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

import bcrypt from "bcryptjs";
import type { ArtifactType, HttpMethod, RelationType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { assertDestructiveAllowed } from "../src/lib/destructive-guard.js";
import { recordVersionEvent } from "../src/modules/versions/versions.engine.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import { buildExportContent } from "../src/modules/exports/exports.engine.js";
import { analyzeExportSnapshot } from "../src/modules/exports/analysis/metrics.engine.js";
import { analyzeProjectApiIntel } from "../src/modules/api-intel/payload-analyzer.js";
import type { AnalyzerInput } from "../src/modules/api-intel/api-intel.types.js";
import { normalizeArtifactTitle } from "../src/modules/artifacts/artifact-title.js";

const PROJECT_NAME = "Payload Intelligence Testbed";
const DEMO_EMAIL = "deyvid@minotaurus.dev";
const DEMO_PASSWORD = "minotaurus";
const BASE_TS = new Date("2026-06-01T09:00:00.000Z").getTime();
const json = (o: unknown) => JSON.stringify(o, null, 2);

// ───────────────────────────── data definitions ─────────────────────────────

interface ArtifactDef { key: string; title: string; type: ArtifactType; gx: number; gy: number; }
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

  // Version events (deterministic timestamps; origin metadata).
  let i = 0;
  const at = () => new Date(BASE_TS + i++ * 1000);
  const ev = recordVersionEvent;
  await ev({ projectId: project.id, entityType: "PROJECT", entityId: project.id, action: "CREATED", title: project.name, description: "Testbed project created", triggeredBy: user.id, metadata: { origin: "SEED", source: "PAYLOAD_TESTBED" }, at: at() });
  for (const def of ARTIFACTS) await ev({ projectId: project.id, entityType: "ARTIFACT", entityId: aid[def.key], action: "CREATED", title: def.title, description: def.type, triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const m of modelIds) await ev({ projectId: project.id, entityType: "DATABASE_MODEL", entityId: m.id, action: "CREATED", title: m.title, description: "PostgreSQL", triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const s of specIds) await ev({ projectId: project.id, entityType: "API_SPEC", entityId: s.id, action: "CREATED", title: s.title, description: "Testbed spec", triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const r of relIds) await ev({ projectId: project.id, entityType: "RELATION", entityId: r.id, action: "LINKED", title: `${r.source} → ${r.target}`, description: r.type, triggeredBy: user.id, metadata: { origin: "SEED", relationType: r.type }, at: at() });

  // ── Self-verification: run validation + the analysis chain, print outcomes ──
  console.log(`\n✓ Seeded "${PROJECT_NAME}" (${project.id})`);
  console.log(`  ${ARTIFACTS.length} artifacts · ${RELATIONS.length} relations · ${MODELS.length} db models · ${SPECS.length} api specs · ${SPECS.reduce((n, s) => n + s.endpoints.length, 0)} endpoints`);

  const issues = await runValidationForProject(project.id, user.id);
  const apiIssues = issues.filter((iss) => /^(API_FIELD_UNMAPPED|PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD|USER_SCOPED_ENDPOINT_WITHOUT_AUTH|RESPONSE_EXPOSES_TOKEN_OR_SECRET) ·/.test(iss.message));
  console.log(`\n── Validation: ${issues.length} total issues; ${apiIssues.length} from API Payload rules ──`);
  for (const iss of apiIssues) console.log(`  [${iss.severity}/${iss.category}] ${iss.message}`);

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
