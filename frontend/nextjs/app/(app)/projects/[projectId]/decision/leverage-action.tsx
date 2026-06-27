// decision/leverage-action.tsx — the Decision page HERO: one synthesized,
// deterministic "do this next" that intersects the three panels (health weakest
// dimension × flagged artifacts × connectivity degree). Pure presentation over
// selectLeverageAction() — it computes nothing itself. Visibly tagged
// "Deterministic · no AI" to distinguish it from the interpretive AI Advisor.
"use client";

import { OpenLink } from "@/components/ui/open-link";
import { selectLeverageAction } from "@/lib/leverage";
import type { Artifact, ProjectAnalysis, ValidationIssue } from "@/lib/types";

function DeterministicTag() {
  return (
    <span className="inline-flex items-center shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-fg-subtle">
      Deterministic · no AI
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
        background: "color-mix(in srgb, var(--accent) 6%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-accent">Do this next</span>
        <DeterministicTag />
      </div>
      {children}
    </div>
  );
}

export function LeverageAction({
  projectId,
  analysis,
  issues,
  artifacts,
}: {
  projectId: string;
  analysis: ProjectAnalysis;
  issues: ValidationIssue[];
  artifacts: Artifact[];
}) {
  const result = selectLeverageAction(analysis, issues, artifacts);
  if (result.kind === "EMPTY") return null;

  if (result.kind === "NONE_FLAGGED") {
    return (
      <Shell>
        <p className="text-[14px] text-fg">✓ No high-leverage action — nothing flagged.</p>
        <p className="text-[12.5px] text-fg-muted mt-1">
          No undocumented artifacts and no open findings tied to a component.{" "}
          {result.weakest.label} is your weakest dimension ({result.weakest.value}).
        </p>
      </Shell>
    );
  }

  const { lever, verb, problem, widestReach, weakest, ctaKind } = result;
  const href =
    ctaKind === "DOCS"
      ? `/projects/${projectId}/artifacts/${lever.id}?tab=documentation`
      : `/projects/${projectId}/artifacts/${lever.id}`;
  const ctaLabel = ctaKind === "DOCS" ? "Open documentation" : "Open artifact";

  return (
    <Shell>
      <p className="text-[15px] text-fg leading-snug">
        <span className="font-semibold">
          {verb} “{lever.title}”
        </span>{" "}
        {widestReach ? (
          <>
            — your most-connected artifact ({lever.degree} link{lever.degree === 1 ? "" : "s"}) {problem}, and{" "}
            {weakest.label.toLowerCase()} is your weakest dimension ({weakest.value}).
          </>
        ) : (
          <>
            — it {problem}, and it&apos;s an orphan (no connections), so fix it for correctness, not reach.{" "}
            {weakest.label} is your weakest dimension ({weakest.value}).
          </>
        )}
      </p>
      <OpenLink href={href} label={ctaLabel} className="mt-2" />
    </Shell>
  );
}
