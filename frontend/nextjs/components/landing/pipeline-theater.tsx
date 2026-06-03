// components/landing/pipeline-theater.tsx — the animated centerpiece.
//
// A single evolving scene that tells the IDEA → ARCHITECTURE → VALIDATION →
// DOCUMENTATION → SSOT story. An SVG knowledge graph BUILDS UP on the left
// (left "stage" area), an HTML inspector SWAPS per stage on the right, and a
// stepper below tracks the 8 stages. Auto-advances every ~2.9s and loops;
// pauses on hover; chips jump to a stage. Reduced-motion users get the fully
// built end-state with no looping.
//
// CRITICAL SVG GOTCHA (see globals.css .wf-node): node positioning lives on an
// OUTER <g transform="translate(...)"> attribute; the opacity/scale pop lives
// on a nested INNER <g className="wf-node">. Never put both on the same <g> —
// the CSS transform overrides the SVG attribute and every node collapses to 0,0.
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ShieldCheck,
  FileText,
  Database as DatabaseIcon,
  Network,
  AlertTriangle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ stages */

type StageKey =
  | "REQ"
  | "ART"
  | "GRAPH"
  | "DB"
  | "API"
  | "VAL"
  | "DOC"
  | "SSOT";

const STAGES: { n: string; key: StageKey; label: string; blurb: string }[] = [
  { n: "01", key: "REQ", label: "Requirement", blurb: "A plain-language need becomes a typed, testable artifact." },
  { n: "02", key: "ART", label: "Artifacts", blurb: "Minotaurus derives the services, models and docs it implies." },
  { n: "03", key: "GRAPH", label: "Knowledge graph", blurb: "Every artifact is wired into one connected, navigable graph." },
  { n: "04", key: "DB", label: "Database models", blurb: "Tables, keys and entities are pinned to the services that own them." },
  { n: "05", key: "API", label: "API specs", blurb: "Endpoints are generated and linked back to their data + docs." },
  { n: "06", key: "VAL", label: "Validation", blurb: "Deterministic rules sweep the graph. Drift surfaces, then resolves." },
  { n: "07", key: "DOC", label: "Documentation", blurb: "Human-readable docs are generated from the verified graph." },
  { n: "08", key: "SSOT", label: "Single source", blurb: "The whole system is sealed into one versioned, reproducible bundle." },
];

const STAGE_COUNT = STAGES.length;
const ADVANCE_MS = 2900;
const VAL_RESOLVE_MS = 1200;

/* ------------------------------------------------------------------- graph */

const TYPE_COLOR: Record<string, string> = {
  REQUIREMENT: "#06b6d4",
  SERVICE: "#3b82f6",
  DOCUMENTATION: "#f59e0b",
  SECURITY_POLICY: "#ef4444",
  API_ENDPOINT: "#a78bfa",
  API_SPEC: "#8b5cf6",
  DATABASE_MODEL: "#10b981",
};

type NodeId = "req" | "svc" | "doc" | "sec" | "ep" | "api" | "db";

interface GNode {
  x: number;
  y: number;
  type: keyof typeof TYPE_COLOR;
  title: string;
  sub: string;
  order: number; // stagger order for the pop-in
}

const HW = 66; // card half-width
const HH = 20; // card half-height

const NODES: Record<NodeId, GNode> = {
  req: { x: 230, y: 46, type: "REQUIREMENT", title: "REQ-204", sub: "Requirement", order: 0 },
  svc: { x: 230, y: 168, type: "SERVICE", title: "auth-service", sub: "Service", order: 0 },
  doc: { x: 86, y: 250, type: "DOCUMENTATION", title: "Reset flow", sub: "Doc", order: 2 },
  sec: { x: 374, y: 250, type: "SECURITY_POLICY", title: "MFA policy", sub: "Security", order: 3 },
  ep: { x: 230, y: 300, type: "API_ENDPOINT", title: "/auth/reset", sub: "Endpoint", order: 1 },
  api: { x: 104, y: 380, type: "API_SPEC", title: "auth.json", sub: "API spec", order: 4 },
  db: { x: 356, y: 380, type: "DATABASE_MODEL", title: "reset_tokens", sub: "DB model", order: 5 },
};

interface GEdge {
  id: string;
  from: NodeId;
  to: NodeId;
  bow: number;
  path: string;
  tipX: number; // arrowhead tip (path end)
  tipY: number;
  angle: number; // end-tangent direction in degrees (travel direction)
}

