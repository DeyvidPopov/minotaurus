import { Skeleton, SkeletonHeader, SkeletonBox } from "@/components/ui/skeleton";

// The result body — score-card grid + executive summary + a section. Exported so
// the page can show it inline while reusing a persisted review (no AI call).
export function ReviewBodySkeleton() {
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[96px] border border-border" />
        ))}
      </div>
      <SkeletonBox className="h-[140px] mb-4" />
      <SkeletonBox className="h-[200px]" />
    </div>
  );
}

// Mirrors the AI Review page: header + mode switch + result body.
export default function ReviewSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader actions={2} />
      <Skeleton className="h-9 w-[260px] mb-5" />
      <ReviewBodySkeleton />
    </div>
  );
}
