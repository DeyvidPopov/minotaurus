// components/graph/graph-canvas.tsx — React Flow-powered knowledge graph
"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import ReactFlow, {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  getSmoothStepPath,
  useNodes,
  useNodesState,
  useReactFlow,
  useStore,
  type Node,
  type Edge,
  type EdgeProps,
  type NodeProps,
  ReactFlowProvider,
  ConnectionMode,
} from "reactflow"
import "reactflow/dist/style.css"
import { getSmartEdge } from "@tisoap/react-flow-smart-edge"
import { TYPE_INFO, EDGE_COLOR } from "@/lib/mock-data"
import type { Artifact, Relation } from "@/lib/types"
import { truncate } from "@/lib/utils"
import { computeDagreLayout } from "@/lib/graph-layout"

interface Props {
  artifacts: Artifact[]
  relations: Relation[]
  selectedId?: string | null
  onSelect?: (a: Artifact | null) => void
  nodeStyle?: "shape" | "color" | "minimal"
  typeFilter?: Set<string> | null
  storageKey?: string
  fitView?: boolean
  height?: string | number
  draggable?: boolean
  showMiniMap?: boolean
  highlightSelected?: boolean
  /**
   * When set, run a dagre auto-layout in the given direction ("LR" = left→right,
   * "TB" = top→bottom). Persisted drag positions still override the layout
   * per-node, so user adjustments are preserved.
   */
  autoLayout?: "LR" | "TB"
  /**
   * Imperative trigger: whenever this number changes, the canvas wipes saved
   * drag positions and re-runs the dagre layout in `relayoutDirection`
   * (default "LR"). Owned by the parent so a toolbar button can drive it.
   */
  relayoutSignal?: number
  relayoutDirection?: "LR" | "TB"
  /**
   * Lowest zoom React Flow allows. Defaults to 0.25. Set lower for small
   * embedded views (e.g. the dashboard mini-graph) so fitView can shrink a
   * large graph enough to fully contain it instead of clamping and overflowing.
   */
  minZoom?: number
}

export function GraphCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}

