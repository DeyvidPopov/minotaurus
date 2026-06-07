// app/(app)/projects/[projectId]/advisor/page.tsx — redirect stub.
//
// The AI Advisor is no longer a standalone feature: it has been consolidated into
// AI Review as the "Advisor / Next Steps" mode (Project → AI Review →
// [Full Review | Advisor]). This route is kept only so existing bookmarks/links
// land in the right place — it immediately redirects to the Advisor mode of the
// Review page. There is no separate Advisor sidebar item or page anymore.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdvisorRedirect({ params }: { params: { projectId: string } }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/projects/${params.projectId}/review?mode=advisor`);
  }, [router, params.projectId]);
  return null;
}
