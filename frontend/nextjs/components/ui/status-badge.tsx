// components/ui/status-badge.tsx
import { Badge } from "./badge";
import type { ArtifactStatus, IssueStatus } from "@/lib/types";

type Status = ArtifactStatus | IssueStatus | "READY";

const MAP: Record<Status, { tone: "success" | "warning" | "danger" | "default"; label: string }> = {
  ACTIVE:     { tone: "success", label: "Active" },
  DRAFT:      { tone: "default", label: "Draft" },
  DEPRECATED: { tone: "warning", label: "Deprecated" },
  OPEN:       { tone: "warning", label: "Open" },
  RESOLVED:   { tone: "success", label: "Resolved" },
  IGNORED:    { tone: "default", label: "Ignored" },
  READY:      { tone: "success", label: "Ready" },
};

export function StatusBadge({ status }: { status: Status }) {
  const { tone, label } = MAP[status];
  return <Badge tone={tone}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label}</Badge>;
}
