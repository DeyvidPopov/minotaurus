// src/pages-artifact.jsx — Project workspace, Artifacts, Documentation

const { useState: aUseState, useMemo: aUseMemo, useEffect: aUseEffect, useRef: aUseRef } = React;

// ──────────────────────────────────────────────────────────
// Workspace: /projects/[id]
// ──────────────────────────────────────────────────────────
function WorkspacePage({ projectId }) {
  const project = PROJECTS.find(p => p.id === projectId);
  if (!project) return <NotFound />;

  const projectArtifacts = ARTIFACTS;
  const byType = aUseMemo(() => {
    const m = {};
    projectArtifacts.forEach(a => { m[a.type] = (m[a.type] || 0) + 1; });
    return m;
  }, [projectArtifacts]);

  const openIssues = ISSUES.filter(i => i.status === "OPEN");

  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
          <ProjectMark color={project.color} size={44} letter={project.name[0]} />
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {project.name}
              <StatusBadge status="ACTIVE" />
              {project.starred && <I.Star size={16} style={{ color: "var(--c-warning)" }} />}
            </h1>
            <div className="sub">{project.description}</div>
            <div className="row" style={{ marginTop: 8, gap: 16, fontSize: 12, color: "var(--fg-muted)" }}>
              <span className="row" style={{ gap: 5 }}><I.Cube size={12} /> {project.artifactCount} artifacts</span>
              <span className="row" style={{ gap: 5 }}><I.Graph size={12} /> {RELATIONS.length} relations</span>
              <span className="row" style={{ gap: 5 }}><I.History size={12} /> updated {timeAgo(project.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="actions">
          <Btn icon={<I.Refresh size={14} />}>Run validation</Btn>
          <Btn icon={<I.Export size={14} />} onClick={() => navigate(`/projects/${project.id}/export`)}>Export SSOT</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => navigate(`/projects/${project.id}/artifacts/new`)}>New artifact</Btn>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 10, marginBottom: 28 }}>
        {[
          { icon: <I.Cube />, label: "New artifact", to: `/projects/${project.id}/artifacts/new` },
          { icon: <I.Plug />, label: "Import API",   to: `/projects/${project.id}/api` },
          { icon: <I.Book />, label: "Docs",         to: `/projects/${project.id}/docs` },
          { icon: <I.Graph />, label: "Graph",       to: `/projects/${project.id}/graph` },
          { icon: <I.Shield />, label: "Validation", to: `/projects/${project.id}/validation` },
          { icon: <I.Pkg />, label: "Export",        to: `/projects/${project.id}/export` },
        ].map((q, i) => (
          <a key={i} href={"#" + q.to} className="card" style={{
            padding: 14, display: "flex", flexDirection: "column", gap: 8, textDecoration: "none",
          }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--border-strong)"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
              {React.cloneElement(q.icon, { size: 15 })}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{q.label}</div>
          </a>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 20 }}>
        <Card title="Knowledge graph" subtitle={`${ARTIFACTS.length} nodes · ${RELATIONS.length} relations`}
          action={<a href={`#/projects/${project.id}/graph`} className="btn btn-sm btn-ghost">Open <I.ExtLink size={12} /></a>}
          padded={false}>
          <div style={{ height: 360, position: "relative" }}>
            <GraphCanvas
              artifacts={ARTIFACTS}
              relations={RELATIONS}
              selectedId={null}
              onSelect={(a) => a && navigate(`/projects/${project.id}/artifacts/${a.id}`)}
              nodeStyle="color"
              autoFit
            />
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card title="Validation snapshot" action={<a href={`#/projects/${project.id}/validation`} className="btn btn-sm btn-ghost">Open <I.ExtLink size={12} /></a>} padded>
            <div className="grid cols-4" style={{ gap: 8, marginBottom: 14 }}>
              {[
                { lbl: "Critical", n: openIssues.filter(i => i.severity === "CRITICAL").length, c: "var(--c-danger)" },
                { lbl: "Errors",   n: openIssues.filter(i => i.severity === "ERROR").length,    c: "var(--c-danger)" },
                { lbl: "Warnings", n: openIssues.filter(i => i.severity === "WARNING").length,  c: "var(--c-warning)" },
                { lbl: "Info",     n: openIssues.filter(i => i.severity === "INFO").length,     c: "var(--c-info)" },
              ].map(s => (
                <div key={s.lbl} style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".06em" }}>{s.lbl}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: s.n > 0 ? s.c : "var(--fg-subtle)" }}>{s.n}</div>
                </div>
              ))}
            </div>
            {openIssues.slice(0, 3).map(iss => (
              <a key={iss.id} href={`#/projects/${project.id}/artifacts/${iss.artifactId}`} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", textDecoration: "none", gap: 10 }}>
                <SeverityBadge severity={iss.severity} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--fg)" }} className="truncate">{iss.message}</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{BY_ID[iss.artifactId]?.title}</div>
                </div>
              </a>
            ))}
          </Card>

          <Card title="Recent changes" action={<a href={`#/projects/${project.id}/versions`} className="btn btn-sm btn-ghost">Open <I.ExtLink size={12} /></a>}>
            <div className="tl">
              {VERSIONS.slice(0, 4).map(v => (
                <div key={v.id} className="tl-item">
                  <div className="meta"><strong>{v.changedBy.firstName}</strong> {v.changeType.toLowerCase()} <span className="mono">{v.entityType.toLowerCase()}</span> · {timeAgo(v.createdAt)}</div>
                  {v.entityType === "ARTIFACT" && BY_ID[v.entityId] && (
                    <div style={{ fontSize: 13 }}>{BY_ID[v.entityId].title}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>Artifact composition</h2>
        <div className="grid cols-4">
          {ARTIFACT_TYPES.filter(t => byType[t]).map(t => {
            const info = TYPE_INFO[t];
            return (
              <a key={t} href={`#/projects/${project.id}/artifacts?type=${t}`} className="card" style={{ padding: 14, textDecoration: "none" }}>
                <div className="row" style={{ marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `color-mix(in srgb, ${info.color} 16%, transparent)`, display: "grid", placeItems: "center", color: info.color }}>
                    {React.createElement(I[info.icon] || I.Cube, { size: 14 })}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{info.label}</span>
                  <span className="grow" />
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>{byType[t]}</span>
                </div>
                {/* mini bar */}
                <div style={{ height: 4, background: "var(--panel-2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (byType[t] / 8) * 100)}%`, height: "100%", background: info.color }} />
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Artifacts list: /projects/[id]/artifacts
// ──────────────────────────────────────────────────────────
function ArtifactsListPage({ projectId, query }) {
  const project = PROJECTS.find(p => p.id === projectId);
  const [type, setType] = aUseState(query.type || "ALL");
  const [status, setStatus] = aUseState("ALL");
  const [q, setQ] = aUseState("");
  const [view, setView] = aUseState("list");

  const list = aUseMemo(() => {
    return ARTIFACTS.filter(a =>
      (type === "ALL" || a.type === type) &&
      (status === "ALL" || a.status === status) &&
      (!q.trim() || a.title.toLowerCase().includes(q.toLowerCase()))
    );
  }, [type, status, q]);

  if (!project) return <NotFound />;

  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>Artifacts</h1>
          <div className="sub">{list.length} of {ARTIFACTS.length} artifacts · the building blocks of {project.name}</div>
        </div>
        <div className="actions">
          <div className="input-with-icon" style={{ width: 220 }}>
            <I.Search size={14} />
            <input className="input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 170 }}>
            <option value="ALL">All types</option>
            {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{TYPE_INFO[t].label}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
            <option value="ALL">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="DEPRECATED">Deprecated</option>
          </select>
          <Segmented value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }]} />
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => navigate(`/projects/${project.id}/artifacts/new`)}>New</Btn>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<I.Cube size={28} />} title="No artifacts match" message="Try different filters." />
      ) : view === "list" ? (
        <Card padded={false}>
          <table className="tbl">
            <thead><tr>
              <th>Artifact</th><th>Type</th><th>Status</th><th>Relations</th><th>Issues</th><th>Author</th><th>Updated</th><th></th>
            </tr></thead>
            <tbody>
              {list.map(a => {
                const issues = ISSUES.filter(i => i.artifactId === a.id && i.status === "OPEN").length;
                return (
                  <tr key={a.id} className="row-link" onClick={() => navigate(`/projects/${project.id}/artifacts/${a.id}`)}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 500 }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: "var(--fg-muted)" }} className="truncate">{a.description}</div>
                      </div>
                    </td>
                    <td><TypeChip type={a.type} /></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="num">{a.relationCount}</td>
                    <td className="num">{issues > 0 ? <Badge tone="warning">{issues}</Badge> : "—"}</td>
                    <td><div className="row"><Avatar user={a.author} size={20} /><span style={{ fontSize: 12.5 }}>{a.author.firstName}</span></div></td>
                    <td><span style={{ color: "var(--fg-muted)", fontSize: 12.5 }}>{timeAgo(a.updatedAt)}</span></td>
                    <td><Btn variant="ghost" size="sm" icon={<I.ChevronR size={13} />} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid cols-3">
          {list.map(a => (
            <a key={a.id} href={`#/projects/${project.id}/artifacts/${a.id}`} className="card" style={{ padding: 14, textDecoration: "none" }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <TypeChip type={a.type} />
                <span className="grow" />
                <StatusBadge status={a.status} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55, minHeight: 36 }}>{a.description}</div>
              <hr style={{ margin: "12px 0" }} />
              <div className="row" style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                <span className="row" style={{ gap: 4 }}><I.Graph size={12} />{a.relationCount}</span>
                <span className="grow" />
                <span>{timeAgo(a.updatedAt)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Create artifact: /projects/[id]/artifacts/new
// ──────────────────────────────────────────────────────────
function ArtifactNewPage({ projectId }) {
  const [title, setTitle] = aUseState("");
  const [type, setType] = aUseState("SERVICE");
  const [status, setStatus] = aUseState("DRAFT");
  const [desc, setDesc] = aUseState("");
  const [tags, setTags] = aUseState("");
  const toast = useToast();

  return (
    <div className="content-inner" style={{ maxWidth: 720 }}>
      <div className="page-h">
        <div>
          <h1>New artifact</h1>
          <div className="sub">Create something to document, link, validate and export.</div>
        </div>
      </div>

      <Card>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Inventory Service" />
        </div>
        <div className="grid cols-2" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Type</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {ARTIFACT_TYPES.map(t => <option key={t} value={t}>{TYPE_INFO[t].label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="DEPRECATED">Deprecated</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Description</label>
          <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this artifact do?" />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Tags</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated, tags" />
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Btn onClick={() => navigate(`/projects/${projectId}/artifacts`)}>Cancel</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => {
            toast(`Artifact "${title || "Untitled"}" created`);
            navigate(`/projects/${projectId}/artifacts/svc-auth`);
          }}>Create artifact</Btn>
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Artifact detail: /projects/[id]/artifacts/[artifactId]
// ──────────────────────────────────────────────────────────
function ArtifactDetailPage({ projectId, artifactId, query }) {
  const project = PROJECTS.find(p => p.id === projectId);
  const a = BY_ID[artifactId];
  const [tab, setTab] = aUseState(query.tab || "overview");
  const [showRelDrawer, setShowRelDrawer] = aUseState(false);
  const toast = useToast();
  if (!project || !a) return <NotFound />;

  const incoming = RELATIONS.filter(r => r.target === a.id);
  const outgoing = RELATIONS.filter(r => r.source === a.id);
  const issues = ISSUES.filter(i => i.artifactId === a.id);
  const versions = VERSIONS.filter(v => v.entityId === a.id);
  const hasDoc = !!DOC_CONTENT[a.id];

  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ marginBottom: 8, gap: 8 }}>
            <TypeChip type={a.type} />
            <StatusBadge status={a.status} />
            {a.tags.map(t => <Badge key={t} mono>{t}</Badge>)}
          </div>
          <h1>{a.title}</h1>
          <div className="sub">{a.description}</div>
          <div className="row" style={{ marginTop: 8, gap: 16, fontSize: 12, color: "var(--fg-muted)" }}>
            <span className="row" style={{ gap: 5 }}><Avatar user={a.author} size={14} /> {a.author.firstName} {a.author.lastName}</span>
            <span>Created {timeAgo(a.createdAt)}</span>
            <span>Updated {timeAgo(a.updatedAt)}</span>
            <span className="mono">{a.id}</span>
          </div>
        </div>
        <div className="actions">
          <Btn icon={<I.Edit size={13} />}>Edit</Btn>
          <Btn icon={<I.Link size={13} />} onClick={() => setShowRelDrawer(true)}>Link</Btn>
          <Btn variant="ghost" icon={<I.More size={14} />} size="sm" />
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "overview",  label: "Overview" },
        { id: "relations", label: "Relations", count: a.relationCount },
        { id: "doc",       label: "Documentation", count: hasDoc ? 1 : 0 },
        { id: "api",       label: "API Links", count: a.type === "SERVICE" ? outgoing.filter(r => r.target.startsWith("api-")).length + incoming.filter(r => BY_ID[r.source]?.type === "API_SPEC").length : 0 },
        { id: "diagrams",  label: "Diagrams" },
        { id: "validation",label: "Validation", count: issues.length },
        { id: "history",   label: "History", count: versions.length },
      ]} />

      {tab === "overview" && <ArtifactOverview a={a} project={project} incoming={incoming} outgoing={outgoing} />}
      {tab === "relations" && <ArtifactRelations a={a} project={project} incoming={incoming} outgoing={outgoing} onOpen={() => setShowRelDrawer(true)} />}
      {tab === "doc"       && <ArtifactDoc a={a} project={project} />}
      {tab === "api"       && <ArtifactApiLinks a={a} />}
      {tab === "diagrams"  && <ArtifactDiagrams a={a} project={project} />}
      {tab === "validation"&& <ArtifactValidation a={a} issues={issues} project={project} />}
      {tab === "history"   && <ArtifactHistory versions={versions} />}

      <Drawer open={showRelDrawer} onClose={() => setShowRelDrawer(false)} title="Add relation"
        footer={<><Btn onClick={() => setShowRelDrawer(false)}>Cancel</Btn><Btn variant="primary" onClick={() => { toast("Relation added"); setShowRelDrawer(false); }}>Add</Btn></>}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Source</label>
          <div className="card-pad card" style={{ borderRadius: 6, padding: "8px 10px" }}>
            <div className="row"><TypeChip type={a.type} /><span style={{ fontWeight: 500 }}>{a.title}</span></div>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Relation type</label>
          <select className="select">{RELATION_TYPES.map(r => <option key={r}>{r}</option>)}</select>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Target artifact</label>
          <select className="select">
            {ARTIFACTS.filter(x => x.id !== a.id).map(x => <option key={x.id}>{x.title}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea className="textarea" placeholder="Describe the relationship…" />
        </div>
      </Drawer>
    </div>
  );
}

// — sub: overview tab —
function ArtifactOverview({ a, project, incoming, outgoing }) {
  const subgraph = aUseMemo(() => {
    const center = { ...a, gx: 0, gy: 0 };
    const radius = 180;
    const all = [...new Set([...incoming.map(r => r.source), ...outgoing.map(r => r.target)])];
    const items = all.map((id, i) => {
      const n = BY_ID[id];
      const ang = (i / all.length) * Math.PI * 2;
      return { ...n, gx: Math.cos(ang) * radius, gy: Math.sin(ang) * radius };
    });
    const rels = RELATIONS.filter(r => r.source === a.id || r.target === a.id);
    return { nodes: [center, ...items], rels };
  }, [a, incoming, outgoing]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card title="Mini-graph" subtitle="This artifact and its direct neighbors" padded={false}>
          <div style={{ height: 300, position: "relative" }}>
            <GraphCanvas artifacts={subgraph.nodes} relations={subgraph.rels} selectedId={a.id}
              onSelect={(n) => n && n.id !== a.id && navigate(`/projects/${project.id}/artifacts/${n.id}`)}
              nodeStyle="color" autoFit />
          </div>
        </Card>

        <Card title="Description">
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg)" }}>{a.description}</div>
          {a.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {a.tags.map(t => <Badge key={t} mono>{t}</Badge>)}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Card title="Metadata" padded>
          {[
            ["Type", <TypeChip type={a.type} />],
            ["Status", <StatusBadge status={a.status} />],
            ["Owner", <div className="row"><Avatar user={a.author} size={18} /><span style={{ fontSize: 13 }}>{a.author.firstName} {a.author.lastName}</span></div>],
            ["Created", <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{new Date(a.createdAt).toLocaleDateString()}</span>],
            ["Updated", <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>{timeAgo(a.updatedAt)}</span>],
            ["ID", <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{a.id}</span>],
          ].map(([k, v], i) => (
            <div key={i} className="row" style={{ padding: "8px 0", borderBottom: i < 5 ? "1px solid var(--border)" : 0 }}>
              <span style={{ width: 84, fontSize: 12, color: "var(--fg-muted)" }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </Card>

        <Card title={`Linked (${incoming.length + outgoing.length})`} padded>
          {[...outgoing, ...incoming].slice(0, 6).map(r => {
            const isOut = r.source === a.id;
            const other = BY_ID[isOut ? r.target : r.source];
            if (!other) return null;
            return (
              <a key={r.id} href={`#/projects/${project.id}/artifacts/${other.id}`} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", textDecoration: "none" }}>
                <TypeChip type={other.type} />
                <span style={{ minWidth: 0, flex: 1, fontSize: 13 }} className="truncate">{other.title}</span>
                <span className="mono" style={{ fontSize: 10.5, color: EDGE_COLOR[r.type], padding: "1px 6px", border: `1px solid ${EDGE_COLOR[r.type]}33`, borderRadius: 3 }}>
                  {isOut ? "→ " : "← "}{r.type}
                </span>
              </a>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// — sub: relations tab —
function ArtifactRelations({ a, project, incoming, outgoing, onOpen }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card title={`Outgoing (${outgoing.length})`} subtitle="Things this artifact depends on or affects" action={<Btn size="sm" variant="primary" icon={<I.Plus size={12} />} onClick={onOpen}>Add</Btn>}>
        {outgoing.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No outgoing relations.</div> :
          outgoing.map(r => (
            <div key={r.id} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", gap: 10 }}>
              <span className="mono" style={{ fontSize: 10.5, color: EDGE_COLOR[r.type], padding: "1px 6px", border: `1px solid ${EDGE_COLOR[r.type]}33`, borderRadius: 3 }}>{r.type}</span>
              <a href={`#/projects/${project.id}/artifacts/${r.target}`} className="row" style={{ minWidth: 0, flex: 1, gap: 8 }}>
                <TypeChip type={BY_ID[r.target].type} />
                <span style={{ fontSize: 13, fontWeight: 500 }} className="truncate">{BY_ID[r.target].title}</span>
              </a>
              <Btn size="sm" variant="ghost" icon={<I.Unlink size={12} />} />
            </div>
          ))
        }
      </Card>
      <Card title={`Incoming (${incoming.length})`} subtitle="Things that depend on this artifact">
        {incoming.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No incoming relations.</div> :
          incoming.map(r => (
            <div key={r.id} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", gap: 10 }}>
              <span className="mono" style={{ fontSize: 10.5, color: EDGE_COLOR[r.type], padding: "1px 6px", border: `1px solid ${EDGE_COLOR[r.type]}33`, borderRadius: 3 }}>{r.type}</span>
              <a href={`#/projects/${project.id}/artifacts/${r.source}`} className="row" style={{ minWidth: 0, flex: 1, gap: 8 }}>
                <TypeChip type={BY_ID[r.source].type} />
                <span style={{ fontSize: 13, fontWeight: 500 }} className="truncate">{BY_ID[r.source].title}</span>
              </a>
              <Btn size="sm" variant="ghost" icon={<I.Unlink size={12} />} />
            </div>
          ))
        }
      </Card>
    </div>
  );
}

// — sub: doc tab —
function ArtifactDoc({ a, project }) {
  const content = DOC_CONTENT[a.id];
  if (!content) {
    return <Empty icon={<I.Doc size={28} />} title="No documentation yet" message="Write a Markdown page to document this artifact."
      action={<Btn variant="primary" icon={<I.Plus size={14} />}>Add documentation</Btn>} />;
  }
  return (
    <div>
      <Card padded>
        <div className="md-prose">{renderMarkdown(content)}</div>
      </Card>
    </div>
  );
}

// — sub: api links —
function ArtifactApiLinks({ a }) {
  // Show endpoints belonging to specs that expose this service
  const specs = ARTIFACTS.filter(x => x.type === "API_SPEC" && RELATIONS.some(r => r.source === x.id && r.target === a.id && r.type === "EXPOSES"));
  if (specs.length === 0) {
    return <Empty icon={<I.Plug size={28} />} title="No API endpoints linked" message="Link an API spec to associate endpoints with this artifact." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {specs.map(spec => {
        const eps = API_ENDPOINTS_BY_SPEC[spec.id] || [];
        return (
          <Card key={spec.id} title={spec.title} subtitle={`${eps.length} endpoints`} padded={false}>
            <table className="tbl">
              <thead><tr><th>Method</th><th>Path</th><th>Summary</th><th>Auth</th><th>Status</th></tr></thead>
              <tbody>
                {eps.map(ep => (
                  <tr key={ep.id}>
                    <td><MethodBadge method={ep.method} /></td>
                    <td><span className="mono" style={{ fontSize: 12.5 }}>{ep.path}</span></td>
                    <td>{ep.summary}</td>
                    <td>{ep.auth ? <Badge tone="default" mono>required</Badge> : <span className="muted">public</span>}</td>
                    <td>{ep.status === "OK" ? <Badge tone="success">OK</Badge> : <Badge tone="warning">issues</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}

function ArtifactDiagrams({ a, project }) {
  const linked = RELATIONS.filter(r => r.target === a.id && BY_ID[r.source]?.type === "DIAGRAM").map(r => BY_ID[r.source]);
  if (linked.length === 0) {
    return <Empty icon={<I.Diagram size={28} />} title="No diagrams linked" message="Create or link a diagram to visualize this artifact." action={<Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => navigate(`/projects/${project.id}/diagrams`)}>New diagram</Btn>} />;
  }
  return (
    <div className="grid cols-2">
      {linked.map(d => (
        <Card key={d.id} title={d.title} subtitle={d.diagramType} padded={false}>
          <div style={{ padding: 12 }}><MermaidBlock source={DIAGRAM_SOURCE[d.id] || ""} /></div>
        </Card>
      ))}
    </div>
  );
}

function ArtifactValidation({ a, issues, project }) {
  if (issues.length === 0) {
    return <Empty icon={<I.Check2 size={28} />} title="No issues for this artifact" message="It passes all validation checks." />;
  }
  return (
    <Card padded={false}>
      <table className="tbl">
        <thead><tr><th>Severity</th><th>Category</th><th>Message</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {issues.map(i => (
            <tr key={i.id}>
              <td><SeverityBadge severity={i.severity} /></td>
              <td><Badge mono>{i.category}</Badge></td>
              <td>{i.message}</td>
              <td><StatusBadge status={i.status} /></td>
              <td><Btn size="sm" variant="ghost">Resolve</Btn></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ArtifactHistory({ versions }) {
  if (versions.length === 0) {
    return <Empty icon={<I.History size={28} />} title="No history yet" />;
  }
  return (
    <Card padded>
      <div className="tl">
        {versions.map(v => (
          <div key={v.id} className="tl-item">
            <div className="meta"><strong>{v.changedBy.firstName}</strong> <span style={{ color: "var(--fg-muted)" }}>{v.changeType.toLowerCase()}</span> · {timeAgo(v.createdAt)}</div>
            {v.oldValue && v.newValue && (
              <div className="diff">
                {Object.keys(v.newValue).map(k => (
                  <div key={k}><span style={{ color: "var(--c-danger)" }}>- {k}: {JSON.stringify(v.oldValue?.[k])}</span><br /><span style={{ color: "var(--c-success)" }}>+ {k}: {JSON.stringify(v.newValue[k])}</span></div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────
// Documentation: /projects/[id]/docs and /docs/[artifactId]
// ──────────────────────────────────────────────────────────
function DocsListPage({ projectId }) {
  const docs = ARTIFACTS.filter(a => a.type === "DOCUMENTATION");
  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>Documentation</h1>
          <div className="sub">{docs.length} pages</div>
        </div>
        <div className="actions">
          <Btn variant="primary" icon={<I.Plus size={14} />}>New page</Btn>
        </div>
      </div>
      <Card padded={false}>
        <table className="tbl">
          <thead><tr><th>Title</th><th>Linked artifact</th><th>Status</th><th>Author</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {docs.map(d => {
              const linked = RELATIONS.find(r => r.source === d.id && r.type === "DOCUMENTS");
              const targ = linked ? BY_ID[linked.target] : null;
              return (
                <tr key={d.id} className="row-link" onClick={() => navigate(`/projects/${projectId}/docs/${d.id}`)}>
                  <td>
                    <div className="row"><I.Doc size={14} style={{ color: "var(--c-warning)" }} /><div><div style={{ fontWeight: 500 }}>{d.title}</div><div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{d.description}</div></div></div>
                  </td>
                  <td>{targ ? <div className="row"><TypeChip type={targ.type} /><span>{targ.title}</span></div> : <span className="muted">—</span>}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td><div className="row"><Avatar user={d.author} size={20} /><span style={{ fontSize: 12.5 }}>{d.author.firstName}</span></div></td>
                  <td className="muted">{timeAgo(d.updatedAt)}</td>
                  <td><Btn variant="ghost" size="sm" icon={<I.ChevronR size={13} />} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DocDetailPage({ projectId, artifactId }) {
  const project = PROJECTS.find(p => p.id === projectId);
  const doc = BY_ID[artifactId];
  const [content, setContent] = aUseState(DOC_CONTENT[artifactId] || "");
  const [mode, setMode] = aUseState("split");
  const [saved, setSaved] = aUseState(true);
  const linked = RELATIONS.find(r => r.source === artifactId && r.type === "DOCUMENTS");
  const targ = linked ? BY_ID[linked.target] : null;
  aUseEffect(() => { setSaved(false); const id = setTimeout(() => setSaved(true), 600); return () => clearTimeout(id); }, [content]);

  if (!doc) return <NotFound />;
  return (
    <div className="content-inner wide" style={{ paddingBottom: 0 }}>
      <div className="page-h">
        <div>
          <h1>{doc.title}</h1>
          <div className="sub">{doc.description}</div>
        </div>
        <div className="actions">
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{saved ? <><I.Check size={12} /> Saved</> : "Saving…"}</span>
          <Segmented value={mode} onChange={setMode} options={[{ value: "edit", label: "Edit" }, { value: "split", label: "Split" }, { value: "preview", label: "Preview" }]} />
          <Btn variant="primary" icon={<I.Save size={14} />}>Save</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mode === "split" ? "1fr 1fr" : "1fr", gap: 16, height: "calc(100vh - 230px)" }}>
        {mode !== "preview" && (
          <Card padded={false} className="col" style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-h">
              <div className="ttl">Source</div>
              <span className="mono" style={{ fontSize: 11, color: "var(--fg-muted)" }}>Markdown</span>
            </div>
            <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)}
              style={{ flex: 1, border: 0, borderRadius: 0, padding: 16, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6, resize: "none", background: "transparent" }} />
          </Card>
        )}
        {mode !== "edit" && (
          <Card padded={false} className="col" style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-h">
              <div className="ttl">Preview</div>
              {targ && <div className="row" style={{ fontSize: 12 }}><span className="muted">linked to</span><a href={`#/projects/${projectId}/artifacts/${targ.id}`} className="row"><TypeChip type={targ.type} /><span>{targ.title}</span></a></div>}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
              <div className="md-prose">{renderMarkdown(content)}</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="content-inner">
      <Empty icon={<I.Compass size={28} />} title="Not found" message="The page you're looking for doesn't exist." action={<Btn onClick={() => navigate("/dashboard")}>Back to dashboard</Btn>} />
    </div>
  );
}

Object.assign(window, {
  WorkspacePage, ArtifactsListPage, ArtifactNewPage, ArtifactDetailPage,
  DocsListPage, DocDetailPage, NotFound,
});