function Inner({
  artifacts,
  relations,
  selectedId,
  onSelect,
  nodeStyle = "color",
  typeFilter,
  storageKey,
  fitView = true,
  height = "100%",
  draggable = true,
  showMiniMap = true,
  highlightSelected = true,
  autoLayout,
  relayoutSignal,
  relayoutDirection = "LR",
  minZoom = 0.25,
}: Props) {
  // Position overrides (drag persistence)
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => {
    if (typeof window === "undefined" || !storageKey) return {}
    try {
      return JSON.parse(
        localStorage.getItem("mino:graph:" + storageKey) || "{}",
      )
    } catch {
      return {}
    }
  })

  const persist = useCallback(
    (next: Record<string, { x: number; y: number }>) => {
      if (!storageKey || typeof window === "undefined") return
      localStorage.setItem("mino:graph:" + storageKey, JSON.stringify(next))
    },
    [storageKey],
  )

  // Tracks the most recently dragged node so we can keep it visually on top
  // after the drag ends (during the drag React Flow already elevates it).
  const [lastDraggedId, setLastDraggedId] = useState<string | null>(null)

  // Parent-driven relayout: a counter prop. We track the last value we acted on
  // in a ref so the initial mount (signal === undefined or first observation)
  // doesn't trigger a layout — only subsequent changes do.
  const lastRelayoutSignalRef = useRef<number | undefined>(relayoutSignal)
  // Set when a relayout just changed positions, so the next position-driven
  // render re-fits the viewport. Drag-persist and initial mount leave this
  // false, so only an explicit relayout triggers an auto-fit.
  const pendingFitRef = useRef(false)
  useEffect(() => {
    if (relayoutSignal === undefined) return
    if (lastRelayoutSignalRef.current === relayoutSignal) return
    lastRelayoutSignalRef.current = relayoutSignal
    const v = artifacts.filter((a) => !typeFilter || typeFilter.has(a.type))
    const layout = computeDagreLayout(v, relations, {
      nodeStyle: nodeStyle ?? "color",
      direction: relayoutDirection,
    })
    setPositions(layout)
    persist(layout)
    setLastDraggedId(null)
    pendingFitRef.current = true
  }, [
    relayoutSignal,
    relayoutDirection,
    artifacts,
    typeFilter,
    relations,
    nodeStyle,
    persist,
  ])

  const visible = useMemo(
    () => artifacts.filter((a) => !typeFilter || typeFilter.has(a.type)),
    [artifacts, typeFilter],
  )

  // ── focus mode ──
  // When a node is selected (and highlighting is enabled), build the set of the
  // selected node plus its 1-hop neighbors. Everything outside this set is dimmed
  // at render time. `null` = no focus, so the graph looks unchanged. Derived from
  // `relations` only — no data mutation.
  const focusActive = highlightSelected && !!selectedId
  const neighborIds = useMemo(() => {
    if (!focusActive || !selectedId) return null
    const ids = new Set<string>([selectedId])
    for (const r of relations) {
      if (r.source === selectedId) ids.add(r.target)
      if (r.target === selectedId) ids.add(r.source)
    }
    return ids
  }, [focusActive, selectedId, relations])

  // Dagre-derived base positions. Persisted drag positions still take
  // precedence per-node so user adjustments don't get clobbered on rerender.
  const layoutPositions = useMemo(() => {
    if (!autoLayout) return null
    return computeDagreLayout(visible, relations, {
      nodeStyle: nodeStyle ?? "color",
      direction: autoLayout,
    })
  }, [autoLayout, visible, relations, nodeStyle])

  const derivedNodes: Node[] = useMemo(
    () =>
      visible.map((a) => {
        const p =
          positions[a.id] ||
          (layoutPositions && layoutPositions[a.id]) ||
          { x: a.gx, y: a.gy }
        const isSelected = highlightSelected && selectedId === a.id
        const dimmed = neighborIds ? !neighborIds.has(a.id) : false
        return {
          id: a.id,
          type: "minoNode",
          position: p,
          data: { artifact: a, nodeStyle, isSelected },
          selected: isSelected,
          draggable,
          zIndex: lastDraggedId === a.id ? 1 : 0,
          style: { opacity: dimmed ? 0.22 : 1, transition: "opacity .15s ease" },
        }
      }),
    [
      visible,
      positions,
      layoutPositions,
      nodeStyle,
      selectedId,
      draggable,
      lastDraggedId,
      highlightSelected,
      neighborIds,
    ],
  )

  // Live drag: React Flow needs its own mutable node state + onNodesChange so it
  // can apply per-frame drag deltas (the node follows the cursor). We keep
  // `derivedNodes` as the source of truth and mirror it into rfNodes whenever it
  // changes. During an active drag none of derivedNodes' inputs change, so this
  // sync doesn't fire and the in-progress drag position is preserved; on drop we
  // persist to `positions`, derivedNodes recomputes, and rfNodes re-syncs.
  // Initialize with derivedNodes so the first render already has nodes (the
  // mount-time fitView needs them); the effect keeps them in sync afterwards.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(derivedNodes)
  useEffect(() => {
    setRfNodes(derivedNodes)
  }, [derivedNodes, setRfNodes])

  // Id of the node currently being dragged (null when idle). While set, edges
  // route through the cheap path instead of getSmartEdge — see edges memo.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragActive = !!draggingId

  // ── global label de-collision coordinator ──
  // Edges report their measured label anchor + box here; a rAF-coalesced pass
  // resolves overlaps and hands each edge a final position (read via context).
  const anchorsRef = useRef(new Map<string, LabelBox>())
  const [resolvedLabels, setResolvedLabels] = useState<
    Map<string, { x: number; y: number }>
  >(new Map())
  const labelRafRef = useRef<number | null>(null)
  const recomputeLabels = useCallback(() => {
    labelRafRef.current = null
    const boxes = Array.from(anchorsRef.current.entries()).map(([id, b]) => ({
      id,
      ...b,
    }))
    setResolvedLabels(resolveLabelLayout(boxes))
  }, [])
  const reportLabel = useCallback(
    (id: string, box: LabelBox | null) => {
      if (box) anchorsRef.current.set(id, box)
      else anchorsRef.current.delete(id)
      if (labelRafRef.current == null) {
        labelRafRef.current = requestAnimationFrame(recomputeLabels)
      }
    },
    [recomputeLabels],
  )
  useEffect(
    () => () => {
      if (labelRafRef.current != null) cancelAnimationFrame(labelRafRef.current)
    },
    [],
  )
  const labelLayout = useMemo<LabelLayout>(
    () => ({ report: reportLabel, resolved: resolvedLabels }),
    [reportLabel, resolvedLabels],
  )

  const visibleIds = useMemo(() => new Set(visible.map((v) => v.id)), [visible])
  const edges: Edge[] = useMemo(
    () =>
      relations
        .filter((r) => visibleIds.has(r.source) && visibleIds.has(r.target))
        .map((r) => {
          const color = EDGE_COLOR[r.type] || "#94a3b8"
          // Focus mode: edges touching the selected node are emphasized; the rest
          // are dimmed. No focus → original look (strokeWidth 1.4, opacity 0.7).
          const connected =
            focusActive && (r.source === selectedId || r.target === selectedId)
          const dimmed = focusActive && !connected
          return {
            id: r.id,
            source: r.source,
            target: r.target,
            type: "labeledSmoothStep",
            animated: false,
            style: {
              stroke: color,
              strokeWidth: connected ? 2.2 : 1.4,
              opacity: dimmed ? 0.1 : connected ? 1 : 0.7,
              transition: "opacity .15s ease",
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color,
              width: 16,
              height: 16,
            },
            data: { type: r.type, color, dimmed, dragging: dragActive },
            label: r.type,
          }
        }),
    [relations, visibleIds, focusActive, selectedId, dragActive],
  )

  // ── drop-time collision resolution ──
  // Drag is unrestricted (so it never feels "stuck" against the React Flow drag
  // delta), but on release we push the dropped node out of any overlap along
  // the axis of least intrusion. Iterates a few times so cascading pushes
  // (3+ nodes packed together) still converge.
  const reactFlow = useReactFlow()

  // After a relayout writes new positions, re-fit the viewport so the freshly
  // arranged graph is centered. Gated on pendingFitRef so drag-persist and
  // initial mount don't refit. A nested requestAnimationFrame is required: the
  // first frame lets React Flow commit the new node positions into its internal
  // store, the second fits against them — a single frame fires too early and
  // fitView would frame the stale layout.
  useEffect(() => {
    if (!pendingFitRef.current) return
    pendingFitRef.current = false
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.18, maxZoom: 1.1, duration: 400 })
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [positions, reactFlow])

  const resolveDropPosition = useCallback(
    (id: string, startX: number, startY: number, w: number, h: number) => {
      if (!w || !h) return { x: startX, y: startY }
      const all = reactFlow.getNodes().filter((n) => n.id !== id)
      let x = startX
      let y = startY
      for (let iter = 0; iter < 16; iter++) {
        let pushed = false
        for (const n of all) {
          const nw = n.width ?? 0
          const nh = n.height ?? 0
          if (!nw || !nh) continue
          const ax2 = x + w
          const ay2 = y + h
          const bx2 = n.position.x + nw
          const by2 = n.position.y + nh
          if (
            x < bx2 &&
            ax2 > n.position.x &&
            y < by2 &&
            ay2 > n.position.y
          ) {
            const dx = x + w / 2 - (n.position.x + nw / 2)
            const dy = y + h / 2 - (n.position.y + nh / 2)
            const overlapX = w / 2 + nw / 2 - Math.abs(dx)
            const overlapY = h / 2 + nh / 2 - Math.abs(dy)
            if (overlapX < overlapY) {
              x += (dx >= 0 ? 1 : -1) * overlapX
            } else {
              y += (dy >= 0 ? 1 : -1) * overlapY
            }
            pushed = true
          }
        }
        if (!pushed) break
      }
      return { x, y }
    },
    [reactFlow],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      const w = node.width ?? 0
      const h = node.height ?? 0
      const resolved = resolveDropPosition(
        node.id,
        node.position.x,
        node.position.y,
        w,
        h,
      )
      if (resolved.x !== node.position.x || resolved.y !== node.position.y) {
        // Write to rfNodes (the controlled source) so it isn't re-asserted on
        // the next render. setPositions below then re-syncs derivedNodes → rfNodes.
        setRfNodes((ns) =>
          ns.map((n) => (n.id === node.id ? { ...n, position: resolved } : n)),
        )
      }
      setLastDraggedId(node.id)
      setDraggingId(null)
      setPositions((prev) => {
        const next = { ...prev, [node.id]: resolved }
        persist(next)
        return next
      })
    },
    [persist, resolveDropPosition, setRfNodes],
  )

  return (
    <LabelLayoutContext.Provider value={labelLayout}>
      <div style={{ width: "100%", height }}>
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        connectionMode={ConnectionMode.Loose}
        onNodeClick={(_, n) => onSelect?.(n.data.artifact)}
        onPaneClick={() => onSelect?.(null)}
        onNodeDragStart={(_, n) => setDraggingId(n.id)}
        onNodeDragStop={onNodeDragStop}
        fitView={fitView}
        fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={minZoom}
        maxZoom={2.4}
      >
        <Background gap={22} size={1} color="var(--grid-dot)" />
        <Controls position="bottom-center" showInteractive={false} />
        {showMiniMap && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(n) =>
              TYPE_INFO[(n.data.artifact as Artifact).type]?.color || "#94a3b8"
            }
            nodeStrokeWidth={0}
            maskColor="rgba(0,0,0,.4)"
            style={{ width: 180, height: 120 }}
          />
        )}
      </ReactFlow>
      </div>
    </LabelLayoutContext.Provider>
  )
}

