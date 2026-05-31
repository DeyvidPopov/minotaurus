// app/(app)/projects/[projectId]/review/page.tsx — AI Architecture Review.
// Read-only: the deterministic engine computes the numbers (shown verbatim in the
// score cards); the AI only interprets them in the narrative below. There are no
// apply / auto-fix controls anywhere on this page by design.
"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, Loader2, AlertTriangle, ShieldCheck, Lightbulb, TriangleAlert, ScanSearch, Users, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/client";
import {
  aiApi,
  type ReviewResult,
  type EvidenceRef,
} from "@/lib/api/ai";

const SUB_LABELS: Record<string, string> = {
  documentation: "Documentation",
  connectivity: "Connectivity",
  traceability: "Traceability",
  validation: "Validation",
  governance: "Governance",
};

function gradeTone(grade: string): "success" | "info" | "warning" | "danger" | "default" {
  switch (grade) {
    case "A": return "success";
    case "B": return "success";
    case "C": return "info";
    case "D": return "warning";
    case "F": return "danger";
    default: return "default";
  }
}

function severityTone(sev: string): "danger" | "warning" | "info" | "default" {
  switch (sev) {
    case "CRITICAL": return "danger";
    case "HIGH": return "danger";
    case "MEDIUM": return "warning";
    case "LOW": return "info";
    default: return "default";
  }
}

function priorityTone(p: string): "danger" | "warning" | "info" {
  return p === "HIGH" ? "danger" : p === "MEDIUM" ? "warning" : "info";
}

