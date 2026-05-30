// Export Engine V2 — PDF theme & layout primitives.
//
// Centralizes the visual contract (palette, fonts, styles, table layouts) and a
// small set of reusable builders (section headers, metric cards, data tables,
// bars). Linear / Stripe / Datadog feel: neutral slate, light borders, generous
// spacing, no decorative clutter. Keep all visual constants here.

import type { Content, StyleDictionary, TableLayout } from "pdfmake/interfaces";

// ────────────────────────────── palette ──────────────────────────────

export const COLORS = {
  ink: "#0f172a", // slate-900 — headings
  body: "#1e293b", // slate-800 — body text
  muted: "#64748b", // slate-500 — secondary
  subtle: "#94a3b8", // slate-400 — tertiary / captions
  border: "#e2e8f0", // slate-200 — hairlines
  borderStrong: "#cbd5e1", // slate-300
  panel: "#f8fafc", // slate-50 — card fill
  panelAlt: "#f1f5f9", // slate-100 — header-row fill
  accent: "#334155", // slate-700 — accent rules / report title
  white: "#ffffff",
} as const;

export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#b91c1c",
  ERROR: "#dc2626",
  WARNING: "#d97706",
  INFO: "#2563eb",
};

export const GRADE_COLOR: Record<string, string> = {
  A: "#16a34a",
  B: "#4d7c0f",
  C: "#d97706",
  D: "#ea580c",
  F: "#dc2626",
  "N/A": "#64748b",
};

// ────────────────────────────── fonts (standard-14, no embedding) ──────────────────────────────

export const FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
  Courier: {
    normal: "Courier",
    bold: "Courier-Bold",
    italics: "Courier-Oblique",
    bolditalics: "Courier-BoldOblique",
  },
};

export const CONTENT_WIDTH = 515; // A4 (595.28) minus 40pt margins each side

export const STYLES: StyleDictionary = {
  h1: { fontSize: 17, bold: true, color: COLORS.ink },
  sectionSub: { fontSize: 9.5, color: COLORS.muted },
  h2: { fontSize: 12, bold: true, color: COLORS.ink },
  h3: { fontSize: 10, bold: true, color: COLORS.body },
  body: { fontSize: 9.5, color: COLORS.body, lineHeight: 1.25 },
  small: { fontSize: 8, color: COLORS.muted },
  caption: { fontSize: 7.5, color: COLORS.subtle },
  th: { fontSize: 7.5, bold: true, color: COLORS.muted },
  td: { fontSize: 8.5, color: COLORS.body },
  tdMono: { fontSize: 8, color: COLORS.body, font: "Courier" },
  metricValue: { fontSize: 18, bold: true, color: COLORS.ink },
  metricLabel: { fontSize: 7.5, color: COLORS.muted },
  footer: { fontSize: 7.5, color: COLORS.subtle },
  runhead: { fontSize: 7.5, color: COLORS.subtle },
};

// ────────────────────────────── table layouts ──────────────────────────────

/** Clean data table: header underline + light row separators, no vertical lines. */
export const tableLayout: TableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === (node.table.body?.length ?? 0) ? 0 : i === 1 ? 1 : 0.5),
  vLineWidth: () => 0,
  hLineColor: (i) => (i === 1 ? COLORS.borderStrong : COLORS.border),
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  fillColor: (rowIndex) => (rowIndex === 0 ? COLORS.panelAlt : null),
};

/** Card layout: filled panel with a hairline border and roomy padding. */
export const cardLayout: TableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => COLORS.border,
  vLineColor: () => COLORS.border,
  paddingLeft: () => 9,
  paddingRight: () => 9,
  paddingTop: () => 7,
  paddingBottom: () => 7,
  fillColor: () => COLORS.panel,
};

// ────────────────────────────── text safety ──────────────────────────────

/**
 * Standard-14 fonts use WinAnsi encoding. Replace any character outside the
 * Latin-1 representable range with '?' so dynamic content (titles, mermaid,
 * descriptions) can never throw an encoding error mid-render.
 */
export function safe(s: unknown): string {
  return String(s ?? "").replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

/** Percent or em-dash placeholder for null metrics. */
export function pct(v: number | null | undefined): string {
  return v == null ? "N/A" : `${v}%`;
}

export function num(v: number | null | undefined): string {
  return v == null ? "N/A" : String(v);
}

// ────────────────────────────── builders ──────────────────────────────

/** Top-level section header: registers a TOC item and starts a new page. */
export function section(title: string, subtitle?: string): Content {
  const stack: Content[] = [
    { text: safe(title), style: "h1", tocItem: true, margin: [0, 0, 0, subtitle ? 1 : 6] },
  ];
  if (subtitle) stack.push({ text: safe(subtitle), style: "sectionSub", margin: [0, 0, 0, 6] });
  stack.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: COLORS.accent }],
    margin: [0, 0, 0, 12],
  });
  return { stack, pageBreak: "before" };
}

export function subhead(text: string, topMargin = 12): Content {
  return { text: safe(text), style: "h2", margin: [0, topMargin, 0, 6] };
}

export function paragraph(text: string): Content {
  return { text: safe(text), style: "body", margin: [0, 0, 0, 6] };
}

export function note(text: string): Content {
  return { text: safe(text), style: "small", italics: true, margin: [0, 2, 0, 6] };
}

export interface MetricCard {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}

/** A row of equal-width metric cards (dashboard style). */
export function metricCards(cards: MetricCard[]): Content {
  return {
    columns: cards.map((c) => ({
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: safe(c.value), style: "metricValue", color: c.valueColor ?? COLORS.ink },
                { text: safe(c.label), style: "metricLabel", margin: [0, 2, 0, 0] },
                ...(c.sub ? [{ text: safe(c.sub), style: "caption", margin: [0, 1, 0, 0] }] : []),
              ],
            },
          ],
        ],
      },
      layout: cardLayout,
    })),
    columnGap: 8,
  } as Content;
}

