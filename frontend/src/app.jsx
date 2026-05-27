// src/app.jsx — top-level app: routing, theme, tweaks, command palette.

const { useState: aaUseState, useEffect: aaUseEffect, useCallback: aaUseCallback } = React;

const ACCENT_OPTIONS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#e5e5e5"];

function App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const route = useRoute();
  const [cmdOpen, setCmdOpen] = aaUseState(false);
  const [mobileNav, setMobileNav] = aaUseState(false);

  // sync html data attributes for theme/density/sidebar/font
  aaUseEffect(() => {
    const h = document.documentElement;
    h.setAttribute("data-theme",   t.theme);
    h.setAttribute("data-density", t.density);
    h.setAttribute("data-sidebar", t.sidebar);
    h.setAttribute("data-font",    t.fontPair);
    h.style.setProperty("--accent", t.accent);
    // pick a readable accent-fg: use white for color values, black for the white swatch
    const isLight = t.accent.toLowerCase() === "#e5e5e5";
    h.style.setProperty("--accent-fg", isLight ? "#0a0a0a" : "#ffffff");
  }, [t.theme, t.density, t.sidebar, t.fontPair, t.accent]);

  // close mobile nav on route change
  aaUseEffect(() => { setMobileNav(false); }, [route.path]);
  // sync body attr so CSS can react
  aaUseEffect(() => {
    document.body.setAttribute("data-mobile-nav", mobileNav ? "open" : "closed");
  }, [mobileNav]);

  // keyboard shortcuts: ⌘K
  aaUseEffect(() => {
    const on = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(o => !o);
      } else if (e.key === "Escape" && cmdOpen) setCmdOpen(false);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [cmdOpen]);

  const path = route.path;
  const segs = route.segments;

  // Public pages render outside the shell
  if (path === "/" || path === "/landing")   return <LandingPage />;
  if (path === "/login")    return <LoginPage />;
  if (path === "/register") return <LoginPage isRegister />;

  // Detect projectId for shell sub-nav
  const projectId = (segs[0] === "projects" && segs[1] && segs[1] !== "new") ? segs[1] : null;

  // Route table
  let page = null;
  let pageHasOwnShell = false;

  const r = (pattern) => matchRoute(pattern, route);

  if (path === "/dashboard") page = <DashboardPage />;
  else if (path === "/projects") page = <ProjectsListPage />;
  else if (path === "/projects/new") page = <ProjectNewPage />;
  else if (path === "/settings") page = <SettingsPage />;
  else {
    let m;
    if ((m = r("/projects/:projectId")))                            page = <WorkspacePage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/artifacts")))             page = <ArtifactsListPage projectId={m.projectId} query={route.query} />;
    else if ((m = r("/projects/:projectId/artifacts/new")))         page = <ArtifactNewPage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/artifacts/:id")))         page = <ArtifactDetailPage projectId={m.projectId} artifactId={m.id} query={route.query} />;
    else if ((m = r("/projects/:projectId/docs")))                  page = <DocsListPage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/docs/:id")))              page = <DocDetailPage projectId={m.projectId} artifactId={m.id} />;
    else if ((m = r("/projects/:projectId/api")))                   page = <ApiSpecsPage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/api/:id")))               page = <ApiSpecDetailPage projectId={m.projectId} artifactId={m.id} />;
    else if ((m = r("/projects/:projectId/database")))              page = <DatabasePage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/diagrams")))              page = <DiagramsListPage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/diagrams/:id")))          page = <DiagramDetailPage projectId={m.projectId} artifactId={m.id} />;
    else if ((m = r("/projects/:projectId/graph")))                 page = <GraphPage projectId={m.projectId} nodeStyle={t.graphNodeStyle} onSetNodeStyle={(v) => setTweak("graphNodeStyle", v)} />;
    else if ((m = r("/projects/:projectId/validation")))            page = <ValidationPage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/versions")))              page = <VersionsPage projectId={m.projectId} />;
    else if ((m = r("/projects/:projectId/export")))                page = <ExportPage projectId={m.projectId} />;
    else page = <NotFound />;
  }

  return (
    <>
      <div className="shell">
        {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)} />}
        <Sidebar projectId={projectId} route={route} />
        <div className="main">
          <Topbar
            route={route}
            projectId={projectId}
            onOpenSearch={() => setCmdOpen(true)}
            onOpenMobileNav={() => setMobileNav(true)}
            theme={t.theme}
            onToggleTheme={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")}
            onToggleTweaks={() => window.parent.postMessage({ type: "__edit_mode_set_keys", edits: {} }, "*")}
          />
          <div className="content">{page}</div>
        </div>
      </div>

      <CmdK open={cmdOpen} onClose={() => setCmdOpen(false)} />

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio  label="Theme"   value={t.theme} options={["light", "dark"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor  label="Accent"  value={t.accent} options={ACCENT_OPTIONS} onChange={(v) => setTweak("accent", v)} />
        <TweakRadio  label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSelect label="Fonts"   value={t.fontPair} options={[
          { value: "geist", label: "Geist + Geist Mono" },
          { value: "inter", label: "Inter + JetBrains Mono" },
          { value: "plex",  label: "IBM Plex Sans + Mono" },
        ]} onChange={(v) => setTweak("fontPair", v)} />

        <TweakSection label="Layout" />
        <TweakSelect label="Sidebar" value={t.sidebar} options={[
          { value: "expanded", label: "Expanded" },
          { value: "icons",    label: "Icons only" },
          { value: "floating", label: "Floating" },
        ]} onChange={(v) => setTweak("sidebar", v)} />

        <TweakSection label="Knowledge graph" />
        <TweakSelect label="Node style" value={t.graphNodeStyle} options={[
          { value: "shape",   label: "Shape-coded" },
          { value: "color",   label: "Color-coded" },
          { value: "minimal", label: "Minimal" },
        ]} onChange={(v) => setTweak("graphNodeStyle", v)} />
      </TweaksPanel>
    </>
  );
}

// mount
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
