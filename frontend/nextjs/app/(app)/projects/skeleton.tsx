import { SkeletonHeader, SkeletonToolbar, SkeletonCardGrid } from "@/components/ui/skeleton";

// Mirrors the projects list: header + (search · sort · New) toolbar + 3-col card grid.
export default function ProjectsSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonToolbar controls={2} />
      <SkeletonCardGrid n={6} cols="sm:grid-cols-2 lg:grid-cols-3" h="h-[212px]" />
    </div>
  );
}