/** Horizontal proportional bar (canvas — deterministic, no glyphs). */
export function bar(value: number, max: number, color: string, width = 150): Content {
  const w = max > 0 ? Math.max(0, Math.min(width, Math.round((value / max) * width))) : 0;
  return {
    canvas: [
      { type: "rect" as const, x: 0, y: 0, w: width, h: 7, color: COLORS.panelAlt },
      ...(w > 0 ? [{ type: "rect" as const, x: 0, y: 0, w, h: 7, color }] : []),
    ],
  } as Content;
}

export interface Column {
  header: string;
  width: number | "*" | "auto";
  align?: "left" | "right" | "center";
  mono?: boolean;
}

/** Standard data table with a styled header row. Cells may be strings or Content. */
export function dataTable(columns: Column[], rows: Array<Array<string | Content>>): Content {
  const headerRow: Content[] = columns.map((c) => ({
    text: safe(c.header).toUpperCase(),
    style: "th",
    alignment: c.align ?? "left",
  }));
  const body: Content[][] = [headerRow];
  for (const r of rows) {
    body.push(
      r.map((cell, i) => {
        const col = columns[i];
        if (typeof cell === "string") {
          return {
            text: safe(cell),
            style: col?.mono ? "tdMono" : "td",
            alignment: col?.align ?? "left",
          } as Content;
        }
        return cell;
      }),
    );
  }
  return {
    table: { headerRows: 1, widths: columns.map((c) => c.width), body },
    layout: tableLayout,
    margin: [0, 0, 0, 8],
  };
}

/** Key/value definition table (two columns, no header). */
export function kvTable(rows: Array<[string, string]>): Content {
  return {
    table: {
      widths: [140, "*"],
      body: rows.map(([k, v]) => [
        { text: safe(k), style: "small", margin: [0, 1, 0, 1] },
        { text: safe(v), style: "td", margin: [0, 1, 0, 1] },
      ]),
    },
    layout: "noBorders",
    margin: [0, 0, 0, 8],
  };
}

export function severityChip(severity: string): Content {
  const color = SEVERITY_COLOR[severity] ?? COLORS.muted;
  return { text: safe(severity), bold: true, fontSize: 8, color };
}

// ────────────────────────────── V2 visual builders ──────────────────────────────

export interface StatCard {
  label: string;
  value: string;
  valueColor?: string;
  caption?: string;
}

/**
 * A single bordered metric card (label on top, large value, optional caption).
 * Returned as a table cell so it composes inside `cardRow`/`cardGrid`.
 */
function statCardCell(c: StatCard): Content {
  return {
    table: {
      widths: ["*"],
      heights: [44],
      body: [
        [
          {
            stack: [
              { text: safe(c.label).toUpperCase(), style: "metricLabel" },
              { text: safe(c.value), style: "metricValue", color: c.valueColor ?? COLORS.ink, margin: [0, 3, 0, 0] },
              ...(c.caption ? [{ text: safe(c.caption), style: "caption", margin: [0, 2, 0, 0] }] : []),
            ],
          },
        ],
      ],
    },
    layout: cardLayout,
  } as Content;
}

/** A single row of equal-width stat cards. */
export function cardRow(cards: StatCard[]): Content {
  if (cards.length === 0) return { text: "" };
  return {
    columns: cards.map(statCardCell),
    columnGap: 8,
    margin: [0, 0, 0, 8],
  } as Content;
}

/**
 * Cards laid out in a grid that wraps every `perRow` columns. Trailing slots in
 * the final row are padded with invisible spacers so widths stay uniform.
 */
export function cardGrid(cards: StatCard[], perRow = 4): Content {
  if (cards.length === 0) return { text: "" };
  const rows: Content[] = [];
  for (let i = 0; i < cards.length; i += perRow) {
    const slice = cards.slice(i, i + perRow);
    const cols: Content[] = slice.map(statCardCell);
    while (cols.length < perRow) cols.push({ text: "" }); // pad for uniform width
    rows.push({ columns: cols, columnGap: 8, margin: [0, 0, 0, 8] });
  }
  return { stack: rows };
}

/**
 * A finding rendered as a card (not a table row): a thin severity-colored bar,
 * the rule id + finding text, and a deterministic recommendation beneath.
 */
export function findingCard(opts: {
  severity: string;
  ruleId: string;
  finding: string;
  recommendation: string;
}): Content {
  const color = SEVERITY_COLOR[opts.severity] ?? COLORS.muted;
  return {
    table: {
      widths: [3, "*"],
      body: [
        [
          { text: "", fillColor: color, margin: [0, 0, 0, 0] },
          {
            stack: [
              {
                columns: [
                  { text: safe(opts.ruleId), style: "h3", width: "*" },
                  { text: safe(opts.severity), bold: true, fontSize: 7.5, color, width: "auto" },
                ],
              },
              { text: safe(opts.finding), style: "td", margin: [0, 3, 0, 0] },
              {
                text: [
                  { text: "Recommendation  ", style: "caption", bold: true, color: COLORS.muted },
                  { text: safe(opts.recommendation), style: "small" },
                ],
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number, node) => (i === 0 || i === (node.table.body?.length ?? 0) ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.border,
      paddingLeft: (i: number) => (i === 0 ? 0 : 9),
      paddingRight: () => 9,
      paddingTop: () => 7,
      paddingBottom: () => 7,
      fillColor: (_r: number, _n, colIndex: number) => (colIndex === 0 ? color : COLORS.panel),
    },
    margin: [0, 0, 0, 6],
  } as Content;
}
