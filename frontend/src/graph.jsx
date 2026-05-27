// src/graph.jsx — interactive knowledge graph canvas.

const { useState: gUseState, useEffect: gUseEffect, useRef: gUseRef, useCallback: gUseCallback, useMemo: gUseMemo } = React;

// edge color by relation type
const EDGE_COLOR = {
  DEPENDS_ON:        "#3b82f6",
  COMMUNICATES_WITH: "#06b6d4",
  USES:              "#10b981",
  EXPOSES:           "#8b5cf6",
  BELONGS_TO:        "#a78bfa",
  DOCUMENTS:         "#f59e0b",
  SECURES:           "#ef4444",
  VALIDATES:         "#ec4899",
  DEPLOYED_TO:       "#64748b",
  GENERATES:         "#22c55e",
  IMPLEMENTS:        "#0ea5e9",
};

// ── shape renderer ───────────────────────────────────────
// nodeStyle: "shape" | "color" | "minimal"
function NodeShape({ a, selected, dim, nodeStyle, onClick, onHover, onDragStart, isHover }) {
  const info = TYPE_INFO[a.type];
  const color = info?.color || "var(--fg-muted)";
  const x = a.gx, y = a.gy;

  // sizes
  const W = nodeStyle === "minimal" ? 22 : 130;
  const H = nodeStyle === "minimal" ? 22 : 44;

  const baseFill   = "var(--panel)";
  const strokeC    = selected ? "var(--accent)" : isHover ? color : "var(--border-strong)";
  const strokeW    = selected ? 2 : isHover ? 1.6 : 1.1;
  const opacity    = dim ? 0.18 : 1;
  const labelColor = "var(--fg)";

  const handle = {
    onClick: (e) => { e.stopPropagation(); onClick && onClick(a); },
    onMouseDown: (e) => { if (onDragStart) onDragStart(a, e); },
    onMouseEnter: () => onHover && onHover(a.id),
    onMouseLeave: () => onHover && onHover(null),
    style: { cursor: onDragStart ? "grab" : "pointer", transition: "opacity .2s ease" },
  };

  if (nodeStyle === "minimal") {
    return (
      <g transform={`translate(${x},${y})`} opacity={opacity} {...handle}>
        <circle r={selected ? 9 : isHover ? 8 : 6} fill={color} stroke={selected ? "var(--accent)" : "transparent"} strokeWidth={2} />
        {(selected || isHover) && (
          <text y={-12} fontSize="11" textAnchor="middle" fill="var(--fg)" style={{ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3 }}>{a.title}</text>
        )}
      </g>
    );
  }

  // color = uniform rounded-rect, accent border in type color
  if (nodeStyle === "color") {
    return (
      <g transform={`translate(${x},${y})`} opacity={opacity} {...handle}>
        <rect x={-W/2} y={-H/2} width={W} height={H} rx={10} fill={baseFill}
          stroke={strokeC} strokeWidth={strokeW} />
        <rect x={-W/2} y={-H/2} width={4} height={H} rx={0} fill={color} />
        <text x={-W/2 + 12} y={2} fontSize="11.5" fontWeight="500" fill={labelColor} dominantBaseline="middle"
          style={{ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 0 }}>
          <tspan>{truncate(a.title, 16)}</tspan>
        </text>
        <text x={-W/2 + 12} y={H/2 - 7} fontSize="9" letterSpacing=".06em" fill={color} fontWeight="600">{info.label.toUpperCase()}</text>
        {a.status === "DRAFT" && <circle cx={W/2 - 8} cy={-H/2 + 8} r={3} fill="var(--c-warning)" />}
        {a.status === "DEPRECATED" && <circle cx={W/2 - 8} cy={-H/2 + 8} r={3} fill="var(--c-danger)" />}
      </g>
    );
  }

  // shape style — actual differentiation by type
  const shapeRender = renderTypedShape(a.type, W, H, color, baseFill, strokeC, strokeW);

  return (
    <g transform={`translate(${x},${y})`} opacity={opacity} {...handle}>
      {shapeRender}
      <text x={0} y={H/2 + 14} fontSize="11.5" fontWeight="500" fill={labelColor} textAnchor="middle"
        style={{ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3 }}>
        {truncate(a.title, 22)}
      </text>
      {a.status === "DRAFT" && (
        <g transform={`translate(${W/2 - 12},${-H/2 + 8})`}>
          <circle r={4} fill="var(--c-warning)" stroke="var(--bg)" strokeWidth={1.5} />
        </g>
      )}
      {a.status === "DEPRECATED" && (
        <g transform={`translate(${W/2 - 12},${-H/2 + 8})`}>
          <circle r={4} fill="var(--c-danger)" stroke="var(--bg)" strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}

function renderTypedShape(type, W, H, color, fill, stroke, strokeW) {
  switch (type) {
    case "SERVICE":
      // rounded square with bands top/bottom
      return (
        <g>
          <rect x={-W/2} y={-H/2} width={W} height={H} rx={8} fill={fill} stroke={stroke} strokeWidth={strokeW} />
          <rect x={-W/2} y={-H/2} width={W} height={6} rx={3} fill={color} opacity={0.85} />
          <text x={0} y={4} fontSize="11.5" fontWeight="600" fill="var(--fg)" textAnchor="middle">{shortLabel("Service", color)}</text>
        </g>
      );
    case "API_SPEC":
      // hexagon
      {
        const hx = W * 0.55, hy = H * 0.6;
        const pts = [`${-hx},0`, `${-hx/2},${-hy}`, `${hx/2},${-hy}`, `${hx},0`, `${hx/2},${hy}`, `${-hx/2},${hy}`].join(" ");
        return (
          <g>
            <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <polygon points={pts} fill={color} opacity={0.07} />
            <text x={0} y={4} fontSize="11" fontWeight="600" fill={color} textAnchor="middle" style={{ fontFamily: "var(--font-mono)" }}>API</text>
          </g>
        );
      }
    case "API_ENDPOINT":
      // small pill
      return (
        <g>
          <rect x={-W/2} y={-H/2 + 6} width={W} height={H - 12} rx={H/2 - 6} fill={fill} stroke={stroke} strokeWidth={strokeW} />
          <text x={0} y={4} fontSize="11" fontWeight="600" fill={color} textAnchor="middle" style={{ fontFamily: "var(--font-mono)" }}>{"{ }"}</text>
        </g>
      );
    case "DATABASE_MODEL":
    case "DATABASE_ENTITY":
      // cylinder
      {
        const ry = 8;
        return (
          <g>
            <path d={`M ${-W/2} ${-H/2 + ry} a ${W/2} ${ry} 0 0 0 ${W} 0 L ${W/2} ${H/2 - ry} a ${W/2} ${ry} 0 0 1 ${-W} 0 Z`} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <ellipse cx={0} cy={-H/2 + ry} rx={W/2} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <text x={0} y={4} fontSize="11.5" fontWeight="600" fill={color} textAnchor="middle">DB</text>
          </g>
        );
      }
    case "DOCUMENTATION":
      // page with fold
      {
        const fold = 10;
        const path = `
          M ${-W/2 + 4} ${-H/2}
          L ${W/2 - fold} ${-H/2}
          L ${W/2} ${-H/2 + fold}
          L ${W/2} ${H/2 - 4}
          Q ${W/2} ${H/2}, ${W/2 - 4} ${H/2}
          L ${-W/2 + 4} ${H/2}
          Q ${-W/2} ${H/2}, ${-W/2} ${H/2 - 4}
          L ${-W/2} ${-H/2 + 4}
          Q ${-W/2} ${-H/2}, ${-W/2 + 4} ${-H/2} Z`;
        return (
          <g>
            <path d={path} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <path d={`M ${W/2 - fold} ${-H/2} L ${W/2 - fold} ${-H/2 + fold} L ${W/2} ${-H/2 + fold}`} fill="none" stroke={stroke} strokeWidth={strokeW} />
            <line x1={-W/2 + 14} y1={-2} x2={W/2 - 18} y2={-2} stroke={color} strokeWidth={1.5} opacity={0.7} />
            <line x1={-W/2 + 14} y1={6} x2={W/2 - 26} y2={6} stroke={color} strokeWidth={1.5} opacity={0.5} />
          </g>
        );
      }
    case "DIAGRAM":
      // overlapping diamonds
      {
        const dx = 8;
        return (
          <g>
            <rect x={-W/2} y={-H/2} width={W} height={H} rx={6} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <g transform={`translate(${-12},0)`}>
              <polygon points={`0,${-12} 12,0 0,12 -12,0`} fill={color} opacity={0.3} stroke={color} strokeWidth={1.2}/>
            </g>
            <g transform={`translate(${10},0)`}>
              <polygon points={`0,${-10} 10,0 0,10 -10,0`} fill={color} opacity={0.6} stroke={color} strokeWidth={1.2}/>
            </g>
          </g>
        );
      }
    case "REQUIREMENT":
      // diamond
      {
        const dx = W/2 - 6, dy = H/2 + 2;
        return (
          <g>
            <polygon points={`0,${-dy} ${dx},0 0,${dy} ${-dx},0`} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <text x={0} y={4} fontSize="11" fontWeight="600" fill={color} textAnchor="middle">REQ</text>
          </g>
        );
      }
    case "SECURITY_POLICY":
      // shield
      {
        const path = `
          M ${0} ${-H/2}
          L ${W/2 - 4} ${-H/2 + 8}
          L ${W/2 - 4} ${4}
          Q ${W/2 - 4} ${H/2}, ${0} ${H/2}
          Q ${-(W/2 - 4)} ${H/2}, ${-(W/2 - 4)} ${4}
          L ${-(W/2 - 4)} ${-H/2 + 8} Z`;
        return (
          <g>
            <path d={path} fill={fill} stroke={stroke} strokeWidth={strokeW} />
            <path d="M -8 0 l 4 5 l 10 -9" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      }
    case "ENVIRONMENT":
      // cloud-ish (rounded with bumps)
      return (
        <g>
          <rect x={-W/2} y={-H/2 + 6} width={W} height={H - 12} rx={H/2 - 6} fill={fill} stroke={stroke} strokeWidth={strokeW} />
          <circle cx={-W/4} cy={-H/2 + 8} r={9} fill={fill} stroke={stroke} strokeWidth={strokeW} />
          <circle cx={W/4 - 4} cy={-H/2 + 10} r={7} fill={fill} stroke={stroke} strokeWidth={strokeW} />
          <text x={0} y={4} fontSize="10.5" fontWeight="600" fill={color} textAnchor="middle" style={{ fontFamily: "var(--font-mono)" }}>ENV</text>
        </g>
      );
    case "EXTERNAL_SYSTEM":
      // parallelogram
      {
        const sk = 8;
        const pts = `${-W/2 + sk},${-H/2} ${W/2},${-H/2} ${W/2 - sk},${H/2} ${-W/2},${H/2}`;
        return (
          <g>
            <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeW} strokeDasharray="4 3" />
            <text x={0} y={4} fontSize="11" fontWeight="600" fill={color} textAnchor="middle">EXT</text>
          </g>
        );
      }
    default:
      return <rect x={-W/2} y={-H/2} width={W} height={H} rx={6} fill={fill} stroke={stroke} strokeWidth={strokeW} />;
  }
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function shortLabel(s) { return s; }

// ── edge bezier ────────────────────────────────────────
function edgePath(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cur = Math.min(80, len * 0.18);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // perpendicular offset for slight curve
  const nx = -dy / len, ny = dx / len;
  const cx = mx + nx * cur;
  const cy = my + ny * cur;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

// ── main canvas ─────────────────────────────────────────
function GraphCanvas({
  artifacts, relations, selectedId, onSelect,
  nodeStyle = "shape",          // "shape" | "color" | "minimal"
  typeFilter,                   // Set<type> of allowed types
  edgeFilter,                   // Set<relationType>
  search = "",
  height = "100%",
  initialZoom = 0.85,
  autoFit = false,              // auto-fit-to-content on mount + when artifacts change
  draggable = true,             // allow dragging nodes to reposition them
  storageKey = null,            // localStorage key to persist position overrides
}) {
  const wrapRef = gUseRef(null);
  const [tx, setTx] = gUseState(0);
  const [ty, setTy] = gUseState(0);
  const [scale, setScale] = gUseState(initialZoom);
  const [drag, setDrag] = gUseState(null);
  const [hover, setHover] = gUseState(null);

  // ── node-drag (move artifacts within the canvas) ──────────────────
  // load saved overrides from localStorage when storageKey changes
  const [positions, setPositions] = gUseState(() => {
    if (!storageKey || typeof localStorage === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("mino:graph:" + storageKey) || "{}"); } catch { return {}; }
  });
  gUseEffect(() => {
    if (!storageKey || typeof localStorage === "undefined") return;
    try { setPositions(JSON.parse(localStorage.getItem("mino:graph:" + storageKey) || "{}")); } catch {}
  }, [storageKey]);
  const persistPositions = gUseCallback((next) => {
    if (!storageKey || typeof localStorage === "undefined") return;
    try { localStorage.setItem("mino:graph:" + storageKey, JSON.stringify(next)); } catch {}
  }, [storageKey]);
  const [nodeDrag, setNodeDrag] = gUseState(null);   // { id, ox, oy, moved }
  const scaleRef = gUseRef(scale);
  gUseEffect(() => { scaleRef.current = scale; }, [scale]);

  // resolve a node's effective position (override or fallback to its gx/gy)
  const getPos = gUseCallback((a) => {
    const o = positions[a.id];
    return o ? { gx: o.gx, gy: o.gy } : { gx: a.gx, gy: a.gy };
  }, [positions]);

  // center initial layout
  gUseEffect(() => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setTx(r.width / 2);
    setTy(r.height / 2);
  }, []);

  const visibleNodes = gUseMemo(() => artifacts.filter(a => !typeFilter || typeFilter.has(a.type)), [artifacts, typeFilter]);
  const visibleSet = gUseMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  // Position lookup that respects the user's drag overrides. Edges and node
  // renders both go through this so a moved node and its incident edges stay
  // glued together.
  const posMap = gUseMemo(() => {
    const m = {};
    artifacts.forEach(a => {
      const o = positions[a.id];
      m[a.id] = o ? { ...a, gx: o.gx, gy: o.gy } : a;
    });
    return m;
  }, [artifacts, positions]);

  const visibleEdges = gUseMemo(() => relations.filter(r =>
    (!edgeFilter || edgeFilter.has(r.type)) &&
    visibleSet.has(r.source) && visibleSet.has(r.target)
  ), [relations, edgeFilter, visibleSet]);

  const norm = search.trim().toLowerCase();
  const matches = norm ? new Set(visibleNodes.filter(a => a.title.toLowerCase().includes(norm)).map(a => a.id)) : null;

  const neighborSet = gUseMemo(() => {
    if (!selectedId && !hover) return null;
    const id = hover || selectedId;
    const set = new Set([id]);
    relations.forEach(r => {
      if (r.source === id) set.add(r.target);
      if (r.target === id) set.add(r.source);
    });
    return set;
  }, [hover, selectedId, relations]);

  const onMouseDown = (e) => {
    if (e.target.tagName !== "svg" && e.target.tagName !== "rect" && !e.target.dataset?.bg) {
      // allow drag from bg only
    }
    if (e.target.dataset?.bg !== "1") return;
    if (nodeDrag) return;   // node-drag has priority
    setDrag({ x: e.clientX, y: e.clientY, tx, ty });
  };
  const onMouseMove = (e) => {
    if (!drag) return;
    setTx(drag.tx + (e.clientX - drag.x));
    setTy(drag.ty + (e.clientY - drag.y));
  };
  const onMouseUp = () => setDrag(null);

  // ── node drag handlers ─────────────────────────────────
  const onNodeDragStart = gUseCallback((node, e) => {
    e.stopPropagation();
    const cur = positions[node.id] ? positions[node.id] : { gx: node.gx, gy: node.gy };
    setNodeDrag({
      id: node.id,
      startMx: e.clientX,
      startMy: e.clientY,
      startGx: cur.gx,
      startGy: cur.gy,
      moved: false,
    });
  }, [positions]);

  gUseEffect(() => {
    if (!nodeDrag) return;
    const onMove = (ev) => {
      const s = scaleRef.current || 1;
      const dx = (ev.clientX - nodeDrag.startMx) / s;
      const dy = (ev.clientY - nodeDrag.startMy) / s;
      if (!nodeDrag.moved && (Math.abs(dx) + Math.abs(dy)) * s > 3) {
        // upgrade to "moved" once threshold crossed (so a tap still selects)
        setNodeDrag(d => d && { ...d, moved: true });
      }
      setPositions(prev => ({
        ...prev,
        [nodeDrag.id]: { gx: nodeDrag.startGx + dx, gy: nodeDrag.startGy + dy },
      }));
    };
    const onUp = () => {
      // persist final positions
      setPositions(prev => { persistPositions(prev); return prev; });
      // brief delay so the synthetic click that follows mouseup can be discarded
      setTimeout(() => setNodeDrag(null), 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [nodeDrag, persistPositions]);

  // public-ish: reset positions
  const resetPositions = gUseCallback(() => {
    setPositions({});
    persistPositions({});
    if (autoFit) requestAnimationFrame(() => fit());
  }, [autoFit, fit, persistPositions]);

  const onWheel = gUseCallback((e) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const dir = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = Math.max(0.25, Math.min(2.4, scale * dir));
    // anchor zoom around cursor
    const nx = px - (px - tx) * (next / scale);
    const ny = py - (py - ty) * (next / scale);
    setScale(next);
    setTx(nx); setTy(ny);
  }, [scale, tx, ty]);

  gUseEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const fit = gUseCallback(() => {
    if (!wrapRef.current || !visibleNodes.length) return;
    const r = wrapRef.current.getBoundingClientRect();
    const xs = visibleNodes.map(n => posMap[n.id]?.gx ?? n.gx);
    const ys = visibleNodes.map(n => posMap[n.id]?.gy ?? n.gy);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padding = 120;
    const sw = (maxX - minX) + padding * 2;
    const sh = (maxY - minY) + padding * 2;
    const s = Math.min(r.width / sw, r.height / sh, 1.2);
    setScale(s);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setTx(r.width / 2 - cx * s);
    setTy(r.height / 2 - cy * s);
  }, [visibleNodes, posMap]);

  // auto-fit on mount + when artifact list changes
  gUseEffect(() => {
    if (!autoFit) return;
    // Delay to next frame so the wrap has its measured size.
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFit, artifacts]);

  return (
    <div
      ref={wrapRef}
      className={`graph-wrap ${drag ? "dragging" : ""}${nodeDrag ? " node-dragging" : ""}`}
      style={{ width: "100%", height }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={(e) => { if (e.target.dataset?.bg === "1") onSelect?.(null); }}
    >
      {/* invisible bg capture for panning */}
      <div data-bg="1" style={{ position: "absolute", inset: 0 }} />

      <svg className="graph-svg" data-bg="1" style={{ pointerEvents: "none" }}>
        <defs>
          {Object.entries(EDGE_COLOR).map(([k, v]) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <polygon points="0,0 10,5 0,10" fill={v} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${tx} ${ty}) scale(${scale})`} style={{ pointerEvents: "auto" }}>
          {/* edges first */}
          {visibleEdges.map(r => {
            const a = posMap[r.source], b = posMap[r.target];
            if (!a || !b) return null;
            const col = EDGE_COLOR[r.type] || "#94a3b8";
            const aPt = { x: a.gx, y: a.gy };
            const bPt = { x: b.gx, y: b.gy };
            const focused = neighborSet ? neighborSet.has(a.id) && neighborSet.has(b.id) : true;
            const dim = neighborSet && !focused;
            return (
              <path key={r.id} d={edgePath(aPt, bPt)} fill="none"
                stroke={col} strokeWidth={focused ? 1.6 : 1.0}
                strokeOpacity={dim ? 0.10 : 0.55}
                markerEnd={`url(#arrow-${r.type})`} />
            );
          })}

          {/* nodes */}
          {visibleNodes.map(a => {
            const selected = a.id === selectedId;
            const isHover  = a.id === hover;
            const dim = (neighborSet && !neighborSet.has(a.id)) || (matches && !matches.has(a.id));
            const pos = posMap[a.id] || a;
            return (
              <NodeShape
                key={a.id} a={{ ...a, gx: pos.gx, gy: pos.gy }}
                selected={selected} dim={dim} nodeStyle={nodeStyle}
                isHover={isHover}
                onClick={() => {
                  // ignore click if we just dragged
                  if (nodeDrag && nodeDrag.moved) return;
                  onSelect?.(a);
                }}
                onHover={setHover}
                onDragStart={draggable ? onNodeDragStart : null}
              />
            );
          })}
        </g>
      </svg>

      {/* controls */}
      <div className="graph-controls">
        <button title="Zoom out" onClick={() => setScale(s => Math.max(0.25, s / 1.2))}><I.Minus size={14} /></button>
        <button title="Fit"      onClick={fit}><I.Compass size={14} /></button>
        <button title="Zoom in"  onClick={() => setScale(s => Math.min(2.4, s * 1.2))}><I.Plus size={14} /></button>
        {storageKey && Object.keys(positions).length > 0 && (
          <button title="Reset node positions" onClick={resetPositions}><I.Refresh size={14} /></button>
        )}
      </div>
    </div>
  );
}

// Filter sidebar component (graph page uses it)
function GraphLegend({ typeFilter, onToggle, counts }) {
  return (
    <div className="graph-filters">
      <h4>Filter by type</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {ARTIFACT_TYPES.map(t => {
          const info = TYPE_INFO[t];
          const on = !typeFilter || typeFilter.has(t);
          return (
            <div key={t} className="row" onClick={() => onToggle(t)} style={{ opacity: on ? 1 : 0.45 }}>
              <span className="sw" style={{ background: info.color }} />
              <span style={{ color: "var(--fg)" }}>{info.label}</span>
              <span className="ct">{counts[t] || 0}</span>
            </div>
          );
        })}
      </div>
      <hr style={{ margin: "10px 0" }} />
      <h4>Relations</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {RELATION_TYPES.map(r => (
          <div key={r} className="row" style={{ pointerEvents: "none" }}>
            <span className="sw" style={{ background: EDGE_COLOR[r] || "#94a3b8" }} />
            <span style={{ fontSize: 11.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { GraphCanvas, GraphLegend, EDGE_COLOR });
