// components/ui/severity-badge.tsx
import { Badge } from "./badge";
import type { Severity } from "@/lib/types";

const MAP: Record<Severity, Parameters<typeof Badge>[0]["tone"]> = {
  CRITICAL: "danger", ERROR: "danger", WARNING: "warning", INFO: "info",
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={MAP[severity]}>{severity}</Badge>;
}
