// components/ui/field.tsx — labelled form field wrapper (label above its control).
import type { ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
    </div>
  );
}