// ───── custom node types ─────
const NODE_TYPES = {
  minoNode: MinoNode,
}

// ───── custom edge types ─────
// LabeledSmoothStepEdge: routes around intervening nodes via @tisoap/react-flow-smart-edge
// (with a smoothstep fallback when no corridor is found), and renders the label through
// React Flow's EdgeLabelRenderer portal so it sits above the nodes layer. Label position
// is measured from the actual SVG path (getPointAtLength at len/2) so it lands on the
// visible body of the edge instead of a routing waypoint.
type LabeledEdgeData = {
  type?: string
  color?: string
  dimmed?: boolean
  dragging?: boolean
}

// ───── global edge-label de-collision ─────
// Each edge reports the measured anchor + estimated box of its label to a shared
// coordinator (provided via context by GraphCanvas). The coordinator runs a
// deterministic greedy pass that pushes overlapping labels apart and returns a
// resolved position per edge, which the edge renders at. Because the reported
// anchor is the measured *path* point (independent of the label's own offset),
// there is no feedback loop. Labels live in React Flow's transformed pane, so
// these flow-coordinate boxes are zoom-independent.
type LabelBox = { x: number; y: number; w: number; h: number }

type LabelLayout = {
  report: (id: string, box: LabelBox | null) => void
  resolved: Map<string, { x: number; y: number }>
}

