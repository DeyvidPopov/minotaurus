"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DocDetailRedirect({ params }: { params: { projectId: string; artifactId: string } }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/projects/${params.projectId}/artifacts/${params.artifactId}?tab=documentation`);
  }, [router, params.projectId, params.artifactId]);
  return <div className="px-8 py-6 text-fg-muted">Redirecting to documentation editor…</div>;
}
