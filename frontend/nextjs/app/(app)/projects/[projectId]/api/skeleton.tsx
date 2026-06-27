import { SkeletonHeader, SkeletonToolbar, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the API specs list: header + (search · New) + 5-col table.
export default function ApiSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonToolbar controls={1} />
      <SkeletonTable cols={5} rows={6} />
    </div>
  );
}
