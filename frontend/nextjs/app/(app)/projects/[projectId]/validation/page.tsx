// app/(app)/projects/[projectId]/validation/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Check, ChevronRight, ArrowUpRight, Wand2, X, Loader2, AlertTriangle, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { MermaidPreview } from "@/components/mermaid-preview";
import { CATEGORIES_LIST } from "@/lib/mock-data-extra";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { Empty } from "@/components/ui/empty";
import { validationApi } from "@/lib/api";
import { projectsApi } from "@/lib/api/projects";
import { artifactsApi } from "@/lib/api/artifacts";
import { errorMessage } from "@/lib/api/error-message";
import { useValidationCounts } from "@/lib/validation-counts";
import type { Artifact, IssueStatus, IssueTarget, Project, QuickFixPreview, RemediationCandidate, RemediationPreview, ValidationIssue } from "@/lib/types";
import { IssueRow } from "./issue-row";
import { ValidationStats } from "./validation-stats";
import { targetHref } from "./issue-target";

// REVIEW-required candidate picker. Shows deterministic suggestions; the user must
// explicitly select one before Apply is enabled. Nothing is created until Apply.
function RemediationModal({
  preview,
  loading,
  applying,
  selected,
  onSelect,
  onCancel,
  onApply,
  projectId,
  target,
}: {
  preview: RemediationPreview | null;
  loading: boolean;
  applying: boolean;
  selected: RemediationCandidate | null;
  onSelect: (c: RemediationCandidate) => void;
  onCancel: () => void;
  onApply: () => void;
  projectId: string;
  target: IssueTarget | null;
}) {
  const confColor = (c: RemediationCandidate["confidence"]) =>
    c === "HIGH" ? "var(--c-success)" : c === "MEDIUM" ? "var(--c-warning)" : "var(--fg-muted)";
  const candKey = (c: RemediationCandidate) => `${c.targetId}|${c.relationType ?? ""}`;
  const [openEvidence, setOpenEvidence] = useState<Set<string>>(new Set());
  const toggleEvidence = (k: string) =>
    setOpenEvidence((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // A candidate may be applied even at LOW confidence (candidates are never hidden);
  // Apply is gated only on an explicit selection.
  const canApply = !!preview && !!selected && !applying && !loading;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={applying ? undefined : onCancel}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-[620px] max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <GitBranch size={15} aria-hidden="true" style={{ color: "var(--accent)" }} />
            <h2 className="text-[14px] font-semibold">{preview?.title ?? "Review Fix"}</h2>
            <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Review required</span>
          </div>
          <button type="button" onClick={onCancel} disabled={applying} aria-label="Close"
            className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover disabled:opacity-40">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {loading || !preview ? (
            <div className="flex items-center gap-2 text-fg-muted text-[13px] py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Finding candidates…
            </div>
          ) : (
            <div className="grid gap-3">
              {preview.candidates.length > 0 && (
                <div className="grid gap-1.5">
                  <p className="text-[12px] text-fg-muted mb-1">
                    Select a suggested target. Nothing is created until you click Apply.
                  </p>
                  {preview.candidates.map((c) => {
                    const key = candKey(c);
                    const isSel = selected?.targetId === c.targetId && (selected?.relationType ?? null) === (c.relationType ?? null);
                    const showWhy = openEvidence.has(key);
                    return (
                      <div
                        key={key}
                        className="rounded-md border transition-colors"
                        style={{ borderColor: isSel ? "var(--accent)" : "var(--border)", background: isSel ? "var(--panel-hover)" : "transparent" }}
                      >
                        <button type="button" onClick={() => onSelect(c)} className="flex items-center gap-2.5 w-full px-3 py-2 text-left">
                          <span className="w-3.5 h-3.5 rounded-full border shrink-0 grid place-items-center"
                            style={{ borderColor: isSel ? "var(--accent)" : "var(--border)" }}>
                            {isSel && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <TypeChip type={c.targetType as Artifact["type"]} />
                              <span className="font-medium text-[13px] truncate">{c.targetTitle}</span>
                              {c.relationType && <Badge mono>{c.relationType}</Badge>}
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded"
                            style={{ color: confColor(c.confidence), border: `1px solid ${confColor(c.confidence)}` }}>
                            {c.confidence}
                          </span>
                          <span className="text-[11px] font-mono text-fg-muted shrink-0 tabular-nums">{c.score}/100</span>
                        </button>
                        <button type="button" onClick={() => toggleEvidence(key)} aria-expanded={showWhy}
                          className="flex items-center gap-1 px-3 pb-2 text-[11px] text-fg-muted hover:text-fg">
                          <ChevronRight size={11} className={`transition-transform motion-reduce:transition-none ${showWhy ? "rotate-90" : ""}`} />
                          Why suggested?
                        </button>
                        {showWhy && (
                          <ul className="px-3 pb-2.5 pl-[34px] grid gap-1">
                            {c.evidence.map((e, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-fg-muted">
                                <Check size={11} className="mt-0.5 shrink-0" style={{ color: "var(--c-success)" }} aria-hidden="true" />
                                <span className="flex-1">{e.explanation}</span>
                                <span className="font-mono shrink-0" style={{ color: "var(--accent)" }}>+{e.weight}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {preview.manualFallback && (
                <div className="grid gap-2 rounded-md border border-border bg-bg/40 p-3">
                  <div className="flex gap-2 text-[12px]" style={{ color: "var(--c-warning)" }}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      {preview.candidates.length > 0
                        ? "No high-confidence suggestions found. You can still pick one above, or create the relation manually."
                        : "No safe deterministic candidates found. Create the relation manually."}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {target?.id && (
                      <Link href={targetHref(projectId, target)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-[12px] font-medium hover:bg-panel-hover hover:text-accent transition-colors">
                        <ArrowUpRight size={12} aria-hidden="true" /> Open artifact
                      </Link>
                    )}
                    <Link href={`/projects/${projectId}/graph`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-[12px] font-medium hover:bg-panel-hover hover:text-accent transition-colors">
                      <ArrowUpRight size={12} aria-hidden="true" /> Open graph
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border">
          <Button variant="ghost" onClick={onCancel} disabled={applying}>Cancel</Button>
          {preview && preview.candidates.length > 0 && (
            <Button
              variant="primary"
              onClick={onApply}
              disabled={!canApply}
              icon={applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            >
              {applying ? "Applying…" : "Apply selected"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Preview Fix modal: shows the deterministic generated content and applies it on
// confirm. Apply is owned by the parent (re-runs validation + refreshes the list).
function QuickFixModal({
  preview,
  loading,
  applying,
  onCancel,
  onApply,
}: {
  preview: QuickFixPreview | null;
  loading: boolean;
  applying: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const canApply = !!preview && preview.applicable && !applying && !loading;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={applying ? undefined : onCancel}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-[680px] max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 size={15} aria-hidden="true" style={{ color: "var(--accent)" }} />
            <h2 className="text-[14px] font-semibold">{preview?.title ?? "Preview Fix"}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover disabled:opacity-40"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {loading || !preview ? (
            <div className="flex items-center gap-2 text-fg-muted text-[13px] py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading preview…
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="text-[12.5px] text-fg-muted leading-relaxed">{preview.description}</p>

              {!preview.applicable && (
                <div
                  className="flex gap-2 rounded-md border px-3 py-2 text-[12px]"
                  style={{ borderColor: "var(--c-warning)", color: "var(--c-warning)" }}
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{preview.reason ?? "This quick fix no longer applies."}</span>
                </div>
              )}

              <div>
                <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle mb-1.5">Generated content</div>
                {preview.contentKind === "mermaid" ? (
                  <div className="grid gap-2">
                    <div className="border border-border rounded-md bg-bg overflow-auto h-[200px]">
                      <MermaidPreview source={preview.content} className="w-full h-full" />
                    </div>
                    <pre className="border border-border rounded-md bg-bg p-3 text-[11.5px] font-mono whitespace-pre-wrap overflow-auto max-h-[140px]">{preview.content}</pre>
                  </div>
                ) : (
                  <pre className="border border-border rounded-md bg-bg p-3 text-[11.5px] font-mono whitespace-pre-wrap overflow-auto max-h-[320px]">{preview.content}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border">
          <Button variant="ghost" onClick={onCancel} disabled={applying}>Cancel</Button>
          <Button
            variant="primary"
            onClick={onApply}
            disabled={!canApply}
            icon={applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          >
            {applying ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ValidationPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;

  const [project, setProject] = useState<Project | null>(null);
  const [artifactsById, setArtifactsById] = useState<Record<string, Artifact>>({});
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  const [sev, setSev] = useState("ALL");
  const [cat, setCat] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Quick Fix (SAFE) modal state.
  const [fixIssueId, setFixIssueId] = useState<string | null>(null);
  const [fixPreview, setFixPreview] = useState<QuickFixPreview | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixApplying, setFixApplying] = useState(false);

  // Relation Remediation (REVIEW-required) modal state.
  const [reviewIssueId, setReviewIssueId] = useState<string | null>(null);
  const [reviewPreview, setReviewPreview] = useState<RemediationPreview | null>(null);
  const [reviewTarget, setReviewTarget] = useState<IssueTarget | null>(null);
  const [reviewSelected, setReviewSelected] = useState<RemediationCandidate | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewApplying, setReviewApplying] = useState(false);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const load = async () => {
    try {
      const [p, arts, vi] = await Promise.all([
        projectsApi.get(projectId),
        artifactsApi.list(projectId),
        validationApi.list(projectId),
      ]);
      setProject(p);
      setArtifactsById(Object.fromEntries(arts.map((a) => [a.id, a])));
      setIssues(vi);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to load validation"));
      setIssues([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keep the sidebar's Validation badge in sync as issues are run/resolved/fixed.
  const setValidationCount = useValidationCounts((s) => s.setCount);
  useEffect(() => {
    if (issues) setValidationCount(projectId, issues.filter((i) => i.status === "OPEN").length);
  }, [issues, projectId, setValidationCount]);

  const items = issues ?? [];
  const visible = items.filter((i) =>
    (sev === "ALL" || i.severity === sev) &&
    (cat === "ALL" || i.category === cat) &&
    (statusFilter === "ALL" || i.status === statusFilter)
  );

  const stats = {
    CRITICAL: items.filter((i) => i.status === "OPEN" && i.severity === "CRITICAL").length,
    ERROR:    items.filter((i) => i.status === "OPEN" && i.severity === "ERROR").length,
    WARNING:  items.filter((i) => i.status === "OPEN" && i.severity === "WARNING").length,
    INFO:     items.filter((i) => i.status === "OPEN" && i.severity === "INFO").length,
  };

  const openCount = items.filter((i) => i.status === "OPEN").length;

  const runValidation = async () => {
    setRunning(true);
    try {
      await validationApi.run(projectId);
      toast.success("Validation complete");
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Validation failed"));
    } finally {
      setRunning(false);
    }
  };

  const updateStatus = async (id: string, status: IssueStatus) => {
    try {
      await validationApi.update(id, { status });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "Could not update issue"));
    }
  };

  // Quick Fix: open the modal and fetch the deterministic preview for an issue.
  const openQuickFix = async (issueId: string) => {
    setFixIssueId(issueId);
    setFixPreview(null);
    setFixLoading(true);
    try {
      setFixPreview(await validationApi.quickFixPreview(issueId));
    } catch (err) {
      toast.error(errorMessage(err, "Could not load fix preview"));
      setFixIssueId(null);
    } finally {
      setFixLoading(false);
    }
  };

  const closeQuickFix = () => {
    if (fixApplying) return;
    setFixIssueId(null);
    setFixPreview(null);
  };

  // Apply re-runs validation server-side and returns the refreshed issue list, so
  // the resolved finding disappears without a separate run/reload round-trip.
  const applyQuickFix = async () => {
    if (!fixIssueId) return;
    setFixApplying(true);
    try {
      const result = await validationApi.quickFixApply(fixIssueId);
      setIssues(result.issues);
      setExpanded(new Set()); // issue ids are regenerated by the re-run
      toast.success("Quick fix applied");
      setFixIssueId(null);
      setFixPreview(null);
    } catch (err) {
      toast.error(errorMessage(err, "Could not apply fix"));
    } finally {
      setFixApplying(false);
    }
  };

  // Relation Remediation: fetch deterministic candidates for review.
  const openReviewFix = async (issueId: string, target: IssueTarget | null) => {
    setReviewIssueId(issueId);
    setReviewPreview(null);
    setReviewSelected(null);
    setReviewTarget(target);
    setReviewLoading(true);
    try {
      setReviewPreview(await validationApi.remediationPreview(issueId));
    } catch (err) {
      toast.error(errorMessage(err, "Could not load suggestions"));
      setReviewIssueId(null);
    } finally {
      setReviewLoading(false);
    }
  };

  const closeReviewFix = () => {
    if (reviewApplying) return;
    setReviewIssueId(null);
    setReviewPreview(null);
    setReviewSelected(null);
  };

  // Apply only the user-selected candidate; backend re-validates the selection,
  // writes (relation or diagram link), re-runs validation, returns fresh issues.
  const applyReviewFix = async () => {
    if (!reviewIssueId || !reviewSelected) return;
    setReviewApplying(true);
    try {
      const result = await validationApi.remediationApply(reviewIssueId, {
        targetId: reviewSelected.targetId,
        relationType: reviewSelected.relationType,
      });
      setIssues(result.issues);
      setExpanded(new Set());
      toast.success("Remediation applied");
      setReviewIssueId(null);
      setReviewPreview(null);
      setReviewSelected(null);
    } catch (err) {
      toast.error(errorMessage(err, "Could not apply remediation"));
    } finally {
      setReviewApplying(false);
    }
  };

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Validation"
        subtitle={
          issues === null
            ? "Loading…"
            : `${openCount} open issue${openCount === 1 ? "" : "s"} · ${project?.name ?? ""}`
        }
        actions={
          <Button variant="primary" icon={<Play size={14} />} onClick={runValidation} disabled={running}>
            {running ? "Running…" : "Run validation"}
          </Button>
        }
      />

      <ValidationStats stats={stats} />

      {issues !== null && items.length === 0 ? (
        <Empty
          title="No validation issues yet"
          message="Run validation to check this project against the rules."
          action={<Button variant="primary" icon={<Play size={14} />} onClick={runValidation} disabled={running}>Run validation</Button>}
        />
      ) : (
        <Card padded={false} title="All issues" action={
          <div className="flex items-center gap-2">
            <select value={sev} onChange={(e) => setSev(e.target.value)} className="h-8 px-2 pr-7 bg-panel border border-border rounded-sm text-[12.5px]">
              <option value="ALL">All severities</option>
              {["CRITICAL","ERROR","WARNING","INFO"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-8 px-2 pr-7 bg-panel border border-border rounded-sm text-[12.5px]">
              <option value="ALL">All categories</option>
              {CATEGORIES_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 px-2 pr-7 bg-panel border border-border rounded-sm text-[12.5px]">
              <option value="ALL">All status</option>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IGNORED">Ignored</option>
            </select>
          </div>
        }>
          {visible.length === 0 ? (
            <div className="p-8 text-center text-fg-muted">No issues match these filters.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="w-8 px-2 py-2.5 border-b border-border" aria-label="Expand" />
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Severity</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Category</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Message</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Artifact</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Created</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Status</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <IssueRow
                    key={i.id}
                    issue={i}
                    projectId={projectId}
                    artifactsById={artifactsById}
                    isOpen={expanded.has(i.id)}
                    onToggle={toggleExpanded}
                    onUpdateStatus={updateStatus}
                    onPreviewFix={openQuickFix}
                    onReviewFix={openReviewFix}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {fixIssueId && (
        <QuickFixModal
          preview={fixPreview}
          loading={fixLoading}
          applying={fixApplying}
          onCancel={closeQuickFix}
          onApply={applyQuickFix}
        />
      )}

      {reviewIssueId && (
        <RemediationModal
          preview={reviewPreview}
          loading={reviewLoading}
          applying={reviewApplying}
          selected={reviewSelected}
          onSelect={setReviewSelected}
          onCancel={closeReviewFix}
          onApply={applyReviewFix}
          projectId={projectId}
          target={reviewTarget}
        />
      )}
    </div>
  );
}
