// components/landing/parallax-graph.tsx — decorative hero background.
// Three layers of faint nodes + edges drifting via slow CSS keyframes, masked
// with a radial gradient so the field fades out toward the edges. Purely
// presentational: no client interactivity, no auth store (public page), and
// the drift animations are disabled under prefers-reduced-motion (see globals.css).
//
// Node coordinates are hardcoded (not random) so SSR and the client agree and
// the composition stays deterministic.

type Pt = { x: number; y: number; r: number };
type Edge = [number, number];

// Type-color palette mirrored from the design system (do not invent colors).
const PALETTE = [
  "#3b82f6", // SERVICE
  "#8b5cf6", // API_SPEC
  "#a78bfa", // API_ENDPOINT
  "#10b981", // DATABASE_MODEL
  "#f59e0b", // DOCUMENTATION
  "#ef4444", // SECURITY_POLICY
  "#06b6d4", // REQUIREMENT
];

const LAYERS: { nodes: Pt[]; edges: Edge[]; cls: string }[] = [
  {
    cls: "parallax-layer--a",
    nodes: [
      { x: 140, y: 120, r: 5 },
      { x: 320, y: 80, r: 4 },
      { x: 470, y: 180, r: 6 },
      { x: 250, y: 260, r: 5 },
      { x: 620, y: 120, r: 4 },
      { x: 760, y: 240, r: 5 },
      { x: 900, y: 140, r: 6 },
      { x: 1040, y: 260, r: 4 },
      { x: 1160, y: 120, r: 5 },
      { x: 540, y: 320, r: 4 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [6, 8],
      [5, 9],
    ],
  },
  {
    cls: "parallax-layer--b",
    nodes: [
      { x: 200, y: 360, r: 4 },
      { x: 380, y: 440, r: 5 },
      { x: 560, y: 380, r: 4 },
      { x: 720, y: 460, r: 5 },
      { x: 880, y: 400, r: 4 },
      { x: 1080, y: 440, r: 5 },
      { x: 1220, y: 360, r: 4 },
      { x: 60, y: 440, r: 4 },
    ],
    edges: [
      [7, 0],
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ],
  },
  {
    cls: "parallax-layer--c",
    nodes: [
      { x: 110, y: 220, r: 3 },
      { x: 430, y: 200, r: 3 },
      { x: 690, y: 160, r: 3 },
      { x: 980, y: 320, r: 3 },
      { x: 1240, y: 220, r: 3 },
      { x: 300, y: 540, r: 3 },
      { x: 820, y: 560, r: 3 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [0, 5],
      [3, 6],
    ],
  },
];

export function ParallaxGraph() {
  return (
    <div className="parallax-graph" aria-hidden="true">
      <svg viewBox="0 0 1320 620" preserveAspectRatio="xMidYMid slice">
        {LAYERS.map((layer, li) => (
          <g key={li} className={`parallax-layer ${layer.cls}`}>
            {layer.edges.map(([a, b], ei) => {
              const na = layer.nodes[a];
              const nb = layer.nodes[b];
              if (!na || !nb) return null;
              return (
                <line
                  key={ei}
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
              );
            })}
            {layer.nodes.map((n, ni) => (
              <circle
                key={ni}
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill={PALETTE[(li * 3 + ni) % PALETTE.length]}
                opacity={0.8}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
