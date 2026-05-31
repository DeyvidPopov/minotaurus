// mermaid-normalize.ts — strip Mermaid *styling* directives while preserving
// structure (nodes, edges, labels, diagram type). AI-generated Mermaid must be
// structure-only; the shared renderer owns ALL appearance (colors, fills,
// borders, typography, theme). This pure function enforces that at the AI
// boundary (propose + apply). The renderer's luminance correction in
// frontend mermaid-preview.tsx remains as runtime protection for user-pasted /
// imported diagrams — it is a fallback, not the primary styling strategy.

const INIT_DIRECTIVE = /%%\{[\s\S]*?\}%%/g; // %%{init: {...}}%% theme/config blocks
const INLINE_CLASS = /:::[A-Za-z0-9_-]+/g; // node:::className -> node
const CLASSDEF_LINE = /^\s*classDef\b/i;
const LINKSTYLE_LINE = /^\s*linkStyle\b/i;
const STYLE_STMT = /^\s*style\s+[A-Za-z0-9_.-]+\s+[A-Za-z-]+\s*:/i; // style A fill:#fff
const CLASS_STMT = /^\s*class\s+[^\n{}]+\s+[A-Za-z][\w-]*\s*$/i; // class A,B name (flowchart)
const FLOWCHART_HEADER = /^(?:flowchart|graph)\b/i;

/**
 * Returns `source` with all Mermaid styling/theme directives removed and the
 * diagram structure intact. Idempotent.
 *
 * Safe across diagram types: `classDef`, `style`, `linkStyle`, `%%{init}%%`, and
 * inline `:::class` are styling in every diagram and are always stripped; the
 * `class X Y` *assignment* is only stripped in flowchart/graph diagrams (in a
 * classDiagram, `class Foo` is structure, never styling).
 */
export function normalizeMermaidSource(source: string): string {
  if (!source) return source;

  // 1. Remove init/config/theme directives wholesale (can span lines).
  const work = source.replace(INIT_DIRECTIVE, "");

  // 2. Detect flowchart/graph from the first significant (non-comment) line.
  const firstSignificant =
    work
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("%%")) ?? "";
  const isFlowchart = FLOWCHART_HEADER.test(firstSignificant);

  // 3. Drop pure styling statements; strip inline class operators from the rest.
  return work
    .split(/\r?\n/)
    .filter((line) => {
      if (CLASSDEF_LINE.test(line)) return false;
      if (LINKSTYLE_LINE.test(line)) return false;
      if (STYLE_STMT.test(line)) return false;
      if (isFlowchart && CLASS_STMT.test(line)) return false;
      return true;
    })
    .map((line) => line.replace(INLINE_CLASS, ""))
    .join("\n")
    .replace(/[ \t]+$/gm, "") // trailing whitespace per line
    .replace(/\n{3,}/g, "\n\n") // collapse runs of blank lines
    .trim();
}
