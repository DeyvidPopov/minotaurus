// app/(app)/projects/[projectId]/review/page.tsx — AI Architecture Review.
// Read-only: the deterministic engine computes the numbers (shown verbatim in the
// score cards); the AI only interprets them in the narrative below. There are no
// apply / auto-fix controls anywhere on this page by design.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sparkles, Loader2, AlertTriangle, ShieldCheck, Lightbulb, TriangleAlert, ScanSearch, Users, ClipboardCheck, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/client";
import {
  aiApi,
  type ReviewResult,
  type ReviewListItem,
  type EvidenceRef,
} from "@/lib/api/ai";

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const SUB_LABELS: Record<string, string> = {
  documentation: "Documentation",
  connectivity: "Connectivity",
  traceability: "Traceability",
  validation: "Validation",
  governance: "Governance",
};

// Same semantic tokens + thresholds as the backend GRADE_BANDS
// (≥75 → success, 60–74 → info, 40–59 → warning, <40 → danger). Drives the
// metric-card progress strip; reuses the existing --c-* palette, no new colors.
function scoreColorVar(score: number | null): string {
  if (score == null) return "var(--border-strong)";
  if (score >= 75) return "var(--c-success)";
  if (score >= 60) return "var(--c-info)";
  if (score >= 40) return "var(--c-warning)";
  return "var(--c-danger)";
}

