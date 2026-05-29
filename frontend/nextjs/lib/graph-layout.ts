// lib/graph-layout.ts — dagre-based auto-layout for the knowledge graph.
//
// Used by the full-page knowledge graph to spread artifacts out so edge labels
// don't stack on top of each other. The mini-graph keeps its own circular
// layout (no dagre call) since it's a deliberately constrained "1 + neighbors"
// view.

import dagre from "dagre"
import type { Artifact, Relation } from "./types"

type NodeStyle = "shape" | "color" | "minimal"
type Direction = "LR" | "TB"

interface LayoutOptions {
  nodeStyle?: NodeStyle
  direction?: Direction
}

// Approximate footprint of each node-style as rendered by MinoNode.
// Dagre uses these to reserve enough gap between nodes for edge labels.
// Shape mode's height includes the label that hangs below the SVG container
// (label baseline sits ~16px below SHAPE_H), so neighbors don't sit on the text.
const NODE_SIZE: Record<NodeStyle, { width: number; height: number }> = {
  color: { width: 200, height: 56 },
  shape: { width: 150, height: 80 },
  minimal: { width: 40, height: 40 },
}

export function computeDagreLayout(
  artifacts: Artifact[],
  relations: Relation[],
  options: LayoutOptions = {},
): Record<string, { x: number; y: number }> {
  if (artifacts.length === 0) return {}

  const { nodeStyle = "color", direction = "LR" } = options
  const { width, height } = NODE_SIZE[nodeStyle]

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: direction,
    nodesep: 95,
    ranksep: 180,
    edgesep: 28,
    marginx: 30,
    marginy: 30,
  })
  g.setDefaultEdgeLabel(() => ({}))

  artifacts.forEach((a) => g.setNode(a.id, { width, height }))

  const ids = new Set(artifacts.map((a) => a.id))
  relations
    .filter((r) => ids.has(r.source) && ids.has(r.target))
    .forEach((r) => g.setEdge(r.source, r.target))

  dagre.layout(g)

  // Dagre returns node centers; React Flow positions are top-left.
  const out: Record<string, { x: number; y: number }> = {}
  g.nodes().forEach((id) => {
    const n = g.node(id)
    if (n) out[id] = { x: n.x - width / 2, y: n.y - height / 2 }
  })
  return out
}
