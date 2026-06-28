// decision/whats-missing.tsx — the "What's missing?" panel of the Decision surface.
// Pure presentation over OPEN validation issues (read-only; the deterministic
// validation engine is the source). It groups by severity and lists the top
// findings, linking to the Validation page — it computes no findings of its own.
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { OpenLink } from "@/components/ui/open-link";
import { SeverityBadge } from "@/components/ui/severity-badge";
import type { Severity, ValidationIssue } from "@/lib/types";

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "ERROR", "WARNING", "INFO"];
const RANK: Record<Severity, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };
const TILE_LABEL: Record<Severity, string> = { CRITICAL: "Critical", ERROR: "Errors", WARNING: "Warnings", INFO: "Info" };
const TILE_COLOR: Record<Severity, string> = {
  CRITICAL: "var(--c-danger)", ERROR: "var(--c-danger)", WARNING: "var(--c-warning)", INFO: "var(--c-info)",
};
const TOP_N = 5;

// Findings from the api-intel rules carry a "CODE · " message prefix; the
// validation presenter strips it for display, so mirror that here.
function cleanMessage(msg: string): string {
  return msg.replace(/^[A-Z0-9_]+ · /, "");
}

export function WhatsMissing({
  projectId,
  issues,
  failed,
}: {
  projectId: string;
  issues: ValidationIssue[];
  failed: boolean;
}) {
  const validationHref = `/projects/${projectId}/validation`;
  const open = issues.filter((i) => i.status === "OPEN");
  const counts: Record<Severity, number> = { CRITICAL: 0, ERROR: 0, WARNING: 0, INFO: 0 };
  for (const i of open) counts[i.severity] += 1;
  const top = [...open].sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, TOP_N);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          What&apos;s missing <span className="text-fg-subtle font-normal tabular-nums">{open.length}</span>
        </span>
      }
      action={<OpenLink href={validationHref} label="View all" />}
    >
      {failed ? (
        <p className="text-[13px] text-fg-muted">
          Couldn&apos;t load findings.{" "}
          <Link href={validationHref} className="text-accent hover:underline">Open Validation</Link>.
        </p>
      ) : open.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No open findings — nothing flagged as missing right now.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {SEVERITY_ORDER.map((s) => (
              <div key={s} className="bg-bg border border-border rounded-md px-2 py-1.5 text-center">
                <div className="text-[10.5px] uppercase tracking-wide text-fg-subtle">{TILE_LABEL[s]}</div>
                <div
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: counts[s] > 0 ? TILE_COLOR[s] : "var(--fg)" }}
                >
                  {counts[s]}
                </div>
              </div>
            ))}
          </div>

          <ul className="space-y-1">
            {top.map((i) => (
              <li key={i.id}>
                <Link
                  href={validationHref}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-panel-hover transition-colors"
                >
                  <span className="shrink-0"><SeverityBadge severity={i.severity} /></span>
                  <span className="text-[12.5px] text-fg leading-snug">{cleanMessage(i.message)}</span>
                </Link>
              </li>
            ))}
          </ul>

          {open.length > top.length && (
            <OpenLink
              href={validationHref}
              label={`+${open.length - top.length} more`}
              icon={false}
              className="mt-2"
            />
          )}
        </>
      )}
    </Card>
  );
}
