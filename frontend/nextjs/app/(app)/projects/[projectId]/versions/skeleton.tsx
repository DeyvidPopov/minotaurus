import { Skeleton, SkeletonHeader, SkeletonToolbar, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors version history: header + (search · entity · action) + a day-grouped
// timeline (day label + a card of event rows).
export default function VersionsSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonToolbar controls={2} />
      <Skeleton className="h-3 w-28 mb-2.5" />
      <SkeletonTable cols={3} rows={6} />
    </div>
  );
}
