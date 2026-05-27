// src/shell.jsx — sidebar, topbar, command palette, app frame.

const { useState: sUseState, useEffect: sUseEffect, useMemo: sUseMemo, useCallback: sUseCallback, useRef: sUseRef } = React;

// ───── Sidebar ─────
function Sidebar({ projectId, route }) {
  const project = projectId ? PROJECTS.find(p => p.id === projectId) : null;
  const path = route.path;

  const global = [
    { id: "dash",     label: "Dashboard", icon: <I.Home />,    to: "/dashboard", match: ["/dashboard"] },
    { id: "projects", label: "Projects",  icon: <I.Folder />,  to: "/projects",  match: ["/projects", "/projects/new"] },
  ];

  const inProj = project ? [
    { id: "overview",   label: "Overview",        icon: <I.Compass />, to: `/projects/${project.id}` },
    { id: "artifacts",  label: "Artifacts",       icon: <I.Cube />,    to: `/projects/${project.id}/artifacts`, badge: project.artifactCount },
    { id: "graph",      label: "Knowledge Graph", icon: <I.Graph />,   to: `/projects/${project.id}/graph` },
    { id: "docs",       label: "Documentation",   icon: <I.Book />,    to: `/projects/${project.id}/docs` },
    { id: "api",        label: "API Specs",       icon: <I.Plug />,    to: `/projects/${project.id}/api` },
    { id: "database",   label: "Database Model",  icon: <I.Database />,to: `/projects/${project.id}/database` },
    { id: "diagrams",   label: "Diagrams",        icon: <I.Diagram />, to: `/projects/${project.id}/diagrams` },
    { id: "validation", label: "Validation",      icon: <I.Shield />,  to: `/projects/${project.id}/validation`, badge: project.validationIssueCount, badgeTone: "warning" },
    { id: "versions",   label: "Version History", icon: <I.History />, to: `/projects/${project.id}/versions` },
    { id: "export",     label: "Export SSOT",     icon: <I.Pkg />,     to: `/projects/${project.id}/export` },
  ] : [];

  const isActive = (item) => {
    if (item.match) return item.match.some(m => path === m || path.startsWith(m + "/"));
    return path === item.to || path.startsWith(item.to + "/");
  };

  return (
    <aside className="sidebar">
      <a href="#/" className="sb-brand" style={{ textDecoration: "none", color: "inherit" }} title="Back to landing">
        <div className="mark">M</div>
        <div className="name">
          <span className="sb-name-text">Minotaurus</span>
          <small>SSOT Architecture</small>
        </div>
      </a>

      <div className="sb-items" style={{ marginTop: 4 }}>
        {global.map(it => (
          <a key={it.id} href={"#" + it.to} className={`sb-item ${isActive(it) ? "active" : ""}`} title={it.label}>
            {React.cloneElement(it.icon, { size: 16 })}
            <span className="lbl">{it.label}</span>
          </a>
        ))}
      </div>

      {project && (
        <>
          <div className="sb-divider" />
          <div className="sb-proj">
            <span className="dot" style={{ background: project.color }} />
            <span className="truncate"><strong>{project.name}</strong></span>
          </div>
          <div className="sb-items">
            {inProj.map(it => (
              <a key={it.id} href={"#" + it.to} className={`sb-item ${isActive(it) ? "active" : ""}`} title={it.label}>
                {React.cloneElement(it.icon, { size: 16 })}
                <span className="lbl">{it.label}</span>
                {it.badge != null && it.badge > 0 && (
                  <span className="right">
                    {it.badgeTone === "warning"
                      ? <Badge tone="warning">{it.badge}</Badge>
                      : <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{it.badge}</span>}
                  </span>
                )}
              </a>
            ))}
          </div>
        </>
      )}

      <div className="sb-bottom">
        <a href="#/settings" className="sb-item" style={{ padding: "7px 10px" }}>
          <I.Cog size={16} /><span className="lbl">Settings</span>
        </a>
        <div className="sb-user" style={{ marginTop: 4 }}>
          <Avatar user={CURRENT_USER} size={26} />
          <div className="who" style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }} className="truncate">{CURRENT_USER.firstName} {CURRENT_USER.lastName}</div>
            <div style={{ fontSize: 11, color: "var(--fg-muted)", lineHeight: 1.2 }} className="truncate">{CURRENT_USER.email}</div>
          </div>
          <button
            className="sb-logout"
            title="Sign out"
            aria-label="Sign out"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/login"); }}
            style={{ width: 24, height: 24, borderRadius: 5, display: "grid", placeItems: "center", color: "var(--fg-muted)" }}
          >
            <I.Logout size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ───── Topbar ─────
