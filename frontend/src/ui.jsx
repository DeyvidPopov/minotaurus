// src/ui.jsx — reusable UI primitives.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ────────── primitive: Btn ──────────
function Btn({ variant = "default", size = "md", icon, iconRight, children, className = "", ...rest }) {
  const cls = [
    "btn",
    variant === "primary" && "btn-primary",
    variant === "ghost"   && "btn-ghost",
    variant === "danger"  && "btn-danger",
    size === "sm" && "btn-sm",
    !children && "btn-icon",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {icon}{children}{iconRight}
    </button>
  );
}

// ────────── primitive: Card ──────────
function Card({ title, subtitle, action, children, padded = true, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-h">
          <div>
            {title && <div className="ttl">{title}</div>}
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={padded ? "card-pad" : ""}>{children}</div>
    </div>
  );
}

// ────────── primitive: Stat ──────────
function Stat({ label, value, delta, deltaDir = "flat", icon, spark }) {
  return (
    <div className="stat">
      <div className="lbl">{icon}{label}</div>
      <div className="val">{value}</div>
      {delta && (
        <div className={`delta ${deltaDir}`}>
          {deltaDir === "up" ? <I.ArrowUp size={12} /> : deltaDir === "dn" ? <I.ArrowDn size={12} /> : null}
          {delta}
        </div>
      )}
      {spark && <Sparkline data={spark} className="spark" />}
    </div>
  );
}

