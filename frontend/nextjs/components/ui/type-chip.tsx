// components/ui/type-chip.tsx
import { TYPE_INFO } from "@/lib/mock-data";
import type { ArtifactType } from "@/lib/types";

export function TypeChip({ type }: { type: ArtifactType }) {
  const info = TYPE_INFO[type];
  return (
    <span className={`t-${type} inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs whitespace-nowrap`} style={{
      background: "var(--t-soft)",
      border: "1px solid color-mix(in srgb, var(--t-color) 30%, transparent)",
    }}>
      <span className="w-2 h-2 rounded-[2px]" style={{ background: "var(--t-color)" }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-color)" }}>{info.label}</span>
    </span>
  );
}
