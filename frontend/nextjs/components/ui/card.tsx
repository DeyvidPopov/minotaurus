// components/ui/card.tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}

export function Card({ title, subtitle, action, children, padded = true, className }: Props) {
  return (
    <div className={cn("bg-panel border border-border rounded-lg overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div>
            {title && <div className="text-[13.5px] font-semibold">{title}</div>}
            {subtitle && <div className="text-[12.5px] text-fg-muted">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </div>
  );
}