// ────────── primitive: Sparkline ──────────
function Sparkline({ data, w = 64, h = 22, className = "" }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 2) - 1}`).join(" ");
  return (
    <svg className={className} width={w} height={h} fill="none">
      <polyline points={pts} stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`${pts} ${w},${h} 0,${h}`} fill="var(--accent-soft)" stroke="none" />
    </svg>
  );
}

// ────────── primitive: Badge / TypeChip ──────────
function Badge({ tone = "default", mono, square, children }) {
  const cls = ["badge", tone === "default" ? "" : tone, mono && "mono", square && "sq"].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}

function TypeChip({ type, size = "md" }) {
  const info = TYPE_INFO[type] || { label: type, icon: "Cube" };
  return (
    <span className={`type-chip t-${type}`}>
      <span className="sw" />
      <span className="lbl">{info.label}</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE:     { tone: "success", label: "Active" },
    DRAFT:      { tone: "default", label: "Draft" },
    DEPRECATED: { tone: "warning", label: "Deprecated" },
    OPEN:       { tone: "warning", label: "Open" },
    RESOLVED:   { tone: "success", label: "Resolved" },
    IGNORED:    { tone: "default", label: "Ignored" },
    READY:      { tone: "success", label: "Ready" },
  };
  const { tone, label } = map[status] || { tone: "default", label: status };
  return <Badge tone={tone}><span className="dot" />{label}</Badge>;
}

function MethodBadge({ method }) {
  const map = {
    GET:    "info",
    POST:   "success",
    PUT:    "warning",
    PATCH:  "purple",
    DELETE: "danger",
  };
  return <Badge tone={map[method] || "default"} mono>{method}</Badge>;
}

function SeverityBadge({ severity }) {
  const info = SEVERITIES[severity];
  if (!info) return <Badge>{severity}</Badge>;
  return <Badge tone={info.badge}>{severity}</Badge>;
}

// ────────── primitive: Empty / Loading ──────────
function Empty({ icon, title, message, action }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

function Skel({ w = "100%", h = 12, r = 6, style }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// ────────── primitive: Tabs ──────────
function Tabs({ value, onChange, tabs }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          className={value === t.id ? "on" : ""}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ────────── primitive: Segmented ──────────
function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button key={o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

// ────────── primitive: Avatar ──────────
function Avatar({ user, size = 24 }) {
  if (!user) return null;
  const initials = user.initials || (user.firstName?.[0] || "") + (user.lastName?.[0] || "");
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--panel-hover)", border: "1px solid var(--border)",
      display: "inline-grid", placeItems: "center",
      fontSize: size < 24 ? 10 : 11.5, fontWeight: 600, color: "var(--fg)",
      flex: "none",
    }}>{initials}</span>
  );
}

// ────────── primitive: Toasts (simple registry) ──────────
const ToastCtx = React.createContext(() => {});
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, msg, tone }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span className="dot" style={{
              background: t.tone === "danger" ? "var(--c-danger)"
                       : t.tone === "warning" ? "var(--c-warning)"
                       : t.tone === "info" ? "var(--c-info)"
                       : "var(--c-success)"
            }} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => React.useContext(ToastCtx);

// ────────── primitive: Modal/Drawer (right) ──────────
function Drawer({ open, onClose, title, width = 420, children, footer }) {
  return (
    <>
      {open && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.32)",
          backdropFilter: "blur(2px)", zIndex: 110,
        }} />
      )}
      <div className={`drawer ${open ? "open" : ""}`} style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width, maxWidth: "100%",
        zIndex: 111,
      }}>
        <div className="drawer-h">
          <div style={{ fontWeight: 600 }}>{title}</div>
          <Btn variant="ghost" size="sm" icon={<I.X size={14} />} onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
        {footer && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

// ────────── primitive: PageHeader (shared) ──────────
function PageHeader({ title, subtitle, eyebrow, actions, children }) {
  return (
    <div className="page-h">
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && <div className="row" style={{ marginBottom: 8, gap: 8, flexWrap: "wrap" }}>{eyebrow}</div>}
        {typeof title === "string" ? <h1>{title}</h1> : title}
        {subtitle && <div className="sub">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

// ────────── primitive: FilterBar (shared) ──────────
function FilterBar({ children, className = "" }) {
  return (
    <div className={`row ${className}`} style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>{children}</div>
  );
}

// ────────── primitive: SearchInput ──────────
function SearchInput({ value, onChange, placeholder = "Search…", width = 220 }) {
  return (
    <div className="input-with-icon" style={{ width }}>
      <I.Search size={14} />
      <input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
// Handles: headings, paragraphs, code fences (with mermaid support hook),
// inline code, bold, italic, links, lists, blockquotes, tables, hr.
function renderMarkdown(src, opts = {}) {
  if (!src) return null;
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  let key = 0;
  const k = () => `m${++key}`;

  const inline = (s) => {
    // escape angle brackets
    let parts = [];
    let rest = s;
    const patterns = [
      [/^`([^`]+)`/, (m) => <code key={k()}>{m[1]}</code>],
      [/^\*\*([^*]+)\*\*/, (m) => <strong key={k()}>{m[1]}</strong>],
      [/^\*([^*]+)\*/, (m) => <em key={k()}>{m[1]}</em>],
      [/^\[([^\]]+)\]\(([^)]+)\)/, (m) => <a key={k()} href={m[2]} onClick={(e) => e.preventDefault()}>{m[1]}</a>],
    ];
    while (rest.length) {
      let matched = false;
      for (const [re, render] of patterns) {
        const m = rest.match(re);
        if (m) {
          parts.push(render(m));
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // accumulate plain text up to next special char
        const nextIdx = rest.search(/[`*\[]/);
        const chunk = nextIdx === -1 ? rest : rest.slice(0, nextIdx || 1);
        parts.push(chunk);
        rest = rest.slice(chunk.length);
      }
    }
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    // code fence
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      if (lang === "mermaid") {
        out.push(<MermaidBlock key={k()} source={buf.join("\n")} />);
      } else {
        out.push(<pre key={k()}><code>{buf.join("\n")}</code></pre>);
      }
      continue;
    }
    // heading
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      const lvl = h[1].length;
      const Tag = `h${Math.min(lvl, 4)}`;
      out.push(React.createElement(Tag, { key: k() }, inline(h[2])));
      i++; continue;
    }
    // hr
    if (/^---+$/.test(line)) { out.push(<hr key={k()} />); i++; continue; }
    // blockquote
    if (line.startsWith("> ")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith("> ")) { buf.push(lines[i].slice(2)); i++; }
      out.push(<blockquote key={k()}>{inline(buf.join(" "))}</blockquote>);
      continue;
    }
    // table
    if (line.startsWith("|") && lines[i + 1]?.match(/^\|\s*-/)) {
      const headers = line.split("|").slice(1, -1).map(s => s.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map(s => s.trim()));
        i++;
      }
      out.push(
        <div key={k()} style={{ overflowX: "auto", margin: "0 0 12px" }}>
          <table className="tbl" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <thead><tr>{headers.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}><span className={ci === 0 ? "mono" : ""}>{inline(c)}</span></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    // unordered list
    if (line.match(/^[-*]\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(<ul key={k()}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul>);
      continue;
    }
    // ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(<ol key={k()}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>);
      continue;
    }
    // paragraph
    if (line.trim()) {
      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].match(/^(#|\||>|```|---|[-*]\s|\d+\.\s)/)) {
        buf.push(lines[i]);
        i++;
      }
      out.push(<p key={k()}>{inline(buf.join(" "))}</p>);
      continue;
    }
    i++;
  }
  return out;
}

