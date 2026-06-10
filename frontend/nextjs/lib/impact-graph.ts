// lib/impact-graph.ts — deterministic transitive reachability for the Blast
// Radius graph. Pure: walks the project's real relation set with a bounded BFS
// (depth-limited, NOT unbounded) from a root artifact, in both directions.
//
// "dependents" = who depends on the root (reverse edges) — the blast radius.
// "dependencies" = what the root depends on (forward edges) — the constraints.
// The risk verdict itself stays 1-hop (see impact-risk.ts); this only widens the
// *visualisation* to the chosen depth.
import type { Relation } from "@/lib/types";

export interface TransitiveReach {
  /** id → hop distance (1..depth). Excludes the root. */
  dependents: Map<string, number>;
  dependencies: Map<string, number>;
  /** Every reachable id within `depth`, INCLUDING the root. */
  reached: Set<string>;
}

function buildAdjacency(relations: Relation[]): { fwd: Map<string, string[]>; rev: Map<string, string[]> } {
  const fwd = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  for (const r of relations) {
    (fwd.get(r.source) ?? fwd.set(r.source, []).get(r.source)!).push(r.target);
    (rev.get(r.target) ?? rev.set(r.target, []).get(r.target)!).push(r.source);
  }
  return { fwd, rev };
}

function bfs(rootId: string, adj: Map<string, string[]>, depth: number): Map<string, number> {
  const dist = new Map<string, number>([[rootId, 0]]);
  let frontier = [rootId];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!dist.has(n)) {
          dist.set(n, d);
          next.push(n);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  dist.delete(rootId);
  return dist;
}

export function computeTransitiveReach(rootId: string, relations: Relation[], depth: number): TransitiveReach {
  const safeDepth = Math.max(1, Math.floor(depth));
  const { fwd, rev } = buildAdjacency(relations);
  const dependents = bfs(rootId, rev, safeDepth);
  const dependencies = bfs(rootId, fwd, safeDepth);
  const reached = new Set<string>([rootId, ...dependents.keys(), ...dependencies.keys()]);
  return { dependents, dependencies, reached };
}
