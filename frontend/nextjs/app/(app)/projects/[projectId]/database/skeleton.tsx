import { SkeletonHeader, SkeletonToolbar, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the database models list: header + (search · type · New) + 5-col table.
export default function DatabaseSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonToolbar controls={2} />
      <SkeletonTable cols={5} rows={6} />
    </div>
  );
}