function Topbar({ route, projectId, onOpenSearch, onOpenMobileNav, onToggleTweaks, theme, onToggleTheme }) {
  const project = projectId ? PROJECTS.find(p => p.id === projectId) : null;
  const totalIssues = project ? project.validationIssueCount : null;
  const segs = route.segments;

  // Build breadcrumbs
  const crumbs = [];
  if (segs[0] === "dashboard") crumbs.push({ label: "Dashboard", to: "/dashboard", now: true });
  else if (segs[0] === "projects" && !segs[1]) crumbs.push({ label: "Projects", to: "/projects", now: true });
  else if (project) {
    crumbs.push({ label: "Projects", to: "/projects" });
    crumbs.push({ label: project.name, to: `/projects/${project.id}`, now: !segs[2] });
    if (segs[2] === "artifacts") {
      crumbs.push({ label: "Artifacts", to: `/projects/${project.id}/artifacts`, now: !segs[3] });
      if (segs[3] === "new") crumbs.push({ label: "New artifact", now: true });
      else if (segs[3]) {
        const a = BY_ID[segs[3]];
        if (a) crumbs.push({ label: a.title, now: true });
      }
    } else if (segs[2] === "graph") crumbs.push({ label: "Knowledge Graph", now: true });
    else if (segs[2] === "docs") {
      crumbs.push({ label: "Documentation", to: `/projects/${project.id}/docs`, now: !segs[3] });
      if (segs[3]) { const a = BY_ID[segs[3]]; if (a) crumbs.push({ label: a.title, now: true }); }
    } else if (segs[2] === "api") {
      crumbs.push({ label: "API Specs", to: `/projects/${project.id}/api`, now: !segs[3] });
      if (segs[3]) { const a = BY_ID[segs[3]]; if (a) crumbs.push({ label: a.title, now: true }); }
    } else if (segs[2] === "database") crumbs.push({ label: "Database Model", now: true });
    else if (segs[2] === "diagrams") {
      crumbs.push({ label: "Diagrams", to: `/projects/${project.id}/diagrams`, now: !segs[3] });
      if (segs[3]) { const a = BY_ID[segs[3]]; if (a) crumbs.push({ label: a.title, now: true }); }
    } else if (segs[2] === "validation") crumbs.push({ label: "Validation", now: true });
    else if (segs[2] === "versions") crumbs.push({ label: "Version History", now: true });
    else if (segs[2] === "export") crumbs.push({ label: "Export SSOT", now: true });
  } else if (segs[0] === "settings") crumbs.push({ label: "Settings", now: true });

  const valTone = totalIssues == null ? "muted"
                : totalIssues === 0 ? "success"
                : totalIssues > 5 ? "danger"
                : "warning";
  const valColor = valTone === "success" ? "var(--c-success)" : valTone === "danger" ? "var(--c-danger)" : valTone === "warning" ? "var(--c-warning)" : "var(--fg-subtle)";

  return (
    <div className="topbar">
      <button className="tb-hamburger" onClick={onOpenMobileNav} aria-label="Open menu">
        <I.Filter size={16} />
      </button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {c.to ? <a href={"#" + c.to} className={`crumb ${c.now ? "now" : ""}`}>{c.label}</a> : <span className={`crumb ${c.now ? "now" : ""}`}>{c.label}</span>}
          </React.Fragment>
        ))}
      </div>

      <div className="search" onClick={onOpenSearch}>
        <I.Search size={14} />
        <span className="grow">Search artifacts, docs, endpoints…</span>
        <kbd>⌘K</kbd>
      </div>

      <div className="tb-actions">
        {project && (
          <button className="val-pill" onClick={() => navigate(`/projects/${project.id}/validation`)} title="Validation status">
            <span className="dot" style={{ background: valColor }} />
            {totalIssues === 0 ? "Healthy" : `${totalIssues} ${totalIssues === 1 ? "issue" : "issues"}`}
          </button>
        )}
        <Btn variant="ghost" size="sm" icon={theme === "dark" ? <I.Sun size={15} /> : <I.Moon size={15} />} onClick={onToggleTheme} />
        <Btn variant="ghost" size="sm" icon={<I.Bell size={15} />} />
        <Btn variant="ghost" size="sm" icon={<I.Sparkle size={15} />} onClick={onToggleTweaks} title="Tweaks" />
      </div>
    </div>
  );
}

// ───── Command palette ─────
function CmdK({ open, onClose }) {
  const [q, setQ] = sUseState("");
  const [idx, setIdx] = sUseState(0);
  const inputRef = sUseRef();
  sUseEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(""); setIdx(0); }
  }, [open]);

  const items = sUseMemo(() => {
    const norm = q.trim().toLowerCase();
    const all = [
      { kind: "page", title: "Dashboard",     sub: "Home",            to: "/dashboard" },
      { kind: "page", title: "All projects",  sub: "Workspace",       to: "/projects" },
      { kind: "page", title: "Create project",sub: "Workspace",       to: "/projects/new" },
      { kind: "page", title: "Settings",      sub: "Account",         to: "/settings" },
      ...PROJECTS.map(p => ({ kind: "project", title: p.name, sub: "Project", to: `/projects/${p.id}` })),
      ...ARTIFACTS.map(a => ({ kind: "artifact", title: a.title, sub: TYPE_INFO[a.type]?.label || a.type, type: a.type, to: `/projects/p_helix/artifacts/${a.id}` })),
    ];
    if (!norm) return all.slice(0, 14);
    return all.filter(it => it.title.toLowerCase().includes(norm) || it.sub.toLowerCase().includes(norm)).slice(0, 30);
  }, [q]);

  sUseEffect(() => { setIdx(0); }, [q]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      const it = items[idx];
      if (it) { navigate(it.to); onClose(); }
    } else if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  return (
    <div className="cp-back" onClick={onClose}>
      <div className="cp" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Search projects, artifacts, endpoints… try 'auth' or 'orders'"
        />
        <div className="list">
          {items.length === 0 && <div style={{ padding: 18, textAlign: "center", color: "var(--fg-muted)" }}>No results.</div>}
          {items.map((it, i) => (
            <div key={i} className={`opt ${i === idx ? "on" : ""}`} onMouseEnter={() => setIdx(i)} onClick={() => { navigate(it.to); onClose(); }}>
              {it.kind === "artifact" ? <TypeChip type={it.type} /> :
               it.kind === "project"  ? <I.Folder size={14} /> :
                                        <I.ArrowR  size={14} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="ttl truncate">{it.title}</div>
                <div className="sub truncate">{it.sub}</div>
              </div>
              <kbd className="kbd">↵</kbd>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 14, fontSize: 11, color: "var(--fg-subtle)" }}>
          <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, CmdK });
