// components/ui/page-header.tsx
import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, eyebrow, actions, children }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="flex items-center gap-2 mb-2 flex-wrap">{eyebrow}</div>}
        {typeof title === "string" ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : title}
        {subtitle && <div className="mt-1 text-fg-muted text-[13.5px]">{subtitle}</div>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
