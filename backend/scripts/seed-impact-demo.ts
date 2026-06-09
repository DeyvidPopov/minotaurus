// seed-impact-demo.ts — a DEDICATED, idempotent seed for exercising the Impact
// Analysis page, especially the transitive Blast Radius BFS (depth 1/2/3) and
// Rename Impact.
//
// Isolated + idempotent: it manages ONLY the "Impact Analysis Demo" project. It
// find-or-creates the demo user and never wipes other data, so it does NOT touch
// the main demo (seed-demo.ts) or the payload testbed. Re-running deletes and
// recreates only this project. Run with:  npm run seed:impact
//
// The fixture is a deliberate 3-hop dependency chain in BOTH directions around a
// recommended root — "Order Service" — so toggling the Blast Radius depth from
// 1 → 2 → 3 visibly grows the graph:
//
//   Customer Browser → Web Storefront ┐
//   Customer Browser → Mobile App     ├→ API Gateway → ORDER SERVICE → Payment Service → Payment Gateway → Bank API
//                                     ┘                              ├→ Inventory Service → Inventory Database
//                                                                    ├→ Notification Service
//                                                                    └→ Orders Database
//
// From Order Service the BFS reaches (excluding the root):
//   depth 1: 5  (API Gateway · Payment Service · Inventory Service · Notification Service · Orders Database)
//   depth 2: +4 (Web Storefront · Mobile App · Payment Gateway · Inventory Database)
//   depth 3: +2 (Customer Browser · Bank API)
// The risk VERDICT stays 1-hop (1 direct dependent → Medium-ish); only the graph
// view widens. The seed prints this reachability as a self-check.