export default function ReviewPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiApi.reviewArchitecture(projectId);
      setResult(res);
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: { code?: string } } | undefined)?.error?.code ?? null : null;
      const status = err instanceof ApiError ? err.status : null;
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (code === "AI_OUTPUT_TRUNCATED") {
        setError("The project is large and the review was truncated. Increase AI_MAX_TOKENS on the backend and try again.");
      } else if (status === 503 || code === "AI_NOT_CONFIGURED") {
        setError("AI is not configured. Add ANTHROPIC_API_KEY to the backend environment.");
      } else if (status === 502) {
        setError("AI provider failed. Try again.");
      } else if (status === 403) {
        setError(message || "You don't have permission to run an AI review on this project.");
      } else {
        setError(message || "Failed to generate the review.");
      }
    } finally {
      setLoading(false);
    }
  };

  const review = result?.review;
  const health = result?.analysis.health;

  return (
    <div>
      <PageHeader
        title="AI Architecture Review"
        eyebrow={<Badge tone="accent"><Sparkles size={11} /> AI · read-only</Badge>}
        subtitle="A senior-architect interpretation of this project's deterministic analysis. The metrics are computed by the engine; the AI only explains and recommends."
        actions={
          <Button
            type="button"
            variant="primary"
            icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            onClick={generate}
            disabled={loading}
          >
            {loading ? "Generating…" : result ? "Regenerate Review" : "Generate AI Review"}
          </Button>
        }
      />

      <div className="mb-5 rounded-md px-3 py-2 text-[12.5px] flex items-start gap-2"
        style={{
          borderWidth: 1, borderStyle: "solid",
          borderColor: "color-mix(in srgb, var(--c-info) 30%, transparent)",
          background: "color-mix(in srgb, var(--c-info) 8%, transparent)",
          color: "var(--fg-muted)",
        }}>
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-info" />
        <span>AI-generated advisory review. Deterministic metrics remain authoritative — the AI interprets them, it never computes or changes them. No changes are applied to your project.</span>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-md border p-3 text-[12.5px]"
          style={{
            borderColor: "color-mix(in srgb, var(--c-danger) 35%, transparent)",
            background: "color-mix(in srgb, var(--c-danger) 10%, transparent)",
          }}>
          <AlertTriangle size={14} className="mt-0.5 text-danger shrink-0" />
          <span className="text-fg whitespace-pre-line">{error}</span>
        </div>
      )}

      {loading && !result && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div className="text-[14px] font-medium">Analyzing the architecture…</div>
          <div className="text-[12.5px] text-fg-muted">The engine computes the metrics; the AI interprets them. A few seconds.</div>
        </div>
      )}

      {!loading && !result && !error && (
        <Card>
          <div className="flex flex-col items-center text-center gap-2 py-10">
            <ScanSearch size={26} className="text-fg-subtle" />
            <div className="text-[14px] font-medium">No review yet</div>
            <div className="text-[12.5px] text-fg-muted max-w-md">
              Generate an AI architecture review to get a narrative assessment — strengths, risks, blind spots,
              governance, and prioritized recommendations — grounded in this project&apos;s deterministic analysis.
            </div>
          </div>
        </Card>
      )}

      {result && review && health && (
        <div className="flex flex-col gap-5">
          {/* Deterministic score cards (engine-authoritative) */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="md:col-span-1" padded>
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Health</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums">{health.score ?? "—"}</span>
                <Badge tone={gradeTone(health.grade)}>{health.grade}</Badge>
              </div>
              <div className="text-[11.5px] text-fg-muted mt-0.5">{health.label}</div>
            </Card>
            {Object.entries(health.subScores).map(([k, v]) => (
              <Card key={k} padded>
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle truncate">{SUB_LABELS[k] ?? k}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
              </Card>
            ))}
          </div>
          <div className="text-[11px] text-fg-subtle -mt-3">
            Deterministic metrics · analysis {result.analysisHash.slice(0, 12)} · model {result.model}
          </div>

          {/* Executive summary */}
          <Card title="Executive summary">
            <p className="text-[13.5px] leading-relaxed text-fg whitespace-pre-line">{review.executiveSummary}</p>
          </Card>

          {/* Strengths */}
          <FindingSection
            icon={<ShieldCheck size={15} className="text-success" />}
            title="Strengths"
            count={review.strengths.length}
            empty="No notable strengths surfaced."
          >
            {review.strengths.map((f, i) => (
              <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} evidence={f.evidence} />
            ))}
          </FindingSection>

          {/* Risks */}
          <FindingSection
            icon={<TriangleAlert size={15} className="text-warning" />}
            title="Risks"
            count={review.risks.length}
            empty="No architectural risks called out."
          >
            {review.risks.map((f, i) => (
              <Finding
                key={i}
                title={f.title}
                unverified={f.unverified}
                badge={<Badge tone={severityTone(f.severity)}>{f.severity}</Badge>}
                observation={f.observation}
                recommendation={f.recommendation}
                evidence={f.evidence}
              />
            ))}
          </FindingSection>

          {/* Blind spots */}
          <FindingSection
            icon={<ScanSearch size={15} className="text-info" />}
            title="Blind spots"
            count={review.blindSpots.length}
            empty="No blind spots identified."
          >
            {review.blindSpots.map((f, i) => (
              <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
            ))}
          </FindingSection>

          {/* Governance */}
          <FindingSection
            icon={<Users size={15} className="text-accent" />}
            title="Governance"
            count={review.governanceReview.length}
            empty="No governance commentary."
          >
            {review.governanceReview.map((f, i) => (
              <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
            ))}
          </FindingSection>

          {/* Validation commentary */}
          <FindingSection
            icon={<ClipboardCheck size={15} className="text-info" />}
            title="Validation commentary"
            count={review.validationCommentary.length}
            empty="No validation commentary."
          >
            {review.validationCommentary.map((f, i) => (
              <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
            ))}
          </FindingSection>

          {/* Recommendations */}
          <FindingSection
            icon={<Lightbulb size={15} className="text-warning" />}
            title="Recommendations"
            count={review.recommendations.length}
            empty="No recommendations."
          >
            {review.recommendations.map((f, i) => (
              <Finding
                key={i}
                title={f.title}
                unverified={f.unverified}
                badge={<Badge tone={priorityTone(f.priority)}>{f.priority}</Badge>}
                recommendation={f.recommendation}
                evidence={f.evidence}
              />
            ))}
          </FindingSection>
        </div>
      )}
    </div>
  );
}

function FindingSection({ icon, title, count, empty, children }: {
  icon: ReactNode; title: string; count: number; empty: string; children: ReactNode;
}) {
  return (
    <Card
      title={<span className="flex items-center gap-2">{icon} {title} <span className="text-fg-subtle font-normal">{count}</span></span>}
    >
      {count === 0 ? (
        <div className="text-[12.5px] text-fg-subtle">{empty}</div>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </Card>
  );
}

function Finding({ title, badge, observation, recommendation, evidence, unverified }: {
  title: string;
  badge?: ReactNode;
  observation?: string;
  recommendation?: string;
  evidence: EvidenceRef[];
  unverified?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-panel-2 p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13.5px] font-medium">{title}</span>
        {badge}
        {unverified && (
          <Badge tone="warning" className="gap-1"><AlertTriangle size={11} /> unverifiable</Badge>
        )}
      </div>
      {observation && (
        <div className="text-[12.5px] text-fg-muted leading-relaxed">
          <span className="text-fg-subtle font-medium">Observation. </span>{observation}
        </div>
      )}
      {recommendation && (
        <div className="text-[12.5px] text-fg leading-relaxed">
          <span className="text-fg-subtle font-medium">Recommendation. </span>{recommendation}
        </div>
      )}
      {evidence.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          {evidence.map((e, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-px rounded-xs border border-border bg-panel text-fg-subtle"
              title={`${e.kind} evidence`}>
              {e.ref}{e.value != null ? `: ${e.value}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