// Trim an edge to the card boundary along the line toward `toward`, with a gap.
function edgePoint(c: GNode, toward: GNode, gap: number) {
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const s = 1 / Math.max(Math.abs(dx) / (HW + gap), Math.abs(dy) / (HH + gap));
  return { x: c.x + dx * s, y: c.y + dy * s };
}

// Visible arrowhead length (matches the polygon below, which spans 0 → -7 in x)
// and the breathing room left between the arrow tip and the target card.
const WF_ARROW_LEN = 7;
const WF_NODE_GAP = 7;

function buildEdge(a: GNode, b: GNode, bow: number) {
  const p1 = edgePoint(a, b, 3);
  // The arrowhead TIP sits WF_NODE_GAP px off the target card (clear breathing
  // room, not touching it).
  const tip = edgePoint(b, a, WF_NODE_GAP);
  const mx = (p1.x + tip.x) / 2;
  const my = (p1.y + tip.y) / 2;
  const dx = tip.x - p1.x;
  const dy = tip.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * bow;
  const cy = my + py * bow;
  // End-tangent unit vector (control → tip) = the quadratic's exit direction.
  const tdx = tip.x - cx;
  const tdy = tip.y - cy;
  const tlen = Math.hypot(tdx, tdy) || 1;
  const ux = tdx / tlen;
  const uy = tdy / tlen;
  // The drawn LINE stops one px shy of the arrowhead base (tip − WF_ARROW_LEN),
  // so the triangle alone forms the point — no stroke nub poking past the tip.
  const ex = tip.x - ux * (WF_ARROW_LEN - 1);
  const ey = tip.y - uy * (WF_ARROW_LEN - 1);
  const path = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  return { path, tipX: tip.x, tipY: tip.y, angle };
}

const EDGES: GEdge[] = (
  [
    { id: "req-svc", from: "req", to: "svc", bow: 0 },
    { id: "svc-doc", from: "svc", to: "doc", bow: -16 },
    { id: "svc-sec", from: "svc", to: "sec", bow: 16 },
    { id: "svc-ep", from: "svc", to: "ep", bow: 0 },
    { id: "ep-api", from: "ep", to: "api", bow: -14 },
    { id: "ep-db", from: "ep", to: "db", bow: 14 },
  ] as Omit<GEdge, "path" | "tipX" | "tipY" | "angle">[]
).map((e) => ({ ...e, ...buildEdge(NODES[e.from], NODES[e.to], e.bow) }));

// Per-edge draw timing (kept in sync with the CSS transition + the stagger
// applied below) so each arrowhead can fade in only once its line has arrived.
const EDGE_DRAW_MS = 700;
const EDGE_STAGGER_MS = 90;

function nodeVisible(id: NodeId, idx: number) {
  return id === "req" ? idx >= 0 : idx >= 1;
}

const FOCUS_BY_STAGE: Partial<Record<StageKey, NodeId>> = {
  DB: "db",
  API: "api",
  DOC: "doc",
};

type Badge = "warn" | "check" | null;

function badgeFor(
  id: NodeId,
  stageKey: StageKey,
  valResolved: boolean,
): Badge {
  if (stageKey === "SSOT") return "check"; // every visible node sealed
  if (stageKey === "VAL") {
    if (id === "db" || id === "api") return valResolved ? "check" : "warn";
    return null;
  }
  if (stageKey === "DOC") {
    if (id === "db" || id === "api") return "check";
    return null;
  }
  return null;
}

/* -------------------------------------------------------------- component */

