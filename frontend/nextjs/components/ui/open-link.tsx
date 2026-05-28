// components/ui/open-link.tsx — the canonical "Open" navigation link.
// Use this instead of ad-hoc <Link className="text-accent hover:underline">
// or <Button icon={<ExternalLink/>}>Open</Button> patterns whenever the
// action is "navigate to this detail / module page".
//
// For mutation buttons (Edit, Delete, Run validation, Save) keep the Button
// component. For hero CTAs that need to read as a primary action (e.g. the
// dashboard's "Open Demo Project") also keep Button — OpenLink is the muted
// neutral variant used in tables, card actions, and inline rows.

import Link from "next/link";
import { SquareArrowOutUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpenLinkProps {
  href: string;
  label?: string;
  className?: string;
  icon?: boolean;
  "aria-label"?: string;
  onClick?: () => void;
}

export function OpenLink({
  href,
  label = "Open",
  className,
  icon = true,
  onClick,
  ...rest
}: OpenLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={rest["aria-label"] ?? label}
      className={cn(
        // Muted neutral by default; brighter on hover. No blue, no arrow.
        "inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-muted",
        "hover:text-fg transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg rounded-sm",
        className,
      )}
    >
      {icon && <SquareArrowOutUpRight size={12} aria-hidden="true" />}
      {label}
    </Link>
  );
}
