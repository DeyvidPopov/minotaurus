import { SkeletonHeader, SkeletonStatTiles, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the impact analysis page: header (badges + actions) + scope note +
// risk-verdict tiles + blast-radius graph.
export default function ImpactSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader eyebrow actions={2} />
      <SkeletonBox className="h-12 mb-5" />
      <SkeletonStatTiles n={4} className="mb-5" />
      <SkeletonBox className="h-[380px]" />
    </div>
  );
}
