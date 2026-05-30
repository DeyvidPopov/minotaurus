// Export Engine V2 — PDF renderer smoke tests.
//
// Exercises the full docDefinition through pdfmake at runtime so any invalid
// node shape (canvas, table, toc, cards) fails fast. Asserts a valid PDF byte
// stream, not pixels. Run via: npm run test:unit

import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExportSnapshot } from "../analysis/metrics.engine.js";
import { renderArchitecturePdf } from "./pdf.renderer.js";
import type { ExportSnapshot } from "../analysis/analysis.types.js";

const META = { id: "exp-1", format: "PDF", sections: ["ARTIFACTS", "RELATIONS"], createdAt: "2026-05-30T12:00:00.000Z" };

function isPdf(buf: Buffer): boolean {
  return buf.length > 800 && buf.slice(0, 5).toString("latin1") === "%PDF-";
}

const richProject: ExportSnapshot = {
  project: { id: "p1", name: "Aurora Commerce Platform", ownerId: "u1", description: "Demo" },
  generatedAt: "2026-05-30T12:00:00.000Z",
  artifacts: [
    { id: "a1", title: "Checkout requirement", type: "REQUIREMENT", status: "ACTIVE", documentation: { markdownContent: "Spec" } },
    { id: "a2", title: "Order service", type: "SERVICE", status: "ACTIVE" },
    { id: "a3", title: "PCI boundary", type: "SECURITY_POLICY", status: "ACTIVE" },
    { id: "a4", title: "Legacy gateway", type: "SERVICE", status: "DEPRECATED", documentation: { markdownContent: "old" } },
  ],
  relations: [
    { id: "r1", sourceArtifactId: "a2", targetArtifactId: "a1", relationType: "IMPLEMENTS" },
    { id: "r2", sourceArtifactId: "a2", targetArtifactId: "a4", relationType: "DEPENDS_ON" },
  ],
  apiSpecs: [
    { id: "s1", title: "Order API", description: "d", artifactId: "a2", endpoints: [{ id: "e1", summary: "List", requiresAuth: true } as never] },
  ],
  databaseModels: [{ id: "m1", title: "Order DB", description: "d", artifactId: "a2" }],
  diagrams: [{ id: "d1", title: "Flow", type: "FLOWCHART", description: "", artifactId: "a2" }],
  validationIssues: [
    { id: "i1", artifactId: "a2", severity: "CRITICAL", category: "SECURITY", message: "Public auth endpoint", status: "OPEN" },
    { id: "i2", artifactId: "a4", severity: "WARNING", category: "ARCHITECTURE", message: "Deprecated in use", status: "OPEN" },
  ],
  versionHistory: [
    { id: "v1", entityId: "p1", entityType: "VALIDATION", action: "VALIDATED", title: "Run", createdAt: "2026-05-29T12:00:00.000Z" },
    { id: "v2", entityId: "a2", entityType: "ARTIFACT", action: "UPDATED", title: "Edit service", createdAt: "2026-05-28T12:00:00.000Z" },
  ],
  team: [
    { id: "t1", role: "OWNER", email: "o@x.dev" },
    { id: "t2", role: "ARCHITECT", email: "a@x.dev" },
  ],
};

test("renders a valid PDF for a populated project", async () => {
  const analysis = analyzeExportSnapshot(richProject);
  const buf = await renderArchitecturePdf({ content: richProject, analysis, meta: META });
  assert.ok(isPdf(buf), `expected a PDF buffer, got ${buf.length} bytes`);
});

test("determinism: same snapshot renders byte-identical PDFs", async () => {
  const analysis = analyzeExportSnapshot(richProject);
  const a = await renderArchitecturePdf({ content: richProject, analysis, meta: META });
  const b = await renderArchitecturePdf({ content: richProject, analysis, meta: META });
  assert.ok(a.equals(b), "two renders of the same snapshot must be byte-identical");
});

test("renders a valid PDF for an empty project (no crash, fallback branding)", async () => {
  const empty: ExportSnapshot = { project: { id: "p0", name: "Empty", ownerId: "u1" }, generatedAt: "2026-05-30T12:00:00.000Z", artifacts: [] };
  const analysis = analyzeExportSnapshot(empty);
  const buf = await renderArchitecturePdf({ content: empty, analysis, meta: { ...META, sections: [] } });
  assert.ok(isPdf(buf));
});

test("renders with unicode/odd characters in titles without throwing", async () => {
  const weird: ExportSnapshot = {
    project: { id: "p2", name: "Проект 🚀 — Ω", ownerId: "u1" },
    generatedAt: "2026-05-30T12:00:00.000Z",
    artifacts: [{ id: "a1", title: "Service → emoji 🔒 test", type: "SERVICE", status: "ACTIVE" }],
  };
  const analysis = analyzeExportSnapshot(weird);
  const buf = await renderArchitecturePdf({ content: weird, analysis, meta: META });
  assert.ok(isPdf(buf));
});
