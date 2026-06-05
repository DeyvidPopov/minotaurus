// components/api/workflow-impact.tsx — Phase 1 "Workflow Impact (Inferred)"
// panel. Deterministic business-workflow signals, each with a visible
// confidence and a mandatory basis (explainability). Read-only; not persisted.
"use client";

import { Check } from "lucide-react";
import type { IntelWorkflowSignal } from "@/lib/api/api-intel";
import { ConfidenceDot, InferredBadge } from "./intel-bits";

export function WorkflowImpact({ workflow }: { workflow: IntelWorkflowSignal[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted font-semibold">⇄ Workflow Impact</span>
        <InferredBadge />
      </div>

      {workflow.length === 0 ? (
        <div className="text-[12.5px] text-fg-subtle italic">No workflow impact inferred from this payload.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {workflow.map((w) => (
            <li key={w.label} className="flex items-start gap-2" title={w.basis}>
              <Check size={13} className="text-accent shrink-0 mt-[3px]" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-fg">{w.label}</span>
                  <ConfidenceDot confidence={w.confidence} />
                </div>
                <span className="text-[11.5px] text-fg-subtle">Reason: {w.basis}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
