// Export Engine V2 — PDF Architecture Intelligence Report renderer.
//
//   AnalysisResult (+ SSOT snapshot)  →  renderArchitecturePdf()  →  Buffer
//
// Presentation only. Every score/metric is read from `analysis`; raw lists in
// the appendix come straight from `content`. No scoring logic is duplicated
// here, no AI, no headless browser. Built on pdfmake with the standard-14 PDF
// fonts (no embedded TTF), so output is dependency-light and deterministic.

import { createHash } from "node:crypto";
// pdfmake's server-side printer is CommonJS (typed locally via
// pdfmake-printer.d.ts). Default-import works under NodeNext CJS output and tsx.
import PdfPrinter from "pdfmake/src/printer";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { RenderInput } from "./pdf.types.js";
import type { AnalysisResult, ExportSnapshot, RiskFinding } from "../analysis/analysis.types.js";
import { MINOTAURUS_LOGO_DATA_URI, MINOTAURUS_LOGO_SVG } from "./logo.js";
import {
  bar,
  cardGrid,
  cardRow,
  COLORS,
  CONTENT_WIDTH,
  dataTable,
  findingCard,
  FONTS,
  GRADE_COLOR,
  kvTable,
  metricCards,
  note,
  num,
  paragraph,
  pct,
  safe,
  section,
  SEVERITY_COLOR,
  severityChip,
  STYLES,
  subhead,
} from "./pdf.theme.js";
import { prepareDiagramSvg } from "./diagram-svg.js";

// Deterministic, rule-keyed recommendations (static text — not AI).
const RECOMMENDATIONS: Record<string, string> = {
  ORPHAN_ARTIFACT: "Connect this artifact to at least one related architecture element, or remove it if obsolete.",
  OVER_COUPLED: "Review responsibilities and consider splitting this component to reduce coupling.",
  DEPRECATED_REFERENCED: "Migrate dependents off the deprecated artifact and remove remaining references.",
  UNIMPLEMENTED_REQUIREMENT: "Link this requirement to the artifact(s) that implement it via an IMPLEMENTS relation.",
  UNDOCUMENTED_SECURITY_POLICY: "Add documentation explaining the scope, enforcement point, and affected components.",
  UNLINKED_SERVICE: "Link this service to its API spec, database model, or a diagram and connect it in the graph.",
  SINGLE_OWNER: "Assign at least one additional OWNER to reduce continuity risk.",
  STALE_VALIDATION: "Run validation to refresh findings for this project.",
  HIGH_CHURN: "Investigate frequent changes; high churn can indicate unstable design or unclear ownership.",
  VALIDATION_ISSUE: "Resolve the underlying validation finding.",
};

const SEVERITY_ORDER = ["CRITICAL", "ERROR", "WARNING", "INFO"];

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  // Deterministic: slice the ISO string, no locale formatting, no Date.now().
  return safe(String(iso).slice(0, 10));
}

// ────────────────────────────── public entry ──────────────────────────────

export async function renderArchitecturePdf(input: RenderInput): Promise<Buffer> {
  const docDefinition = buildDocDefinition(input);
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(docDefinition) as unknown as {
    info?: Record<string, unknown>;
    _id?: Buffer;
  } & NodeJS.ReadableStream & { end: () => void };

  // Determinism: pdfkit otherwise stamps a live CreationDate and a file /ID
  // derived from it, so two renders of the same snapshot would differ
  // byte-for-byte. Pin the dates to the snapshot's generatedAt and override the
  // 16-byte file ID (`_id`, written verbatim into the trailer) with a hash of
  // the snapshot identity.
  const stampMs = Date.parse(input.analysis.meta.generatedAt);
  const stamp = new Date(Number.isNaN(stampMs) ? 0 : stampMs);
  if (doc.info) {
    doc.info.CreationDate = stamp;
    doc.info.ModDate = stamp;
  }
  const seed = `${input.analysis.meta.projectId}|${input.analysis.meta.generatedAt}|${input.meta.id}`;
  doc._id = createHash("md5").update(seed).digest(); // 16 bytes — pdfkit writes this verbatim

  return streamToBuffer(doc);
}

