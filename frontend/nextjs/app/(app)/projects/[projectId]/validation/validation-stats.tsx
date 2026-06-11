// app/(app)/projects/[projectId]/validation/validation-stats.tsx
// Open-issue severity summary strip. Pure presentation over the page's `stats`.

interface Props {
  stats: { CRITICAL: number; ERROR: number; WARNING: number; INFO: number };
}

export function ValidationStats({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      {([
        ["Critical", stats.CRITICAL, "var(--c-danger)"],
        ["Errors",   stats.ERROR,    "var(--c-danger)"],
        ["Warnings", stats.WARNING,  "var(--c-warning)"],
        ["Info",     stats.INFO,     "var(--c-info)"],
      ] as const).map(([lbl, n, c]) => (
        <div key={lbl} className="bg-panel border border-border rounded-lg p-4">
          <div className="text-[12px] text-fg-muted">{lbl}</div>
          <div className="text-[28px] font-semibold tabular-nums" style={{ color: n > 0 ? c : "var(--fg)" }}>{n}</div>
        </div>
      ))}
    </div>
  );
}
