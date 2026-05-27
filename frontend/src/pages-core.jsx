// src/pages-core.jsx — Auth, Dashboard, Projects, Settings

const { useState: pUseState, useEffect: pUseEffect, useMemo: pUseMemo } = React;

// ──────────────────────────────────────────────────────────
// Auth: /login, /register
// ──────────────────────────────────────────────────────────
function LoginPage({ isRegister = false }) {
  const [email, setEmail] = pUseState("deyvid@helix.dev");
  const [password, setPassword] = pUseState("••••••••••••");
  const [first, setFirst] = pUseState("");
  const [last, setLast] = pUseState("");
  const [loading, setLoading] = pUseState(false);
  const submit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); navigate("/dashboard"); }, 500);
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <div className="mark" style={{
            width: 30, height: 30, borderRadius: 8,
            background: "linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #000))",
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontFamily: "var(--font-mono)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)",
          }}>M</div>
          <div style={{ fontWeight: 600 }}>Minotaurus <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>· SSOT</span></div>
        </div>
        <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="sub">{isRegister ? "Start documenting your architecture in minutes." : "Sign in to your workspace."}</p>

        <div className="sso">
          <Btn variant="default" style={{ flex: 1 }} icon={<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" /></svg>}>SSO</Btn>
          <Btn variant="default" style={{ flex: 1 }} icon={<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.9 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.3-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11 11 0 016 0c2.3-1.6 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.9 1.2 2 1.2 3.3 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 0z" /></svg>}>GitHub</Btn>
        </div>
        <div className="divider">or with email</div>

        <form className="fields" onSubmit={submit}>
          {isRegister && (
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>First name</label>
                <input className="input" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Deyvid" />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Last name</label>
                <input className="input" value={last} onChange={(e) => setLast(e.target.value)} placeholder="Popov" />
              </div>
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <div className="input-with-icon"><I.Mail size={14} /><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
          </div>
          <div className="field">
            <label>Password</label>
            <div className="input-with-icon"><I.Lock size={14} /><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          </div>
          <Btn type="submit" variant="primary" style={{ marginTop: 4, height: 36 }}>
            {loading ? "Signing in…" : (isRegister ? "Create account" : "Sign in")}
            <I.ArrowR size={14} />
          </Btn>
        </form>
        <div className="foot">
          {isRegister ? <>Already have an account? <a href="#/login">Sign in</a></>
                      : <>New here? <a href="#/register">Create an account</a></>}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Dashboard: /dashboard
// ──────────────────────────────────────────────────────────
function DashboardPage() {
  const totalArtifacts = PROJECTS.reduce((s, p) => s + p.artifactCount, 0);
  const totalIssues = PROJECTS.reduce((s, p) => s + p.validationIssueCount, 0);
  const totalChanges = VERSIONS.length;

  return (
    <div className="content-inner">
      <div className="page-h">
        <div>
          <h1>Good afternoon, Deyvid</h1>
          <div className="sub">You have <strong style={{ color: "var(--fg)" }}>{totalIssues} open validation issues</strong> across {PROJECTS.length} projects.</div>
        </div>
        <div className="actions">
          <Btn icon={<I.Sparkle size={14} />}>Ask Minotaurus</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => navigate("/projects/new")}>New project</Btn>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 24 }}>
        <Stat label="Projects" value={PROJECTS.length} delta="+1 this month" deltaDir="up" icon={<I.Folder size={13} />} spark={[3, 3, 3, 3, 4, 4, 4]} />
        <Stat label="Artifacts" value={totalArtifacts} delta="+8 this week" deltaDir="up" icon={<I.Cube size={13} />} spark={[42, 47, 52, 56, 58, 64, 70]} />
        <Stat label="Open issues" value={totalIssues} delta="-3 since last week" deltaDir="up" icon={<I.Shield size={13} />} spark={[14, 13, 12, 11, 10, 11, 10]} />
        <Stat label="Changes" value={totalChanges} delta="last 7 days" deltaDir="flat" icon={<I.History size={13} />} spark={[2, 5, 4, 6, 8, 12, 10]} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 20 }}>
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>Your projects</h2>
            <div className="grow" />
            <button className="btn btn-sm btn-ghost" onClick={() => navigate("/projects")}>View all <I.ChevronR size={12} /></button>
          </div>

          <div className="grid cols-2">
            {PROJECTS.map(p => (
              <a href={`#/projects/${p.id}`} key={p.id} className="card" style={{ display: "block", padding: 18, transition: "border-color .1s ease", textDecoration: "none" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--border-strong)"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}>
                <div className="row" style={{ marginBottom: 12 }}>
                  <ProjectMark color={p.color} size={28} letter={p.name[0]} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-.01em" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--fg-subtle)" }} className="truncate">{p.slug}</div>
                  </div>
                  {p.starred && <I.Star size={14} style={{ color: "var(--c-warning)" }} />}
                </div>
                <div style={{ color: "var(--fg-muted)", fontSize: 12.5, marginBottom: 14, minHeight: 32, lineHeight: 1.5 }}>{p.description}</div>
                <div className="row" style={{ gap: 12, fontSize: 12, color: "var(--fg-muted)" }}>
                  <span className="row" style={{ gap: 4 }}><I.Cube size={12} />{p.artifactCount}</span>
                  <span className="row" style={{ gap: 4 }}><I.Shield size={12} />{p.validationIssueCount}</span>
                  <span className="row" style={{ gap: 4 }}><Avatar user={USERS[0]} size={14} /><span>+{p.members - 1}</span></span>
                  <div className="grow" />
                  <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>updated {timeAgo(p.updatedAt)}</span>
                </div>
              </a>
            ))}
          </div>

          <div style={{ marginTop: 28 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>Validation by project</h2>
            <Card padded={false}>
              <table className="tbl">
                <thead><tr>
                  <th>Project</th><th>Open</th><th>Critical</th><th>Errors</th><th>Warnings</th><th>Info</th><th></th>
                </tr></thead>
                <tbody>
                  {PROJECTS.map(p => (
                    <tr key={p.id} className="row-link" onClick={() => navigate(`/projects/${p.id}/validation`)}>
                      <td>
                        <div className="row">
                          <ProjectMark color={p.color} size={20} letter={p.name[0]} />
                          <span style={{ fontWeight: 500 }}>{p.name}</span>
                        </div>
                      </td>
                      <td className="num">{p.validationIssueCount}</td>
                      <td className="num">{p.id === "p_helix" ? 1 : 0}</td>
                      <td className="num">{p.id === "p_helix" ? 2 : p.id === "p_atlas" ? 1 : 0}</td>
                      <td className="num">{p.id === "p_helix" ? 3 : p.id === "p_atlas" ? 1 : p.id === "p_loom" ? 1 : 0}</td>
                      <td className="num">{p.id === "p_helix" ? 1 : 0}</td>
                      <td><Btn variant="ghost" size="sm" icon={<I.ChevronR size={13} />} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>

        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>Recent activity</h2>
            <div className="grow" />
            <button className="btn btn-sm btn-ghost"><I.Refresh size={12} /></button>
          </div>
          <Card padded={false}>
            <div style={{ padding: "8px 0" }}>
              {ACTIVITY.map((a, i) => (
                <div key={a.id} className="row" style={{ padding: "10px 16px", gap: 10 }}>
                  <Avatar user={a.who} size={22} />
                  <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
                    <strong>{a.who.firstName}</strong> <span style={{ color: "var(--fg-muted)" }}>{a.action}</span> <strong>{a.target}</strong>
                    <div style={{ color: "var(--fg-subtle)", fontSize: 11.5 }}>{a.at}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ marginTop: 20 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, letterSpacing: "-.01em" }}>Tips</h2>
            <Card padded>
              <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--fg)" }}>Press <kbd>⌘K</kbd></strong> to jump to any artifact, endpoint, or page. Minotaurus indexes everything you write.
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Projects list: /projects + create: /projects/new
// ──────────────────────────────────────────────────────────
function ProjectsListPage() {
  const [view, setView] = pUseState("grid");
  const [q, setQ] = pUseState("");
  const [sort, setSort] = pUseState("updated");

  const list = pUseMemo(() => {
    let xs = PROJECTS.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
    if (sort === "name") xs = [...xs].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "artifacts") xs = [...xs].sort((a, b) => b.artifactCount - a.artifactCount);
    else xs = [...xs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return xs;
  }, [q, sort]);

  return (
    <div className="content-inner">
      <div className="page-h">
        <div>
          <h1>Projects</h1>
          <div className="sub">{PROJECTS.length} projects · {PROJECTS.reduce((s, p) => s + p.artifactCount, 0)} artifacts</div>
        </div>
        <div className="actions">
          <div className="input-with-icon" style={{ width: 220 }}>
            <I.Search size={14} />
            <input className="input" placeholder="Filter projects…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 160 }}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="artifacts">Most artifacts</option>
          </select>
          <Segmented value={view} onChange={setView} options={[{ value: "grid", label: "Cards" }, { value: "list", label: "List" }]} />
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => navigate("/projects/new")}>New project</Btn>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<I.Folder size={28} />} title="No projects match your filter" message="Try a different search term or clear the filter." action={<Btn onClick={() => setQ("")}>Clear filter</Btn>} />
      ) : view === "grid" ? (
        <div className="grid cols-3">
          {list.map(p => (
            <a href={`#/projects/${p.id}`} key={p.id} className="card" style={{ display: "block", padding: 18, textDecoration: "none" }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <ProjectMark color={p.color} size={32} letter={p.name[0]} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, letterSpacing: "-.01em" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--fg-subtle)" }} className="mono">{p.slug}</div>
                </div>
                {p.starred && <I.Star size={14} style={{ color: "var(--c-warning)" }} />}
              </div>
              <div style={{ color: "var(--fg-muted)", fontSize: 13, marginBottom: 16, lineHeight: 1.55, minHeight: 40 }}>{p.description}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Artifacts</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{p.artifactCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Issues</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: p.validationIssueCount > 0 ? "var(--c-warning)" : "var(--fg)" }}>{p.validationIssueCount}</div>
                </div>
              </div>
              <hr />
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <div style={{ display: "flex" }}>
                  {USERS.slice(0, 4).map((u, i) => (
                    <div key={u.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                      <Avatar user={u} size={20} />
                    </div>
                  ))}
                </div>
                <div className="grow" />
                <span style={{ fontSize: 11.5, color: "var(--fg-subtle)" }}>updated {timeAgo(p.updatedAt)}</span>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <Card padded={false}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Artifacts</th><th>Issues</th><th>Members</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id} className="row-link" onClick={() => navigate(`/projects/${p.id}`)}>
                  <td>
                    <div className="row">
                      <ProjectMark color={p.color} size={24} letter={p.name[0]} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>{p.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{p.artifactCount}</td>
                  <td className="num">{p.validationIssueCount === 0 ? "—" : <Badge tone="warning">{p.validationIssueCount}</Badge>}</td>
                  <td className="num">{p.members}</td>
                  <td>{timeAgo(p.updatedAt)}</td>
                  <td><Btn variant="ghost" size="sm" icon={<I.ChevronR size={13} />} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function ProjectNewPage() {
  const [name, setName] = pUseState("");
  const [desc, setDesc] = pUseState("");
  const [tpl, setTpl] = pUseState("blank");
  const toast = useToast();
  return (
    <div className="content-inner" style={{ maxWidth: 720 }}>
      <div className="page-h">
        <div>
          <h1>New project</h1>
          <div className="sub">Create a workspace for documenting and validating a system.</div>
        </div>
      </div>

      <Card>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Project name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Helix Commerce" />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Description</label>
          <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this project document?" />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Starter template</label>
          <div className="grid cols-3" style={{ gap: 10 }}>
            {[
              { id: "blank",  label: "Blank",          desc: "Empty project — start from scratch." },
              { id: "micro",  label: "Microservices",  desc: "Service, API, DB, doc and diagram templates." },
              { id: "monorepo", label: "Monorepo",     desc: "Multi-package layout with shared types." },
            ].map(t => (
              <label key={t.id} className="card" style={{
                padding: 14, cursor: "pointer",
                borderColor: tpl === t.id ? "var(--accent)" : "var(--border)",
                boxShadow: tpl === t.id ? "0 0 0 3px var(--accent-soft)" : "none",
              }}>
                <input type="radio" checked={tpl === t.id} onChange={() => setTpl(t.id)} style={{ display: "none" }} />
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 12.5, color: "var(--fg-muted)" }}>{t.desc}</div>
              </label>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Btn onClick={() => navigate("/projects")}>Cancel</Btn>
          <Btn variant="primary" icon={<I.Plus size={14} />} onClick={() => {
            toast(`Project "${name || "New project"}" created`);
            navigate("/projects/p_helix");
          }}>Create project</Btn>
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Settings: /settings
// ──────────────────────────────────────────────────────────
function SettingsPage() {
  const [tab, setTab] = pUseState("profile");
  const toast = useToast();
  return (
    <div className="content-inner" style={{ maxWidth: 820 }}>
      <div className="page-h">
        <div>
          <h1>Settings</h1>
          <div className="sub">Account, workspace and preferences.</div>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "profile", label: "Profile" },
        { id: "workspace", label: "Workspace" },
        { id: "notifications", label: "Notifications" },
        { id: "tokens", label: "API tokens" },
        { id: "danger", label: "Danger zone" },
      ]} />

      {tab === "profile" && (
        <Card>
          <div className="row" style={{ marginBottom: 18, gap: 16 }}>
            <Avatar user={CURRENT_USER} size={56} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{CURRENT_USER.firstName} {CURRENT_USER.lastName}</div>
              <div className="muted" style={{ fontSize: 13 }}>{CURRENT_USER.email} · <Badge tone="info">{CURRENT_USER.role}</Badge></div>
            </div>
            <div className="grow" />
            <Btn>Upload photo</Btn>
          </div>
          <div className="grid cols-2">
            <div className="field"><label>First name</label><input className="input" defaultValue={CURRENT_USER.firstName} /></div>
            <div className="field"><label>Last name</label><input className="input" defaultValue={CURRENT_USER.lastName} /></div>
            <div className="field"><label>Email</label><input className="input" defaultValue={CURRENT_USER.email} /></div>
            <div className="field"><label>Role</label><input className="input" defaultValue={CURRENT_USER.role} disabled /></div>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <Btn variant="primary" onClick={() => toast("Profile saved")}>Save changes</Btn>
          </div>
        </Card>
      )}

      {tab === "workspace" && (
        <Card title="Workspace preferences">
          <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Default project</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Opens when you sign in.</div>
            </div>
            <select className="select" defaultValue="p_helix" style={{ width: 200 }}>
              {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Auto-run validation</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Validate on every save.</div>
            </div>
            <Toggle defaultOn={true} />
          </div>
          <div className="row" style={{ justifyContent: "space-between", padding: "10px 0" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Realtime presence</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Show who is viewing the same artifact.</div>
            </div>
            <Toggle defaultOn={true} />
          </div>
        </Card>
      )}

      {tab === "notifications" && (
        <Card title="Notifications">
          {[
            ["Validation issues", "When a new critical or error-level issue is detected.", true],
            ["Mentions",          "When someone @-mentions you in docs or comments.", true],
            ["Export ready",      "When your SSOT export is generated.", true],
            ["Weekly digest",     "Summary of changes across your projects.", false],
          ].map(([t, s, d], i) => (
            <div key={i} className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: i < 3 ? "1px solid var(--border)" : 0 }}>
              <div><div style={{ fontWeight: 500 }}>{t}</div><div className="muted" style={{ fontSize: 12.5 }}>{s}</div></div>
              <Toggle defaultOn={d} />
            </div>
          ))}
        </Card>
      )}

      {tab === "tokens" && (
        <Card title="Personal access tokens" action={<Btn variant="primary" icon={<I.Plus size={13} />} size="sm">New token</Btn>}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Created</th><th>Last used</th><th>Scopes</th><th></th></tr></thead>
            <tbody>
              {[
                { n: "CI · Helix Commerce", c: "2 weeks ago", u: "1 hour ago", s: "read,write" },
                { n: "Local dev",           c: "6 weeks ago", u: "yesterday",  s: "read" },
              ].map((t, i) => (
                <tr key={i}>
                  <td><span className="mono">{t.n}</span></td>
                  <td className="muted">{t.c}</td>
                  <td className="muted">{t.u}</td>
                  <td>{t.s.split(",").map(x => <Badge key={x} mono>{x}</Badge>)}</td>
                  <td><Btn variant="ghost" size="sm" icon={<I.More size={13} />} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "danger" && (
        <Card title="Danger zone">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 500 }}>Sign out</div>
              <div className="muted" style={{ fontSize: 12.5 }}>End this session.</div>
            </div>
            <Btn icon={<I.Logout size={13} />} onClick={() => navigate("/login")}>Sign out</Btn>
          </div>
          <hr style={{ margin: "14px 0" }} />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 500, color: "var(--c-danger)" }}>Delete account</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Removes you from all workspaces. Irreversible.</div>
            </div>
            <Btn variant="danger">Delete</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// helper: tiny toggle
function Toggle({ defaultOn = false, onChange }) {
  const [on, setOn] = pUseState(defaultOn);
  return (
    <button
      onClick={() => { setOn(o => { const n = !o; onChange?.(n); return n; }); }}
      style={{
        width: 34, height: 20, borderRadius: 999,
        background: on ? "var(--accent)" : "var(--border-strong)",
        border: 0, position: "relative", transition: "background .15s ease",
      }}
      aria-pressed={on}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 16 : 2,
        width: 16, height: 16, borderRadius: 999,
        background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        transition: "left .15s ease",
      }} />
    </button>
  );
}

// helper: human time ago from ISO
function timeAgo(iso) {
  const ms = new Date("2026-05-26T12:00:00Z") - new Date(iso);
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

Object.assign(window, { LoginPage, DashboardPage, ProjectsListPage, ProjectNewPage, SettingsPage, Toggle, timeAgo });
