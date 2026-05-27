// src/router.jsx — tiny hash router.

const { useState: rUseState, useEffect: rUseEffect, useCallback: rUseCallback } = React;

// parse hash like #/projects/p_helix/artifacts/svc-auth?tab=relations
function parseHash() {
  const raw = window.location.hash.slice(1) || "/dashboard";
  const [pathPart, queryPart = ""] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { path: "/" + segments.join("/"), segments, query };
}

function navigate(path, opts = {}) {
  const next = path.startsWith("#") ? path : ("#" + path);
  if (opts.replace) window.location.replace(next);
  else window.location.hash = next.slice(1);
}

function useRoute() {
  const [route, setRoute] = rUseState(parseHash());
  rUseEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

// pattern matcher — "/projects/:projectId/artifacts/:id" → params
function matchRoute(pattern, route) {
  const a = pattern.split("/").filter(Boolean);
  const b = route.segments;
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = b[i];
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

// Link component
function L({ to, children, className = "", style, onClick }) {
  return (
    <a href={"#" + to} className={className} style={style} onClick={(e) => {
      if (onClick) onClick(e);
    }}>{children}</a>
  );
}

Object.assign(window, { parseHash, navigate, useRoute, matchRoute, L });