const LabelLayoutContext = createContext<LabelLayout | null>(null)

// Estimated label box (px == flow units here) from the label text.
const LABEL_CHAR_W = 6.1
const LABEL_PAD_X = 10
const LABEL_H = 15
const LABEL_GAP = 3 // min clear space between two labels

function estimateLabelBox(text: string): { w: number; h: number } {
  return { w: text.length * LABEL_CHAR_W + LABEL_PAD_X, h: LABEL_H }
}

// Center-based AABB overlap test with a gap margin.
function labelsOverlap(a: LabelBox, b: LabelBox): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w + LABEL_GAP * 2 &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h + LABEL_GAP * 2
  )
}

// Deterministic greedy de-collision: process labels in id order; for each, keep
// its x and search outward in y (alternating up/down) for the nearest slot clear
// of every already-placed label. Each label is placed only once it's clear, so
// the result is guaranteed overlap-free.
function resolveLabelLayout(
  boxes: Array<LabelBox & { id: string }>,
): Map<string, { x: number; y: number }> {
  const sorted = [...boxes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const placed: LabelBox[] = []
  const out = new Map<string, { x: number; y: number }>()
  for (const b of sorted) {
    const step = b.h * 0.65
    let y = b.y
    let k = 1
    let dir = 1
    let guard = 0
    while (
      placed.some((p) => labelsOverlap(p, { x: b.x, y, w: b.w, h: b.h })) &&
      guard++ < 500
    ) {
      y = b.y + dir * k * step
      dir = -dir
      if (dir === 1) k++
    }
    placed.push({ x: b.x, y, w: b.w, h: b.h })
    out.set(b.id, { x: b.x, y })
  }
  return out
}

// Below this zoom, edge labels are hidden (render-time only; the label data is
// untouched). They reappear automatically as the user zooms back in.
const LABEL_ZOOM_THRESHOLD = 0.6

// Padding (px) inflating each node's box when testing whether a straight
// smoothstep path clips it. Bigger → more edges escalate to smart routing
// (fewer clips); smaller → straighter edges, slightly higher clip risk.
const SMOOTHSTEP_NODE_PADDING = 8

type Pt = { x: number; y: number }

// Orthogonal corner waypoints of React Flow's smoothstep path. Our nodes use
// Left/Right handles, so the route is the horizontal Z (source → midX → target);
// the vertical case is included for completeness. This is an approximation of
// React Flow's exact geometry — good enough for a crossing test.
function smoothStepWaypoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: Position,
): Pt[] {
  const horizontal =
    sourcePosition === Position.Left || sourcePosition === Position.Right
  if (horizontal) {
    const midX = (sx + tx) / 2
    return [
      { x: sx, y: sy },
      { x: midX, y: sy },
      { x: midX, y: ty },
      { x: tx, y: ty },
    ]
  }
  const midY = (sy + ty) / 2
  return [
    { x: sx, y: sy },
    { x: sx, y: midY },
    { x: tx, y: midY },
    { x: tx, y: ty },
  ]
}

