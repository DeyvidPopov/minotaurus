import { SkeletonHeader, SkeletonTabs, SkeletonBox, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the database model detail page: header (badges + actions) + 3 tabs +
// an entity card header + its fields table.
export default function DatabaseDetailSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader eyebrow actions={3} />
      <SkeletonTabs n={3} />
      <SkeletonBox className="h-16 mb-3" />
      <SkeletonTable cols={4} rows={5} />
    </div>
  );
}
