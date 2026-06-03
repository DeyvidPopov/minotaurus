// components/shell/app-shell.tsx — wraps the authenticated workspace
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CmdK } from "./cmdk";
import { useTweaks } from "@/components/providers";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();
  const accent = useTweaks((s) => s.accent);
  const theme = useTweaks((s) => s.theme);

  // The selected accent is applied here (not in the global Providers) so it only
  // affects authenticated pages. Public pages keep the fixed purple CSS default.
  // Cleanup removes the inline override so navigating back to the landing/auth
  // pages reverts to purple instead of leaking the user's accent.
  useEffect(() => {
    const h = document.documentElement;
    h.style.setProperty("--accent", accent);
    h.style.setProperty("--accent-fg", accent.toLowerCase() === "#e5e5e5" ? "#0a0a0a" : "#ffffff");
    return () => {
      h.style.removeProperty("--accent");
      h.style.removeProperty("--accent-fg");
    };
  }, [accent]);

  // Light/dark theme is likewise scoped to authenticated pages: applied here, and
  // reverted to the fixed dark brand default on cleanup so the landing/auth pages
  // never pick up a user's light-mode preference.
  useEffect(() => {
    const h = document.documentElement;
    h.setAttribute("data-theme", theme);
    return () => {
      h.setAttribute("data-theme", "dark");
    };
  }, [theme]);

  // Detect projectId from URL for sub-nav
  const segs = pathname.split("/").filter(Boolean);
  const projectId = (segs[0] === "projects" && segs[1] && segs[1] !== "new") ? segs[1] : null;

  useEffect(() => { setMobileNav(false); }, [pathname]);

  useEffect(() => {
    document.body.setAttribute("data-mobile-nav", mobileNav ? "open" : "closed");
  }, [mobileNav]);

  // ⌘K (macOS) / Ctrl+K (Windows/Linux) — toggle the command palette
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  return (
    <>
      <div className="grid h-screen overflow-hidden" style={{ gridTemplateColumns: "auto 1fr" }}>
        {mobileNav && <div onClick={() => setMobileNav(false)} className="fixed inset-0 bg-black/45 z-[199] md:hidden" />}
        <Sidebar projectId={projectId} />
        <div className="flex flex-col min-w-0 min-h-0 overflow-hidden">
          <Topbar onOpenSearch={() => setCmdOpen(true)} onOpenMobileNav={() => setMobileNav(true)} />
          <div className="mino-app-content flex-1 min-h-0 min-w-0 overflow-auto relative">{children}</div>
        </div>
      </div>
      <CmdK open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
