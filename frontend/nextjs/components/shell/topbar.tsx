// components/shell/topbar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, Fragment } from "react";
import { Sun, Moon, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTweaks } from "@/components/providers";
import { cn } from "@/lib/utils";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";

interface Crumb { label: string; href?: string; now?: boolean; }

export function Topbar({ onOpenSearch, onOpenMobileNav }: { onOpenSearch: () => void; onOpenMobileNav: () => void }) {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);
  const { theme, set } = useTweaks();

  const projectId = segs[0] === "projects" && segs[1] && segs[1] !== "new" ? segs[1] : null;
  const artifactId = segs[2] === "artifacts" && segs[3] && segs[3] !== "new" ? segs[3] : null;

  const [projectName, setProjectName] = useState<string | null>(null);
  const [artifactTitle, setArtifactTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) { setProjectName(null); return; }
    projectsApi.get(projectId)
      .then((p) => { if (!cancelled) setProjectName(p.name); })
      .catch(() => { if (!cancelled) setProjectName(null); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!artifactId) { setArtifactTitle(null); return; }
    artifactsApi.get(artifactId)
      .then((a) => { if (!cancelled) setArtifactTitle(a.title); })
      .catch(() => { if (!cancelled) setArtifactTitle(null); });
    return () => { cancelled = true; };
  }, [artifactId]);

  const crumbs: Crumb[] = [];
  if (segs[0] === "dashboard") crumbs.push({ label: "Dashboard", href: "/dashboard", now: true });
  else if (segs[0] === "projects" && !segs[1]) crumbs.push({ label: "Projects", href: "/projects", now: true });
  else if (segs[0] === "projects" && segs[1] === "new") {
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: "New project", now: true });
  } else if (segs[0] === "projects" && segs[1]) {
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: projectName || "Project", href: `/projects/${segs[1]}`, now: !segs[2] });
    if (segs[2] === "artifacts") {
      crumbs.push({ label: "Artifacts", href: `/projects/${segs[1]}/artifacts`, now: !segs[3] });
      if (segs[3] === "new") crumbs.push({ label: "New artifact", now: true });
      else if (segs[3]) crumbs.push({ label: artifactTitle || "Artifact", now: true });
    } else if (segs[2] === "decision") crumbs.push({ label: "Decision", now: true });
    else if (segs[2] === "graph") crumbs.push({ label: "Knowledge Graph", now: true });
    else if (segs[2] === "validation") crumbs.push({ label: "Validation", now: true });
    else if (segs[2] === "export") crumbs.push({ label: "Export SSOT", now: true });
    else if (segs[2] === "api") {
      crumbs.push({ label: "API Specs", href: `/projects/${segs[1]}/api`, now: !segs[3] });
      if (segs[3]) crumbs.push({ label: "Spec", now: true });
    }
    else if (segs[2] === "database") {
      crumbs.push({ label: "Database Model", href: `/projects/${segs[1]}/database`, now: !segs[3] });
      if (segs[3]) crumbs.push({ label: "Model", now: true });
    }
    else if (segs[2] === "diagrams") {
      crumbs.push({ label: "Diagrams", href: `/projects/${segs[1]}/diagrams`, now: !segs[3] });
      if (segs[3]) crumbs.push({ label: "Diagram", now: true });
    }
    else if (segs[2] === "review") crumbs.push({ label: "AI Review", now: true });
    else if (segs[2] === "versions") {
      crumbs.push({ label: "Version History", now: true });
    }
    else if (segs[2] === "impact") {
      crumbs.push({ label: "Impact", now: !segs[3] });
      if (segs[3]) crumbs.push({ label: "Artifact", now: true });
    }
  } else if (segs[0] === "settings") crumbs.push({ label: "Settings", now: true });

  const renderCrumb = (c: Crumb, extra = "") =>
    c.href ? (
      <Link href={c.href} className={cn("px-1.5 py-1 rounded", c.now ? "text-fg font-medium" : "hover:bg-panel-hover hover:text-fg", extra)}>
        {c.label}
      </Link>
    ) : (
      <span className={cn("px-1.5 py-1", c.now && "text-fg font-medium", extra)}>{c.label}</span>
    );

  const sep = <span className="text-fg-subtle text-[11px] shrink-0">/</span>;
  // Mobile collapses everything between the first and last crumb into a single "…"
  // so a long project/entity name can never explode the bar into multiple lines.
  const collapse = crumbs.length >= 3;
  const parent = crumbs[crumbs.length - 2]; // nearest ancestor — the "…" links here
  const hiddenLabels = crumbs.slice(1, -1).map((c) => c.label).join(" / ");

  return (
    <div className="flex items-center gap-3 h-[52px] px-4 border-b border-border bg-bg flex-none min-w-0">
      <button
        onClick={onOpenMobileNav}
        className="tb-hamburger md:hidden w-8 h-8 rounded-[6px] flex items-center justify-center text-fg-muted hover:bg-panel-hover hover:text-fg"
        aria-label="Open menu"
      >
        <Menu size={16} />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-shrink text-[13px] text-fg-muted">
        {/* Desktop: the full trail (unchanged behavior). */}
        <div className="hidden md:flex items-center gap-1.5 min-w-0">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && sep}
              {renderCrumb(c)}
            </span>
          ))}
        </div>
        {/* Mobile: first / … / last — one line, last crumb truncates. */}
        <div className="flex md:hidden items-center gap-1.5 min-w-0">
          {collapse ? (
            <>
              {renderCrumb(crumbs[0], "shrink-0 whitespace-nowrap")}
              {sep}
              {parent?.href ? (
                <Link href={parent.href} title={hiddenLabels} aria-label={`Parent pages: ${hiddenLabels}`} className="px-1 py-1 rounded shrink-0 hover:bg-panel-hover hover:text-fg">…</Link>
              ) : (
                <span title={hiddenLabels} className="px-1 py-1 shrink-0">…</span>
              )}
              {sep}
              {renderCrumb(crumbs[crumbs.length - 1], "min-w-0 flex-1 truncate whitespace-nowrap")}
            </>
          ) : (
            crumbs.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && sep}
                {renderCrumb(c, i === crumbs.length - 1 ? "min-w-0 flex-1 truncate whitespace-nowrap" : "shrink-0 whitespace-nowrap")}
              </Fragment>
            ))
          )}
        </div>
      </nav>

      <button
        onClick={onOpenSearch}
        className="flex-1 max-w-[480px] mx-auto h-8 flex items-center gap-2 px-2.5 bg-panel border border-border rounded-sm text-fg-muted hover:border-border-strong text-[13px] whitespace-nowrap overflow-hidden hidden sm:flex"
      >
        <Search size={14} className="shrink-0" />
        <span className="flex-1 text-left text-fg-subtle truncate">Jump to a page…</span>
        <ShortcutHint className="kbd" />
      </button>

      <div className="flex items-center gap-1.5 ml-auto flex-none">
        <Button
          variant="ghost"
          size="sm"
          icon={theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => set("theme", theme === "dark" ? "light" : "dark")}
        />
      </div>
    </div>
  );
}
