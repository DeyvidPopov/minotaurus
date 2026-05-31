// components/shell/brand-logo.tsx — shared Minotaurus wordmark (accent mark + MINOTAURUS.dev).
// Reused by the app sidebar, the landing nav, and the auth screens. The mark and the
// ".dev" suffix both follow the active accent color; pass layout="stacked" for a
// centered, vertically-stacked variant (used on the auth pages).
"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MinotaurusMark } from "@/components/ui/minotaurus-mark";

export function BrandLogo({
  href = "/",
  layout = "row",
  markSize = 28,
  className,
  title,
}: {
  href?: string | null;
  layout?: "row" | "stacked";
  markSize?: number;
  className?: string;
  title?: string;
}) {
  const stacked = layout === "stacked";

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
    href !== null && "hover:opacity-80",
    className
  );

  if (href === null) {
    return <div className={classes}>{content}</div>;
  }
  return (
    <Link href={href} className={classes} title={title}>
      {content}
    </Link>
  );
}
