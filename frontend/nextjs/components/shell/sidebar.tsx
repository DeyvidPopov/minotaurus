// components/shell/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, Folder, Compass, Box, Network,
  Plug, Database, Shield, Package, Settings, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { projectsApi } from "@/lib/api/projects";
import type { Project, User } from "@/lib/types";

interface Item { id: string; label: string; href: string; icon: React.ReactNode; badge?: number; badgeTone?: "warning"; }

export function Sidebar({ projectId }: { projectId: string | null }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) { setProject(null); return; }
    projectsApi.get(projectId).then((p) => { if (!cancelled) setProject(p); }).catch(() => {
      if (!cancelled) setProject(null);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const global: Item[] = [
    { id: "dash",     label: "Dashboard", href: "/dashboard", icon: <Home size={16} /> },
    { id: "projects", label: "Projects",  href: "/projects",  icon: <Folder size={16} /> },
  ];

  const inProj: Item[] = project ? [
    { id: "overview",   label: "Overview",        href: `/projects/${project.id}`,             icon: <Compass size={16} /> },
    { id: "artifacts",  label: "Artifacts",       href: `/projects/${project.id}/artifacts`,   icon: <Box size={16} />,    badge: project.artifactCount },
    { id: "graph",      label: "Knowledge Graph", href: `/projects/${project.id}/graph`,       icon: <Network size={16} /> },
    { id: "api",        label: "API Specs",       href: `/projects/${project.id}/api`,         icon: <Plug size={16} /> },
    { id: "database",   label: "Database Model",  href: `/projects/${project.id}/database`,    icon: <Database size={16} /> },
    { id: "validation", label: "Validation",      href: `/projects/${project.id}/validation`,  icon: <Shield size={16} />, badge: project.validationIssueCount, badgeTone: "warning" },
    { id: "export",     label: "Export SSOT",     href: `/projects/${project.id}/export`,      icon: <Package size={16} /> },
  ] : [];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar h-screen overflow-hidden flex flex-col bg-bg border-r border-border" style={{ width: 232 }}>
      <Link href="/" className="flex items-center gap-2.5 px-3.5 py-3.5 hover:opacity-80 transition-opacity" title="Back to landing">
        <div className="w-7 h-7 rounded-md grid place-items-center text-white font-bold font-mono text-[13px]" style={{
          background: "linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #000))",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18), 0 1px 0 rgba(0,0,0,.18)",
        }}>M</div>
        <div className="min-w-0">
          <div className="font-semibold text-[14px] tracking-tight leading-tight">Minotaurus</div>
          <div className="text-[11px] text-fg-muted leading-tight">SSOT Architecture</div>
        </div>
      </Link>

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
          <Settings size={16} /><span>Settings</span>
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

function SidebarSection({ items, isActive }: { items: Item[]; isActive: (href: string) => boolean }) {
  return (
    <div className="flex flex-col px-2 gap-px">
      {items.map((it) => (
        <Link key={it.id} href={it.href} className={cn(
          "flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-[13.5px] font-normal min-h-[30px] transition-colors",
          isActive(it.href) ? "bg-panel-hover text-fg font-medium" : "text-fg-muted hover:bg-panel-hover hover:text-fg",
        )}>
          <span className={cn(isActive(it.href) && "text-accent")}>{it.icon}</span>
          <span className="flex-1">{it.label}</span>
          {it.badge != null && it.badge > 0 && (
            it.badgeTone === "warning"
              ? <Badge tone="warning">{it.badge}</Badge>
              : <span className="text-[11px] text-fg-subtle">{it.badge}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