export function PipelineTheater() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [valResolved, setValResolved] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Respect prefers-reduced-motion: jump to the built end-state, no looping.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setIdx(STAGE_COUNT - 1);
        setValResolved(true);
      }
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const stage = STAGES[idx];
  const stageKey = stage.key;

  // Validation warnings resolve to green ~1.2s after entering the VAL stage.
  useEffect(() => {
    if (reduced) {
      setValResolved(true);
      return;
    }
    if (stageKey === "VAL") {
      setValResolved(false);
      const t = setTimeout(() => setValResolved(true), VAL_RESOLVE_MS);
      return () => clearTimeout(t);
    }
  }, [stageKey, reduced]);

  // Auto-advance + loop. Re-runs (and resets the timer) on idx / pause change.
  useEffect(() => {
    if (paused || reduced) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % STAGE_COUNT), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [idx, paused, reduced]);

  const jump = useCallback((i: number) => setIdx(i), []);

  const focusNode = FOCUS_BY_STAGE[stageKey];

  return (
    <div
      className="theater-grid"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ---------------------------------------------------------- stage */}
      <div
        style={{ gridArea: "stage" }}
        className="rounded-xl border border-border bg-panel overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-panel-2 text-[12px] text-fg-muted">
          <div className="flex gap-1.5">
            <i className="w-2 h-2 rounded-full bg-border-strong" />
            <i className="w-2 h-2 rounded-full bg-border-strong" />
            <i className="w-2 h-2 rounded-full bg-border-strong" />
          </div>
          <span className="font-mono">helix-auth / knowledge-graph</span>
          <span className="flex-1" />
          <span className="font-mono text-[11px]">
            {idx === 0 ? 1 : 7} nodes · {idx >= 2 ? 6 : 0} edges
          </span>
        </div>
        <div
          className="relative"
          style={{ background: "var(--bg-2)" }}
        >
          <svg viewBox="0 0 460 430" className="w-full block" role="img" aria-label="Knowledge graph building up across the workflow stages">
            <defs>
              {/* card silhouette — clips the colored left band to the rounded
                  corners (the SVG equivalent of the app node's overflow:hidden),
                  resolved in each node's local coords via userSpaceOnUse */}
              <clipPath id="wf-card-clip">
                <rect x={0} y={0} width={HW * 2} height={HH * 2} rx={9} />
              </clipPath>
            </defs>

            {/* edges (rendered first so opaque cards paint over the tails).
                The arrowhead is an explicit triangle at the path end — not an
                SVG marker — so it can be (a) positioned exactly on the tip and
                (b) held hidden until the line has finished drawing into it. */}
            {EDGES.map((e, i) => {
              const drawn =
                idx >= 2 && nodeVisible(e.from, idx) && nodeVisible(e.to, idx);
              const pulsing = drawn && stageKey === "GRAPH";
              const drawDelay = i * EDGE_STAGGER_MS;
              return (
                <g key={e.id}>
                  <path
                    d={e.path}
                    pathLength={1}
                    className={cn(
                      "wf-edge",
                      drawn && "is-drawn",
                      pulsing && "is-pulsing",
                    )}
                    style={{ transitionDelay: `${drawDelay}ms` }}
                  />
                  <g transform={`translate(${e.tipX} ${e.tipY}) rotate(${e.angle})`}>
                    <polygon
                      points="0,0 -7,-3.1 -7,3.1"
                      className={cn(
                        "wf-arrowhead",
                        drawn && "is-on",
                        pulsing && "is-pulsing",
                      )}
                      // fade in just as the line arrives (draw delay + duration)
                      style={{
                        transitionDelay: drawn
                          ? `${drawDelay + EDGE_DRAW_MS - 60}ms`
                          : "0ms",
                      }}
                    />
                  </g>
                </g>
              );
            })}

            {/* nodes */}
            {(Object.keys(NODES) as NodeId[]).map((id) => {
              const n = NODES[id];
              const color = TYPE_COLOR[n.type];
              const visible = nodeVisible(id, idx);
              return (
                <g key={id} transform={`translate(${n.x - HW} ${n.y - HH})`}>
                  <g
                    className={cn("wf-node", visible && "is-visible")}
                    style={{ transitionDelay: `${n.order * 70}ms` }}
                  >
                    {/* focus ring — hugs the rounded card edge (cropped to the
                        corner), matching the app's selected-node treatment */}
                    <rect
                      className={cn("wf-focus", focusNode === id && "is-on")}
                      style={{ ["--ring-color" as string]: color }}
                      x={-1.5}
                      y={-1.5}
                      width={HW * 2 + 3}
                      height={HH * 2 + 3}
                      rx={9.5}
                    />
                    <rect
                      x={0}
                      y={0}
                      width={HW * 2}
                      height={HH * 2}
                      rx={8}
                      fill="var(--panel)"
                      stroke={focusNode === id ? color : "var(--border-strong)"}
                      strokeWidth={focusNode === id ? 2 : 1}
                    />
                    {/* colored left band — clipped to the rounded card corners */}
                    <rect
                      x={0}
                      y={0}
                      width={4}
                      height={HH * 2}
                      fill={color}
                      clipPath="url(#wf-card-clip)"
                    />
                    {/* title + uppercase type label, matching the in-app "color"
                        graph node (MinoNode): fg title at weight 500 with the
                        type-colored uppercase label beneath — no leading dot. */}
                    <text x={14} y={HH - 2} fontSize={12} fontWeight={500} fill="var(--fg)">
                      {n.title}
                    </text>
                    <text
                      x={14}
                      y={HH + 11}
                      fontSize={9}
                      fontWeight={700}
                      fill={color}
                      style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
                    >
                      {n.sub}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* badges layer (on top of nodes) */}
            {(Object.keys(NODES) as NodeId[]).map((id) => {
              const n = NODES[id];
              if (!nodeVisible(id, idx)) return null;
              const b = badgeFor(id, stageKey, valResolved);
              if (!b) return null;
              return (
                <g key={`b-${id}`} transform={`translate(${n.x + HW - 6} ${n.y - HH + 4})`}>
                  {/* key={b} remounts so the pop replays when warn → check */}
                  <g className="wf-badge" key={b}>
                    {b === "warn" ? (
                      <>
                        <circle r={8} fill="var(--c-warning)" />
                        <path
                          d="M0 -3.5 L0 1 M0 3.4 L0 3.5"
                          stroke="#1a1205"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                        />
                      </>
                    ) : (
                      <>
                        <circle r={8} fill="var(--c-success)" />
                        <path
                          d="M-3 0 L-0.6 2.6 L3.4 -2.6"
                          fill="none"
                          stroke="#04150d"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}
                  </g>
                </g>
              );
            })}

            {/* SSOT seal ring */}
            <rect
              className={cn("wf-seal", stageKey === "SSOT" && "is-on")}
              x={6}
              y={6}
              width={448}
              height={418}
              rx={16}
              pathLength={1}
            />
          </svg>
        </div>
      </div>

      {/* ------------------------------------------------------ inspector */}
      <div
        style={{ gridArea: "inspector" }}
        className="rounded-xl border border-border bg-panel p-5 min-h-[360px] flex flex-col"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] text-fg-subtle tracking-wider">
            {stage.n} · {stage.label.toUpperCase()}
          </span>
        </div>
        {/* key={idx} replays the crossfade entrance on every stage change */}
        <div key={idx} className="wf-inspector flex-1">
          <Inspector stageKey={stageKey} valResolved={valResolved} />
        </div>
      </div>

      {/* -------------------------------------------------------- stepper */}
      <div style={{ gridArea: "stepper" }}>
        <div className="h-1.5 rounded-full bg-panel-2 border border-border overflow-hidden mb-4">
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${((idx + 1) / STAGE_COUNT) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {STAGES.map((s, i) => {
            const active = i === idx;
            const done = i < idx;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => jump(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-md border text-left transition-colors",
                  active
                    ? "border-accent bg-accent-soft"
                    : "border-border bg-panel hover:bg-panel-hover",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[11px] flex items-center gap-1",
                    active
                      ? "text-accent"
                      : done
                        ? "text-success"
                        : "text-fg-subtle",
                  )}
                >
                  {done ? <Check size={11} /> : s.n}
                </span>
                <span
                  className={cn(
                    "text-[11.5px] leading-tight font-medium",
                    active ? "text-fg" : "text-fg-muted",
                  )}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13.5px] text-fg-muted">{stage.blurb}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- inspector views */

function Inspector({
  stageKey,
  valResolved,
}: {
  stageKey: StageKey;
  valResolved: boolean;
}) {
  switch (stageKey) {
    case "REQ":
      return <InspectorReq />;
    case "ART":
      return <InspectorArt />;
    case "GRAPH":
      return <InspectorGraph />;
    case "DB":
      return <InspectorDb />;
    case "API":
      return <InspectorApi />;
    case "VAL":
      return <InspectorVal valResolved={valResolved} />;
    case "DOC":
      return <InspectorDoc />;
    case "SSOT":
      return <InspectorSsot />;
  }
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-panel-2 border border-border text-[11px] font-mono text-fg-muted">
      {children}
    </span>
  );
}

function InspectorReq() {
  return (
    <div className="flex flex-col gap-3">
      <blockquote className="wf-row text-[15px] italic text-fg leading-relaxed border-l-2 border-border-strong pl-3">
        “users need to reset a forgotten password”
      </blockquote>
      <div className="wf-row flex justify-center text-fg-subtle" style={{ animationDelay: "0.1s" }}>
        <ArrowDown size={16} />
      </div>
      <div
        className="wf-row rounded-lg border border-border bg-panel-2 p-3.5"
        style={{ borderLeft: "3px solid #06b6d4", animationDelay: "0.2s" }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-mono text-[12px] font-semibold" style={{ color: "#06b6d4" }}>
            REQ-204
          </span>
          <span className="text-[11px] text-fg-subtle font-mono">Requirement</span>
        </div>
        <p className="m-0 text-[13px] text-fg leading-relaxed">
          The system must let an authenticated-capable user request, confirm and
          complete a password reset via a time-limited, single-use token.
        </p>
        <div className="flex gap-1.5 mt-2.5">
          <Tag>acceptance: 3</Tag>
          <Tag>priority: high</Tag>
        </div>
      </div>
    </div>
  );
}

function InspectorArt() {
  const rows: { title: string; type: string; color: string }[] = [
    { title: "auth-service", type: "Service", color: "#3b82f6" },
    { title: "/auth/reset", type: "Endpoint", color: "#a78bfa" },
    { title: "reset_tokens", type: "DB model", color: "#10b981" },
    { title: "MFA policy", type: "Security", color: "#ef4444" },
    { title: "Reset flow", type: "Doc", color: "#f59e0b" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12.5px] text-fg-muted mb-1">Derived artifacts</p>
      {rows.map((r, i) => (
        <div
          key={r.title}
          className="wf-row flex items-center gap-2.5 rounded-md border border-border bg-panel-2 px-3 py-2"
          style={{ animationDelay: `${i * 0.09}s` }}
        >
          <Check size={14} className="text-success shrink-0" />
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
          <span className="font-mono text-[13px] text-fg">{r.title}</span>
          <span className="ml-auto text-[11px] text-fg-subtle">{r.type}</span>
        </div>
      ))}
    </div>
  );
}

function InspectorGraph() {
  const rels: [string, string, string][] = [
    ["auth-service", "IMPLEMENTS", "REQ-204"],
    ["/auth/reset", "EXPOSES", "auth.json"],
    ["/auth/reset", "USES", "reset_tokens"],
    ["MFA policy", "SECURES", "auth-service"],
    ["Reset flow", "DOCUMENTS", "auth-service"],
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12.5px] text-fg-muted mb-1">Relations</p>
      {rels.map((r, i) => (
        <div
          key={i}
          className="wf-row flex items-center gap-2 flex-wrap rounded-md bg-panel-2 border border-border px-3 py-1.5 text-[12.5px]"
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <span className="font-mono text-fg">{r[0]}</span>
          <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-sm bg-accent-soft text-accent">
            {r[1]}
          </span>
          <span className="font-mono text-fg">{r[2]}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 text-[12px] text-fg-muted">
        <Network size={13} className="text-accent" />
        <span className="font-mono">6 relations · 0 orphans</span>
      </div>
    </div>
  );
}

function InspectorDb() {
  const cols: { name: string; type: string; key?: "PK" | "FK" }[] = [
    { name: "id", type: "uuid", key: "PK" },
    { name: "user_id", type: "uuid", key: "FK" },
    { name: "token_hash", type: "text" },
    { name: "expires_at", type: "timestamptz" },
    { name: "used", type: "boolean" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DatabaseIcon size={14} style={{ color: "#10b981" }} />
        <span className="font-mono text-[13px] text-fg">reset_tokens</span>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        {cols.map((c, i) => (
          <div
            key={c.name}
            className="wf-row flex items-center gap-2 px-3 py-2 text-[12.5px] border-b border-border last:border-b-0 bg-panel-2"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
            <span className="font-mono text-fg w-[110px]">{c.name}</span>
            <span className="font-mono text-fg-subtle">{c.type}</span>
            {c.key && (
              <span
                className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded-sm"
                style={
                  c.key === "PK"
                    ? { background: "var(--c-warning-soft)", color: "#f59e0b" }
                    : { background: "var(--c-info-soft)", color: "#3b82f6" }
                }
              >
                {c.key}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InspectorApi() {
  const eps: { m: string; path: string; color: string }[] = [
    { m: "POST", path: "/auth/reset/request", color: "#10b981" },
    { m: "POST", path: "/auth/reset/confirm", color: "#10b981" },
    { m: "GET", path: "/auth/reset/status", color: "#3b82f6" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-[12.5px] text-fg-muted mb-0.5">Endpoints</p>
      {eps.map((e, i) => (
        <div
          key={e.path}
          className="wf-row flex items-center gap-2.5 rounded-md border border-border bg-panel-2 px-3 py-2"
          style={{ animationDelay: `${i * 0.09}s` }}
        >
          <span
            className="font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded-sm w-[44px] text-center"
            style={{ background: `${e.color}22`, color: e.color }}
          >
            {e.m}
          </span>
          <span className="font-mono text-[12.5px] text-fg">{e.path}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2 text-[12px] text-fg-muted">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: "#8b5cf6" }}
        />
        <span className="font-mono">OpenAPI 3.1 · linked to reset_tokens</span>
      </div>
    </div>
  );
}

function InspectorVal({ valResolved }: { valResolved: boolean }) {
  const rules: { label: string; initiallyWarn: boolean }[] = [
    { label: "Endpoint documented", initiallyWarn: false },
    { label: "FK → users resolves", initiallyWarn: true },
    { label: "Token TTL ≤ policy max", initiallyWarn: true },
    { label: "MFA policy attached", initiallyWarn: false },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12.5px] text-fg-muted mb-0.5">Deterministic rules</p>
      {rules.map((r, i) => {
        const warn = r.initiallyWarn && !valResolved;
        return (
          <div
            key={r.label}
            className="wf-row flex items-center gap-2.5 rounded-md border border-border bg-panel-2 px-3 py-2 text-[12.5px]"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
            {warn ? (
              <AlertTriangle size={14} className="text-warning shrink-0" />
            ) : (
              <Check size={14} className="text-success shrink-0" />
            )}
            <span className="text-fg">{r.label}</span>
          </div>
        );
      })}
      <div
        className="mt-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium flex items-center gap-2 transition-colors"
        style={
          valResolved
            ? { background: "var(--c-success-soft)", color: "#10b981" }
            : { background: "var(--c-warning-soft)", color: "#f59e0b" }
        }
      >
        {valResolved ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
        {valResolved
          ? "2 issues resolved · architecture consistent"
          : "2 issues found · resolving…"}
      </div>
    </div>
  );
}

function InspectorDoc() {
  return (
    <div className="rounded-lg border border-border bg-panel-2 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} style={{ color: "#f59e0b" }} />
        <span className="text-[14px] font-semibold text-fg">Password reset</span>
      </div>
      <div className="flex flex-col gap-2">
        {[88, 96, 72].map((w, i) => (
          <div
            key={i}
            className="wf-line h-2 rounded-full bg-border"
            style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }}
          />
        ))}
        <div
          className="wf-row my-1 font-mono text-[12px] text-accent bg-panel border border-border rounded-sm px-2.5 py-1.5"
          style={{ animationDelay: "0.3s" }}
        >
          POST /auth/reset/request
        </div>
        {[94, 80, 90, 64].map((w, i) => (
          <div
            key={`b${i}`}
            className="wf-line h-2 rounded-full bg-border"
            style={{ width: `${w}%`, animationDelay: `${0.36 + i * 0.09}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function InspectorSsot() {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div
        className="wf-row w-16 h-16 rounded-full grid place-items-center"
        style={{
          background: "var(--accent-soft)",
          border: "2px solid var(--accent)",
        }}
      >
        <Check size={30} className="text-accent" />
      </div>
      <div className="wf-row" style={{ animationDelay: "0.08s" }}>
        <div className="font-mono text-[14px] text-fg">helix-auth.ssot</div>
        <div className="font-mono text-[12px] text-fg-subtle">v1.0.0 · sealed</div>
      </div>
      <div
        className="wf-row w-full mt-1 rounded-lg border border-border bg-panel-2 divide-y divide-border text-[12.5px]"
        style={{ animationDelay: "0.16s" }}
      >
        {[
          ["artifacts", "7"],
          ["relations", "6"],
          ["validation", "pass"],
          ["formats", "json · md · pdf"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-fg-muted">{k}</span>
            <span className="font-mono text-fg">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
