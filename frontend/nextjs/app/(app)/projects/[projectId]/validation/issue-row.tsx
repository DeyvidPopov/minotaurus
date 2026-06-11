// app/(app)/projects/[projectId]/validation/issue-row.tsx
// One validation issue: the summary row plus its expandable detail panel. Pure
// presentation — the page owns all state and passes the handlers down.
"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronRight, Check, MinusCircle, RotateCcw, Info, Crosshair, Wrench, ShieldCheck,
  Zap, ArrowUpRight, Wand2, GitBranch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { TypeChip } from "@/components/ui/type-chip";
import { ProjectChip } from "@/components/ui/project-chip";
import { OpenLink } from "@/components/ui/open-link";
import { timeAgo } from "@/lib/utils";
import type { Artifact, FindingAction, IssueStatus, IssueTarget, ValidationIssue } from "@/lib/types";
import { KIND_LABEL, PROJECT_LEVEL_PREFIX, targetDescription, targetHref } from "./issue-target";

function DetailSection({
  icon: Icon,
  label,
  accent = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  accent?: boolean;
  children: ReactNode;
}) {
  const accentStyle = accent ? { color: "var(--accent)" } : undefined;
  return (
    <div className="flex gap-2.5">
      <Icon
        size={14}
        className={`mt-0.5 shrink-0 ${accent ? "" : "text-fg-subtle"}`}
        style={accentStyle}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div
          className={`text-[10.5px] uppercase tracking-wider mb-0.5 ${accent ? "" : "text-fg-subtle"}`}
          style={accentStyle}
        >
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

// Quick Fix Actions. NAVIGATE reuses the finding's existing link (`target`); an
// AVAILABLE action backed by a deterministic quick fix opens the Preview Fix modal;
// a PLANNED action is a placeholder ("Not implemented yet"). No fix logic runs here.
function FindingActions({
  actions,
  projectId,
  target,
  onPreviewFix,
  onReviewFix,
}: {
  actions: FindingAction[];
  projectId: string;
  target: IssueTarget | null;
  onPreviewFix: () => void;
  onReviewFix: () => void;
}) {
  if (actions.length === 0) return null;
  return (
    <DetailSection icon={Zap} label="Available actions">
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => {
          if (action.kind === "NAVIGATE" && target) {
            return (
              <Link
                key={action.id}
                href={targetHref(projectId, target)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 text-[12px] font-medium hover:bg-panel-hover hover:text-accent transition-colors"
              >
                <ArrowUpRight size={12} aria-hidden="true" />
                {action.label}
              </Link>
            );
          }
          if (action.status === "AVAILABLE" && action.fixId) {
            // REVIEW-required remediation → opens the candidate picker. Clearly labelled.
            if (action.requiresReview) {
              return (
                <span key={action.id} className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onReviewFix}
                    title={`${action.label} — review required (you choose the target; nothing is created until you confirm)`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    <GitBranch size={12} aria-hidden="true" />
                    Review Fix
                  </button>
                  <span className="text-[10px] uppercase tracking-wide text-fg-subtle">Review required</span>
                </span>
              );
            }
            // SAFE deterministic quick fix → "Preview Fix" (one-click apply after preview).
            return (
              <button
                key={action.id}
                type="button"
                onClick={onPreviewFix}
                title={action.label}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                <Wand2 size={12} aria-hidden="true" />
                Preview Fix
              </button>
            );
          }
          // PLANNED / DISABLED placeholder.
          const disabled = action.status === "DISABLED";
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={disabled ? undefined : () => toast.message("Not implemented yet", { description: action.label })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 text-[12px] font-medium text-fg-muted hover:bg-panel-hover transition-colors disabled:opacity-40 disabled:hover:bg-panel"
            >
              <Wrench size={12} aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
      </div>
    </DetailSection>
  );
}

export function IssueRow({
  issue,
  projectId,
  artifactsById,
  isOpen,
  onToggle,
  onUpdateStatus,
  onPreviewFix,
  onReviewFix,
}: {
  issue: ValidationIssue;
  projectId: string;
  artifactsById: Record<string, Artifact>;
  isOpen: boolean;
  onToggle: (id: string) => void;
  onUpdateStatus: (id: string, status: IssueStatus) => void;
  onPreviewFix: (id: string) => void;
  onReviewFix: (id: string, target: IssueTarget | null) => void;
}) {
  const i = issue;
  const isProjectLevel = i.message.startsWith(PROJECT_LEVEL_PREFIX);
  const message =
    i.meta?.cleanMessage ??
    (isProjectLevel ? i.message.slice(PROJECT_LEVEL_PREFIX.length) : i.message);
  // artifactId is the real Artifact FK — non-null only for ARTIFACT-subject
  // findings; api-spec/db-model/diagram findings navigate via meta.target.
  const art = !isProjectLevel && i.artifactId ? artifactsById[i.artifactId] : undefined;
  const meta = i.meta;
  const target = meta?.target ?? null;
  return (
    <Fragment>
    <tr
      className="border-b border-border hover:bg-panel-hover cursor-pointer"
      onClick={() => meta && onToggle(i.id)}
    >
      <td className="px-2 py-3 align-middle">
        {meta && (
          <ChevronRight
            size={14}
            className={`text-fg-subtle transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}
          />
        )}
      </td>
      <td className="px-3.5 py-3"><SeverityBadge severity={i.severity} /></td>
      <td className="px-3.5 py-3"><Badge mono>{i.category}</Badge></td>
      <td className="px-3.5 py-3">{message}</td>
      <td className="px-3.5 py-3">
        {isProjectLevel ? (
          <ProjectChip />
        ) : art ? (
          <div className="flex items-center gap-2"><TypeChip type={art.type} /><span className="font-medium">{art.title}</span></div>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
      <td className="px-3.5 py-3 text-fg-muted text-[12.5px]">{timeAgo(i.createdAt)}</td>
      <td className="px-3.5 py-3"><StatusBadge status={i.status} /></td>
      <td className="px-3.5 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {i.status !== "RESOLVED" && (
            <button onClick={() => onUpdateStatus(i.id, "RESOLVED")} title="Mark resolved"
              className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover"><Check size={13} /></button>
          )}
          {i.status !== "IGNORED" && (
            <button onClick={() => onUpdateStatus(i.id, "IGNORED")} title="Ignore"
              className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover"><MinusCircle size={13} /></button>
          )}
          {i.status !== "OPEN" && (
            <button onClick={() => onUpdateStatus(i.id, "OPEN")} title="Reopen"
              className="p-1 text-fg-muted hover:text-fg rounded hover:bg-panel-hover"><RotateCcw size={13} /></button>
          )}
        </div>
      </td>
    </tr>
    {meta && isOpen && (
      <tr className="border-b border-border last:border-0">
        <td colSpan={8} className="bg-panel/30 px-3.5 pt-1 pb-5">
          <div className="grid gap-4 text-[12.5px]">
            {/* header spans full width so "Open" sits at the right edge;
                the body below stays max-w-3xl for readable line length */}
            <div className="flex items-center gap-2">
              <Badge mono>{meta.code ?? meta.ruleId}</Badge>
              {meta.deterministic && (
                <span
                  className="inline-flex items-center gap-1 text-[10.5px] font-mono uppercase tracking-wider"
                  style={{ color: "var(--c-success)" }}
                  title="Computed by the deterministic rule engine — no AI"
                >
                  <ShieldCheck size={11} aria-hidden="true" /> Deterministic
                </span>
              )}
              {target && (
                <OpenLink
                  href={targetHref(projectId, target)}
                  label={`Open ${KIND_LABEL[target.kind]}`}
                  className="ml-auto -mr-2 shrink-0 rounded-md px-2 py-1 hover:bg-panel-hover"
                />
              )}
            </div>

            <div className="max-w-3xl grid gap-4">
              <DetailSection icon={Info} label="Why it fired">
                <span className="text-fg-muted leading-relaxed">{meta.why}</span>
              </DetailSection>

              {target && (
                <DetailSection icon={Crosshair} label="Affected target">
                  {target.id ? (
                    <Link
                      href={targetHref(projectId, target)}
                      className="font-medium text-fg hover:text-accent transition-colors"
                    >
                      {targetDescription(target)}
                    </Link>
                  ) : (
                    <span className="text-fg-muted">{targetDescription(target)}</span>
                  )}
                </DetailSection>
              )}

              {/* suggested fix — the actionable part; emphasised with an
                  accent icon + label and brighter body text, no nested box */}
              <DetailSection icon={Wrench} label="Suggested fix" accent>
                <p className="text-fg leading-relaxed">{meta.suggestedFix}</p>
              </DetailSection>

              <FindingActions
                actions={meta.actions ?? []}
                projectId={projectId}
                target={target}
                onPreviewFix={() => onPreviewFix(i.id)}
                onReviewFix={() => onReviewFix(i.id, target)}
              />
            </div>
          </div>
        </td>
      </tr>
    )}
    </Fragment>
  );
}