// Qualitative band label, matching the backend GRADE_BANDS wording the composite
// Health label uses — applied per sub-score so every card reads "number + band".
function scoreLabel(score: number | null): string {
  if (score == null) return "—";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Healthy";
  if (score >= 60) return "Fair";
  if (score >= 40) return "At Risk";
  return "Critical";
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
  const [loading, setLoading] = useState(false);          // generating (AI call)
  const [initialLoading, setInitialLoading] = useState(true); // first fetch of persisted review
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [history, setHistory] = useState<ReviewListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // On open: load the latest persisted review (NO AI call) + history. A 404 just
  // means none exists yet → empty state. We never auto-generate.
  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);
    Promise.allSettled([aiApi.getLatestReview(projectId), aiApi.listReviews(projectId)])
      .then(([latest, list]) => {
        if (cancelled) return;
        if (latest.status === "fulfilled") {
          setResult(latest.value);
        } else if (!(latest.reason instanceof ApiError && latest.reason.status === 404)) {
          setError(latest.reason instanceof Error ? latest.reason.message : "Failed to load the saved review.");
        }
        if (list.status === "fulfilled") setHistory(list.value);
      })
      .finally(() => { if (!cancelled) setInitialLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const reportError = (err: unknown) => {
    const code = err instanceof ApiError ? (err.body as { error?: { code?: string } } | undefined)?.error?.code ?? null : null;
    const status = err instanceof ApiError ? err.status : null;
    const message = err instanceof Error ? err.message : "Something went wrong";
    if (code === "AI_OUTPUT_TRUNCATED") {
      setError("The AI review was too detailed and reached the output limit.\n\nTry again — the review aims for a shorter, more focused set of findings.");
    } else if (status === 503 || code === "AI_NOT_CONFIGURED") {
      setError("AI is not configured. Add ANTHROPIC_API_KEY to the backend environment.");
    } else if (status === 502) {
      setError("AI provider failed. Try again.");
    } else if (status === 403) {
      setError(message || "You don't have permission to run an AI review on this project.");
    } else {
      setError(message || "Failed to generate the review.");
    }
  };

  // Generate a NEW review (explicit user action). Creates a new audit session;
  // never overwrites history.
  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiApi.reviewArchitecture(projectId);
      setResult(res);
      try { setHistory(await aiApi.listReviews(projectId)); } catch { /* non-fatal */ }
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  };

  // Load a previous review by id (read-only — no AI call, no mutation).
  const loadReview = async (id: string) => {
    if (!id || id === result?.id || loading) return;
    setError(null);
    try {
      setResult(await aiApi.getReviewById(projectId, id));
    } catch (err) {
      reportError(err);
    }
  };

  const review = result?.review;
  const health = result?.analysis.health;

  return (
    <div className="px-8 py-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="AI Architecture Review"
        subtitle="A senior-architect interpretation of this project's deterministic analysis. The metrics are computed by the engine; the AI only explains and recommends."
        actions={
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <select
                aria-label="Review history"
                value={result?.id ?? ""}
                onChange={(e) => loadReview(e.target.value)}
                disabled={loading || initialLoading}
                className="h-8 px-2 rounded-sm border border-border bg-panel-2 text-[12.5px] text-fg-muted focus:outline-none focus:border-border-strong max-w-[230px]"
              >
                {!result?.id && <option value="">Current review</option>}
                {history.map((h, i) => (
                  <option key={h.id} value={h.id}>
                    {i === 0 ? "Latest" : "Review"} · {formatTs(h.generatedAt)}
                  </option>
                ))}
              </select>
            )}
            <Button
              type="button"
              variant="primary"
              icon={loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              onClick={generate}
              disabled={loading}
            >
              {loading ? "Generating…" : result ? "Generate New Review" : "Generate AI Review"}
            </Button>
          </div>
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

      {initialLoading && !result && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div className="text-[14px] font-medium">Loading saved review…</div>
          <div className="text-[12.5px] text-fg-muted">Reusing the last review — no AI call.</div>
        </div>
      )}

      {loading && !result && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div className="text-[14px] font-medium">Analyzing the architecture…</div>
          <div className="text-[12.5px] text-fg-muted">The engine computes the metrics; the AI interprets them. A few seconds.</div>
        </div>
      )}

      {!initialLoading && !loading && !result && !error && (
        <Card>
          <div className="flex flex-col items-center text-center gap-2 py-10">
            <ScanSearch size={26} className="text-fg-subtle" />
            <div className="text-[14px] font-medium">No AI review generated yet</div>
            <div className="text-[12.5px] text-fg-muted max-w-md">
              Generate an AI architecture review to get a narrative assessment — strengths, risks, blind spots,
              governance, and prioritized recommendations — grounded in this project&apos;s deterministic analysis.
              Once generated, it&apos;s saved and reused on refresh.
            </div>
          </div>
        </Card>
      )}

      {result && review && health && (
        <div className="flex flex-col gap-5">
          {result.truncated && (
            <div className="rounded-md px-3 py-2 text-[12.5px] flex items-start gap-2"
              style={{
                borderWidth: 1, borderStyle: "solid",
                borderColor: "color-mix(in srgb, var(--c-warning) 35%, transparent)",
                background: "color-mix(in srgb, var(--c-warning) 8%, transparent)",
              }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <span className="text-fg">
                Partial review generated. Some sections may be incomplete
                {result.missingSections.length > 0 ? ` (${result.missingSections.join(", ")})` : ""}. Regenerate to try for a complete review.
              </span>
            </div>
          )}

          {/* Current review state */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} /> Generated {formatTs(result.generatedAt)}
            </span>
            <span>Model <span className="text-fg">{result.model}</span></span>
            <span className="inline-flex items-center gap-1.5">
              Status{" "}
              {result.stale
                ? <Badge tone="warning">Project changed since this review</Badge>
                : <Badge tone="success">Current</Badge>}
            </span>
          </div>

          {/* Deterministic score cards (engine-authoritative) — value drives a
              subtle progress strip; content sits above it via z-index. */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="md:col-span-1 relative" padded>
              <ScoreStrip value={health.score} />
              <div className="relative z-10">
                <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Health</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums">{health.score ?? "—"}</div>
                <div className="text-[11.5px] text-fg-muted mt-0.5">{health.label}</div>
              </div>
            </Card>
            {Object.entries(health.subScores).map(([k, v]) => (
              <Card key={k} className="relative" padded>
                <ScoreStrip value={v} />
                <div className="relative z-10">
                  <div className="text-[11px] uppercase tracking-wider text-fg-subtle truncate">{SUB_LABELS[k] ?? k}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
                  <div className="text-[11.5px] text-fg-muted mt-0.5">{scoreLabel(v)}</div>
                </div>
              </Card>
            ))}
          </div>
          <div className="text-[11px] text-fg-subtle -mt-3">
            Deterministic metrics (engine-authoritative) · analysis {result.analysisHash.slice(0, 12) || "—"}
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

// Subtle progress layer rendered as the card's BOTTOM BORDER: a full-width strip
// flush to the bottom edge (the card's rounded-lg + overflow-hidden clip it to
// the corner radius). The faint track is the unfilled border; the score fills it
// left → right. Color comes from scoreColorVar (existing --c-* palette). Fills
// 0 → value on mount.
function ScoreStrip({ value }: { value: number | null }) {
  const target = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = scoreColorVar(value);
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <div
        className="h-full transition-[width] duration-700 ease-out"
        style={{
          width: `${w}%`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 45%, transparent), color-mix(in srgb, ${color} 80%, transparent))`,
          boxShadow: `0 0 6px color-mix(in srgb, ${color} 35%, transparent)`,
        }}
      />
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
