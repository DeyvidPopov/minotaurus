// components/landing/landing-nav.tsx — public landing top navigation (client island).
//
// Three zones: brand (left), section links (absolutely centered in the bar), and
// the auth buttons (right). On desktop (md+) all three show. On mobile the brand
// stays left and the centered links + auth buttons collapse into a burger menu.
// When open, the menu is a SOLID, full-height sheet that fills everything under
// the 61px bar (fixed top-[61px] inset → bottom), locks body scroll, and closes
// on Escape.
//
// The sheet is rendered as a SIBLING of the <nav>, not inside it: the nav uses
// `backdrop-blur`, and an ancestor with a backdrop-filter becomes the containing
// block for `position: fixed` descendants — which would collapse the sheet to the
// 61px-tall nav and make it invisible. Keeping it outside resolves `fixed` against
// the viewport again. Extracted as a "use client" island purely for the open/close
// state — the landing page itself stays a server component.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/shell/brand-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#workflow", label: "Workflow" },
  { href: "#governance", label: "Governance" },
  { href: "#platform", label: "Platform" },
  { href: "#why", label: "SSOT" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  // While the full-height sheet is open: lock body scroll and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Bar is solid while the menu is open (no hero bleeding through the blur);
          translucent + blurred when closed for the scroll-over-content look. */}
      <nav
        className={cn(
          "sticky top-0 z-30 border-b border-border",
          open ? "bg-bg" : "backdrop-blur bg-bg/70",
        )}
      >
        <div className="relative max-w-[1280px] mx-auto px-4 sm:px-8 py-3.5 flex items-center gap-4 text-[14px]">
          <BrandLogo />

          {/* centered section links — desktop only */}
          <div className="hidden md:flex gap-5 text-fg-muted absolute left-1/2 -translate-x-1/2">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-fg">
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex-1" />

          {/* auth buttons — desktop only (collapse into the burger on mobile) */}
          <Link
            href="/login"
            className="hidden md:inline-flex h-8 px-3 items-center bg-panel border border-border rounded-sm text-[13px] transition-colors hover:bg-panel-hover"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="hidden md:inline-flex h-8 px-3.5 items-center gap-1.5 bg-accent text-accent-fg border border-transparent rounded-sm text-[13px] font-medium transition-colors hover:brightness-[0.95] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          >
            Get started <ArrowRight size={13} />
          </Link>

          {/* burger — mobile only */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-sm border border-border bg-panel text-fg transition-colors hover:bg-panel-hover"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* mobile sheet — solid, full height under the bar; links top, auth bottom.
          Sibling of <nav> on purpose (see file header: backdrop-filter + fixed). */}
      {open && (
        <div
          id="landing-mobile-menu"
          className="md:hidden fixed inset-x-0 top-[61px] bottom-0 z-20 bg-bg flex flex-col px-5 py-2 overflow-y-auto"
        >
          <div className="flex flex-col">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-4 text-[16px] text-fg-muted hover:text-fg border-b border-border transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>
          {/* Auth links route to another page (which unmounts the landing), so we
              deliberately do NOT setOpen(false) here — closing first causes a
              visible close-then-redirect flicker. The in-page section links above
              DO close the sheet so the jumped-to section is visible. */}
          <div className="mt-auto flex flex-col gap-2.5 py-5">
            <Link
              href="/login"
              className="h-11 inline-flex items-center justify-center bg-panel border border-border rounded-sm text-[15px] transition-colors hover:bg-panel-hover"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="h-11 inline-flex items-center justify-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[15px] font-medium transition-colors hover:brightness-[0.95] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
            >
              Get started <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
