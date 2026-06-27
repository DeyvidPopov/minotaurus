import { SkeletonHeader, SkeletonTabs, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the artifact detail page: header (badges + actions) + 4 tabs + the
// Overview tab's 2-col body (mini-graph + description / metadata cards).
export default function ArtifactDetailSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader eyebrow actions={3} />
      <SkeletonTabs n={4} />
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          <SkeletonBox className="h-[300px]" />
          <SkeletonBox className="h-[140px]" />
        </div>
        <div className="flex flex-col gap-5">
          <SkeletonBox className="h-[120px]" />
          <SkeletonBox className="h-[180px]" />
        </div>
      </div>
    </div>
  );
}
