// src/pages-tools.jsx — API specs, Database, Diagrams, Graph, Validation, Versions, Export

const { useState: tUseState, useMemo: tUseMemo, useEffect: tUseEffect, useRef: tUseRef } = React;

// ──────────────────────────────────────────────────────────
// API Specs list and detail
// ──────────────────────────────────────────────────────────
function ApiSpecsPage({ projectId }) {
  const specs = ARTIFACTS.filter(a => a.type === "API_SPEC");
  const [importOpen, setImportOpen] = tUseState(false);
  const toast = useToast();
  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>API specifications</h1>
          <div className="sub">{specs.length} specs · {Object.values(API_ENDPOINTS_BY_SPEC).flat().length} endpoints total</div>
        </div>
        <div className="actions">
          <Btn icon={<I.Upload size={14} />} onClick={() => setImportOpen(true)}>Import spec</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => setImportOpen(true)}>New spec</Btn>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        {specs.map(s => {
          const eps = API_ENDPOINTS_BY_SPEC[s.id] || [];
          const exposes = RELATIONS.filter(r => r.source === s.id && r.type === "EXPOSES").map(r => BY_ID[r.target]);
          return (
            <a key={s.id} href={`#/projects/${projectId}/api/${s.id}`} className="card" style={{ padding: 16, textDecoration: "none" }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <TypeChip type="API_SPEC" />
                <span className="grow" />
                <StatusBadge status={s.status} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12, lineHeight: 1.5, minHeight: 36 }}>{s.description}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                {Array.from(new Set(eps.map(e => e.method))).map(m => <MethodBadge key={m} method={m} />)}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg-subtle)" }}>{eps.length} endpoints</span>
              </div>
              {exposes.length > 0 && (
                <div className="row" style={{ fontSize: 12, color: "var(--fg-muted)", gap: 6 }}>
                  <I.Link size={12} /><span>exposes</span>
                  {exposes.slice(0, 2).map(e => <span key={e.id} style={{ fontWeight: 500, color: "var(--fg)" }}>{e.title}</span>)}
                  {exposes.length > 2 && <span>+{exposes.length - 2}</span>}
                </div>
              )}
            </a>
          );
        })}
      </div>

      <Drawer open={importOpen} onClose={() => setImportOpen(false)} title="Import OpenAPI spec"
        footer={<><Btn onClick={() => setImportOpen(false)}>Cancel</Btn><Btn variant="primary" onClick={() => { toast("Spec imported (3 endpoints)"); setImportOpen(false); }}>Import</Btn></>}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Name</label><input className="input" placeholder="Inventory API" />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Source</label>
          <Segmented value="paste" onChange={() => {}} options={[{ value: "paste", label: "Paste" }, { value: "url", label: "URL" }, { value: "file", label: "File" }]} />
        </div>
        <div className="field">
          <label>OpenAPI JSON / YAML</label>
          <textarea className="textarea" style={{ minHeight: 220, fontFamily: "var(--font-mono)", fontSize: 12.5 }}
            defaultValue={`openapi: 3.1.0\ninfo:\n  title: Inventory API\n  version: 0.1.0\npaths:\n  /stock/{sku}:\n    get:\n      summary: Stock level for a SKU`} />
        </div>
      </Drawer>
    </div>
  );
}

