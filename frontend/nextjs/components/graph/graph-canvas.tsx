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
        <Controls position="bottom-left" showInteractive={false} />
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
