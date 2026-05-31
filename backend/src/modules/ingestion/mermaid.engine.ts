// mermaid.engine.ts — deterministic Mermaid source parser.
// No actual Mermaid rendering happens here; the engine only inspects the
// source enough to detect the diagram type, an optional title, a line count,
// and a handful of node-label hints to show in the preview.

import { DiagramType } from "@prisma/client";

export interface MermaidPreview {
  source: "MERMAID";
  title: string;
  diagramType: DiagramType;
  lineCount: number;
  nodeHints: string[];
  mermaidSource: string;
}

export class MermaidParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidParseError";
  }
}

// First non-empty, non-comment line decides the diagram type.
const TYPE_PATTERNS: { type: DiagramType; re: RegExp }[] = [
  { type: "SEQUENCE",     re: /^sequenceDiagram\b/i },
  { type: "ERD",          re: /^erDiagram\b/i },
  { type: "CLASS",        re: /^classDiagram(?:-v2)?\b/i },
  { type: "STATE",        re: /^stateDiagram(?:-v2)?\b/i },
  { type: "GANTT",        re: /^gantt\b/i },
  { type: "FLOWCHART",    re: /^(?:flowchart|graph)\b/i },
];

const TITLE_COMMENT_RE = /^\s*%%\s*title\s*[:\-]\s*(.+?)\s*$/i;

const MERMAID_FENCE_RE = /```\s*mermaid\s*([\s\S]*?)```/i;

function extractMermaidBlock(input: string): string {
  // If the input is a Markdown body containing a ```mermaid``` fence, lift
  // out the fence content. Otherwise return the input unchanged.
  const match = MERMAID_FENCE_RE.exec(input);
  if (match) return match[1].trim();
  return input.trim();
}

function detectType(source: string): DiagramType | null {
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("%%")) continue;
    for (const { type, re } of TYPE_PATTERNS) {
      if (re.test(line)) return type;
    }
    // The first significant line is not a known starter.
    return null;
  }
  return null;
}

function extractTitle(source: string, fallback: string): string {
  for (const raw of source.split(/\r?\n/)) {
    const m = TITLE_COMMENT_RE.exec(raw);
    if (m && m[1]) return m[1].trim();
    // Stop scanning once non-comment content begins — Mermaid title comments
    // are conventionally placed at the very top.
    if (raw.trim() && !raw.trim().startsWith("%%")) break;
  }
  return fallback.trim() || "Imported Mermaid Diagram";
}

// The `>label]` branch is Mermaid's asymmetric "flag" node shape (`id>label]`).
// The negative lookbehind keeps it from matching the `>` inside an edge arrow
// (`-->`, `==>`, `-.->`), which would otherwise swallow the arrow plus the next
// node's opening bracket (e.g. `A[X] --> B[Y]` → a bogus `B[Y` hint).
const NODE_LABEL_RE = /\[([^\]]+?)\]|\(\(([^)]+?)\)\)|\(\[([^\]]+?)\]\)|\{\{([^}]+?)\}\}|(?<![-=.<>])>([^\]]+?)\]|\(([^)]+?)\)/g;
const PARTICIPANT_RE = /^\s*(?:participant|actor)\s+(?:[A-Za-z0-9_-]+\s+as\s+)?([A-Za-z0-9_\- ]+)/gim;
const ERD_ENTITY_RE = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?:\{|\}|\|\||--\|\||\|o--\|\||--o)/m;
const ERD_ENTITY_DECLARATION_RE = /^\s*([A-Za-z][A-Za-z0-9_-]+)\s*\{/gm;

function stripQuotes(s: string): string {
  return s.replace(/^["'`](.*)["'`]$/, "$1").trim();
}

function extractNodeHints(type: DiagramType, source: string): string[] {
  const out = new Set<string>();
  const push = (s: string | undefined) => {
    if (!s) return;
    const cleaned = stripQuotes(s).trim();
    if (!cleaned) return;
    if (cleaned.length > 80) return;
    out.add(cleaned);
  };

  if (type === "SEQUENCE") {
    let m: RegExpExecArray | null;
    while ((m = PARTICIPANT_RE.exec(source)) !== null) push(m[1]);
    // Also pull arrow-line participants like "Customer->>Frontend: …"
    for (const raw of source.split(/\r?\n/)) {
      const arrow = /^\s*([A-Za-z0-9_\- ]+?)\s*-{1,2}>{1,2}\s*([A-Za-z0-9_\- ]+?)\s*:/.exec(raw);
      if (arrow) { push(arrow[1]); push(arrow[2]); }
    }
  } else if (type === "ERD") {
    for (const raw of source.split(/\r?\n/)) {
      const m = ERD_ENTITY_DECLARATION_RE.exec(raw);
      if (m) push(m[1]);
    }
    // Also catch entities mentioned only in relationships like "Users ||--o{ Sessions : has"
    for (const raw of source.split(/\r?\n/)) {
      const rel = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s+[ol|}{-]+\s+([A-Za-z][A-Za-z0-9_-]*)/.exec(raw);
      if (rel) { push(rel[1]); push(rel[2]); }
    }
  } else {
    // FLOWCHART / CLASS / STATE / GANTT / ARCHITECTURE — best effort: pull
    // every bracketed label from the source.
    let m: RegExpExecArray | null;
    while ((m = NODE_LABEL_RE.exec(source)) !== null) {
      push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6]);
    }
  }

  return Array.from(out).slice(0, 40);
}

export function parseMermaid(rawSource: string, options: { sourceName?: string } = {}): MermaidPreview {
  if (!rawSource || !rawSource.trim()) {
    throw new MermaidParseError("Empty Mermaid source");
  }
  const source = extractMermaidBlock(rawSource);
  if (!source) {
    throw new MermaidParseError("Mermaid source is empty after extracting code block");
  }
  const lineCount = source.split(/\r?\n/).length;
  const detected = detectType(source);
  if (!detected) {
    throw new MermaidParseError(
      "Could not detect a Mermaid diagram type. Expected the first non-comment line to start with flowchart / graph / sequenceDiagram / erDiagram / classDiagram / stateDiagram / gantt.",
    );
  }
  const fallbackTitle = options.sourceName?.replace(/\.(mmd|md)$/i, "") || "";
  const title = extractTitle(source, fallbackTitle);
  const nodeHints = extractNodeHints(detected, source);
  return {
    source: "MERMAID",
    title,
    diagramType: detected,
    lineCount,
    nodeHints,
    mermaidSource: source,
  };
}
