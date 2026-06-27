import {
  Skeleton,
  SkeletonHeader,
  SkeletonToolbar,
  SkeletonStatTiles,
  SkeletonCardGrid,
} from "@/components/ui/skeleton";

// Mirrors the Documentation Hub: header + 4 coverage stat tiles + info banner +
// (search · filter) toolbar + 2-col documented-artifacts grid.
export default function DocsSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonStatTiles n={4} className="mb-5" />
      <Skeleton className="h-14 w-full mb-5 border border-border" />
      <SkeletonToolbar controls={1} />
      <SkeletonCardGrid n={4} cols="md:grid-cols-2" h="h-[120px]" />
    </div>
  );
}
