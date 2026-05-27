// components/ui/empty.tsx
import type { ReactNode } from "react";

interface Props { icon?: ReactNode; title: string; message?: string; action?: ReactNode; }

export function Empty({ icon, title, message, action }: Props) {
  return (
    <div className="border border-dashed border-border-strong rounded-lg p-12 text-center bg-panel-2">
      {icon && <div className="text-fg-subtle mb-3 inline-block">{icon}</div>}
      <h3 className="text-base font-semibold m-0 mb-1.5">{title}</h3>
      {message && <p className="text-fg-muted text-[13.5px] m-0 mb-4">{message}</p>}
      {action}
    </div>
  );
}
