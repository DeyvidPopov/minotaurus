// components/shell/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, Folder, Compass, Box, Network, Gauge,
  Plug, Database, GitMerge, Shield, History, Package, Settings, LogOut, Users, BookOpen, Download, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/shell/brand-logo";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { projectsApi } from "@/lib/api/projects";
import { useValidationCounts } from "@/lib/validation-counts";
import type { Project, User } from "@/lib/types";

interface Item { id: string; label: string; href: string; icon: React.ReactNode; badge?: number; badgeTone?: "warning"; exact?: boolean; }

export function Sidebar({ projectId }: { projectId: string | null }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [project, setProject] = useState<Project | null>(null);

  // Live validation badge: prefer the in-session count (updated by the Validation
  // page as issues are fixed) over the value fetched with the project.
  const setValidationCount = useValidationCounts((s) => s.setCount);
  const liveValidationCount = useValidationCounts((s) => (projectId ? s.counts[projectId] : undefined));

  useEffect(() => {
    let cancelled = false;
    if (!projectId) { setProject(null); return; }
    projectsApi.get(projectId).then((p) => {
      if (cancelled) return;
      setProject(p);
      setValidationCount(p.id, p.validationIssueCount); // seed the store with server truth
    }).catch(() => {
      if (!cancelled) setProject(null);
    });
    return () => { cancelled = true; };
  }, [projectId, setValidationCount]);

  const global: Item[] = [
    { id: "dash",     label: "Dashboard", href: "/dashboard", icon: <Home size={16} /> },
    { id: "projects", label: "Projects",  href: "/projects",  icon: <Folder size={16} />, exact: true },
  ];

  const inProj: Item[] = project ? [
    { id: "overview",   label: "Overview",        href: `/projects/${project.id}`,             icon: <Compass size={16} />, exact: true },
    { id: "decision",   label: "Decision",        href: `/projects/${project.id}/decision`,    icon: <Gauge size={16} /> },
    { id: "artifacts",  label: "Artifacts",       href: `/projects/${project.id}/artifacts`,   icon: <Box size={16} />,    badge: project.artifactCount },
    { id: "api",        label: "API Specs",       href: `/projects/${project.id}/api`,         icon: <Plug size={16} /> },
    { id: "database",   label: "Database Model",  href: `/projects/${project.id}/database`,    icon: <Database size={16} /> },
    { id: "diagrams",   label: "Diagrams",        href: `/projects/${project.id}/diagrams`,    icon: <GitMerge size={16} /> },
    { id: "docs",       label: "Documentation",   href: `/projects/${project.id}/docs`,        icon: <BookOpen size={16} /> },
    { id: "ingestion",  label: "Ingestion",       href: `/projects/${project.id}/ingestion`,   icon: <Download size={16} /> },
    { id: "graph",      label: "Knowledge Graph", href: `/projects/${project.id}/graph`,       icon: <Network size={16} /> },
    { id: "validation", label: "Validation",      href: `/projects/${project.id}/validation`,  icon: <Shield size={16} />, badge: liveValidationCount ?? project.validationIssueCount, badgeTone: "warning" },
    { id: "review",     label: "AI Review",       href: `/projects/${project.id}/review`,      icon: <Sparkles size={16} /> },
    { id: "versions",   label: "Version History", href: `/projects/${project.id}/versions`,    icon: <History size={16} /> },
    { id: "team",       label: "Team",            href: `/projects/${project.id}/team`,        icon: <Users size={16} />,  badge: project.members },
    { id: "export",     label: "Export SSOT",     href: `/projects/${project.id}/export`,      icon: <Package size={16} /> },
  ] : [];

  const isActive = (href: string, exact?: boolean) =>
    pathname === href || (!exact && pathname.startsWith(href + "/"));

  return (
    <aside className="sidebar h-screen overflow-hidden flex flex-col bg-bg border-r border-border" style={{ width: 232 }}>
      <BrandLogo className="px-3.5 py-3.5" />

      <SidebarSection items={global} isActive={isActive} />

      {project && (
        <>
          <hr className="mx-3 my-2.5 border-border" />
          <div className="flex items-center gap-2 px-3 pt-1.5 pb-1 text-[12px] text-fg-muted">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: project.color }} />
            <span className="truncate"><strong className="font-semibold">{project.name}</strong></span>
          </div>
          <SidebarSection items={inProj} isActive={isActive} />
        </>
      )}

      <div className="mt-auto p-2.5 border-t border-border">
        <Link href="/settings" className={cn(
          "sb-item flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-[13.5px] font-normal min-h-[30px] transition-colors",
          isActive("/settings") ? "bg-panel-hover text-fg" : "text-fg-muted hover:bg-panel-hover hover:text-fg",
        )}>
          <span className={cn(isActive("/settings") && "text-accent")}><Settings size={16} /></span>
          <span>Settings</span>
        </Link>
        <div className="flex items-center gap-2.5 p-1.5 rounded-sm mt-1">
          {user && <Avatar user={user as User} size={26} />}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium leading-tight truncate">
              {user ? `${user.firstName} ${user.lastName}` : "Loading…"}
            </div>
            <div className="text-[11px] text-fg-muted leading-tight truncate">{user?.email ?? ""}</div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sign out"
            aria-label="Sign out"
            className="w-6 h-6 rounded-[5px] grid place-items-center text-fg-muted hover:bg-panel-hover hover:text-danger"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({ items, isActive }: { items: Item[]; isActive: (href: string, exact?: boolean) => boolean }) {
  return (
    <div className="flex flex-col px-2 gap-px">
      {items.map((it) => {
        const active = isActive(it.href, it.exact);
        return (
        <Link key={it.id} href={it.href} className={cn(
          "flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-[13.5px] font-normal min-h-[30px] transition-colors",
          active ? "bg-panel-hover text-fg font-medium" : "text-fg-muted hover:bg-panel-hover hover:text-fg",
        )}>
          <span className={cn(active && "text-accent")}>{it.icon}</span>
          <span className="flex-1">{it.label}</span>
          {it.badge != null && it.badge > 0 && (
            <SidebarBadge value={it.badge} tone={it.badgeTone} />
          )}
        </Link>
        );
      })}
    </div>
  );
}

// Severity-graded badge for the validation count: 1–9 renders plain (like the
// other numeric badges), 10–19 yellow, 20+ red. Plain numeric badges (artifacts,
// team) carry no tone and always render uncolored.
function SidebarBadge({ value, tone }: { value: number; tone?: "warning" }) {
  if (tone === "warning") {
    if (value >= 20) return <Badge tone="danger">{value}</Badge>;
    if (value >= 10) return <Badge tone="warning">{value}</Badge>;
  }
  return <span className="text-[11px] text-fg-subtle">{value}</span>;
}
