import { SkeletonHeader, SkeletonToolbar, SkeletonCardGrid } from "@/components/ui/skeleton";

// Mirrors the diagrams gallery: header + (search · type · New) + 3-col preview cards.
export default function DiagramsSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonToolbar controls={2} />
      <SkeletonCardGrid n={6} cols="sm:grid-cols-2 lg:grid-cols-3" h="h-[260px]" />
    </div>
  );
}