// Axis-aligned segment vs rectangle test (smoothstep segments are always
// horizontal or vertical, so this stays trivial).
function segIntersectsRect(
  a: Pt,
  b: Pt,
  rx1: number,
  ry1: number,
  rx2: number,
  ry2: number,
): boolean {
  if (a.y === b.y) {
    if (a.y < ry1 || a.y > ry2) return false
    return Math.max(a.x, b.x) >= rx1 && Math.min(a.x, b.x) <= rx2
  }
  if (a.x < rx1 || a.x > rx2) return false
  return Math.max(a.y, b.y) >= ry1 && Math.min(a.y, b.y) <= ry2
}

// True if the smoothstep polyline clips any node other than its own endpoints.
function pathCrossesNode(
  waypoints: Pt[],
  nodes: Node[],
  sourceId: string,
  targetId: string,
  padding: number,
): boolean {
  for (const n of nodes) {
    if (n.id === sourceId || n.id === targetId) continue
    const w = n.width ?? 0
    const h = n.height ?? 0
    if (!w || !h) continue
    const rx1 = n.position.x - padding
    const ry1 = n.position.y - padding
    const rx2 = n.position.x + w + padding
    const ry2 = n.position.y + h + padding
    for (let i = 0; i < waypoints.length - 1; i++) {
      if (segIntersectsRect(waypoints[i], waypoints[i + 1], rx1, ry1, rx2, ry2)) {
        return true
      }
    }
  }
  return false
}

function LabeledSmoothStepEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  label,
}: EdgeProps<LabeledEdgeData>) {
  const nodes = useNodes()
  // Subscribe to the threshold as a BOOLEAN, not the raw zoom: edges then
  // re-render only when crossing LABEL_ZOOM_THRESHOLD, not on every zoom tick.
  // (React Flow already moves the edges layer via a single CSS transform, so
  // there's no reason to re-render every edge per zoom delta.)
  const labelsVisible = useStore((s) => s.transform[2] >= LABEL_ZOOM_THRESHOLD)
  const color = data?.color || "#94a3b8"
  // While any node is dragging, route through the cheap smoothstep path: no
  // getSmartEdge pathfinding (O(1) per frame instead of a grid search ×N edges),
  // so lines follow the moving node smoothly. Smart routing returns on drop.
  const dragging = !!data?.dragging

  // Smoothstep-first routing: prefer the clean orthogonal smoothstep path, and
  // only escalate to the (expensive) getSmartEdge pathfinding for edges whose
  // straight path would actually clip a node. While dragging we always take the
  // cheap path. Memoized so unrelated re-renders don't recompute.
  const { edgePath, fallbackLabelX, fallbackLabelY } = useMemo(() => {
    const cheap = () => {
      const [p, lx, ly] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 6,
      })
      return { edgePath: p, fallbackLabelX: lx, fallbackLabelY: ly }
    }
    if (dragging) return cheap()
    // Does the straight smoothstep route clip an intervening node? If not, keep
    // it (cheap + clean). Only crossing edges pay for grid pathfinding.
    const waypoints = smoothStepWaypoints(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
    )
    if (!pathCrossesNode(waypoints, nodes, source, target, SMOOTHSTEP_NODE_PADDING)) {
      return cheap()
    }
    const smart = getSmartEdge({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      nodes,
      options: { nodePadding: 12, gridRatio: 12 },
    })
    if (smart) {
      return {
        edgePath: smart.svgPathString,
        fallbackLabelX: smart.edgeCenterX,
        fallbackLabelY: smart.edgeCenterY,
      }
    }
    return cheap()
  }, [source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, nodes, dragging])

  const pathRef = useRef<SVGPathElement | null>(null)
  const [labelPt, setLabelPt] = useState<{ x: number; y: number } | null>(null)
  const layout = useContext(LabelLayoutContext)
  // `report` is a stable callback; the layout object's identity changes on every
  // resolve, so depend on `report` (not `layout`) in the effect to avoid a
  // report → resolve → re-render → report loop.
  const report = layout?.report
  const labelText = label != null ? String(label) : ""

  useEffect(() => {
    // Measure the base label anchor (path midpoint) and report it to the global
    // de-collision coordinator. getTotalLength / getPointAtLength force a
    // synchronous reflow, so skip while zoomed out / mid-drag (label is hidden
    // then anyway) and unreport so its box doesn't block others.
    if (!labelsVisible || dragging || !labelText) {
      setLabelPt(null)
      report?.(id, null)
      return
    }
    const el = pathRef.current
    if (!el) return
    try {
      const len = el.getTotalLength()
      if (!Number.isFinite(len) || len <= 0) {
        setLabelPt(null)
        report?.(id, null)
        return
      }
      const mid = el.getPointAtLength(len / 2)
      setLabelPt({ x: mid.x, y: mid.y })
      const { w, h } = estimateLabelBox(labelText)
      report?.(id, { x: mid.x, y: mid.y, w, h })
    } catch {
      setLabelPt(null)
      report?.(id, null)
    }
  }, [edgePath, labelsVisible, dragging, id, labelText, report])

  // Unreport on unmount so a removed edge's box never blocks remaining labels.
  useEffect(() => () => report?.(id, null), [id, report])

  // Render at the globally de-collided position when available; until the first
  // resolve pass lands, fall back to the measured midpoint (then the smart/
  // smoothstep waypoint center if even that isn't measured yet).
  const resolved = layout?.resolved.get(id)
  const labelX = resolved?.x ?? labelPt?.x ?? fallbackLabelX
  const labelY = resolved?.y ?? labelPt?.y ?? fallbackLabelY

  return (
    <>
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        stroke="none"
        style={{ pointerEvents: "none" }}
      />
      {label != null && labelPt != null && labelsVisible && !dragging && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--fg-muted)",
              background: "var(--bg)",
              border: `1px solid ${color}33`,
              borderRadius: 3,
              padding: "1px 4px",
              lineHeight: 1.2,
              opacity: data?.dimmed ? 0.1 : 1,
              transition: "opacity .15s ease",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const EDGE_TYPES = {
  labeledSmoothStep: LabeledSmoothStepEdge,
}

// Hide React Flow's default handle dot — we only need the connection anchor, not the visual.
const HANDLE_STYLE: React.CSSProperties = {
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  background: "transparent",
  border: 0,
  opacity: 0,
  pointerEvents: "none",
}

function MinoNode({
  data,
}: NodeProps<{
  artifact: Artifact
  nodeStyle: Props["nodeStyle"]
  isSelected: boolean
}>) {
  const { artifact: a, nodeStyle, isSelected } = data
  const info = TYPE_INFO[a.type]
  const color = info?.color || "#94a3b8"

  if (nodeStyle === "minimal") {
    return (
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          background: color,
          outline: isSelected ? `2px solid var(--accent)` : "none",
          outlineOffset: 2,
          boxShadow: "0 0 0 1px rgba(255,255,255,.2)",
          position: "relative",
        }}
        title={a.title}
      >
        <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      </div>
    )
  }

  if (nodeStyle === "shape") {
    return <ShapeNode artifact={a} isSelected={isSelected} color={color} />
  }

  return (
    <div
      className={`t-${a.type}`}
      style={{
        minWidth: 150,
        maxWidth: 200,
        background: "var(--panel)",
        border: isSelected
          ? `2px solid var(--accent)`
          : `1px solid var(--border-strong)`,
        borderRadius: 8,
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        boxShadow: isSelected
          ? "0 0 0 3px var(--accent-soft)"
          : "var(--shadow-sm)",
        fontFamily: "var(--font-sans)",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <div style={{ width: 4, background: color, flexShrink: 0 }} />
      <div style={{ padding: "8px 10px", minWidth: 0, flex: 1 }}>
        <div
          style={{
            color: "var(--fg)",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {truncate(a.title, 22)}
        </div>
        <div
          style={{
            color,
            fontSize: 9,
            letterSpacing: ".06em",
            fontWeight: 700,
            marginTop: 2,
            textTransform: "uppercase",
          }}
        >
          {info?.label || a.type}
        </div>
      </div>
      {a.status !== "ACTIVE" && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            alignSelf: "flex-start",
            margin: 6,
            background:
              a.status === "DRAFT" ? "var(--c-warning)" : "var(--c-danger)",
          }}
          title={a.status}
        />
      )}
    </div>
  )
}

