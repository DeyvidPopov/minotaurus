import { SkeletonHeader, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the diagram detail page: header (badges + actions) + the rendered
// diagram canvas.
export default function DiagramDetailSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader eyebrow actions={3} />
      <SkeletonBox className="h-[520px]" />
    </div>
  );
}
