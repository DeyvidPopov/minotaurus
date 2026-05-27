// components/shell/app-shell.tsx — wraps the authenticated workspace
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CmdK } from "./cmdk";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();

  // Detect projectId from URL for sub-nav
  const segs = pathname.split("/").filter(Boolean);
  const projectId = (segs[0] === "projects" && segs[1] && segs[1] !== "new") ? segs[1] : null;

  useEffect(() => { setMobileNav(false); }, [pathname]);

  useEffect(() => {
    document.body.setAttribute("data-mobile-nav", mobileNav ? "open" : "closed");
  }, [mobileNav]);

  // ⌘K
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
          <div className="flex-1 min-h-0 min-w-0 overflow-auto relative">{children}</div>
        </div>
      </div>
      <CmdK open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
