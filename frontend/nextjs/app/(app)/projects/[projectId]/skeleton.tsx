import { SkeletonHeader, SkeletonStatTiles, SkeletonBox, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the project overview: header + 4 stat tiles + 2-col body (mini-graph +
// validation snapshot on the left, recent changes on the right).
export default function OverviewSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader actions={3} />
      <SkeletonStatTiles n={4} />
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <SkeletonBox className="h-[380px]" />
          <SkeletonTable cols={3} rows={3} />
        </div>
        <SkeletonBox className="h-[420px]" />
      </div>
    </div>
  );
}
