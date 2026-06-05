// components/ui/project-chip.tsx
// Pill for project-level (non-artifact) validation issues — mirrors TypeChip's
// shape exactly, but uses teal (unused by any artifact type) so a "Project"
// scope reads as a peer of the artifact chips without colliding with them.
const PROJECT_COLOR = "#14b8a6"; // teal

export function ProjectChip({ label = "Project" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-xs whitespace-nowrap"
      style={{
        background: `${PROJECT_COLOR}22`,
        border: `1px solid color-mix(in srgb, ${PROJECT_COLOR} 30%, transparent)`,
      }}
    >
      <span className="w-2 h-2 rounded-[2px]" style={{ background: PROJECT_COLOR }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: PROJECT_COLOR }}>
        {label}
      </span>
    </span>
  );
}
