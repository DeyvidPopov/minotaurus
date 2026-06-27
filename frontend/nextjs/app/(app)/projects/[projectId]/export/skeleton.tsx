import { SkeletonHeader, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the export page: header + create-export card + recent-exports list.
export default function ExportSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <SkeletonBox className="h-[280px] mb-5" />
      <SkeletonBox className="h-[200px]" />
    </div>
  );
}
