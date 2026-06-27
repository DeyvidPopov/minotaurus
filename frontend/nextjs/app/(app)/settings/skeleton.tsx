import { Skeleton, SkeletonHeader, SkeletonBox } from "@/components/ui/skeleton";

// Mirrors the settings page: header + tab strip + the active tab's card content.
export default function SettingsSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader />
      <div className="flex gap-2 border-b border-border mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24" />
        ))}
      </div>
      <SkeletonBox className="h-[320px]" />
    </div>
  );
}
