import { SkeletonHeader, SkeletonBox, SkeletonCardGrid, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the ingestion page: header + info banner + 4 source-type cards +
// ingestion-history table.
export default function IngestionSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonBox className="h-12 mb-5" />
      <SkeletonCardGrid n={4} cols="sm:grid-cols-2 lg:grid-cols-4" h="h-[120px]" />
      <div className="mt-6">
        <SkeletonTable cols={6} rows={4} />
      </div>
    </div>
  );
}
