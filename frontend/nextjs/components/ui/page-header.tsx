// components/ui/page-header.tsx
import type { ReactNode } from "react";

// On mobile, toolbar controls — buttons, button-wrapping links AND selects —
// each grow to fill the row (flex-1) down to a ~8rem floor, so two controls pair
// up to fill one line, and anything that can't fit (e.g. a long-labelled button)
// wraps to its own full-width line. Everything reverts to content-width at sm+.
// Search inputs (plain <div>s) are intentionally NOT targeted, so they keep
// whatever width the caller set (typically full-width on their own row).
// Exported so custom toolbars share the exact rule. Apply to a `flex flex-wrap`
// container.
export const FILL_ACTIONS_MOBILE =
  "[&>button]:flex-1 [&>button]:min-w-[8rem] [&>a]:flex-1 [&>a]:min-w-[8rem] [&>a>button]:w-full [&>select]:flex-1 [&>select]:min-w-[8rem] " +
  "sm:[&>button]:flex-none sm:[&>button]:min-w-0 sm:[&>a]:flex-none sm:[&>a]:min-w-0 sm:[&>a>button]:w-auto sm:[&>select]:flex-none sm:[&>select]:min-w-0";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, eyebrow, actions, children }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4 mb-6">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="flex items-center gap-2 mb-2 flex-wrap">{eyebrow}</div>}
        {typeof title === "string" ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : title}
        {subtitle && <div className="mt-1 text-fg-muted text-[13.5px]">{subtitle}</div>}
        {children}
      </div>
      {actions && (
        <div className={`flex items-center gap-2 flex-wrap ${FILL_ACTIONS_MOBILE}`}>
          {actions}
        </div>
      )}
    </div>
  );
}