import bcrypt from "bcryptjs";
import type { ArtifactType, DiagramType, RelationType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { assertDestructiveAllowed } from "../src/lib/destructive-guard.js";
import { recordVersionEvent } from "../src/modules/versions/versions.engine.js";
import { runValidationForProject } from "../src/modules/validation/validation.engine.js";
import { normalizeArtifactTitle } from "../src/modules/artifacts/artifact-title.js";

const PROJECT_NAME = "Impact Analysis Demo";
const DEMO_EMAIL = "deyvid@minotaurus.dev";
const DEMO_PASSWORD = "minotaurus";
const ROOT_KEY = "orderSvc";
const BASE_TS = new Date("2026-06-01T09:00:00.000Z").getTime();

// ───────────────────────────── data definitions ─────────────────────────────

interface ArtifactDef { key: string; title: string; type: ArtifactType; status?: "DRAFT" | "ACTIVE" | "DEPRECATED"; gx: number; gy: number; documentationContent?: string; }
const ARTIFACTS: ArtifactDef[] = [
  { key: "browser", title: "Customer Browser", type: "EXTERNAL_SYSTEM", gx: -780, gy: 0 },
  { key: "webApp", title: "Web Storefront", type: "SERVICE", gx: -560, gy: -90 },
  { key: "mobileApp", title: "Mobile App", type: "SERVICE", gx: -560, gy: 90 },
  { key: "gateway", title: "API Gateway", type: "SERVICE", gx: -340, gy: 0,
    // Mentions the root by name → demonstrates the Rename Impact "documentation" reference.
    documentationContent: "# API Gateway\n\nEdge router for all inbound traffic. Routes checkout calls to the Order Service and forwards auth to downstream services." },
  {
    key: "orderSvc", title: "Order Service", type: "SERVICE", gx: -120, gy: 0,
    // Documented so the root itself is a clean, well-modeled artifact in the verdict.
    documentationContent: "# Order Service\n\nOwns the order lifecycle: validates carts, reserves inventory, charges payment and emits notifications. Central node of the checkout blast radius.",
  },
  { key: "paymentSvc", title: "Payment Service", type: "SERVICE", gx: 120, gy: -120 },
  { key: "inventorySvc", title: "Inventory Service", type: "SERVICE", gx: 120, gy: 0 },
  { key: "notifySvc", title: "Notification Service", type: "SERVICE", gx: 120, gy: 120 },
  { key: "ordersDb", title: "Orders Database", type: "DATABASE_MODEL", gx: 360, gy: 60 },
  { key: "inventoryDb", title: "Inventory Database", type: "DATABASE_MODEL", gx: 360, gy: -20 },
  { key: "paymentGw", title: "Payment Gateway", type: "EXTERNAL_SYSTEM", gx: 360, gy: -180 },
  { key: "bankApi", title: "Bank API", type: "EXTERNAL_SYSTEM", gx: 600, gy: -180 },
];

interface RelationDef { source: string; target: string; type: RelationType; }
// "X USES Y" → X is source, Y is target → X depends on Y. So dependents of a node
// are the SOURCES of edges pointing at it; dependencies are the TARGETS of edges
// leaving it. (Matches impact.controller.ts: dependents = incoming, deps = outgoing.)
const RELATIONS: RelationDef[] = [
  { source: "browser", target: "webApp", type: "USES" },
  { source: "browser", target: "mobileApp", type: "USES" },
  { source: "webApp", target: "gateway", type: "USES" },
  { source: "mobileApp", target: "gateway", type: "USES" },
  { source: "gateway", target: "orderSvc", type: "USES" },
  { source: "orderSvc", target: "paymentSvc", type: "USES" },
  { source: "orderSvc", target: "inventorySvc", type: "USES" },
  { source: "orderSvc", target: "notifySvc", type: "USES" },
  { source: "orderSvc", target: "ordersDb", type: "USES" },
  { source: "paymentSvc", target: "paymentGw", type: "USES" },
  { source: "paymentSvc", target: "ordersDb", type: "USES" },
  { source: "inventorySvc", target: "inventoryDb", type: "USES" },
  { source: "paymentGw", target: "bankApi", type: "USES" },
];

interface DiagramDef { key: string; title: string; type: DiagramType; artifactKey: string | null; mermaidSource: string; }
const DIAGRAMS: DiagramDef[] = [
  // Linked to the root → appears in "Required updates", AND its node labels mention
  // "Order Service" → appears in "Rename impact" (diagram reference).
  {
    key: "checkoutArch",
    title: "Checkout Architecture",
    type: "ARCHITECTURE",
    artifactKey: "orderSvc",
    mermaidSource: `graph LR
Web_Storefront["Web Storefront"] --> API_Gateway["API Gateway"]
Mobile_App["Mobile App"] --> API_Gateway
API_Gateway --> Order_Service["Order Service"]
Order_Service --> Payment_Service["Payment Service"]
Order_Service --> Inventory_Service["Inventory Service"]
Payment_Service --> Payment_Gateway["Payment Gateway"]`,
  },
];

// ───────────────────────────── deterministic BFS (self-check) ────────────────

function reachByDepth(rootKey: string): { dependents: Map<string, number>; dependencies: Map<string, number> } {
  const fwd = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  for (const r of RELATIONS) {
    (fwd.get(r.source) ?? fwd.set(r.source, []).get(r.source)!).push(r.target);
    (rev.get(r.target) ?? rev.set(r.target, []).get(r.target)!).push(r.source);
  }
  const bfs = (adj: Map<string, string[]>): Map<string, number> => {
    const dist = new Map<string, number>([[rootKey, 0]]);
    let frontier = [rootKey];
    for (let d = 1; d <= 3; d++) {
      const next: string[] = [];
      for (const id of frontier) for (const n of adj.get(id) ?? []) if (!dist.has(n)) { dist.set(n, d); next.push(n); }
      frontier = next;
    }
    dist.delete(rootKey);
    return dist;
  };
  return { dependents: bfs(rev), dependencies: bfs(fwd) };
}

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
async function deleteDemo(): Promise<void> {
  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME }, select: { id: true } });
  if (!existing) return;
  const projectId = existing.id;
  await prisma.validationIssue.deleteMany({ where: { projectId } });
  await prisma.versionEvent.deleteMany({ where: { projectId } });
  await prisma.exportPackage.deleteMany({ where: { projectId } });
  await prisma.aiSession.deleteMany({ where: { projectId } });
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
  await deleteDemo();

  const project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      description:
        "Synthetic checkout architecture with a deliberate 3-hop dependency chain in both directions. Open the Impact page for \"Order Service\" and toggle the Blast Radius depth (1 → 2 → 3) to watch the transitive reach grow.",
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
        status: def.status ?? "ACTIVE",
        description: `${def.title} — impact-demo artifact.`,
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

  // Diagrams (Required updates + Rename impact fixture)
  const diagramIds: { id: string; title: string }[] = [];
  for (const d of DIAGRAMS) {
    const created = await prisma.diagram.create({
      data: {
        projectId: project.id,
        artifactId: d.artifactKey ? aid[d.artifactKey] : null,
        title: d.title,
        type: d.type,
        mermaidSource: d.mermaidSource,
        description: `${d.title} — impact-demo diagram.`,
        createdById: user.id,
      },
    });
    diagramIds.push({ id: created.id, title: created.title });
  }

  // Version events (deterministic timestamps; origin metadata).
  let i = 0;
  const at = () => new Date(BASE_TS + i++ * 1000);
  const ev = recordVersionEvent;
  await ev({ projectId: project.id, entityType: "PROJECT", entityId: project.id, action: "CREATED", title: project.name, description: "Impact demo project created", triggeredBy: user.id, metadata: { origin: "SEED", source: "IMPACT_DEMO" }, at: at() });
  for (const def of ARTIFACTS) await ev({ projectId: project.id, entityType: "ARTIFACT", entityId: aid[def.key], action: "CREATED", title: def.title, description: def.type, triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const d of diagramIds) await ev({ projectId: project.id, entityType: "DIAGRAM", entityId: d.id, action: "CREATED", title: d.title, description: "Impact demo diagram", triggeredBy: user.id, metadata: { origin: "SEED" }, at: at() });
  for (const r of relIds) await ev({ projectId: project.id, entityType: "RELATION", entityId: r.id, action: "LINKED", title: `${r.source} → ${r.target}`, description: r.type, triggeredBy: user.id, metadata: { origin: "SEED", relationType: r.type }, at: at() });

  // Validation (so the Change Signals → Validation block has live data).
  const { issues } = await runValidationForProject(project.id, user.id);

  // ── Self-verification ──
  const titleByKey = new Map(ARTIFACTS.map((a) => [a.key, a.title]));
  const { dependents, dependencies } = reachByDepth(ROOT_KEY);
  const atDepth = (m: Map<string, number>, d: number) => [...m.entries()].filter(([, v]) => v === d).map(([k]) => titleByKey.get(k) ?? k);

  console.log(`\n✓ Seeded "${PROJECT_NAME}" (${project.id})`);
  console.log(`  ${ARTIFACTS.length} artifacts · ${RELATIONS.length} relations · ${DIAGRAMS.length} diagram · ${issues.length} validation issue(s)`);
  console.log(`\n── Recommended root: "${titleByKey.get(ROOT_KEY)}" (id ${aid[ROOT_KEY]}) ──`);
  console.log(`  Open: /projects/${project.id}/impact/${aid[ROOT_KEY]}`);
  console.log(`\n── Transitive Blast Radius BFS (what the depth toggle should show) ──`);
  for (let d = 1; d <= 3; d++) {
    console.log(`  depth ${d}:`);
    console.log(`    dependents  (+${atDepth(dependents, d).length}): ${atDepth(dependents, d).join(", ") || "—"}`);
    console.log(`    dependencies(+${atDepth(dependencies, d).length}): ${atDepth(dependencies, d).join(", ") || "—"}`);
  }
  console.log(`  cumulative reached @ depth 3: ${dependents.size + dependencies.size} nodes + root = ${dependents.size + dependencies.size + 1} total`);
  console.log(`\n  Verdict stays 1-hop: ${atDepth(dependents, 1).length} direct dependent(s) → the risk band does not change with depth.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
