import { Skeleton, SkeletonHeader } from "@/components/ui/skeleton";

// Mirrors the Decision page layout: header → "do this next" hero → health
// score-card band → the What's-missing / What-breaks panel grid. Pure/server-safe
// (no hooks), so it backs both loading.tsx (route transition) and the page's
// data === null branch.
export default function DecisionSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />

      {/* "Do this next" hero */}
      <Skeleton className="h-[92px] w-full border border-border mb-6" />

      {/* "Is this healthy?" label + the six health cards */}
      <Skeleton className="h-4 w-40 mb-3" />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[96px] border border-border" />
        ))}
      </div>

      {/* What's-missing / What-breaks panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[280px] border border-border" />
        ))}
      </div>
    </div>
  );
}