// ───── shape-mode node (typed glyph + label below) ─────
const SHAPE_W = 130
const SHAPE_H = 44

function ShapeNode({
  artifact: a,
  isSelected,
  color,
}: {
  artifact: Artifact
  isSelected: boolean
  color: string
}) {
  const stroke = isSelected ? "var(--accent)" : "var(--border-strong)"
  const strokeW = isSelected ? 2 : 1.1
  const fill = "var(--panel)"
  const statusColor =
    a.status === "DRAFT"
      ? "var(--c-warning)"
      : a.status === "DEPRECATED"
        ? "var(--c-danger)"
        : null

  return (
    <div
      style={{
        width: SHAPE_W,
        height: SHAPE_H,
        position: "relative",
        fontFamily: "var(--font-sans)",
      }}
      title={a.title}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <svg
        width={SHAPE_W}
        height={SHAPE_H}
        viewBox={`0 0 ${SHAPE_W} ${SHAPE_H}`}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        {renderTypedShape(a.type, SHAPE_W, SHAPE_H, color, fill, stroke, strokeW)}
        {statusColor && (
          <circle
            cx={SHAPE_W - 8}
            cy={8}
            r={4}
            fill={statusColor}
            stroke="var(--panel)"
            strokeWidth={1}
          />
        )}
        <text
          x={SHAPE_W / 2}
          y={SHAPE_H + 14}
          textAnchor="middle"
          fontSize={11.5}
          fill="var(--fg)"
          stroke="var(--bg)"
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {truncate(a.title, 22)}
        </text>
      </svg>
    </div>
  )
}

