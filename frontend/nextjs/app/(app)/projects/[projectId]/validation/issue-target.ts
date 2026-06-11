// app/(app)/projects/[projectId]/validation/issue-target.ts
// Pure issue-target helpers shared by the validation page, its issue rows, and the
// remediation modal. No JSX, no state — keep deterministic.

import type { IssueTarget } from "@/lib/types";

// Mirrors PROJECT_LEVEL_PREFIX in backend validation.engine.ts: project-level
// issues are not artifact-scoped, so they carry this prefix and store the
// projectId in artifactId (which never resolves to an artifact). Keep in sync.
export const PROJECT_LEVEL_PREFIX = "PROJECT_LEVEL · ";

export const KIND_LABEL: Record<IssueTarget["kind"], string> = {
  TEAM: "Team",
  ARTIFACT: "artifact",
  API_SPEC: "API spec",
  DATABASE_MODEL: "database model",
  DIAGRAM: "diagram",
};

// Map a resolved issue target to its in-app route. A null id (resource not
// found / deleted) falls back to the relevant module index page.
export function targetHref(projectId: string, t: IssueTarget): string {
  switch (t.kind) {
    case "TEAM":
      return `/projects/${projectId}/team`;
    case "ARTIFACT":
      return t.id
        ? `/projects/${projectId}/artifacts/${t.id}${t.tab ? `?tab=${t.tab}` : ""}`
        : `/projects/${projectId}/graph`;
    case "API_SPEC":
      return t.id ? `/projects/${projectId}/api/${t.id}` : `/projects/${projectId}/api`;
    case "DATABASE_MODEL":
      return t.id ? `/projects/${projectId}/database/${t.id}` : `/projects/${projectId}/database`;
    case "DIAGRAM":
      return t.id ? `/projects/${projectId}/diagrams/${t.id}` : `/projects/${projectId}/diagrams`;
  }
}

// Human description of the affected target for the details panel.
export function targetDescription(t: IssueTarget): string {
  if (t.kind === "TEAM") return "Project · Team";
  const noun = KIND_LABEL[t.kind];
  const head = t.title ? `${noun} “${t.title}”` : `${noun} (unresolved)`;
  return t.endpoint ? `${head} · ${t.endpoint.method} ${t.endpoint.path}` : head;
}
