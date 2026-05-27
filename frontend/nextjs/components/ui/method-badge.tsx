// components/ui/method-badge.tsx
import { Badge } from "./badge";

const MAP: Record<string, Parameters<typeof Badge>[0]["tone"]> = {
  GET: "info", POST: "success", PUT: "warning", PATCH: "purple", DELETE: "danger",
};
export function MethodBadge({ method }: { method: string }) {
  return <Badge tone={MAP[method] || "default"} mono>{method}</Badge>;
}