function renderTypedShape(
  type: Artifact["type"],
  W: number,
  H: number,
  color: string,
  fill: string,
  stroke: string,
  strokeW: number,
) {
  const common = { fill, stroke, strokeWidth: strokeW }

  switch (type) {
    case "SERVICE": {
      const r = 8
      return (
        <g>
          <rect x={0} y={0} width={W} height={H} rx={r} {...common} />
          <path
            d={`M ${r},0 L ${W - r},0 A ${r},${r} 0 0 1 ${W},${r} L ${W},7 L 0,7 L 0,${r} A ${r},${r} 0 0 1 ${r},0 Z`}
            fill={color}
          />
          <text
            x={W / 2}
            y={H / 2 + 8}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={600}
            fill="var(--fg-muted)"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Service
          </text>
        </g>
      )
    }
    case "API_SPEC": {
      const inset = W * 0.22
      return (
        <g>
          <polygon
            points={`0,${H / 2} ${inset},0 ${W - inset},0 ${W},${H / 2} ${W - inset},${H} ${inset},${H}`}
            {...common}
          />
          <polygon
            points={`${inset + 4},${H / 2 - 8} ${W - inset - 4},${H / 2 - 8} ${W - inset - 4},${H / 2 + 8} ${inset + 4},${H / 2 + 8}`}
            fill={color}
            fillOpacity={0.07}
          />
          <text
            x={W / 2}
            y={H / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={color}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            API
          </text>
        </g>
      )
    }
    case "API_ENDPOINT": {
      return (
        <g>
          <rect x={0} y={0} width={W} height={H} rx={H / 2} {...common} />
          <text
            x={W / 2}
            y={H / 2 + 5}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill={color}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {"{ }"}
          </text>
        </g>
      )
    }
    case "DATABASE_MODEL":
    case "DATABASE_ENTITY": {
      const ery = 6
      return (
        <g>
          <path
            d={`M 0,${ery} L 0,${H - ery} A ${W / 2},${ery} 0 0 0 ${W},${H - ery} L ${W},${ery}`}
            {...common}
          />
          <ellipse cx={W / 2} cy={ery} rx={W / 2} ry={ery} {...common} />
          <text
            x={W / 2}
            y={H / 2 + 5}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={color}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            DB
          </text>
        </g>
      )
    }
    case "DOCUMENTATION": {
      const fold = 9
      return (
        <g>
          <path
            d={`M 0,0 L ${W - fold},0 L ${W},${fold} L ${W},${H} L 0,${H} Z`}
            {...common}
          />
          <path
            d={`M ${W - fold},0 L ${W - fold},${fold} L ${W},${fold}`}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <line
            x1={10}
            y1={H / 2 - 4}
            x2={W - 14}
            y2={H / 2 - 4}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <line
            x1={10}
            y1={H / 2 + 4}
            x2={W - 22}
            y2={H / 2 + 4}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      )
    }
    case "DIAGRAM": {
      return (
        <g>
          <rect x={0} y={0} width={W} height={H} rx={6} {...common} />
          <polygon
            points={`${W / 2 - 16},${H / 2} ${W / 2 - 4},${H / 2 - 10} ${W / 2 + 8},${H / 2} ${W / 2 - 4},${H / 2 + 10}`}
            fill={color}
            fillOpacity={0.6}
          />
          <polygon
            points={`${W / 2 - 2},${H / 2} ${W / 2 + 10},${H / 2 - 10} ${W / 2 + 22},${H / 2} ${W / 2 + 10},${H / 2 + 10}`}
            fill={color}
            fillOpacity={0.3}
          />
        </g>
      )
    }
    case "REQUIREMENT": {
      return (
        <g>
          <polygon
            points={`${W / 2},0 ${W},${H / 2} ${W / 2},${H} 0,${H / 2}`}
            {...common}
          />
          <text
            x={W / 2}
            y={H / 2 + 4}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={700}
            fill={color}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            REQ
          </text>
        </g>
      )
    }
    case "SECURITY_POLICY": {
      return (
        <g>
          <path
            d={`M ${W / 2},0 L ${W},6 L ${W},${H * 0.55} Q ${W},${H} ${W / 2},${H} Q 0,${H} 0,${H * 0.55} L 0,6 Z`}
            {...common}
          />
          <path
            d={`M ${W / 2 - 7},${H / 2 - 1} L ${W / 2 - 1},${H / 2 + 5} L ${W / 2 + 8},${H / 2 - 5}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )
    }
    case "ENVIRONMENT": {
      const bodyTop = 8
      return (
        <g>
          <rect
            x={0}
            y={bodyTop}
            width={W}
            height={H - bodyTop}
            rx={(H - bodyTop) / 2}
            {...common}
          />
          <circle cx={W * 0.32} cy={6} r={5} fill={color} fillOpacity={0.7} />
          <circle cx={W * 0.46} cy={3} r={3.5} fill={color} fillOpacity={0.5} />
          <text
            x={W / 2}
            y={H / 2 + 8}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={color}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            ENV
          </text>
        </g>
      )
    }
    case "EXTERNAL_SYSTEM": {
      const skew = 10
      return (
        <g>
          <polygon
            points={`${skew},0 ${W},0 ${W - skew},${H} 0,${H}`}
            {...common}
            strokeDasharray="4 3"
          />
          <text
            x={W / 2}
            y={H / 2 + 4}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={700}
            fill={color}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            EXT
          </text>
        </g>
      )
    }
    default:
      return <rect x={0} y={0} width={W} height={H} rx={8} {...common} />
  }
}
