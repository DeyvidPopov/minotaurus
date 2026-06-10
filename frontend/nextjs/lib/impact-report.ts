// lib/impact-report.ts — deterministic Markdown impact report for change sign-off.
// Pure: given the same inputs (with generatedAt injected) it produces the same
// document. The page wraps it in a Blob download — no backend, no Export Engine
// dependency. A reviewer can attach this to a change request or print it to PDF.
import type { ImpactResponse } from "@/lib/api/versions";
import type { ImpactAssessment } from "@/lib/impact-risk";

export interface ImpactReportReach {
  directDependents: number;
  indirectDependents: number;
  directDependencies: number;
  depth: number;
}

export interface ImpactReportInput {
  data: ImpactResponse;
  assessment: ImpactAssessment;
  findings: { severity: string; message: string; code: string | null }[];
  renameRefs: { kind: string; title: string }[];
  reach: ImpactReportReach | null;
  generatedAt: string;
}

const BAND_WORD: Record<string, string> = {
  NONE: "Minimal",
  SAFE: "Safe",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const rel = (t: string): string => t.toLowerCase().replace(/_/g, " ");

export function buildImpactReportMarkdown(input: ImpactReportInput): string {
  const { data, assessment: a, findings, renameRefs, reach, generatedAt } = input;
  const L: string[] = [];

  L.push(`# Impact analysis — ${data.artifact.title}`, "");
  L.push(`- **Type:** ${data.artifact.type}`);
  L.push(`- **Status:** ${data.artifact.status}`);
  L.push(`- **Generated:** ${generatedAt}`, "");

  L.push(`## Verdict`);
  L.push(`- **Overall risk:** ${BAND_WORD[a.overall] ?? a.overall}`);
  L.push(`- **If deleted:** ${BAND_WORD[a.deletion.verdict] ?? a.deletion.verdict} — ${a.deletion.reason}`);
  L.push(`- **If modified:** ${BAND_WORD[a.modification.band] ?? a.modification.band} — ${a.modification.reason}`, "");

  L.push(`### Why`);
  for (const r of a.reasons) L.push(`- ${r}`);
  L.push("");
  L.push(`### How it was calculated`);
  for (const r of a.rules) L.push(`- ${r}`);
  L.push("");

  const indirect = reach && reach.indirectDependents > 0 ? `, ${reach.indirectDependents} indirect within ${reach.depth} hops` : "";
  L.push(`## Impacted components — what breaks (${data.dependentArtifacts.length} direct${indirect})`);
  if (data.dependentArtifacts.length === 0) L.push("_Nothing depends on this artifact._");
  for (const r of data.dependentArtifacts) {
    L.push(`- ${r.artifact.title} (${r.artifact.type}, ${r.artifact.status}) — ${rel(r.relationType)}`);
  }
  L.push("");

  L.push(`## Dependencies — what constrains this (${data.directDependencies.length})`);
  if (data.directDependencies.length === 0) L.push("_No outgoing dependencies._");
  for (const r of data.directDependencies) {
    L.push(`- ${r.artifact.title} (${r.artifact.type}) — ${rel(r.relationType)}`);
  }
  L.push("");

  const assets =
    data.apiSpecs.length + data.databaseModels.length + data.diagrams.length + data.documentation.length;
  L.push(`## Required updates (${assets})`);
  const group = (label: string, items: string[]) => {
    if (items.length === 0) return;
    L.push(`### ${label} (${items.length})`);
    for (const it of items) L.push(`- ${it}`);
  };
  group("API specs", data.apiSpecs.map((s) => `${s.title} v${s.version} (${s.endpointCount} endpoints)`));
  group("Database models", data.databaseModels.map((d) => `${d.title} (${d.databaseType}, ${d.entityCount} entities)`));
  group("Diagrams", data.diagrams.map((d) => `${d.title} (${d.type})`));
  group("Documentation", data.documentation.map((d) => `${d.title} (${d.source})`));
  if (assets === 0) L.push("_No linked assets._");
  L.push("");

  if (renameRefs.length > 0) {
    L.push(`## Rename impact (${renameRefs.length})`);
    L.push(`This artifact's current title is referenced by name in:`);
    for (const r of renameRefs) L.push(`- ${r.title} (${r.kind.toLowerCase()})`);
    L.push("");
  }

  L.push(`## Validation findings (${findings.length})`);
  if (findings.length === 0) L.push("_No open validation findings on this artifact._");
  for (const f of findings) L.push(`- [${f.severity}] ${f.message}${f.code ? ` (${f.code})` : ""}`);
  L.push("");

  L.push("---");
  L.push(
    `_Deterministic impact analysis. The risk verdict is computed from direct (1-hop) relationships; the blast-radius view is shown to ${reach ? reach.depth : 1} hop(s)._`,
  );
  return L.join("\n");
}
