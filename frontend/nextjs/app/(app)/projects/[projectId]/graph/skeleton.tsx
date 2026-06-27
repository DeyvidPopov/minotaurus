import { Skeleton, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the knowledge graph: top toolbar row + full-height canvas.
export default function GraphSkeleton() {
  return (
    <div className="grid h-full overflow-hidden" style={{ gridTemplateRows: "auto 1fr" }}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Skeleton className="h-4 w-40" />
        <div className="flex-1" />
        <Skeleton className="hidden sm:block h-9 w-[180px]" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="p-4">
        <SkeletonBox className="h-full" />
      </div>
    </div>
  );
}
