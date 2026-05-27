// components/ui/project-mark.tsx
export function ProjectMark({ color = "var(--accent)", size = 30, letter = "M" }: { color?: string; size?: number; letter?: string }) {
  return (
    <div
      className="rounded-md grid place-items-center text-white font-bold font-mono shrink-0"
      style={{
        width: size, height: size,
        background: `linear-gradient(140deg, ${color}, color-mix(in srgb, ${color} 40%, #000))`,
        fontSize: size * 0.42,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18), 0 1px 0 rgba(0,0,0,.18)",
      }}
    >
      {letter}
    </div>
  );
}
