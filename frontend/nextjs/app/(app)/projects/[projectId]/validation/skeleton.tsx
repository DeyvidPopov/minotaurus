import { SkeletonHeader, SkeletonStatTiles, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the validation page: header (+ Run validation) + severity stat tiles +
// the all-issues list.
export default function ValidationSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader actions={1} />
      <SkeletonStatTiles n={4} className="mb-5" />
      <SkeletonTable cols={3} rows={7} />
    </div>
  );
}
