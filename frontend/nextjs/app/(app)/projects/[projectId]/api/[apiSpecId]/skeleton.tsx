import { SkeletonHeader, SkeletonTabs, SkeletonTable } from "@/components/ui/skeleton";

// Mirrors the API spec detail page: header (badges + actions) + 2 tabs +
// endpoints table.
export default function ApiDetailSkeleton() {
  return (
    <div className="page-shell">
      <SkeletonHeader eyebrow actions={2} />
      <SkeletonTabs n={2} />
      <SkeletonTable cols={5} rows={6} />
    </div>
  );
}
