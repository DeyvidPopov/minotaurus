// quick-fix.ts — deterministic, low-risk "Quick Fix" content generators (V1).
//
// V1 supports exactly TWO safe, fully-deterministic fixes:
//   - GENERATE_DOCUMENTATION_TEMPLATE → fills an EMPTY documentation body with a
//     fixed section template (resolves MISSING_DOCUMENTATION).
//   - GENERATE_STARTER_DIAGRAM → seeds an EMPTY graph/flowchart diagram with a
//     minimal starter graph (resolves DIAGRAM_EMPTY).
//
// Explicitly OUT of scope (do NOT add here): AI-generated content, relation
// creation, endpoint generation, security modifications, architecture mutations.
// Those findings stay navigation-only PLANNED actions (see finding-actions.ts).
//
// The content is a PURE function of the fixId — same fixId → byte-identical
// content — so the preview the user sees and the bytes apply writes are
// guaranteed identical (apply re-derives from the fixId and NEVER trusts client
// content). No IO, no clock, no randomness, no DB.

export type QuickFixId = "GENERATE_DOCUMENTATION_TEMPLATE" | "GENERATE_STARTER_DIAGRAM";

// Where the fix writes. Mirrors the resource the finding's target resolves to.
export type QuickFixTargetKind = "ARTIFACT" | "DIAGRAM";

export interface QuickFixDescriptor {
  fixId: QuickFixId;
  /** The finding code this fix resolves (1:1 in V1). */
  code: string;
  targetKind: QuickFixTargetKind;
  /** Modal title. */
  title: string;
  /** One-line, plain-language description of what Apply will do. */
  description: string;
  /** Drives preview rendering: markdown body vs. Mermaid diagram. */
  contentKind: "markdown" | "mermaid";
}

// ── Deterministic content (verbatim per the V1 spec) ──

export const DOCUMENTATION_TEMPLATE = `# Purpose

Describe the purpose of this artifact.

# Overview

Provide a high-level overview.

# Actors

*

# Inputs

*

# Outputs

*

# Flow

1.

2.

3.

# Failure Scenarios

*

# Security Considerations

*

# Dependencies

*
`;

export const STARTER_DIAGRAM = `graph TD
A[Service]
B[Database]

A --> B
`;

// Diagram types whose validation header (`graph`/`flowchart`) is satisfied by the
// STARTER_DIAGRAM. Seeding `graph TD` into e.g. a SEQUENCE diagram would trade
// DIAGRAM_EMPTY for DIAGRAM_INVALID, so the starter fix only applies to these.
// Type-specific starters (sequence/ERD/…) are future work.
export const STARTER_DIAGRAM_TYPES = ["FLOWCHART", "ARCHITECTURE"] as const;

export function starterDiagramSupportsType(type: string): boolean {
  return (STARTER_DIAGRAM_TYPES as readonly string[]).includes(type);
}

const DESCRIPTORS: Record<QuickFixId, QuickFixDescriptor> = {
  GENERATE_DOCUMENTATION_TEMPLATE: {
    fixId: "GENERATE_DOCUMENTATION_TEMPLATE",
    code: "MISSING_DOCUMENTATION",
    targetKind: "ARTIFACT",
    title: "Generate documentation template",
    description:
      "Fill this artifact's empty documentation with a deterministic section template you can edit afterwards. No AI is used.",
    contentKind: "markdown",
  },
  GENERATE_STARTER_DIAGRAM: {
    fixId: "GENERATE_STARTER_DIAGRAM",
    code: "DIAGRAM_EMPTY",
    targetKind: "DIAGRAM",
    title: "Generate starter diagram",
    description:
      "Seed this empty diagram with a minimal starter graph you can build on. No AI is used.",
    contentKind: "mermaid",
  },
};

// Inverse of descriptor.code — the finding code a quick fix resolves.
const FIX_BY_CODE: Record<string, QuickFixId> = {
  MISSING_DOCUMENTATION: "GENERATE_DOCUMENTATION_TEMPLATE",
  DIAGRAM_EMPTY: "GENERATE_STARTER_DIAGRAM",
};

/** The deterministic quick fix for a finding code, or null if none is supported. */
export function getQuickFixIdForCode(code: string): QuickFixId | null {
  return FIX_BY_CODE[code] ?? null;
}

export function getQuickFixDescriptor(fixId: QuickFixId): QuickFixDescriptor {
  return DESCRIPTORS[fixId];
}

/** The exact content a fix writes. Pure function of the fixId. */
export function quickFixContent(fixId: QuickFixId): string {
  return fixId === "GENERATE_DOCUMENTATION_TEMPLATE" ? DOCUMENTATION_TEMPLATE : STARTER_DIAGRAM;
}

export interface QuickFixPreview extends QuickFixDescriptor {
  content: string;
}

/** Descriptor + content — the full preview payload for a fix. */
export function buildQuickFixPreview(fixId: QuickFixId): QuickFixPreview {
  return { ...getQuickFixDescriptor(fixId), content: quickFixContent(fixId) };
}

/** Every supported fix id (for tests / iteration). */
export const QUICK_FIX_IDS = Object.keys(DESCRIPTORS) as QuickFixId[];