function streamToBuffer(doc: NodeJS.ReadableStream & { end: () => void }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

// ────────────────────────────── document assembly ──────────────────────────────

function buildDocDefinition(input: RenderInput): TDocumentDefinitions {
  const { analysis, content, meta } = input;
  const projectName = safe(content.project?.name || "Untitled Project");

  const content_: Content[] = [
    ...cover(input, projectName),
    { toc: { title: { text: "Contents", style: "h1", margin: [0, 0, 0, 12] } } },
    ...executiveSummary(analysis, content),
    ...healthDashboard(analysis),
    ...narrative(analysis, content),
    ...documentationCoverage(analysis),
    ...graphInsights(analysis),
    ...risks(analysis),
    ...validationFindings(analysis, content),
    ...traceability(analysis, content),
    ...governance(analysis),
    ...versionHistory(content),
    ...exportMetadata(analysis, meta),
    ...appendix(content),
  ];

  return {
    pageSize: "A4",
    pageMargins: [40, 54, 40, 46],
    defaultStyle: { font: "Helvetica", fontSize: 9.5, color: COLORS.body },
    styles: STYLES,
    info: {
      title: `${projectName} - Architecture Intelligence Report`,
      author: "MINOTAURUS.dev",
      creator: "MINOTAURUS.dev Export Engine V2",
      subject: "Single Source of Truth architecture report",
    },
    header: (currentPage: number) =>
      currentPage === 1
        ? undefined
        : {
            columns: [
              { text: projectName, style: "runhead" },
              { text: "Architecture Intelligence Report", style: "runhead", alignment: "right" },
            ],
            margin: [40, 22, 40, 0],
          },
    footer: (currentPage: number, pageCount: number) =>
      currentPage === 1
        ? undefined
        : {
            columns: [
              { text: "MINOTAURUS.dev", style: "footer" },
              { text: `${currentPage} / ${pageCount}`, style: "footer", alignment: "right" },
            ],
            margin: [40, 0, 40, 0],
          },
    content: content_,
  };
}

// ────────────────────────────── 1. cover ──────────────────────────────

function cover(input: RenderInput, projectName: string): Content[] {
  const { analysis, content } = input;
  const score = analysis.health.score;
  const scoreColorVal = score == null ? COLORS.muted : GRADE_COLOR[analysis.health.grade] ?? COLORS.ink;
  const relationCount = Object.values(analysis.connectivity.relationMix).reduce((s, n) => s + n, 0);

  const out: Content[] = [
    { text: "", margin: [0, 70, 0, 0] },
    // Centered logo mark.
    logoBlock(),
    // Centered wordmark + titles.
    { text: "MINOTAURUS", fontSize: 22, bold: true, color: COLORS.ink, alignment: "center", margin: [0, 16, 0, 2], characterSpacing: 2 },
    { text: "Architecture Intelligence Report", fontSize: 13, color: COLORS.accent, alignment: "center" },
    { text: "Single Source of Truth", fontSize: 10.5, color: COLORS.muted, alignment: "center", margin: [0, 2, 0, 24] },
    {
      canvas: [{ type: "line", x1: 120, y1: 0, x2: CONTENT_WIDTH - 120, y2: 0, lineWidth: 0.75, lineColor: COLORS.border }],
      margin: [0, 0, 0, 22],
    },
    { text: safe(projectName), fontSize: 24, bold: true, color: COLORS.ink, alignment: "center", margin: [0, 0, 0, 4] },
    { text: `Generated ${fmtDate(analysis.meta.generatedAt)}`, fontSize: 10, color: COLORS.muted, alignment: "center", margin: [0, 0, 0, 4] },
    {
      text: score == null ? "Architecture Health: N/A" : `Architecture Health  ${score}/100  -  ${safe(analysis.health.label)} (${safe(analysis.health.grade)})`,
      fontSize: 11,
      bold: true,
      color: scoreColorVal,
      alignment: "center",
      margin: [0, 0, 0, 28],
    },
  ];

  // Headline KPI cards: Health / Coverage / Relations / Findings.
  if (!analysis.meta.emptyProject) {
    out.push(
      cardRow([
        { label: "Health Score", value: num(score), valueColor: scoreColorVal, caption: `Grade ${safe(analysis.health.grade)}` },
        { label: "Documentation", value: pct(analysis.documentation.coveragePct), caption: `${analysis.documentation.documentedCount}/${analysis.documentation.total} documented` },
        { label: "Relations", value: String(relationCount), caption: `${analysis.connectivity.orphanCount} orphan(s)` },
        { label: "Findings", value: String(analysis.validation.openCount), caption: "open" },
      ]),
    );
  }

  out.push({ text: "", pageBreak: "after" });
  return out;
}

function logoBlock(): Content {
  if (MINOTAURUS_LOGO_SVG) return { svg: MINOTAURUS_LOGO_SVG, width: 96, alignment: "center" };
  if (MINOTAURUS_LOGO_DATA_URI) return { image: MINOTAURUS_LOGO_DATA_URI, width: 96, alignment: "center" };
  // Fallback text branding — never blocks rendering.
  return { text: "MINOTAURUS.dev", fontSize: 20, bold: true, color: COLORS.ink, alignment: "center" };
}

// ────────────────────────────── 3. executive summary ──────────────────────────────

function executiveSummary(a: AnalysisResult, content: ExportSnapshot): Content[] {
  const out: Content[] = [section("Executive Summary")];

  if (a.meta.emptyProject) {
    out.push(paragraph("This project contains no artifacts. There is insufficient data to produce an architecture health assessment."));
    return out;
  }

  const artifactCount = a.documentation.total;
  const relationCount = Object.values(a.connectivity.relationMix).reduce((s, n) => s + n, 0);
  const crit = a.validation.bySeverity["CRITICAL"] ?? 0;
  const err = a.validation.bySeverity["ERROR"] ?? 0;

  out.push(
    paragraph(
      `This architecture comprises ${artifactCount} artifacts connected through ${relationCount} relations. ` +
        `Documentation coverage is ${pct(a.documentation.coveragePct)}. ` +
        `The architecture health score is ${num(a.health.score)}/100 (${a.health.label}). ` +
        `The latest validation snapshot contains ${a.validation.openCount} open findings ` +
        `(${crit} critical, ${err} errors).`,
    ),
  );

  out.push(subhead("Key figures"));
  out.push(
    metricCards([
      { label: "Artifacts", value: String(artifactCount) },
      { label: "Relations", value: String(relationCount) },
      { label: "Documented", value: pct(a.documentation.coveragePct) },
      { label: "Health", value: num(a.health.score), valueColor: GRADE_COLOR[a.health.grade] },
    ]),
  );
  out.push({ text: "", margin: [0, 6, 0, 0] });
  out.push(
    metricCards([
      { label: "Open findings", value: String(a.validation.openCount) },
      { label: "Orphans", value: String(a.connectivity.orphanCount) },
      { label: "API endpoints", value: String(countEndpoints(content)) },
      { label: "Team", value: String(a.governance.memberCount) },
    ]),
  );

  out.push(subhead("Top attention items"));
  const top = a.risks.slice(0, 6);
  if (top.length === 0) {
    out.push(note("No risks detected."));
  } else {
    out.push({
      ul: top.map((r) => ({
        text: [
          { text: `[${r.severity}] `, color: SEVERITY_COLOR[r.severity] ?? COLORS.muted, bold: true },
          { text: safe(r.message) },
        ],
        style: "td",
        margin: [0, 1, 0, 1],
      })),
    });
  }
  return out;
}

// ────────────────────────────── 4. health dashboard ──────────────────────────────

function healthDashboard(a: AnalysisResult): Content[] {
  const out: Content[] = [section("Architecture Health Dashboard")];
  if (a.meta.emptyProject) {
    out.push(note("Insufficient data to score."));
    return out;
  }

  out.push(
    cardRow([
      { label: "Overall Health", value: `${num(a.health.score)}`, valueColor: GRADE_COLOR[a.health.grade], caption: "/ 100" },
      { label: "Grade", value: safe(a.health.grade), valueColor: GRADE_COLOR[a.health.grade] },
      { label: "Assessment", value: safe(a.health.label) },
    ]),
  );

  out.push(subhead("Dimension scores"));
  const s = a.health.subScores;
  // Each dimension as a metric card.
  out.push(
    cardGrid(
      [
        { label: "Documentation", value: num(s.documentation), valueColor: scoreColor(s.documentation), caption: pctW(a.health.weights.documentation) + " weight" },
        { label: "Connectivity", value: num(s.connectivity), valueColor: scoreColor(s.connectivity), caption: pctW(a.health.weights.connectivity) + " weight" },
        { label: "Traceability", value: num(s.traceability), valueColor: scoreColor(s.traceability), caption: pctW(a.health.weights.traceability) + " weight" },
        { label: "Validation", value: num(s.validation), valueColor: scoreColor(s.validation), caption: pctW(a.health.weights.validation) + " weight" },
        { label: "Governance", value: num(s.governance), valueColor: scoreColor(s.governance), caption: pctW(a.health.weights.governance) + " weight" },
      ],
      5,
    ),
  );

  // Deterministic explanation per dimension, kept underneath the cards.
  out.push(subhead("How each dimension was scored", 8));
  const explain: Array<[string, string]> = [
    ["Documentation", `${pct(a.documentation.coveragePct)} of artifacts documented (${a.documentation.documentedCount}/${a.documentation.total}).`],
    ["Connectivity", `${a.connectivity.orphanCount} orphan(s); average degree ${num(a.connectivity.avgDegree)}; ${a.connectivity.overCoupled.length} over-coupled.`],
    ["Traceability", `${pct(a.traceability.requirementCoverage)} of requirements implemented; ${pct(a.traceability.resourceLinkage)} resource linkage.`],
    ["Validation", `${a.validation.openCount} open finding(s); weighted severity ${a.validation.weightedIssues}.`],
    ["Governance", `${a.governance.signals.filter((x) => x.passed).length}/4 governance checks passed.`],
  ];
  out.push({
    ul: explain.map(([k, v]) => ({
      text: [{ text: `${k}: `, bold: true, color: COLORS.body }, { text: safe(v) }],
      style: "small",
      margin: [0, 1, 0, 1],
    })),
  });

  out.push(
    note(
      `Composite is the weighted average of the five dimension scores (weights shown on each card). ` +
        `Scores are produced by the deterministic analysis engine; the same snapshot always yields the same scores.`,
    ),
  );
  return out;
}

function pctW(w: number): string {
  return `${Math.round(w * 100)}%`;
}

function scoreColor(score: number): string {
  if (score >= 75) return "#16a34a";
  if (score >= 60) return "#d97706";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

// ────────────────────────────── 5. narrative ──────────────────────────────

function narrative(a: AnalysisResult, content: ExportSnapshot): Content[] {
  const out: Content[] = [section("Architecture Narrative", "Deterministic narration of structural facts.")];
  if (a.meta.emptyProject) {
    out.push(note("No artifacts to describe."));
    return out;
  }

  const typeCount = Object.keys(a.documentation.byType).length;
  const relationCount = Object.values(a.connectivity.relationMix).reduce((s, n) => s + n, 0);
  const topHub = a.connectivity.hubs[0];

  out.push(subhead("System composition", 0));
  out.push(
    paragraph(
      `The system contains ${a.documentation.total} artifacts across ${typeCount} artifact type(s). ` +
        composition(a),
    ),
  );

  out.push(subhead("Connectivity & coupling"));
  out.push(
    paragraph(
      `The knowledge graph contains ${relationCount} relations at an average degree of ${num(a.connectivity.avgDegree)}. ` +
        (topHub ? `The most connected component is "${safe(topHub.title)}" with ${topHub.degree} relations. ` : "") +
        `${a.connectivity.orphanCount} artifact(s) are orphaned (no relations). ` +
        `${a.connectivity.overCoupled.length} artifact(s) exceed the coupling threshold.`,
    ),
  );

  out.push(subhead("Traceability & data"));
  out.push(
    paragraph(
      `Requirement coverage is ${pct(a.traceability.requirementCoverage)} ` +
        `(${a.traceability.unimplementedRequirements.length} requirement(s) without an IMPLEMENTS relation). ` +
        `Resource linkage is ${pct(a.traceability.resourceLinkage)} across API specs, database models and diagrams. ` +
        `The project defines ${countDbEntities(content)} database entit(y/ies) and ${countEndpoints(content)} API endpoint(s).`,
    ),
  );

  out.push(subhead("Governance"));
  out.push(
    paragraph(
      `The project has ${a.governance.memberCount} team member(s). ` +
        `Last validated: ${fmtDate(a.governance.lastValidatedAt)}. ` +
        `${a.governance.signals.filter((s) => s.passed).length} of 4 governance checks pass.`,
    ),
  );

  out.push(subhead("Risk callouts"));
  const callouts = a.risks.filter((r) => r.severity === "CRITICAL" || r.severity === "ERROR").slice(0, 8);
  if (callouts.length === 0) {
    out.push(note("No critical or error-level risks detected."));
  } else {
    out.push({
      ul: callouts.map((r) => ({ text: safe(r.message), style: "td", margin: [0, 1, 0, 1] })),
    });
  }
  return out;
}

function composition(a: AnalysisResult): string {
  const entries = Object.entries(a.documentation.byType); // type -> coverage (presence of type key = count>0)
  // We only have coverage %, not counts here; counts live in content. Keep it factual and generic.
  const types = entries.map(([t]) => t).sort();
  if (types.length === 0) return "";
  return `Types present: ${types.join(", ")}.`;
}

// ────────────────────────────── 6. documentation coverage ──────────────────────────────

function documentationCoverage(a: AnalysisResult): Content[] {
  const d = a.documentation;
  const out: Content[] = [section("Documentation Coverage", "Measures presence of documentation, not quality.")];

  out.push(
    metricCards([
      { label: "Coverage", value: pct(d.coveragePct) },
      { label: "Documented", value: String(d.documentedCount) },
      { label: "Total artifacts", value: String(d.total) },
      { label: "Undocumented", value: String(d.undocumented.length) },
    ]),
  );

  out.push(subhead("Coverage by type"));
  const typeRows = Object.entries(d.byType).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  if (typeRows.length === 0) out.push(note("No artifacts."));
  else
    out.push(
      dataTable(
        [
          { header: "Type", width: 130 },
          { header: "Coverage", width: 50, align: "right" },
          { header: "", width: "*" },
        ],
        typeRows.map(([t, v]) => [t, pct(v), bar(v ?? 0, 100, scoreColor(v ?? 0))]),
      ),
    );

  out.push(subhead("Coverage by status"));
  const statusRows = Object.entries(d.byStatus).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  if (statusRows.length === 0) out.push(note("No artifacts."));
  else
    out.push(
      dataTable(
        [
          { header: "Status", width: 130 },
          { header: "Coverage", width: 50, align: "right" },
          { header: "", width: "*" },
        ],
        statusRows.map(([s, v]) => [s, pct(v), bar(v ?? 0, 100, scoreColor(v ?? 0))]),
      ),
    );

  out.push(subhead("Descriptive coverage (non-artifact resources)"));
  out.push(
    metricCards([
      { label: "API spec descriptions", value: pct(d.descriptive.apiSpec) },
      { label: "Endpoint summaries", value: pct(d.descriptive.endpoint) },
      { label: "DB model descriptions", value: pct(d.descriptive.databaseModel) },
      { label: "Diagram descriptions", value: pct(d.descriptive.diagram) },
    ]),
  );

  out.push(subhead("Undocumented artifacts"));
  if (d.undocumented.length === 0) out.push(note("All artifacts are documented."));
  else
    out.push(
      dataTable(
        [
          { header: "Title", width: "*" },
          { header: "Type", width: 110 },
          { header: "Status", width: 70 },
        ],
        d.undocumented.map((u) => [u.title, u.type, u.status]),
      ),
    );
  return out;
}

// ────────────────────────────── 7. knowledge graph insights ──────────────────────────────

function graphInsights(a: AnalysisResult): Content[] {
  const c = a.connectivity;
  const out: Content[] = [section("Knowledge Graph Insights")];

  const relationCount = Object.values(c.relationMix).reduce((s, n) => s + n, 0);
  const topHub = c.hubs[0];
  const mixEntries = Object.entries(c.relationMix).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  const topRelationType = mixEntries[0];

  // Visual insight cards (not just tables).
  out.push(
    cardGrid(
      [
        { label: "Relation Count", value: String(relationCount), caption: `avg degree ${num(c.avgDegree)}` },
        {
          label: "Most Connected Artifact",
          value: topHub ? String(topHub.degree) : "0",
          caption: topHub ? safe(topHub.title) : "none",
        },
        {
          label: "Top Dependency Hub",
          value: topHub ? safe(topHub.title) : "none",
          caption: topHub ? `${topHub.degree} relations` : undefined,
        },
        {
          label: "Orphans",
          value: String(c.orphanCount),
          valueColor: c.orphanCount > 0 ? SEVERITY_COLOR.WARNING : COLORS.ink,
          caption: "no relations",
        },
        {
          label: "Over-Coupled Components",
          value: String(c.overCoupled.length),
          valueColor: c.overCoupled.length > 0 ? SEVERITY_COLOR.INFO : COLORS.ink,
          caption: "exceed threshold",
        },
        {
          label: "Dominant Relation",
          value: topRelationType ? String(topRelationType[1]) : "0",
          caption: topRelationType ? safe(topRelationType[0]) : "none",
        },
      ],
      3,
    ),
  );

  out.push(subhead("Relation mix"));
  const mix = Object.entries(c.relationMix).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  if (mix.length === 0) out.push(note("No relations."));
  else {
    const maxMix = Math.max(...mix.map(([, n]) => n));
    out.push(
      dataTable(
        [
          { header: "Relation type", width: 150 },
          { header: "Count", width: 44, align: "right" },
          { header: "", width: "*" },
        ],
        mix.map(([t, n]) => [t, String(n), bar(n, maxMix, COLORS.accent)]),
      ),
    );
  }

  out.push(subhead("Hubs (most connected)"));
  if (c.hubs.length === 0) out.push(note("No artifacts."));
  else
    out.push(
      dataTable(
        [
          { header: "Artifact", width: "*" },
          { header: "Degree", width: 50, align: "right" },
        ],
        c.hubs.map((h) => [h.title, String(h.degree)]),
      ),
    );

  if (c.overCoupled.length > 0) {
    out.push(subhead("Over-coupled artifacts"));
    out.push(
      dataTable(
        [
          { header: "Artifact", width: "*" },
          { header: "Degree", width: 50, align: "right" },
        ],
        c.overCoupled.map((h) => [h.title, String(h.degree)]),
      ),
    );
  }

  if (c.orphans.length > 0) {
    out.push(subhead("Orphans"));
    out.push(
      dataTable(
        [
          { header: "Artifact", width: "*" },
          { header: "Type", width: 120 },
        ],
        c.orphans.map((o) => [o.title, o.type]),
      ),
    );
  }
  return out;
}

// ────────────────────────────── 8. risks & recommendations ──────────────────────────────

function risks(a: AnalysisResult): Content[] {
  const out: Content[] = [section("Architecture Risks & Recommendations")];
  if (a.risks.length === 0) {
    out.push(note("No risks detected."));
    return out;
  }

  // Severity summary as cards.
  out.push(
    cardRow(
      SEVERITY_ORDER.map((sev) => ({
        label: sev,
        value: String(a.risks.filter((r) => r.severity === sev).length),
        valueColor: SEVERITY_COLOR[sev] ?? COLORS.ink,
      })),
    ),
  );

  // Each finding as a card, grouped by severity.
  for (const sev of SEVERITY_ORDER) {
    const group = a.risks.filter((r) => r.severity === sev);
    if (group.length === 0) continue;
    out.push(subhead(`${sev} (${group.length})`));
    for (const r of group as RiskFinding[]) {
      out.push(
        findingCard({
          severity: r.severity,
          ruleId: r.ruleId,
          finding: r.message,
          recommendation: RECOMMENDATIONS[r.ruleId] ?? "Review and remediate.",
        }),
      );
    }
  }
  return out;
}

// ────────────────────────────── 9. validation findings ──────────────────────────────

function validationFindings(a: AnalysisResult, content: ExportSnapshot): Content[] {
  const out: Content[] = [section("Validation Findings", "Open findings from the latest validation snapshot.")];

  out.push(
    metricCards([
      { label: "Open findings", value: String(a.validation.openCount) },
      { label: "Critical", value: String(a.validation.bySeverity["CRITICAL"] ?? 0), valueColor: SEVERITY_COLOR.CRITICAL },
      { label: "Errors", value: String(a.validation.bySeverity["ERROR"] ?? 0), valueColor: SEVERITY_COLOR.ERROR },
      { label: "Warnings", value: String(a.validation.bySeverity["WARNING"] ?? 0), valueColor: SEVERITY_COLOR.WARNING },
    ]),
  );

  const byCat = Object.entries(a.validation.byCategory).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  if (byCat.length > 0) {
    out.push(subhead("By category"));
    out.push(
      dataTable(
        [
          { header: "Category", width: 160 },
          { header: "Count", width: 50, align: "right" },
        ],
        byCat.map(([c, n]) => [c, String(n)]),
      ),
    );
  }

  // Detail table — open issues straight from the snapshot (presentation of content).
  const artifactTitle = buildArtifactTitleMap(content);
  const open = asArray<NonNullable<ExportSnapshot["validationIssues"]>[number]>(content.validationIssues)
    .filter((v) => v.status === "OPEN")
    .sort(
      (x, y) =>
        (SEVERITY_ORDER.indexOf(x.severity ?? "INFO") - SEVERITY_ORDER.indexOf(y.severity ?? "INFO")) ||
        ((x.category ?? "") < (y.category ?? "") ? -1 : 1),
    );

  out.push(subhead("Open findings"));
  if (open.length === 0) out.push(note("No open findings."));
  else
    out.push(
      dataTable(
        [
          { header: "Severity", width: 56 },
          { header: "Category", width: 80 },
          { header: "Finding", width: "*" },
          { header: "Artifact", width: 110 },
        ],
        open.map((v) => [
          severityChip(v.severity ?? "INFO"),
          v.category ?? "",
          v.message ?? "",
          artifactTitle.get(v.artifactId ?? "") ?? safe(v.artifactId ?? ""),
        ]),
      ),
    );
  return out;
}

// ────────────────────────────── 10. traceability matrix ──────────────────────────────

const TRACE_CAP = 30;

function traceability(a: AnalysisResult, content: ExportSnapshot): Content[] {
  const out: Content[] = [section("Traceability Matrix")];

  out.push(
    metricCards([
      { label: "Requirement coverage", value: pct(a.traceability.requirementCoverage) },
      { label: "Resource linkage", value: pct(a.traceability.resourceLinkage) },
      { label: "Unimplemented reqs", value: String(a.traceability.unimplementedRequirements.length) },
      { label: "Unlinked resources", value: String(a.traceability.unlinkedResources.length) },
    ]),
  );

  // Requirement -> implementers, derived from snapshot relations (presentation).
  const artifacts = asArray<NonNullable<ExportSnapshot["artifacts"]>[number]>(content.artifacts);
  const relations = asArray<NonNullable<ExportSnapshot["relations"]>[number]>(content.relations);
  const titleMap = buildArtifactTitleMap(content);
  const requirements = artifacts.filter((x) => x.type === "REQUIREMENT");
  const implementersByReq = new Map<string, string[]>();
  for (const r of relations) {
    if (r.relationType === "IMPLEMENTS" && r.targetArtifactId && r.sourceArtifactId) {
      const list = implementersByReq.get(r.targetArtifactId) ?? [];
      list.push(titleMap.get(r.sourceArtifactId) ?? r.sourceArtifactId);
      implementersByReq.set(r.targetArtifactId, list);
    }
  }

  out.push(subhead("Requirements"));
  if (requirements.length === 0) out.push(note("No requirements defined."));
  else {
    const shown = requirements.slice(0, TRACE_CAP);
    out.push(
      dataTable(
        [
          { header: "Requirement", width: "*" },
          { header: "Status", width: 64 },
          { header: "Implemented by", width: 200 },
        ],
        shown.map((req) => {
          const impl = implementersByReq.get(req.id);
          return [
            safe(req.title ?? req.id),
            safe(req.status ?? ""),
            impl && impl.length ? impl.map((t) => safe(t)).join(", ") : "— none",
          ];
        }),
      ),
    );
    if (requirements.length > TRACE_CAP)
      out.push(note(`Showing ${TRACE_CAP} of ${requirements.length} requirements. Full list in the appendix.`));
  }

  if (a.traceability.unlinkedResources.length > 0) {
    out.push(subhead("Unlinked resources"));
    out.push(
      dataTable(
        [
          { header: "Resource", width: "*" },
          { header: "Kind", width: 120 },
        ],
        a.traceability.unlinkedResources.slice(0, TRACE_CAP).map((r) => [r.title, r.kind]),
      ),
    );
  }
  return out;
}

// ────────────────────────────── 11. governance ──────────────────────────────

function governance(a: AnalysisResult): Content[] {
  const g = a.governance;
  const out: Content[] = [section("Governance & Ownership")];

  out.push(
    metricCards([
      { label: "Team size", value: String(g.memberCount) },
      { label: "Last validated", value: fmtDate(g.lastValidatedAt) },
      { label: "Governance score", value: `${a.health.subScores.governance}/100` },
    ]),
  );

  out.push(subhead("Role distribution"));
  const roles = Object.entries(g.roleDistribution).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  if (roles.length === 0) out.push(note("No members."));
  else
    out.push(
      dataTable(
        [
          { header: "Role", width: 160 },
          { header: "Members", width: 60, align: "right" },
        ],
        roles.map(([r, n]) => [r, String(n)]),
      ),
    );

  out.push(subhead("Governance signals"));
  out.push(
    dataTable(
      [
        { header: "Control", width: 200 },
        { header: "Status", width: 50 },
        { header: "Evidence", width: "*" },
      ],
      g.signals.map((s) => [
        safe(s.label),
        { text: s.passed ? "Pass" : "Fail", bold: true, fontSize: 8.5, color: s.passed ? "#16a34a" : "#dc2626" } as Content,
        { text: safe(s.evidence), style: "small" } as Content,
      ]),
    ),
  );
  return out;
}

// ────────────────────────────── 12. version & change history ──────────────────────────────

const TIMELINE_CAP = 20;

function versionHistory(content: ExportSnapshot): Content[] {
  const out: Content[] = [section("Version & Change History")];
  const events = asArray<NonNullable<ExportSnapshot["versionHistory"]>[number]>(content.versionHistory);

  if (events.length === 0) {
    out.push(note("No version events in this snapshot."));
    return out;
  }

  const byAction: Record<string, number> = {};
  const churn = new Map<string, number>();
  for (const e of events) {
    const action = e.action ?? "UNKNOWN";
    byAction[action] = (byAction[action] ?? 0) + 1;
    if ((action === "CREATED" || action === "UPDATED") && e.entityId)
      churn.set(e.entityId, (churn.get(e.entityId) ?? 0) + 1);
  }
  const lastExport = events.find((e) => e.action === "EXPORTED");
  const lastValidation = events.find((e) => e.action === "VALIDATED");

  out.push(
    metricCards([
      { label: "Total events", value: String(events.length) },
      { label: "Created", value: String(byAction["CREATED"] ?? 0) },
      { label: "Updated", value: String(byAction["UPDATED"] ?? 0) },
      { label: "Deleted", value: String(byAction["DELETED"] ?? 0) },
    ]),
  );

  out.push(
    kvTable([
      ["Latest export", lastExport ? fmtDate(lastExport.createdAt) : "N/A"],
      ["Latest validation", lastValidation ? fmtDate(lastValidation.createdAt) : "N/A"],
    ]),
  );

  // Most-changed artifacts (presentation count, not a scored metric).
  const titleMap = buildArtifactTitleMap(content);
  const topChanged = [...churn.entries()]
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, 5)
    .filter(([id]) => titleMap.has(id));
  if (topChanged.length > 0) {
    out.push(subhead("Most changed artifacts"));
    out.push(
      dataTable(
        [
          { header: "Artifact", width: "*" },
          { header: "Changes", width: 60, align: "right" },
        ],
        topChanged.map(([id, n]) => [titleMap.get(id) ?? id, String(n)]),
      ),
    );
  }

  out.push(subhead("Recent timeline"));
  const shown = events.slice(0, TIMELINE_CAP);
  out.push(
    dataTable(
      [
        { header: "Date", width: 64 },
        { header: "Action", width: 64 },
        { header: "Entity", width: 90 },
        { header: "Title", width: "*" },
      ],
      shown.map((e) => [fmtDate(e.createdAt), e.action ?? "", e.entityType ?? "", e.title ?? ""]),
    ),
  );
  if (events.length > TIMELINE_CAP) out.push(note(`Showing latest ${TIMELINE_CAP} of ${events.length} events.`));
  return out;
}

// ────────────────────────────── 13. export metadata ──────────────────────────────

function exportMetadata(a: AnalysisResult, meta: RenderInput["meta"]): Content[] {
  const out: Content[] = [section("Export Metadata")];
  out.push(
    kvTable([
      ["Export ID", safe(meta.id || "N/A")],
      ["Project ID", safe(a.meta.projectId || "N/A")],
      ["Format", safe(meta.format || "PDF")],
      ["Generated", fmtDate(a.meta.generatedAt)],
      ["Sections", meta.sections.length ? safe(meta.sections.join(", ")) : "All available"],
      ["Health score", a.health.score == null ? "N/A" : `${a.health.score}/100 (${safe(a.health.grade)})`],
    ]),
  );
  out.push(
    note("This report is generated from a persisted SSOT snapshot and deterministic analysis metrics. The same snapshot always produces the same analysis."),
  );
  return out;
}

// ────────────────────────────── 14. appendix ──────────────────────────────

function appendix(content: ExportSnapshot): Content[] {
  const out: Content[] = [section("Appendix", "Raw supporting data from the SSOT snapshot.")];

  const artifacts = asArray<NonNullable<ExportSnapshot["artifacts"]>[number]>(content.artifacts);
  const apiSpecs = asArray<NonNullable<ExportSnapshot["apiSpecs"]>[number]>(content.apiSpecs);
  const databaseModels = asArray<NonNullable<ExportSnapshot["databaseModels"]>[number]>(content.databaseModels);
  const diagrams = asArray<NonNullable<ExportSnapshot["diagrams"]>[number]>(content.diagrams);
  const issues = asArray<NonNullable<ExportSnapshot["validationIssues"]>[number]>(content.validationIssues);

  // A. Artifact register
  out.push(subhead("A. Artifact register", 0));
  if (artifacts.length === 0) out.push(note("No artifacts."));
  else
    out.push(
      dataTable(
        [
          { header: "Title", width: "*" },
          { header: "Type", width: 100 },
          { header: "Status", width: 60 },
          { header: "Doc", width: 30, align: "center" },
        ],
        artifacts.map((x) => [
          safe(x.title ?? x.id),
          safe(x.type ?? ""),
          safe(x.status ?? ""),
          hasDoc(x) ? "Y" : "-",
        ]),
      ),
    );

  // B. API catalog
  out.push(subhead("B. API catalog"));
  if (apiSpecs.length === 0) out.push(note("No API specs."));
  else
    for (const s of apiSpecs) {
      out.push({ text: safe(s.title ?? s.id), style: "h3", margin: [0, 6, 0, 2] });
      const eps = asArray<NonNullable<NonNullable<ExportSnapshot["apiSpecs"]>[number]["endpoints"]>[number]>(s.endpoints);
      if (eps.length === 0) out.push(note("No endpoints."));
      else
        out.push(
          dataTable(
            [
              { header: "Method", width: 50 },
              { header: "Path", width: "*", mono: true },
              { header: "Auth", width: 40 },
            ],
            eps.map((e) => [
              safe((e as { method?: string }).method ?? ""),
              safe((e as { path?: string }).path ?? ""),
              (e as { requiresAuth?: boolean }).requiresAuth ? "Yes" : "No",
            ]),
          ),
        );
    }

  // C. Database catalog
  out.push(subhead("C. Database catalog"));
  if (databaseModels.length === 0) out.push(note("No database models."));
  else
    for (const m of databaseModels) {
      const mm = m as { title?: string; id: string; databaseType?: string; entities?: unknown[] };
      out.push({ text: `${safe(mm.title ?? mm.id)}  (${safe(mm.databaseType ?? "")})`, style: "h3", margin: [0, 6, 0, 2] });
      const entities = asArray<{ name?: string; fields?: unknown[] }>(mm.entities);
      if (entities.length === 0) out.push(note("No entities."));
      else
        for (const en of entities) {
          const fields = asArray<{ name?: string; type?: string; isPrimaryKey?: boolean; isForeignKey?: boolean; referencesEntityName?: string | null }>(en.fields);
          out.push({ text: safe(en.name ?? ""), bold: true, fontSize: 8.5, margin: [0, 3, 0, 1] });
          if (fields.length === 0) out.push(note("No fields."));
          else
            out.push(
              dataTable(
                [
                  { header: "Field", width: 130, mono: true },
                  { header: "Type", width: 90, mono: true },
                  { header: "Key", width: 50 },
                  { header: "References", width: "*" },
                ],
                fields.map((f) => [
                  safe(f.name ?? ""),
                  safe(f.type ?? ""),
                  f.isPrimaryKey ? "PK" : f.isForeignKey ? "FK" : "",
                  f.referencesEntityName ? `-> ${safe(f.referencesEntityName)}` : "",
                ]),
              ),
            );
        }
    }

  // D. Diagram inventory — rendered diagram (when captured) + Mermaid source.
  out.push(subhead("D. Diagram inventory"));
  if (diagrams.length === 0) out.push(note("No diagrams."));
  else
    for (const d of diagrams) {
      const dd = d as { title?: string; id: string; type?: string; mermaidSource?: string; renderedSvg?: string | null };
      out.push({ text: `${safe(dd.title ?? dd.id)}  (${safe(dd.type ?? "")})`, style: "h3", margin: [0, 8, 0, 3] });

      // Rendered diagram (vector) when a valid, embeddable SVG was captured.
      const prepared = prepareDiagramSvg(dd.renderedSvg);
      if (prepared) {
        out.push({
          table: {
            widths: ["*"],
            body: [[{ svg: prepared.svg, fit: [CONTENT_WIDTH - 18, 320], alignment: "center" }]],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border,
            paddingLeft: () => 9,
            paddingRight: () => 9,
            paddingTop: () => 9,
            paddingBottom: () => 9,
            fillColor: () => COLORS.white,
          },
          margin: [0, 0, 0, 4],
        });
      } else if (dd.renderedSvg) {
        // SVG present but not embeddable (e.g. foreignObject labels) — be honest.
        out.push(note("Rendered diagram unavailable for embedding; showing source."));
      }

      // Mermaid source — always shown (never removed), labeled when paired with a render.
      const src = (dd.mermaidSource ?? "").trim();
      if (!src) {
        out.push(note("No Mermaid source."));
      } else {
        if (prepared) out.push({ text: "Mermaid source", style: "caption", bold: true, color: COLORS.muted, margin: [0, 2, 0, 2] });
        out.push({
          table: { widths: ["*"], body: [[{ text: safe(src), style: "tdMono", fontSize: 7 }]] },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border,
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 5,
            paddingBottom: () => 5,
            fillColor: () => COLORS.panel,
          },
          margin: [0, 0, 0, 8],
        });
      }
    }

  // E. Validation register (all statuses)
  out.push(subhead("E. Validation register"));
  if (issues.length === 0) out.push(note("No validation issues recorded."));
  else {
    const titleMap = buildArtifactTitleMap(content);
    out.push(
      dataTable(
        [
          { header: "Severity", width: 54 },
          { header: "Category", width: 76 },
          { header: "Status", width: 54 },
          { header: "Message", width: "*" },
          { header: "Artifact", width: 90 },
        ],
        issues.map((v) => [
          safe(v.severity ?? ""),
          safe(v.category ?? ""),
          safe(v.status ?? ""),
          safe(v.message ?? ""),
          titleMap.get(v.artifactId ?? "") ?? safe(v.artifactId ?? ""),
        ]),
      ),
    );
  }
  return out;
}

// ────────────────────────────── shared helpers ──────────────────────────────

function buildArtifactTitleMap(content: ExportSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of asArray<NonNullable<ExportSnapshot["artifacts"]>[number]>(content.artifacts)) {
    map.set(a.id, safe(a.title ?? a.id));
  }
  return map;
}

function hasDoc(a: NonNullable<ExportSnapshot["artifacts"]>[number]): boolean {
  const inline = a.documentation?.markdownContent ?? a.documentationContent ?? "";
  return typeof inline === "string" && inline.trim().length > 0;
}

function countEndpoints(content: ExportSnapshot): number {
  return asArray<{ endpoints?: unknown[] }>(content.apiSpecs).reduce(
    (s, spec) => s + asArray(spec.endpoints).length,
    0,
  );
}

function countDbEntities(content: ExportSnapshot): number {
  return asArray<{ entities?: unknown[] }>(content.databaseModels).reduce(
    (s, m) => s + asArray(m.entities).length,
    0,
  );
}

// re-export to silence unused type import in some toolchains
