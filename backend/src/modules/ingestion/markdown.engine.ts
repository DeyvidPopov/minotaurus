// markdown.engine.ts — deterministic Markdown parser.
// Pure functions: no I/O, no AI, no architecture inference. Used by the
// ingestion parse-markdown endpoint to build the preview payload that the
// frontend renders before the user confirms an import.

import type { ArtifactType } from "@prisma/client";

export interface MarkdownPreview {
  title: string;
  excerpt: string;
  headings: string[];
  wordCount: number;
  suggestedArtifactType: ArtifactType;
}

const FRONTMATTER_RE = /^---[\s\S]*?---\s*/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const IMAGE_RE = /!\[[^\]]*\]\([^)]+\)/g;
const LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;

function stripFrontmatter(md: string): string {
  return md.replace(FRONTMATTER_RE, "");
}

function extractHeadings(md: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = [];
  for (const match of md.matchAll(HEADING_RE)) {
    const level = match[1].length;
    const text = match[2].trim();
    if (text) out.push({ level, text });
  }
  return out;
}

function plainBody(md: string): string {
  return md
    .replace(FRONTMATTER_RE, "")
    .replace(CODE_FENCE_RE, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(IMAGE_RE, "")
    .replace(LINK_RE, "$1")
    .replace(INLINE_CODE_RE, "$1")
    .replace(/^\s*[*+\-]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~]/g, "");
}

function buildExcerpt(body: string, max = 220): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}

function countWords(body: string): number {
  const tokens = body.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

function suggestTitle(md: string, headings: { level: number; text: string }[]): string {
  const h1 = headings.find((h) => h.level === 1);
  if (h1) return h1.text;
  const firstLine = stripFrontmatter(md)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("```"));
  if (firstLine) return firstLine.length > 80 ? firstLine.slice(0, 79) + "…" : firstLine;
  return "Imported Markdown";
}

export function parseMarkdown(markdown: string): MarkdownPreview {
  const headings = extractHeadings(markdown);
  const body = plainBody(markdown);
  return {
    title: suggestTitle(markdown, headings),
    excerpt: buildExcerpt(body),
    headings: headings.map((h) => h.text),
    wordCount: countWords(body),
    suggestedArtifactType: "DOCUMENTATION",
  };
}