// Mermaid block: render a static, hand-drawn-looking preview.
// (We don't load the actual mermaid library — we render a stylized representation
// from the source text using simple parsing of `sequenceDiagram` / `flowchart`.)
function MermaidBlock({ source }) {
  const isSeq = /^\s*sequenceDiagram/.test(source);
  const isFlow = /^\s*(flowchart|graph)/.test(source);

  if (isSeq) return <SequenceDiagram source={source} />;
  if (isFlow) return <FlowDiagram source={source} />;
  return <pre><code>{source}</code></pre>;
}

function SequenceDiagram({ source }) {
  // parse participants and arrows
  const lines = source.split("\n").map(s => s.trim()).filter(Boolean);
  const participants = [];
  const arrows = [];
  for (const ln of lines) {
    const p = ln.match(/^participant\s+(\w+)(?:\s+as\s+(.+))?/);
    if (p) { participants.push({ id: p[1], label: p[2] || p[1] }); continue; }
    const a = ln.match(/^(\w+)\s*[-]+>>?\s*(\w+)\s*:\s*(.+)/);
    if (a) {
      if (!participants.find(x => x.id === a[1])) participants.push({ id: a[1], label: a[1] });
      if (!participants.find(x => x.id === a[2])) participants.push({ id: a[2], label: a[2] });
      arrows.push({ from: a[1], to: a[2], label: a[3] });
    }
    const ar = ln.match(/^(\w+)\s*-+>>?\s*(\w+)\s*:\s*(.+)/);
    if (ar && !a) {
      arrows.push({ from: ar[1], to: ar[2], label: ar[3] });
    }
  }
  const colW = 160;
  const w = participants.length * colW + 40;
  const startY = 60;
  const rowH = 56;
  const h = startY + arrows.length * rowH + 40;

  const xOf = (id) => 20 + colW / 2 + participants.findIndex(p => p.id === id) * colW;

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
      {/* lifelines */}
      {participants.map((p, i) => (
        <g key={p.id}>
          <rect x={20 + i * colW} y={20} width={colW - 20} height="30" rx="6"
            fill="var(--panel)" stroke="var(--border-strong)" />
          <text x={xOf(p.id)} y={40} fontSize="12" fill="var(--fg)" textAnchor="middle" fontWeight="500">{p.label}</text>
          <line x1={xOf(p.id)} y1={50} x2={xOf(p.id)} y2={h - 10}
            stroke="var(--border)" strokeDasharray="3 3" />
        </g>
      ))}
      {/* arrows */}
      {arrows.map((a, i) => {
        const x1 = xOf(a.from), x2 = xOf(a.to);
        const y = startY + i * rowH + 20;
        const dir = x2 >= x1 ? 1 : -1;
        return (
          <g key={i}>
            <text x={(x1 + x2) / 2} y={y - 6} fontSize="11" fill="var(--fg-muted)" textAnchor="middle">{a.label}</text>
            <line x1={x1} y1={y} x2={x2 - 6 * dir} y2={y} stroke="var(--accent)" strokeWidth="1.6" />
            <polygon points={`${x2},${y} ${x2 - 8 * dir},${y - 4} ${x2 - 8 * dir},${y + 4}`} fill="var(--accent)" />
          </g>
        );
      })}
    </svg>
  );
}

