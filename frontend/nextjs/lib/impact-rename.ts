// lib/impact-rename.ts — deterministic "what references this by name" scan for
// rename-impact analysis. Pure: looks for whole-word, case-insensitive mentions
// of an artifact's current title in (a) linked/other diagrams' Mermaid source and
// (b) other artifacts' documentation. These are textual references that a rename
// would silently break, which the relation graph cannot see.

export type RenameRefKind = "DIAGRAM" | "DOCUMENTATION";

export interface RenameRef {
  kind: RenameRefKind;
  /** Diagram id (DIAGRAM) or owning artifact id (DOCUMENTATION) — for navigation. */
  id: string;
  /** Title of the diagram / artifact where the reference was found. */
  title: string;
}

interface DiagramLike {
  id: string;
  title: string;
  mermaidSource?: string | null;
}
interface ArtifactLike {
  id: string;
  title: string;
  documentationContent?: string | null;
}

// Whole-word, case-insensitive. Titles shorter than 2 chars are too noisy to
// match safely, so they are skipped.
function mentions(text: string, title: string): boolean {
  const t = title.trim();
  if (t.length < 2) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "i").test(text);
}

export function findRenameReferences(
  artifactId: string,
  title: string,
  diagrams: DiagramLike[],
  artifacts: ArtifactLike[],
): RenameRef[] {
  const refs: RenameRef[] = [];
  for (const d of diagrams) {
    if (d.mermaidSource && mentions(d.mermaidSource, title)) {
      refs.push({ kind: "DIAGRAM", id: d.id, title: d.title });
    }
  }
  for (const a of artifacts) {
    if (a.id === artifactId) continue; // its own docs aren't a rename hazard
    if (a.documentationContent && mentions(a.documentationContent, title)) {
      refs.push({ kind: "DOCUMENTATION", id: a.id, title: a.title });
    }
  }
  return refs;
}
