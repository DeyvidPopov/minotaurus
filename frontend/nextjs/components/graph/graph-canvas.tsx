// components/graph/graph-canvas.tsx — React Flow-powered knowledge graph
"use client"

import { useCallback, useMemo, useState } from "react"
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  ReactFlowProvider,
  ConnectionMode,
} from "reactflow"
import "reactflow/dist/style.css"
import { TYPE_INFO, EDGE_COLOR } from "@/lib/mock-data"
import type { Artifact, Relation } from "@/lib/types"
import { truncate } from "@/lib/utils"

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

  const visible = useMemo(
    () => artifacts.filter((a) => !typeFilter || typeFilter.has(a.type)),
    [artifacts, typeFilter],
  )

  const nodes: Node[] = useMemo(
    () =>
      visible.map((a) => {
        const p = positions[a.id] || { x: a.gx, y: a.gy }
        return {
          id: a.id,
          type: "minoNode",
          position: p,
          data: { artifact: a, nodeStyle, isSelected: selectedId === a.id },
          selected: selectedId === a.id,
          draggable,
        }
      }),
    [visible, positions, nodeStyle, selectedId, draggable],
  )

  const visibleIds = useMemo(() => new Set(visible.map((v) => v.id)), [visible])
  const edges: Edge[] = useMemo(
    () =>
      relations
        .filter((r) => visibleIds.has(r.source) && visibleIds.has(r.target))
        .map((r) => ({
          id: r.id,
          source: r.source,
          target: r.target,
          type: "smoothstep",
          animated: false,
          style: {
            stroke: EDGE_COLOR[r.type] || "#94a3b8",
            strokeWidth: 1.4,
            opacity: 0.7,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: EDGE_COLOR[r.type] || "#94a3b8",
            width: 16,
            height: 16,
          },
          data: { type: r.type },
          label: r.type,
          labelStyle: {
            fontSize: 10,
            fill: "var(--fg-muted)",
            fontFamily: "var(--font-mono)",
          },
          labelBgStyle: { fill: "var(--panel)", fillOpacity: 0.85 },
          labelBgPadding: [3, 4] as [number, number],
          labelBgBorderRadius: 3,
        })),
    [relations, visibleIds],
  )

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      setPositions((prev) => {
        const next = {
          ...prev,
          [node.id]: { x: node.position.x, y: node.position.y },
        }
        persist(next)
        return next
      })
    },
    [persist],
  )

  return (
    <div style={{ width: "100%", height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        connectionMode={ConnectionMode.Loose}
        onNodeClick={(_, n) => onSelect?.(n.data.artifact)}
        onPaneClick={() => onSelect?.(null)}
        onNodeDragStop={onNodeDragStop}
        fitView={fitView}
        fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.25}
        maxZoom={2.4}
      >
        <Background gap={22} size={1} color="var(--grid-dot)" />
        <Controls position="bottom-center" showInteractive={false} />
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
      </ReactFlow>
    </div>
  )
}

// ───── custom node types ─────
const NODE_TYPES = {
  minoNode: MinoNode,
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
