// components/ui/stat.tsx
import type { ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaDir?: "up" | "dn" | "flat";
  icon?: ReactNode;
  spark?: number[];
}

export function Stat({ label, value, delta, deltaDir = "flat", icon, spark }: Props) {
  const color = deltaDir === "up" ? "var(--c-success)" : deltaDir === "dn" ? "var(--c-danger)" : "var(--fg-muted)";
  return (
    <div className="relative overflow-hidden bg-panel border border-border rounded-lg p-4">
      <div className="text-[12px] text-fg-muted flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-[28px] font-semibold tracking-tight">{value}</div>
      {delta && (
        <div className="text-[12px] inline-flex items-center gap-1" style={{ color }}>
          {deltaDir === "up" ? <ArrowUp size={12} /> : deltaDir === "dn" ? <ArrowDown size={12} /> : null}
          {delta}
        </div>
      )}
      {spark && <Sparkline data={spark} className="absolute right-2 bottom-2" />}
    </div>
  );
}

function Sparkline({ data, w = 64, h = 22, className }: { data: number[]; w?: number; h?: number; className?: string }) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 2) - 1}`).join(" ");
  return (
    <svg className={className} width={w} height={h} fill="none">
      <polyline points={pts} stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`${pts} ${w},${h} 0,${h}`} fill="var(--accent-soft)" stroke="none" />
    </svg>
  );
}
