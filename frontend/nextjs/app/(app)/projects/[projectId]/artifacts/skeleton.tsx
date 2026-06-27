import { SkeletonHeader, SkeletonToolbar, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the artifacts list: header + (search · type · status · sort · New) + table.
export default function ArtifactsSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonToolbar controls={3} />
      <SkeletonTable cols={6} rows={8} />
    </div>
  );
}
