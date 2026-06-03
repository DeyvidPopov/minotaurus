// src/pages-landing.jsx — public landing page at `/`

const { useState: lUseState, useEffect: lUseEffect, useMemo: lUseMemo } = React;

function LandingPage() {
  // pick a tight subgraph for the hero — services + their immediate links
  const heroNodes = lUseMemo(() => {
    const ids = ["svc-auth","svc-user","svc-orders","svc-payments","svc-inventory","svc-search","svc-notifs",
                 "db-users","db-orders","db-payments","api-auth","api-orders","api-payments",
                 "ext-stripe","ext-sendgrid","doc-arch","sec-mfa"];
    return ARTIFACTS.filter(a => ids.includes(a.id));
  }, []);
  const heroRels = lUseMemo(() => {
    const ids = new Set(heroNodes.map(n => n.id));
    return RELATIONS.filter(r => ids.has(r.source) && ids.has(r.target));
  }, [heroNodes]);

  return (
    <div className="landing">
      {/* nav */}
      <nav className="land-nav">
        <div className="row" style={{ gap: 10 }}>
          <div className="mark" style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #000))",
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 700,
            fontFamily: "var(--font-mono)", fontSize: 13,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)",
          }}>M</div>
          <span style={{ fontWeight: 600, letterSpacing: "-.01em" }}>Minotaurus</span>
          <Badge mono>minotaurus.dev</Badge>
        </div>
        <div className="links">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
          <a href="#/docs">Docs</a>
        </div>
        <div className="grow" />
        <a href="#/login" className="btn btn-sm" style={{ height: 32 }}>Sign in</a>
        <a href="#/register" className="btn btn-primary btn-sm" style={{ height: 32, padding: "0 14px" }}>Get started <I.ArrowR size={13} /></a>
      </nav>

      {/* hero */}
      <header className="land-hero">
        <div>
          <span className="land-eyebrow">
            <span className="dot" />
            <span className="mono" style={{ color: "var(--fg)" }}>v1.0</span>
            <span>Source-of-truth for software architecture</span>
          </span>
          <h1>Your system, <em>connected</em>.<br />One source of truth.</h1>
          <p className="sub">
            Minotaurus maps every service, API, database, document and diagram in your platform into a living knowledge graph.
            Validate consistency, trace changes, and export the whole stack as a single SSOT bundle.
          </p>
          <div className="land-cta">
            <a href="#/dashboard" className="btn btn-primary"><I.Cube size={14} /> Open workspace <I.ArrowR size={14} /></a>
            <a href="#/projects/p_helix/graph" className="btn"><I.Graph size={14} /> Tour the graph</a>
          </div>
          <div className="land-trust">
            <span className="row"><I.Check2 size={13} style={{ color: "var(--c-success)" }}/> OpenAPI · GraphQL · Mermaid · ERD</span>
            <span className="row"><I.Check2 size={13} style={{ color: "var(--c-success)" }}/> Self-hosted</span>
            <span className="row"><I.Check2 size={13} style={{ color: "var(--c-success)" }}/> SSO ready</span>
          </div>
        </div>

        {/* hero graph preview */}
        <div className="land-graph-card">
          <div className="hd">
            <div className="dots"><i/><i/><i/></div>
            <span className="mono">helix-commerce / knowledge-graph</span>
            <span className="grow" style={{ flex: 1 }} />
            <span className="row" style={{ gap: 8 }}>
              <span className="row" style={{ gap: 4, fontSize: 11 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-success)" }} /> live</span>
              <span style={{ fontSize: 11 }}>{heroNodes.length} nodes · {heroRels.length} edges</span>
            </span>
          </div>
          <div className="body">
            <GraphCanvas artifacts={heroNodes} relations={heroRels}
              selectedId="svc-orders" onSelect={() => {}}
              nodeStyle="color" autoFit />
          </div>
        </div>
      </header>

      {/* workflow band */}
      <section className="land-band" id="workflow">
        <div className="land-section">
          <div className="land-section-h">
            <h2>From scattered docs to a single graph</h2>
            <p>Minotaurus pulls everything you already write into one connected workspace. No new format to learn — bring your OpenAPI, your Markdown, your Mermaid.</p>
          </div>
          <div className="land-steps">
            <div className="land-step">
              <div className="ic"><I.Upload size={16} /></div>
              <div className="n">01 · INGEST</div>
              <h3>Import what you have</h3>
              <p>Drop in OpenAPI specs, Markdown docs, Mermaid diagrams, and database schemas. Minotaurus parses and turns them into typed artifacts.</p>
            </div>
            <div className="land-step">
              <div className="ic"><I.Link size={16} /></div>
              <div className="n">02 · CONNECT</div>
              <h3>Link your architecture</h3>
              <p>Draw relations between services, endpoints, databases, requirements and policies — or let validation suggest the obvious ones.</p>
            </div>
            <div className="land-step">
              <div className="ic"><I.Shield size={16} /></div>
              <div className="n">03 · VALIDATE</div>
              <h3>Catch drift before it bites</h3>
              <p>Missing docs, undocumented endpoints, deprecated services still in production. Issues open inline next to the artifact that caused them.</p>
            </div>
            <div className="land-step">
              <div className="ic"><I.Pkg size={16} /></div>
              <div className="n">04 · EXPORT</div>
              <h3>Ship the SSOT</h3>
              <p>Generate a JSON, Markdown or PDF report that documents the whole system — versioned, reproducible, ready for handoff.</p>
            </div>
          </div>
        </div>
      </section>

      {/* features grid */}
      <section className="land-features" id="features">
        <div className="land-section">
          <div className="land-section-h">
            <h2>Built like the systems you build</h2>
            <p>An engineering workspace, not a wiki. Typed artifacts, traceable relations, real keyboard shortcuts.</p>
          </div>
          <div className="land-features-grid">
            <Feature icon={<I.Graph size={16} />} title="Knowledge graph" body="A first-class graph view of every artifact, typed by shape and color. Pan, zoom, filter, and open detail from any node." />
            <Feature icon={<I.Cube size={16} />} title="11 artifact types" body="Service, API spec, endpoint, database, entity, doc, diagram, requirement, security policy, environment, external system." />
            <Feature icon={<I.Plug size={16} />} title="OpenAPI ingest" body="Paste or upload an OpenAPI / GraphQL spec; endpoints appear as linked artifacts you can validate and document." />
            <Feature icon={<I.Database size={16} />} title="Database model" body="Tables, fields, primary and foreign keys, normalization warnings — all linked to the services that own them." />
            <Feature icon={<I.Shield size={16} />} title="Validation engine" body="Consistency rules across documentation, APIs, databases, security and relationships. Severity-tiered." />
            <Feature icon={<I.History size={16} />} title="Versioned everything" body="Every artifact, relation, doc edit and validation run is recorded — a full audit trail with diffs." />
            <Feature icon={<I.Book size={16} />} title="Markdown + Mermaid" body="Editor with live preview. Sequence diagrams, flowcharts and ERDs render inline next to the code they describe." />
            <Feature icon={<I.Pkg size={16} />} title="One-click SSOT export" body="Export the whole project — artifacts, graph, validation report, version history — as JSON, Markdown or PDF." />
            <Feature icon={<I.Cmd size={16} />} title="Keyboard-first" body="⌘K palette indexes everything. Open any artifact, endpoint or doc from one keystroke." />
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="land-cta-band">
        <h2>Bring your architecture together.</h2>
        <p>Open the workspace and explore Helix Commerce — a fully-loaded reference project with 36 artifacts and a live graph.</p>
        <div className="land-cta" style={{ justifyContent: "center" }}>
          <a href="#/dashboard" className="btn btn-primary"><I.Sparkle size={14} /> Open workspace <I.ArrowR size={14} /></a>
          <a href="#/login" className="btn">Sign in</a>
        </div>
      </section>

      {/* foot */}
      <footer className="land-foot">
        <span>© Minotaurus · <span className="mono">minotaurus.dev</span> · diploma project</span>
        <span className="mono muted">v1.0.0</span>
        <div className="links">
          <a href="#/docs">Docs</a>
          <a href="#/projects">Workspace</a>
          <a href="#/settings">Settings</a>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }) {
  return (
    <div className="land-feature">
      <div className="ic">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

Object.assign(window, { LandingPage });
