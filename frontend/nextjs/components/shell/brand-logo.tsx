// components/shell/brand-logo.tsx — shared Minotaurus wordmark (accent mark + MINOTAURUS.dev).
// Reused by the app sidebar, the landing nav, and the auth screens. The mark and the
// ".dev" suffix both follow the active accent color; pass layout="stacked" for a
// centered, vertically-stacked variant (used on the auth pages).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MinotaurusMark } from "@/components/ui/minotaurus-mark";
import { useAuth } from "@/lib/auth-context";

export function BrandLogo({
  href,
  layout = "row",
  markSize = 28,
  className,
  title,
}: {
  /**
   * Explicit destination. **Omit** for auth-aware routing: logged in → `/dashboard`,
   * otherwise → `/` (landing). Pass `null` to render a non-link.
   */
  href?: string | null;
  layout?: "row" | "stacked";
  markSize?: number;
  className?: string;
  title?: string;
}) {
  const stacked = layout === "stacked";

  // Auth-aware destination. `useAuth()` is authoritative inside the app (where the
  // provider is mounted); on public pages there's no provider, so we also probe the
  // token directly so a logged-in visitor on the landing page still lands on the
  // dashboard. Computed in an effect to avoid an SSR/hydration mismatch on the href.
  const { user } = useAuth();
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    setHasToken(
      typeof window !== "undefined" && !!localStorage.getItem("mino:token"),
    );
  }, []);
  const loggedIn = !!user || hasToken;

  const resolvedHref =
    href === null ? null : href !== undefined ? href : loggedIn ? "/dashboard" : "/";

  const content = (
    <>
      <MinotaurusMark
        className="shrink-0"
        style={{ color: "var(--accent)", width: markSize, height: markSize }}
      />
      <div className={cn("font-semibold tracking-tight leading-tight", stacked ? "text-[18px]" : "text-[14px]")}>
        MINOTAURUS<span className="text-accent">.dev</span>
      </div>
    </>
  );

  const classes = cn(
    "flex transition-opacity",
    stacked ? "flex-col items-center gap-2" : "items-center gap-2.5",
    resolvedHref !== null && "hover:opacity-80",
    className
  );

  if (resolvedHref === null) {
    return <div className={classes}>{content}</div>;
  }
  return (
    <Link href={resolvedHref} className={classes} title={title}>
      {content}
    </Link>
  );
}
