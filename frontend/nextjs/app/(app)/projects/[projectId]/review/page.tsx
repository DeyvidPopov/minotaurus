// app/(app)/projects/[projectId]/review/page.tsx — AI Architecture analysis.
// ONE surface, TWO modes (segmented control):
//   • Full Review  — comprehensive architecture assessment (strengths, risks,
//                    blind spots, governance, validation, recommendations).
//   • Advisor      — prioritized next steps: "what should I investigate next?"
// Both are read-only: the deterministic engine computes the numbers (shown
// verbatim in the score cards); the AI only interprets them. Both persist their
// result, reload the latest on open without a new AI call, support history, and
// show a stale/current indicator. There are NO apply / auto-fix controls anywhere
// on this page by design.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles, Loader2, AlertTriangle, ShieldCheck, Lightbulb, TriangleAlert, ScanSearch,
  Users, ClipboardCheck, Clock, Telescope, ListChecks, TrendingUp, Compass, Target,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api/client";
import {
  aiApi,
  type ReviewResult,
  type ReviewListItem,
  type AdvisorResult,
  type AdvisorListItem,
  type EvidenceRef,
} from "@/lib/api/ai";

type Mode = "REVIEW" | "ADVISOR";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "advisor" ? "ADVISOR" : "REVIEW");

  // Per-mode result + history. Each mode loads its latest persisted result on
  // first activation (NO AI call) and is cached thereafter for this mount.
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewListItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [advisorResult, setAdvisorResult] = useState<AdvisorResult | null>(null);
  const [advisorHistory, setAdvisorHistory] = useState<AdvisorListItem[]>([]);
  const [advisorLoading, setAdvisorLoading] = useState(false);

  const [loading, setLoading] = useState(false); // generating (AI call) for the active mode
  const [error, setError] = useState<string | null>(null);

  // Which modes have already attempted their initial load (one-shot, per mount).
  const loadedRef = useRef<Record<Mode, boolean>>({ REVIEW: false, ADVISOR: false });

  // Load the latest persisted result + history for a mode (NO AI call). One-shot
  // per mount (guarded by loadedRef): a 404 (none generated yet) just yields the
  // empty state. Only reads setters / props / the ref, so a fresh closure each
  // render is fine — the effect below intentionally doesn't depend on it.
  const loadMode = async (m: Mode) => {
    if (loadedRef.current[m]) return;
    loadedRef.current[m] = true;
    const setBusy = m === "REVIEW" ? setReviewLoading : setAdvisorLoading;
    setBusy(true);
    try {
      if (m === "REVIEW") {
        const [latest, list] = await Promise.allSettled([
          aiApi.getLatestReview(projectId),
          aiApi.listReviews(projectId),
        ]);
        if (latest.status === "fulfilled") setReviewResult(latest.value);
        else if (!(latest.reason instanceof ApiError && latest.reason.status === 404)) {
          setError(latest.reason instanceof Error ? latest.reason.message : "Failed to load the saved review.");
        }
        if (list.status === "fulfilled") setReviewHistory(list.value);
      } else {
        const [latest, list] = await Promise.allSettled([
          aiApi.getLatestAdvisor(projectId),
          aiApi.listAdvisors(projectId),
        ]);
        if (latest.status === "fulfilled") setAdvisorResult(latest.value);
        else if (!(latest.reason instanceof ApiError && latest.reason.status === 404)) {
          setError(latest.reason instanceof Error ? latest.reason.message : "Failed to load the saved advisory.");
        }
        if (list.status === "fulfilled") setAdvisorHistory(list.value);
      }
    } finally {
      setBusy(false);
    }
  };

  // On open / project change: reset caches and load the currently-active mode.
  // The other mode loads lazily when first selected.
  useEffect(() => {
    loadedRef.current = { REVIEW: false, ADVISOR: false };
    setReviewResult(null); setReviewHistory([]);
    setAdvisorResult(null); setAdvisorHistory([]);
    setError(null);
    void loadMode(mode);
    // mode switches are handled in switchMode; only re-run on project change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setError(null);
    router.replace(m === "ADVISOR" ? `${pathname}?mode=advisor` : pathname, { scroll: false });
    void loadMode(m);
  };

  const noun = mode === "REVIEW" ? "review" : "advisory";

  const reportError = (err: unknown) => {
    const code = err instanceof ApiError ? (err.body as { error?: { code?: string } } | undefined)?.error?.code ?? null : null;
    const status = err instanceof ApiError ? err.status : null;
    const message = err instanceof Error ? err.message : "Something went wrong";
    if (code === "AI_OUTPUT_TRUNCATED") {
      setError(`The AI ${noun} was too detailed and reached the output limit.\n\nTry again — it aims for a shorter, more focused set of findings.`);
    } else if (status === 503 || code === "AI_NOT_CONFIGURED") {
      setError("AI is not configured. Add ANTHROPIC_API_KEY to the backend environment.");
    } else if (status === 502) {
      setError("AI provider failed. Try again.");
    } else if (status === 403) {
      setError(message || `You don't have permission to run an AI ${noun} on this project.`);
    } else {
      setError(message || `Failed to generate the ${noun}.`);
    }
  };

  // Generate a NEW result for the active mode (explicit user action). Creates a
  // new persisted session; never overwrites history.
  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "REVIEW") {
        setReviewResult(await aiApi.reviewArchitecture(projectId));
        try { setReviewHistory(await aiApi.listReviews(projectId)); } catch { /* non-fatal */ }
      } else {
        setAdvisorResult(await aiApi.generateAdvisor(projectId));
        try { setAdvisorHistory(await aiApi.listAdvisors(projectId)); } catch { /* non-fatal */ }
      }
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  };

  // Load a previous result by id (read-only — no AI call, no mutation).
  const loadById = async (id: string) => {
    if (!id || loading) return;
    setError(null);
    try {
      if (mode === "REVIEW") {
        if (id === reviewResult?.id) return;
        setReviewResult(await aiApi.getReviewById(projectId, id));
      } else {
        if (id === advisorResult?.id) return;
        setAdvisorResult(await aiApi.getAdvisorById(projectId, id));
      }
    } catch (err) {
      reportError(err);
    }
  };

  const activeResult = mode === "REVIEW" ? reviewResult : advisorResult;
  const activeHistory: Array<{ id: string; generatedAt: string }> = mode === "REVIEW" ? reviewHistory : advisorHistory;
  const initialLoading = mode === "REVIEW" ? reviewLoading : advisorLoading;
  const health = activeResult?.analysis.health;

  return (
    <div className="px-8 py-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="AI Architecture Review"
        subtitle={
          mode === "REVIEW"
            ? "A senior-architect interpretation of this project's deterministic analysis. The metrics are computed by the engine; the AI only explains and recommends."
            : "Prioritized next steps. Validation tells you what is wrong; the Advisor explains why it matters and what to investigate next. It reads your architecture — it never changes it."
        }
        actions={
          <div className="flex items-center gap-2">
            {activeHistory.length > 0 && (
              <select
                aria-label={`${mode === "REVIEW" ? "Review" : "Advisor"} history`}
                value={activeResult?.id ?? ""}
                onChange={(e) => loadById(e.target.value)}
                disabled={loading || initialLoading}
                className="h-8 px-2 rounded-sm border border-border bg-panel-2 text-[12.5px] text-fg-muted focus:outline-none focus:border-border-strong max-w-[230px]"
              >
                {!activeResult?.id && <option value="">{mode === "REVIEW" ? "Current review" : "Current advisory"}</option>}
                {activeHistory.map((h, i) => (
                  <option key={h.id} value={h.id}>
                    {i === 0 ? "Latest" : mode === "REVIEW" ? "Review" : "Advisory"} · {formatTs(h.generatedAt)}
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
              {loading
                ? mode === "REVIEW" ? "Generating…" : "Analyzing…"
                : activeResult
                  ? mode === "REVIEW" ? "Generate New Review" : "Regenerate Advisory"
                  : mode === "REVIEW" ? "Generate AI Review" : "Generate Advisory"}
            </Button>
          </div>
        }
      />

      {/* Mode switch — one surface, two modes. */}
      <ModeTabs mode={mode} onChange={switchMode} disabled={loading} />

      <div className="mb-5 rounded-md px-3 py-2 text-[12.5px] flex items-start gap-2"
        style={{
          borderWidth: 1, borderStyle: "solid",
          borderColor: "color-mix(in srgb, var(--c-info) 30%, transparent)",
          background: "color-mix(in srgb, var(--c-info) 8%, transparent)",
          color: "var(--fg-muted)",
        }}>
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-info" />
        <span>
          {mode === "REVIEW"
            ? "AI-generated advisory review. Deterministic metrics remain authoritative — the AI interprets them, it never computes or changes them. No changes are applied to your project."
            : "Read-only architectural advisory. Every point is grounded in the deterministic analysis — the AI interprets and prioritizes, it never computes a score, edits a finding, or changes your project. There are no fix or apply actions here."}
        </span>
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

      {initialLoading && !activeResult && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div className="text-[14px] font-medium">Loading saved {noun}…</div>
          <div className="text-[12.5px] text-fg-muted">Reusing the last {noun} — no AI call.</div>
        </div>
      )}

      {loading && !activeResult && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div className="text-[14px] font-medium">{mode === "REVIEW" ? "Analyzing the architecture…" : "Consulting the architecture…"}</div>
          <div className="text-[12.5px] text-fg-muted">The engine computes the metrics; the AI interprets them. A few seconds.</div>
        </div>
      )}

      {!initialLoading && !loading && !activeResult && !error && (
        <Card>
          <div className="flex flex-col items-center text-center gap-2 py-10">
            {mode === "REVIEW" ? <ScanSearch size={26} className="text-fg-subtle" /> : <Compass size={26} className="text-fg-subtle" />}
            <div className="text-[14px] font-medium">{mode === "REVIEW" ? "No AI review generated yet" : "No advisory generated yet"}</div>
            <div className="text-[12.5px] text-fg-muted max-w-md">
              {mode === "REVIEW"
                ? "Generate an AI architecture review to get a narrative assessment — strengths, risks, blind spots, governance, and prioritized recommendations — grounded in this project's deterministic analysis. Once generated, it's saved and reused on refresh."
                : "Generate an advisory to get a focused action plan — a short snapshot, the top focus areas, a few opportunities, and prioritized next steps — so you know what to work on next. It's saved and reused on refresh. Nothing is changed."}
            </div>
          </div>
        </Card>
      )}

      {activeResult && health && (
        <div className="flex flex-col gap-5">
          {activeResult.truncated && (
            <div className="rounded-md px-3 py-2 text-[12.5px] flex items-start gap-2"
              style={{
                borderWidth: 1, borderStyle: "solid",
                borderColor: "color-mix(in srgb, var(--c-warning) 35%, transparent)",
                background: "color-mix(in srgb, var(--c-warning) 8%, transparent)",
              }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <span className="text-fg">
                Partial {noun} generated. Some sections may be incomplete
                {activeResult.missingSections.length > 0 ? ` (${activeResult.missingSections.join(", ")})` : ""}. Regenerate to try for a complete {noun}.
              </span>
            </div>
          )}

          {/* Current state: generated time, model, stale/current. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} /> Generated {formatTs(activeResult.generatedAt)}
            </span>
            <span>Model <span className="text-fg">{activeResult.model}</span></span>
            <span className="inline-flex items-center gap-1.5">
              Status{" "}
              {activeResult.stale
                ? <Badge tone="warning">Project changed since this {noun}</Badge>
                : <Badge tone="success">Current</Badge>}
            </span>
          </div>

          {mode === "REVIEW" ? (
            <>
              {/* Full audit: the deterministic score grid is the Review's signature.
                  Each value drives a subtle progress strip; content sits above it. */}
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
                Deterministic metrics (engine-authoritative) · analysis {activeResult.analysisHash.slice(0, 12) || "—"}
              </div>

              <Card title="Executive summary">
                <p className="text-[13.5px] leading-relaxed text-fg whitespace-pre-line">
                  {reviewResult!.review.executiveSummary}
                </p>
              </Card>

              <ReviewSections result={reviewResult!} />
            </>
          ) : (
            // Advisor: a roadmap, not an audit. No score grid — a compact health
            // line keeps the snapshot lightweight; Focus Areas + Next Steps dominate.
            <AdvisorBody result={advisorResult!} health={health} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Mode switch ──────────────────────────────────────────────────────────────

function ModeTabs({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  const tab = (m: Mode, label: string, icon: ReactNode) => {
    const active = mode === m;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        disabled={disabled}
        onClick={() => onChange(m)}
        className={[
          "flex items-center gap-1.5 px-3 h-8 rounded-sm text-[12.5px] font-medium transition-colors disabled:opacity-60",
          active ? "bg-panel text-fg shadow-sm" : "text-fg-muted hover:text-fg",
        ].join(" ")}
      >
        <span className={active ? "text-accent" : ""}>{icon}</span>
        {label}
      </button>
    );
  };
  return (
    <div role="tablist" aria-label="Analysis mode" className="mb-4 inline-flex items-center gap-1 p-1 rounded-md border border-border bg-panel-2">
      {tab("REVIEW", "Full Review", <ScanSearch size={14} />)}
      {tab("ADVISOR", "Advisor", <Telescope size={14} />)}
    </div>
  );
}

// ── Full Review sections ─────────────────────────────────────────────────────

function ReviewSections({ result }: { result: ReviewResult }) {
  const review = result.review;
  return (
    <>
      <FindingSection icon={<ShieldCheck size={15} className="text-success" />} title="Strengths" count={review.strengths.length} empty="No notable strengths surfaced.">
        {review.strengths.map((f, i) => (
          <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} evidence={f.evidence} />
        ))}
      </FindingSection>

      <FindingSection icon={<TriangleAlert size={15} className="text-warning" />} title="Risks" count={review.risks.length} empty="No architectural risks called out.">
        {review.risks.map((f, i) => (
          <Finding key={i} title={f.title} unverified={f.unverified} badge={<Badge tone={severityTone(f.severity)}>{f.severity}</Badge>} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
        ))}
      </FindingSection>

      <FindingSection icon={<ScanSearch size={15} className="text-info" />} title="Blind spots" count={review.blindSpots.length} empty="No blind spots identified.">
        {review.blindSpots.map((f, i) => (
          <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
        ))}
      </FindingSection>

      <FindingSection icon={<Users size={15} className="text-accent" />} title="Governance" count={review.governanceReview.length} empty="No governance commentary.">
        {review.governanceReview.map((f, i) => (
          <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
        ))}
      </FindingSection>

      <FindingSection icon={<ClipboardCheck size={15} className="text-info" />} title="Validation commentary" count={review.validationCommentary.length} empty="No validation commentary.">
        {review.validationCommentary.map((f, i) => (
          <Finding key={i} title={f.title} unverified={f.unverified} observation={f.observation} recommendation={f.recommendation} evidence={f.evidence} />
        ))}
      </FindingSection>

      <FindingSection icon={<Lightbulb size={15} className="text-warning" />} title="Recommendations" count={review.recommendations.length} empty="No recommendations.">
        {review.recommendations.map((f, i) => (
          <Finding key={i} title={f.title} unverified={f.unverified} badge={<Badge tone={priorityTone(f.priority)}>{f.priority}</Badge>} recommendation={f.recommendation} evidence={f.evidence} />
        ))}
      </FindingSection>
    </>
  );
}

// ── Advisor body (a roadmap, not an audit) ───────────────────────────────────
// Differentiation from Full Review is deliberate and visual: NO score grid; a
// lightweight snapshot + Opportunities; and two DOMINANT sections — Current Focus
// Areas and Recommended Next Steps. Coach, not auditor.

function AdvisorBody({ result, health }: { result: AdvisorResult; health: AdvisorResult["analysis"]["health"] }) {
  const report = result.report;
  return (
    <>
      {/* Lightweight Executive Snapshot: a compact health line + a short summary. */}
      <div className="rounded-md border border-border bg-panel-2 px-4 py-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: scoreColorVar(health.score) }} />
            Architecture health <span className="text-fg font-semibold tabular-nums">{health.score ?? "—"}</span>
            <span className="text-fg-subtle">· {health.label}</span>
          </span>
          <span className="text-fg-subtle">·</span>
          <span className="text-fg-subtle">analysis {result.analysisHash.slice(0, 12) || "—"}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-fg whitespace-pre-line">{report.executiveSummary}</p>
      </div>

      {/* DOMINANT: Current Focus Areas. */}
      <RoadmapSection
        icon={<Target size={16} className="text-accent" />}
        title="Current focus areas"
        subtitle="The few things that deserve attention now"
        count={report.focusAreas.length}
        empty="No focus areas surfaced."
      >
        {report.focusAreas.map((f, i) => (
          <NoteBox key={i} title={f.title} detail={f.detail} evidence={f.evidence} />
        ))}
      </RoadmapSection>

      {/* Lightweight: Opportunities (a compact list, not a full audit section). */}
      <Card
        title={<span className="flex items-center gap-2 text-fg-muted text-[12.5px] font-medium"><TrendingUp size={14} className="text-info" /> Opportunities <span className="text-fg-subtle font-normal">{report.opportunities.length}</span></span>}
      >
        {report.opportunities.length === 0 ? (
          <div className="text-[12.5px] text-fg-subtle">No opportunities identified.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {report.opportunities.map((o, i) => (
              <NoteBox key={i} title={o.title} detail={o.detail} evidence={o.evidence} />
            ))}
          </div>
        )}
      </Card>

      {/* DOMINANT: Recommended Next Steps — numbered, prioritized roadmap. */}
      <RoadmapSection
        icon={<ListChecks size={16} className="text-accent" />}
        title="Recommended next steps"
        subtitle="Prioritized actions — start at the top"
        count={report.recommendations.length}
        empty="No recommendations."
      >
        {report.recommendations.map((r, i) => (
          <NextStepItem key={i} index={i + 1} title={r.title} priority={r.priority} rationale={r.rationale} evidence={r.evidence} />
        ))}
      </RoadmapSection>
    </>
  );
}

// A visually DOMINANT section: accent-bubbled icon, larger header, subtitle, and a
// distinct framed body — so the Advisor's key sections stand apart from the
// lightweight snapshot/opportunities (and from Full Review's audit cards).
function RoadmapSection({ icon, title, subtitle, count, empty, children }: {
  icon: ReactNode; title: string; subtitle: string; count: number; empty: string; children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-panel overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-panel-2">
        <span className="grid place-items-center w-7 h-7 rounded-md shrink-0" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>{icon}</span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight">
            {title} <span className="text-fg-subtle font-normal text-[12px]">{count}</span>
          </div>
          <div className="text-[11.5px] text-fg-muted">{subtitle}</div>
        </div>
      </div>
      <div className="p-3">
        {count === 0 ? (
          <div className="text-[12.5px] text-fg-subtle">{empty}</div>
        ) : (
          <div className="flex flex-col gap-2.5">{children}</div>
        )}
      </div>
    </section>
  );
}

// A boxed note used by both Focus Areas and Opportunities so every Advisor
// category shares the same card design.
function NoteBox({ title, detail, evidence }: {
  title: string; detail: string; evidence: EvidenceRef[];
}) {
  return (
    <div className="rounded-md border border-border bg-panel-2 p-3 flex flex-col gap-1.5">
      <div className="text-[13.5px] font-semibold">{title}</div>
      <div className="text-[12.5px] text-fg-muted leading-relaxed">{detail}</div>
      {evidence.length > 0 && <EvidenceRow evidence={evidence} />}
    </div>
  );
}

function NextStepItem({ index, title, priority, rationale, evidence }: {
  index: number; title: string; priority: string; rationale: string; evidence: EvidenceRef[];
}) {
  return (
    <div className="rounded-md border border-border bg-panel-2 p-3 flex gap-3">
      <div className="shrink-0 grid place-items-center w-6 h-6 rounded-full text-[12px] font-semibold text-accent tabular-nums"
        style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
        {index}
      </div>
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold">{title}</span>
          <Badge tone={priorityTone(priority)}>{priority}</Badge>
        </div>
        <div className="text-[12.5px] text-fg leading-relaxed">
          <span className="text-fg-subtle font-medium">Rationale. </span>{rationale}
        </div>
        {evidence.length > 0 && <EvidenceRow evidence={evidence} />}
      </div>
    </div>
  );
}

function EvidenceRow({ evidence }: { evidence: EvidenceRef[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      {evidence.map((e, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-px rounded-xs border border-border bg-panel text-fg-subtle"
          title={`${e.kind} evidence`}>
          {e.ref}{e.value != null ? `: ${e.value}` : ""}
        </span>
      ))}
    </div>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────

// Subtle progress layer rendered as the card's BOTTOM BORDER. Fills 0 → value on mount.
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
    <Card title={<span className="flex items-center gap-2">{icon} {title} <span className="text-fg-subtle font-normal">{count}</span></span>}>
      {count === 0 ? (
        <div className="text-[12.5px] text-fg-subtle">{empty}</div>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </Card>
  );
}

// One finding card. Used by both modes: Full Review passes observation +
// recommendation; Advisor passes a detail (as observation) or a rationale (as a
// labelled recommendation). `unverified` only ever set by Full Review.
function Finding({ title, badge, observation, recommendation, recommendationLabel, evidence, unverified }: {
  title: string;
  badge?: ReactNode;
  observation?: string;
  recommendation?: string;
  recommendationLabel?: string;
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
          <span className="text-fg-subtle font-medium">{recommendationLabel ?? "Recommendation"}. </span>{recommendation}
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
