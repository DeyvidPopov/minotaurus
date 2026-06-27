"use client";

// Decision — the project-scoped decision-support surface. READ-ONLY composition of
// existing deterministic outputs: it answers "what's missing" (validation), "is
// this healthy" (analysis health score), and "what breaks if I change X" (1-hop
// impact). No AI, no recomputation here — every number comes from a pure engine.
//
// Layout: a synthesized "do this next" hero (LeverageAction) leads, then the
// health banner ("is this healthy?"), then the What's-missing / What-breaks grid.
// The hero is the decision; the three panels are its supporting evidence.

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { HealthScoreCards } from "@/components/analysis/health-score-cards";
import { analysisApi, validationApi, artifactsApi } from "@/lib/api";
import { errorMessage } from "@/lib/api/error-message";
import type { Artifact, ProjectAnalysis, ValidationIssue } from "@/lib/types";
import DecisionSkeleton from "./skeleton";
import { LeverageAction } from "./leverage-action";
import { WhatsMissing } from "./whats-missing";
import { WhatBreaks } from "./what-breaks";

const SUBTITLE =
  "What's missing, is this healthy, and what breaks if you change something — at a glance.";

export default function DecisionPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [issuesFailed, setIssuesFailed] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnalysis(null);
    setIssues([]);
    setIssuesFailed(false);
    setArtifacts([]);
    setError(null);
    // Decision composes several read-only sources. Health (analysis) is the
    // primary one — its failure shows the page error. Validation + artifacts are
    // best-effort: a failure degrades the relevant panel, never the page. The
    // impact-per-artifact fetch lives inside WhatBreaks (driven by its picker).
    // Promise.allSettled so one source can't block another.
    Promise.allSettled([
      analysisApi.get(projectId),
      validationApi.list(projectId, { status: "OPEN" }),
      artifactsApi.list(projectId),
    ]).then(([a, v, ar]) => {
      if (cancelled) return;
      if (a.status === "fulfilled") setAnalysis(a.value);
      else setError(errorMessage(a.reason, "Could not load project health."));
      if (v.status === "fulfilled") setIssues(v.value);
      else setIssuesFailed(true);
      if (ar.status === "fulfilled") setArtifacts(ar.value);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="page-shell">
        <PageHeader title="Decision" subtitle={SUBTITLE} />
        <Card>
          <p className="text-[13.5px] text-danger">{error}</p>
        </Card>
      </div>
    );
  }

  if (!analysis) return <DecisionSkeleton />;

  return (
    <div className="page-shell">
      <PageHeader title="Decision" subtitle={SUBTITLE} />

      {analysis.meta.emptyProject ? (
        <Card>
          <p className="text-[13.5px] text-fg-muted">
            This project has no artifacts yet. Add artifacts to see its health, gaps, and change
            impact here.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* The decision: one synthesized, deterministic next action — the page's
              hero. The three panels below are its supporting evidence. */}
          <LeverageAction projectId={projectId} analysis={analysis} issues={issues} artifacts={artifacts} />

          <section className="space-y-2">
            <h2 className="text-[13px] uppercase tracking-wider text-fg-subtle">Is this healthy?</h2>
            <HealthScoreCards health={analysis.health} />
            <p className="text-[11px] text-fg-subtle">
              Deterministic health score — engine-authoritative, recomputed from the current model on
              every load. No AI.
            </p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <WhatsMissing projectId={projectId} issues={issues} failed={issuesFailed} />
            <WhatBreaks projectId={projectId} artifacts={artifacts} issues={issues} />
          </div>
        </div>
      )}
    </div>
  );
}