function FlowDiagram({ source }) {
  // Simple flowchart parser — detects nodes and arrows.
  const lines = source.split("\n").map(s => s.trim()).filter(Boolean);
  const nodes = {};
  const edges = [];
  for (const ln of lines) {
    // node defs like "GW(Public Gateway)" or "Auth[[Auth Service]]"
    const ms = ln.matchAll(/(\w+)(\[\[?[^\]]+\]?\]|\([^)]+\)|\{[^}]+\}|\(\([^)]+\)\))/g);
    for (const m of ms) {
      const id = m[1];
      const raw = m[2];
      let label = raw.replace(/^[\[\(\{(]+|[\]\)\}]+$/g, "");
      let shape = "box";
      if (raw.startsWith("[[")) shape = "service";
      else if (raw.startsWith("((")) shape = "ext";
      else if (raw.startsWith("(")) shape = "round";
      else if (raw.startsWith("{")) shape = "diamond";
      if (!nodes[id]) nodes[id] = { id, label, shape };
    }
    // edges
    const e = ln.match(/^(\w+)\s*-->\s*(\w+)/);
    if (e) edges.push({ from: e[1], to: e[2] });
    // also detect "A --> B & C" style? skip
  }
  const ids = Object.keys(nodes);
  // hand-laid grid layout (rough)
  const cols = Math.ceil(Math.sqrt(ids.length));
  const cellW = 140, cellH = 70;
  const pos = {};
  ids.forEach((id, i) => {
    pos[id] = { x: 30 + (i % cols) * cellW + cellW / 2, y: 40 + Math.floor(i / cols) * cellH + cellH / 2 };
  });
  const w = cols * cellW + 60;
  const h = Math.ceil(ids.length / cols) * cellH + 80;

  const drawNode = (id) => {
    const n = nodes[id]; const p = pos[id];
    if (n.shape === "ext") return <ellipse cx={p.x} cy={p.y} rx="42" ry="22" fill="var(--panel)" stroke="var(--c-pink)" strokeWidth="1.4" />;
    if (n.shape === "round") return <rect x={p.x - 50} y={p.y - 18} width="100" height="36" rx="18" fill="var(--panel)" stroke="var(--accent)" />;
    if (n.shape === "service") return <rect x={p.x - 54} y={p.y - 20} width="108" height="40" rx="6" fill="var(--panel)" stroke="var(--c-info)" strokeWidth="1.6" />;
    return <rect x={p.x - 46} y={p.y - 18} width="92" height="36" rx="6" fill="var(--panel)" stroke="var(--border-strong)" />;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <polygon points="0,0 10,5 0,10" fill="var(--fg-muted)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--fg-muted)" strokeWidth="1.2" markerEnd="url(#ar)" />;
      })}
      {ids.map(id => <g key={id}>{drawNode(id)}<text x={pos[id].x} y={pos[id].y + 4} fontSize="11.5" textAnchor="middle" fill="var(--fg)">{nodes[id].label}</text></g>)}
    </svg>
  );
}

// ────────── Project shape icon (cube/folder) ──────────
function ProjectMark({ color = "var(--accent)", size = 30, letter = "H" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 40%, #000))`,
      display: "grid", placeItems: "center", color: "#fff",
      fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: size * 0.42,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18), 0 1px 0 rgba(0,0,0,.18)",
      flex: "none",
    }}>{letter}</div>
  );
}

Object.assign(window, {
  Btn, Card, Stat, Sparkline,
  Badge, TypeChip, StatusBadge, MethodBadge, SeverityBadge,
  Empty, Skel, Tabs, Segmented, Avatar,
  ToastCtx, ToastProvider, useToast,
  Drawer, renderMarkdown, MermaidBlock, ProjectMark,
  PageHeader, FilterBar, SearchInput,
});
