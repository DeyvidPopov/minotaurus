import { SkeletonHeader, SkeletonStatTiles, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the dashboard command center: greeting header + 4 trend tiles + the
// projects / validation / activity two-column body.
export default function DashboardSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader actions={1} />
      <SkeletonStatTiles n={4} />
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <SkeletonBox className="h-[220px]" />
          <SkeletonBox className="h-[260px]" />
        </div>
        <div className="flex flex-col gap-5 min-w-0">
          <SkeletonBox className="h-[300px]" />
          <SkeletonBox className="h-[140px]" />
        </div>
      </div>
    </div>
  );
}
