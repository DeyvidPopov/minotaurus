// components/ui/project-mark.tsx
//
// Deterministic generative identicon. A project's `seed` (its id) drives a
// mirror-symmetric 5x5 grid, so every project gets a unique, stable mark —
// unlike the old single-letter square, where two projects sharing an initial
// AND a palette color (color is also id-hashed) looked identical. Same seed
// always yields the same art; no randomness, no IO, render-pure.
//
// Falls back to a monogram letter when no seed is supplied (keeps the brand
// default mark usable on its own).

const GRID = 5; // 5x5 cells
const HALF = 3; // left columns 0..2 are generated; cols 3..4 mirror cols 1..0

// FNV-1a 32-bit — deterministic string -> uint32.
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 PRNG — small, fast, well-distributed; seeded for reproducibility.
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function identiconCells(seed: string): boolean[][] {
  const rng = mulberry32(hashSeed(seed));
  const cells: boolean[][] = Array.from({ length: GRID }, () => Array<boolean>(GRID).fill(false));
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < HALF; c++) {
      const on = rng() < 0.5;
      cells[r][c] = on;
      cells[r][GRID - 1 - c] = on; // horizontal mirror
    }
  }
  return cells;
}

export function ProjectMark({
  color = "var(--accent)",
  size = 30,
  seed,
  letter = "M",
}: {
  color?: string;
  size?: number;
  /** Stable identity (the project id). Drives the identicon pattern. */
  seed?: string;
  /** Monogram fallback shown only when `seed` is absent. */
  letter?: string;
}) {
  const tileStyle = {
    width: size,
    height: size,
    // Subtle dark, color-tinted tile so the mark reads as a surface, not
    // floating squares — keeps the old gradient feel of the monogram square.
    background: `linear-gradient(140deg, color-mix(in srgb, ${color} 22%, #0a0a0e), color-mix(in srgb, ${color} 7%, #070709))`,
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12), 0 1px 2px rgba(0,0,0,.25)",
  } as const;

  if (!seed) {
    return (
      <div
        className="rounded-md grid place-items-center text-white font-bold font-mono shrink-0"
        style={{ ...tileStyle, fontSize: size * 0.42 }}
      >
        {letter}
      </div>
    );
  }

  const cells = identiconCells(seed);
  const VB = 100;
  const pad = 16; // keep cells clear of the rounded corners
  const cell = (VB - pad * 2) / GRID;
  const inset = cell * 0.12; // gap between cells
  const dot = cell - inset * 2;

  return (
    <div className="rounded-md shrink-0 overflow-hidden" style={tileStyle}>
      <svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} className="block" aria-hidden="true">
        {cells.flatMap((row, r) =>
          row.map((on, c) =>
            on ? (
              <rect
                key={`${r}-${c}`}
                x={pad + c * cell + inset}
                y={pad + r * cell + inset}
                width={dot}
                height={dot}
                rx={dot * 0.18}
                fill={color}
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}