function ApiSpecDetailPage({ projectId, artifactId }) {
  const spec = BY_ID[artifactId];
  const eps = API_ENDPOINTS_BY_SPEC[artifactId] || [];
  const [active, setActive] = tUseState(null);
  if (!spec) return <NotFound />;
  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <TypeChip type="API_SPEC" />
            <StatusBadge status={spec.status} />
          </div>
          <h1>{spec.title}</h1>
          <div className="sub">{spec.description}</div>
        </div>
        <div className="actions">
          <Btn icon={<I.Download size={14} />}>Download YAML</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />}>New endpoint</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20 }}>
        <Card padded={false}>
          <table className="tbl">
            <thead><tr><th style={{ width: 70 }}>Method</th><th>Path</th><th>Summary</th><th>Auth</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {eps.map(ep => (
                <tr key={ep.id} className="row-link" onClick={() => setActive(ep)}>
                  <td><MethodBadge method={ep.method} /></td>
                  <td><span className="mono" style={{ fontSize: 12.5 }}>{ep.path}</span></td>
                  <td>{ep.summary}</td>
                  <td>{ep.auth ? <I.Lock size={13} style={{ color: "var(--fg-muted)" }} /> : <span className="muted">—</span>}</td>
                  <td>{ep.status === "OK" ? <Badge tone="success">OK</Badge> : <Badge tone="warning">issues</Badge>}</td>
                  <td><Btn variant="ghost" size="sm" icon={<I.ChevronR size={13} />} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Linked services" padded>
          {RELATIONS.filter(r => r.source === spec.id && r.type === "EXPOSES").map(r => {
            const t = BY_ID[r.target];
            return (
              <a key={r.id} href={`#/projects/${projectId}/artifacts/${t.id}`} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", textDecoration: "none" }}>
                <TypeChip type={t.type} />
                <span style={{ fontWeight: 500 }}>{t.title}</span>
              </a>
            );
          })}
        </Card>
      </div>

      <Drawer open={!!active} onClose={() => setActive(null)} title={active ? `${active.method} ${active.path}` : ""} width={520}>
        {active && (
          <>
            <div className="row" style={{ marginBottom: 14 }}>
              <MethodBadge method={active.method} />
              <span className="mono">{active.path}</span>
            </div>
            <div className="drawer-sect">
              <div className="lbl">Summary</div>
              <div style={{ fontSize: 13.5 }}>{active.summary}</div>
            </div>
            <div className="drawer-sect">
              <div className="lbl">Request body</div>
              <pre className="md-prose" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 12, fontSize: 12, margin: 0, fontFamily: "var(--font-mono)" }}>{`{
  "email": "string",
  "password": "string"
}`}</pre>
            </div>
            <div className="drawer-sect">
              <div className="lbl">Responses</div>
              <div className="row" style={{ gap: 8 }}><Badge tone="success">200</Badge><span style={{ fontSize: 12.5 }}>{`{ accessToken, refreshToken, user }`}</span></div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}><Badge tone="danger">401</Badge><span style={{ fontSize: 12.5 }}>{`{ error: "invalid_credentials" }`}</span></div>
            </div>
            <div className="drawer-sect">
              <div className="lbl">Linked artifact</div>
              {active.linkedArtifactId && (
                <a href={`#/projects/${projectId}/artifacts/${active.linkedArtifactId}`} className="row">
                  <TypeChip type={BY_ID[active.linkedArtifactId].type} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{BY_ID[active.linkedArtifactId].title}</span>
                </a>
              )}
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Database model
// ──────────────────────────────────────────────────────────
function DatabasePage({ projectId }) {
  const dbs = ARTIFACTS.filter(a => a.type === "DATABASE_MODEL");
  const [active, setActive] = tUseState(dbs[0]?.id);
  const entities = DB_ENTITIES[active] || [];
  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>Database model</h1>
          <div className="sub">{dbs.length} databases · {Object.values(DB_ENTITIES).flat().length} entities</div>
        </div>
        <div className="actions">
          <Btn icon={<I.Upload size={14} />}>Import schema</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />}>New entity</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 16 }}>
        <Card padded title="Databases">
          {dbs.map(db => (
            <div key={db.id} className="sb-item" style={{ background: active === db.id ? "var(--panel-hover)" : "transparent", margin: "0 -6px", padding: "7px 8px" }} onClick={() => setActive(db.id)}>
              <I.Database size={14} style={{ color: TYPE_INFO.DATABASE_MODEL.color }} />
              <span className="grow" style={{ fontSize: 13 }}>{db.title}</span>
              <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{(DB_ENTITIES[db.id] || []).length}</span>
            </div>
          ))}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title={BY_ID[active]?.title} subtitle={BY_ID[active]?.description}>
            <div className="row" style={{ fontSize: 12, color: "var(--fg-muted)", gap: 16 }}>
              <span className="row" style={{ gap: 5 }}><I.Cube size={12} />{entities.length} entities</span>
              <span className="row" style={{ gap: 5 }}><I.Link size={12} />{entities.reduce((s, e) => s + e.fields.filter(f => f.fk).length, 0)} foreign keys</span>
              <span className="row" style={{ gap: 5 }}><I.Check size={12} />Normalized</span>
            </div>
          </Card>

          <div className="grid cols-2" style={{ gap: 14 }}>
            {entities.map(e => (
              <Card key={e.name} padded={false}>
                <div className="card-h">
                  <div className="row">
                    <I.Cube size={14} style={{ color: "var(--c-success)" }} />
                    <span className="ttl mono">{e.name}</span>
                    <Badge mono>{e.type}</Badge>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{e.fields.length} fields</span>
                </div>
                <table className="tbl">
                  <tbody>
                    {e.fields.map(f => (
                      <tr key={f.name}>
                        <td style={{ padding: "8px 14px" }}>
                          <div className="row">
                            {f.pk && <span title="Primary key" style={{ color: "var(--c-warning)", fontSize: 11 }}>🔑</span>}
                            {f.fk && <span title="Foreign key" style={{ color: "var(--c-info)", fontSize: 11 }}>FK</span>}
                            <span className="mono" style={{ fontSize: 12.5 }}>{f.name}</span>
                            {f.unique && <Badge mono>unique</Badge>}
                            {f.warn && <Badge tone="warning" mono>warn</Badge>}
                          </div>
                          {f.warn && <div style={{ fontSize: 11.5, color: "var(--c-warning)", marginTop: 2 }}>{f.warn}</div>}
                          {f.fk && <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 2 }}>→ {f.fk}</div>}
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "right" }}>
                          <span className="mono" style={{ fontSize: 12, color: "var(--fg-muted)" }}>{f.type}{f.nullable === false ? "" : " ?"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Diagrams list and detail
// ──────────────────────────────────────────────────────────
function DiagramsListPage({ projectId }) {
  const diagrams = ARTIFACTS.filter(a => a.type === "DIAGRAM");
  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>Diagrams</h1>
          <div className="sub">{diagrams.length} diagrams · Mermaid, UML, ERD, flowcharts</div>
        </div>
        <div className="actions">
          <Btn variant="primary" icon={<I.Plus size={14} />}>New diagram</Btn>
        </div>
      </div>
      <div className="grid cols-2">
        {diagrams.map(d => (
          <a href={`#/projects/${projectId}/diagrams/${d.id}`} key={d.id} className="card" style={{ padding: 0, textDecoration: "none", overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <TypeChip type="DIAGRAM" />
                <span className="grow" />
                <Badge mono>{d.diagramType}</Badge>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{d.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{d.description}</div>
            </div>
            <div style={{ padding: 12, background: "var(--bg)", maxHeight: 220, overflow: "hidden" }}>
              <MermaidBlock source={DIAGRAM_SOURCE[d.id] || ""} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function DiagramDetailPage({ projectId, artifactId }) {
  const d = BY_ID[artifactId];
  const [src, setSrc] = tUseState(DIAGRAM_SOURCE[artifactId] || "");
  const [mode, setMode] = tUseState("split");
  if (!d) return <NotFound />;
  return (
    <div className="content-inner wide" style={{ paddingBottom: 0 }}>
      <div className="page-h">
        <div>
          <h1>{d.title}</h1>
          <div className="sub">{d.description} · <Badge mono>{d.diagramType}</Badge></div>
        </div>
        <div className="actions">
          <Segmented value={mode} onChange={setMode} options={[{ value: "edit", label: "Source" }, { value: "split", label: "Split" }, { value: "preview", label: "Preview" }]} />
          <Btn variant="primary" icon={<I.Save size={14} />}>Save</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: mode === "split" ? "1fr 1fr" : "1fr", gap: 16, height: "calc(100vh - 230px)" }}>
        {mode !== "preview" && (
          <Card padded={false} style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-h"><div className="ttl">Source</div><span className="mono muted" style={{ fontSize: 11 }}>Mermaid</span></div>
            <textarea className="textarea" value={src} onChange={(e) => setSrc(e.target.value)}
              style={{ flex: 1, border: 0, borderRadius: 0, padding: 16, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.6, resize: "none", background: "transparent" }} />
          </Card>
        )}
        {mode !== "edit" && (
          <Card padded={false} style={{ display: "flex", flexDirection: "column" }}>
            <div className="card-h"><div className="ttl">Preview</div></div>
            <div style={{ flex: 1, overflow: "auto", padding: 18 }}><MermaidBlock source={src} /></div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Knowledge Graph: /projects/[id]/graph  (HERO PAGE)
// ──────────────────────────────────────────────────────────
function GraphPage({ projectId, nodeStyle, onSetNodeStyle }) {
  const project = PROJECTS.find(p => p.id === projectId);
  const [typeFilter, setTypeFilter] = tUseState(null); // null = all
  const [selected, setSelected] = tUseState(null);
  const [search, setSearch] = tUseState("");

  const counts = tUseMemo(() => {
    const m = {};
    ARTIFACTS.forEach(a => { m[a.type] = (m[a.type] || 0) + 1; });
    return m;
  }, []);

  const toggleType = (t) => {
    setTypeFilter(prev => {
      const set = new Set(prev || ARTIFACT_TYPES);
      if (set.has(t)) set.delete(t); else set.add(t);
      if (set.size === ARTIFACT_TYPES.length) return null;
      return set;
    });
  };

  const focused = selected ? BY_ID[selected] : null;
  const incoming = focused ? RELATIONS.filter(r => r.target === focused.id) : [];
  const outgoing = focused ? RELATIONS.filter(r => r.source === focused.id) : [];

  if (!project) return <NotFound />;

  return (
    <div className="content-inner full" style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      {/* compact header bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Knowledge graph</div>
          <div style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{ARTIFACTS.length} artifacts · {RELATIONS.length} relations</div>
        </div>
        <div className="input-with-icon" style={{ width: 200, marginLeft: 4 }}>
          <I.Search size={14} />
          <input className="input" placeholder="Find a node…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grow" />
        <span style={{ fontSize: 12, color: "var(--fg-muted)", whiteSpace: "nowrap" }}>Node style</span>
        <Segmented value={nodeStyle} onChange={onSetNodeStyle} options={[
          { value: "shape",   label: "Shape" },
          { value: "color",   label: "Color" },
          { value: "minimal", label: "Minimal" },
        ]} />
        <Btn icon={<I.Refresh size={14} />}>Validate</Btn>
        <Btn variant="primary" icon={<I.Link size={14} />}>Create relation</Btn>
      </div>

      <div style={{ position: "relative", overflow: "hidden" }}>
        <GraphCanvas
          artifacts={ARTIFACTS} relations={RELATIONS}
          selectedId={selected}
          onSelect={(a) => setSelected(a?.id || null)}
          typeFilter={typeFilter}
          nodeStyle={nodeStyle}
          search={search}
          autoFit
          storageKey={`project:${projectId}`}
        />
        <GraphLegend typeFilter={typeFilter} onToggle={toggleType} counts={counts} />

        {/* details drawer */}
        <Drawer open={!!focused} onClose={() => setSelected(null)} title="Artifact details" width={400}>
          {focused && (
            <>
              <div className="drawer-sect">
                <div className="row" style={{ marginBottom: 6 }}>
                  <TypeChip type={focused.type} />
                  <StatusBadge status={focused.status} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{focused.title}</div>
                <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>{focused.description}</div>
              </div>

              {focused.tags.length > 0 && (
                <div className="drawer-sect">
                  <div className="lbl">Tags</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{focused.tags.map(t => <Badge key={t} mono>{t}</Badge>)}</div>
                </div>
              )}

              <div className="drawer-sect">
                <div className="lbl">Outgoing ({outgoing.length})</div>
                {outgoing.map(r => (
                  <div key={r.id} className="row" style={{ padding: "6px 0", fontSize: 13 }}>
                    <span className="mono" style={{ fontSize: 10, color: EDGE_COLOR[r.type], padding: "1px 5px", border: `1px solid ${EDGE_COLOR[r.type]}33`, borderRadius: 3 }}>{r.type}</span>
                    <a href={`#/projects/${project.id}/artifacts/${r.target}`} style={{ minWidth: 0 }}>{BY_ID[r.target]?.title}</a>
                  </div>
                ))}
              </div>
              <div className="drawer-sect">
                <div className="lbl">Incoming ({incoming.length})</div>
                {incoming.map(r => (
                  <div key={r.id} className="row" style={{ padding: "6px 0", fontSize: 13 }}>
                    <span className="mono" style={{ fontSize: 10, color: EDGE_COLOR[r.type], padding: "1px 5px", border: `1px solid ${EDGE_COLOR[r.type]}33`, borderRadius: 3 }}>{r.type}</span>
                    <a href={`#/projects/${project.id}/artifacts/${r.source}`} style={{ minWidth: 0 }}>{BY_ID[r.source]?.title}</a>
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <Btn variant="primary" onClick={() => navigate(`/projects/${project.id}/artifacts/${focused.id}`)}>Open artifact <I.ArrowR size={14} /></Btn>
                <Btn icon={<I.Link size={13} />}>Link…</Btn>
              </div>
            </>
          )}
        </Drawer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Validation page
// ──────────────────────────────────────────────────────────
function ValidationPage({ projectId }) {
  const [sev, setSev] = tUseState("ALL");
  const [cat, setCat] = tUseState("ALL");
  const [status, setStatus] = tUseState("OPEN");
  const [running, setRunning] = tUseState(false);
  const toast = useToast();

  const issues = ISSUES.filter(i =>
    (sev === "ALL" || i.severity === sev) &&
    (cat === "ALL" || i.category === cat) &&
    (status === "ALL" || i.status === status)
  );

  const stats = {
    CRITICAL: ISSUES.filter(i => i.status === "OPEN" && i.severity === "CRITICAL").length,
    ERROR:    ISSUES.filter(i => i.status === "OPEN" && i.severity === "ERROR").length,
    WARNING:  ISSUES.filter(i => i.status === "OPEN" && i.severity === "WARNING").length,
    INFO:     ISSUES.filter(i => i.status === "OPEN" && i.severity === "INFO").length,
  };

  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>Validation</h1>
          <div className="sub">{ISSUES.filter(i => i.status === "OPEN").length} open issues · last run 8 minutes ago</div>
        </div>
        <div className="actions">
          <Btn variant="primary" icon={<I.Play size={14} />} onClick={() => {
            setRunning(true);
            setTimeout(() => { setRunning(false); toast("Validation complete · no new issues"); }, 1200);
          }}>{running ? "Running…" : "Run validation"}</Btn>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {[
          { lbl: "Critical", n: stats.CRITICAL, c: "var(--c-danger)",  icon: <I.Crit size={13}/> },
          { lbl: "Errors",   n: stats.ERROR,    c: "var(--c-danger)",  icon: <I.Error size={13}/> },
          { lbl: "Warnings", n: stats.WARNING,  c: "var(--c-warning)", icon: <I.Warn size={13}/> },
          { lbl: "Info",     n: stats.INFO,     c: "var(--c-info)",    icon: <I.Info size={13}/> },
        ].map(s => (
          <div key={s.lbl} className="stat">
            <div className="lbl">{React.cloneElement(s.icon, { style: { color: s.c }})}{s.lbl}</div>
            <div className="val" style={{ color: s.n > 0 ? s.c : "var(--fg)" }}>{s.n}</div>
            <div className="delta flat">across {ISSUES.filter(i => i.severity === s.lbl.toUpperCase().replace("WARNINGS","WARNING").replace("ERRORS","ERROR").replace("CRITICAL","CRITICAL").replace("INFO","INFO")).length} artifacts</div>
          </div>
        ))}
      </div>

      <Card padded={false}>
        <div className="card-h">
          <div className="ttl">All issues</div>
          <div className="row">
            <select className="select" value={sev} onChange={(e) => setSev(e.target.value)} style={{ width: 130 }}>
              <option value="ALL">All severities</option>
              {Object.keys(SEVERITIES).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 150 }}>
              <option value="ALL">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 130 }}>
              <option value="ALL">All status</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IGNORED">Ignored</option>
            </select>
          </div>
        </div>
        {issues.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: "var(--fg-muted)" }}>No issues match these filters.</div> : (
          <table className="tbl">
            <thead><tr>
              <th>Severity</th><th>Category</th><th>Message</th><th>Artifact</th><th>Created</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {issues.map(i => {
                const art = BY_ID[i.artifactId];
                return (
                  <tr key={i.id} className="row-link" onClick={() => navigate(`/projects/${projectId}/artifacts/${i.artifactId}?tab=validation`)}>
                    <td><SeverityBadge severity={i.severity} /></td>
                    <td><Badge mono>{i.category}</Badge></td>
                    <td style={{ fontSize: 13 }}>{i.message}</td>
                    <td>{art && <div className="row"><TypeChip type={art.type} /><span style={{ fontWeight: 500 }}>{art.title}</span></div>}</td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{timeAgo(i.createdAt)}</td>
                    <td><StatusBadge status={i.status} /></td>
                    <td><Btn variant="ghost" size="sm" icon={<I.More size={13} />} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Version history
// ──────────────────────────────────────────────────────────
function VersionsPage({ projectId }) {
  const [type, setType] = tUseState("ALL");
  const [chg, setChg] = tUseState("ALL");
  const filtered = VERSIONS.filter(v =>
    (type === "ALL" || v.entityType === type) &&
    (chg === "ALL" || v.changeType === chg)
  );

  return (
    <div className="content-inner wide">
      <div className="page-h">
        <div>
          <h1>Version history</h1>
          <div className="sub">{VERSIONS.length} changes · all events are tracked</div>
        </div>
        <div className="actions">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 160 }}>
            <option value="ALL">All types</option>
            <option value="ARTIFACT">Artifact</option>
            <option value="RELATION">Relation</option>
            <option value="DOCUMENTATION">Documentation</option>
            <option value="EXPORT">Export</option>
          </select>
          <select className="select" value={chg} onChange={(e) => setChg(e.target.value)} style={{ width: 150 }}>
            <option value="ALL">All changes</option>
            <option value="CREATED">Created</option>
            <option value="UPDATED">Updated</option>
            <option value="DELETED">Deleted</option>
            <option value="LINKED">Linked</option>
            <option value="VALIDATED">Validated</option>
            <option value="EXPORTED">Exported</option>
          </select>
        </div>
      </div>

      <Card padded>
        <div className="tl">
          {filtered.map(v => {
            const a = v.entityType === "ARTIFACT" ? BY_ID[v.entityId] : null;
            const chgColor = {
              CREATED: "var(--c-success)", UPDATED: "var(--accent)", DELETED: "var(--c-danger)",
              LINKED: "var(--c-info)", UNLINKED: "var(--c-warning)", VALIDATED: "var(--c-purple)", EXPORTED: "var(--c-success)",
            }[v.changeType] || "var(--accent)";
            return (
              <div key={v.id} className="tl-item">
                <style>{`.tl-item-${v.id}::before { border-color: ${chgColor} !important; }`}</style>
                <div className="meta">
                  <Avatar user={v.changedBy} size={16} /> <strong style={{ marginLeft: 4 }}>{v.changedBy.firstName}</strong>
                  <span style={{ color: chgColor, marginLeft: 6, fontWeight: 500 }}>{v.changeType.toLowerCase()}</span>
                  <span style={{ marginLeft: 6 }}>{v.entityType.toLowerCase()}</span>
                  <span style={{ marginLeft: "auto", float: "right", color: "var(--fg-subtle)" }}>{timeAgo(v.createdAt)}</span>
                </div>
                {a && (
                  <a href={`#/projects/${projectId}/artifacts/${a.id}`} className="row" style={{ marginBottom: 6 }}>
                    <TypeChip type={a.type} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</span>
                  </a>
                )}
                {v.oldValue && v.newValue && (
                  <div className="diff">
                    {Object.keys(v.newValue).map(k => (
                      <div key={k}>
                        {v.oldValue?.[k] !== undefined && <div><span style={{ color: "var(--c-danger)" }}>- {k}: {JSON.stringify(v.oldValue[k])}</span></div>}
                        <div><span style={{ color: "var(--c-success)" }}>+ {k}: {JSON.stringify(v.newValue[k])}</span></div>
                      </div>
                    ))}
                  </div>
                )}
                {!v.oldValue && v.newValue && v.changeType === "EXPORTED" && (
                  <div className="diff">{JSON.stringify(v.newValue)}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Export SSOT
// ──────────────────────────────────────────────────────────
function ExportPage({ projectId }) {
  const project = PROJECTS.find(p => p.id === projectId);
  const [format, setFormat] = tUseState("PDF");
  const [sections, setSections] = tUseState({
    ARTIFACTS: true, RELATIONS: true, GRAPH: true, API_SPECS: true,
    DATABASE_MODELS: true, DIAGRAMS: true, VALIDATION_REPORT: true, VERSION_HISTORY: true,
    REQUIREMENTS: false, SECURITY_POLICIES: false,
  });
  const [generating, setGenerating] = tUseState(false);
  const [generated, setGenerated] = tUseState(false);
  const toast = useToast();
  const selectedCount = Object.values(sections).filter(Boolean).length;

  const generate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); toast("Export ready · 2.4 MB"); }, 1400);
  };

  return (
    <div className="content-inner">
      <div className="page-h">
        <div>
          <h1>Export SSOT</h1>
          <div className="sub">Bundle the single source of truth for {project?.name}.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="1 · Format">
            <div className="grid cols-4" style={{ gap: 10 }}>
              {[
                { id: "MARKDOWN", label: "Markdown", desc: "Human readable", icon: <I.Doc /> },
                { id: "JSON", label: "JSON", desc: "Machine readable", icon: <I.Cube /> },
                { id: "PDF", label: "PDF", desc: "Printable book", icon: <I.Book /> },
              ].map(f => (
                <label key={f.id} className="card" style={{
                  padding: 14, cursor: "pointer", textAlign: "center",
                  borderColor: format === f.id ? "var(--accent)" : "var(--border)",
                  boxShadow: format === f.id ? "0 0 0 3px var(--accent-soft)" : "none",
                }}>
                  <input type="radio" checked={format === f.id} onChange={() => setFormat(f.id)} style={{ display: "none" }} />
                  <div style={{ width: 32, height: 32, margin: "0 auto 8px", borderRadius: 8, background: format === f.id ? "var(--accent-soft)" : "var(--panel-2)", color: format === f.id ? "var(--accent)" : "var(--fg-muted)", display: "grid", placeItems: "center" }}>
                    {React.cloneElement(f.icon, { size: 16 })}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{f.desc}</div>
                </label>
              ))}
            </div>
          </Card>

          <Card title={`2 · Sections (${selectedCount}/${Object.keys(sections).length})`}>
            <div className="grid cols-2" style={{ gap: 8 }}>
              {Object.keys(sections).map(s => (
                <label key={s} className="row" style={{
                  padding: "10px 12px", borderRadius: 6, cursor: "pointer",
                  background: sections[s] ? "var(--accent-soft)" : "var(--panel-2)",
                  border: `1px solid ${sections[s] ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "var(--border)"}`,
                  gap: 10,
                }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: sections[s] ? "var(--accent)" : "transparent",
                    border: `1.4px solid ${sections[s] ? "var(--accent)" : "var(--border-strong)"}`,
                    display: "grid", placeItems: "center", color: "#fff",
                  }}>{sections[s] && <I.Check size={11} />}</span>
                  <input type="checkbox" checked={sections[s]} onChange={(e) => setSections(o => ({ ...o, [s]: e.target.checked }))} style={{ display: "none" }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase())}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card title="3 · Preview">
            <div className="mono" style={{ background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 6, padding: 14, fontSize: 12, lineHeight: 1.6, color: "var(--fg-muted)" }}>
              {`helix-commerce-ssot.${format.toLowerCase()}\n`}
              {`├── README.md\n`}
              {Object.entries(sections).filter(([_, v]) => v).map(([k]) => `├── ${k.toLowerCase()}/\n`).join("")}
              {`└── manifest.json`}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Generate">
            <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 12 }}>
              {selectedCount === 0 ? "Select at least one section." : `Export ${selectedCount} sections as ${format}.`}
            </div>
            <Btn variant="primary" disabled={selectedCount === 0 || generating} style={{ width: "100%", height: 36 }} onClick={generate}>
              {generating ? <><I.Refresh size={14} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : <><I.Pkg size={14} /> Generate export</>}
            </Btn>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            {generated && (
              <Btn style={{ width: "100%", marginTop: 10, height: 36 }} icon={<I.Download size={14} />} onClick={() => toast("Download started")}>Download</Btn>
            )}
          </Card>

          <Card title="Previous exports" padded={false}>
            <div>
              {EXPORTS.map((e, i) => (
                <div key={e.id} className="row" style={{ padding: "10px 14px", borderBottom: i < EXPORTS.length - 1 ? "1px solid var(--border)" : 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--panel-2)", display: "grid", placeItems: "center" }}>
                    {e.format === "JSON" ? <I.Cube size={14} /> : <I.Doc size={14} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }} className="mono">{e.format} · {e.size}</div>
                    <div style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>{e.sections} sections · {timeAgo(e.createdAt)} by {e.createdBy.firstName}</div>
                  </div>
                  <Btn variant="ghost" size="sm" icon={<I.Download size={13} />} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ApiSpecsPage, ApiSpecDetailPage,
  DatabasePage, DiagramsListPage, DiagramDetailPage,
  GraphPage, ValidationPage, VersionsPage, ExportPage,
});
