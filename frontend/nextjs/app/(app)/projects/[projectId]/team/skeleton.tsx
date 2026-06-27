import { Skeleton, SkeletonHeader, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the team page: header + invite card + members list.
export default function TeamSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <Skeleton className="h-[128px] w-full mb-5 border border-border" />
      <SkeletonTable cols={3} rows={4} />
    </div>
  );
}
