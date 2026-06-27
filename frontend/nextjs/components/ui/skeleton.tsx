// components/ui/skeleton.tsx — pure, server-safe skeleton primitives built on the
// `.skel` shimmer (app/globals.css). These have NO hooks and NO client APIs, so the
// same components back both the route-segment `loading.tsx` files (Server
// Components) and the in-page `data === null` branches (client pages) — giving a
// continuous, layout-matching skeleton from route transition → data fetch → content.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skel rounded-md ${className}`} />;
}

/** A single text-line placeholder. */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skel rounded h-3.5 ${className}`} />;
}

/** Mirrors PageHeader: optional eyebrow chips, title, subtitle, and right-side actions. */
export function SkeletonHeader({
  eyebrow = false,
  actions = 0,
}: {
  eyebrow?: boolean;
  actions?: number;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="flex gap-1.5 mb-2.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        )}
        <Skeleton className="h-7 w-64 max-w-full mb-2" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {actions > 0 && (
        <div className="hidden sm:flex gap-2 shrink-0">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Search input (full-width on mobile) + a few right-aligned controls. */
export function SkeletonToolbar({ controls = 2 }: { controls?: number }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mb-4">
      <Skeleton className="h-9 w-full sm:flex-1 sm:max-w-md" />
      <div className="flex gap-2.5 sm:ml-auto">
        {Array.from({ length: controls }).map((_, i) => (
          <Skeleton key={i} className="h-9 flex-1 sm:flex-none sm:w-[120px]" />
        ))}
      </div>
    </div>
  );
}

/** Stat-tile band (Dashboard / overview / docs hub). */
export function SkeletonStatTiles({ n = 4, className = "mb-6" }: { n?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 ${className}`}>
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-[92px] border border-border" />
      ))}
    </div>
  );
}

/** Responsive card grid (projects / diagrams / docs documented section). */
export function SkeletonCardGrid({
  n = 6,
  cols = "sm:grid-cols-2 lg:grid-cols-3",
  h = "h-[210px]",
}: {
  n?: number;
  cols?: string;
  h?: string;
}) {
  return (
    <div className={`grid grid-cols-1 ${cols} gap-3 sm:gap-4`}>
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className={`${h} border border-border`} />
      ))}
    </div>
  );
}

/** Table placeholder — a header row + N body rows, first column wider. */
export function SkeletonTable({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="bg-panel border-b border-border px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="px-4 py-3.5 flex gap-4 items-center border-b border-border last:border-0"
        >
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={`h-4 ${i === 0 ? "flex-[2]" : "flex-1"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Tab strip placeholder. */
export function SkeletonTabs({ n = 4 }: { n?: number }) {
  return (
    <div className="flex gap-2 border-b border-border mb-5">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-24" />
      ))}
    </div>
  );
}

/** A large sized box — stand-in for a graph canvas, ERD, or Mermaid preview that
 *  must NOT be mounted during loading. */
export function SkeletonBox({ className = "h-[380px]" }: { className?: string }) {
  return <Skeleton className={`w-full border border-border ${className}`} />;
}
