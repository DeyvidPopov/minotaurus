// decision/what-breaks.tsx — the "What breaks if I change X?" panel.
//
// Pure composition: it picks an artifact (default = most connected, by the
// artifacts-list relation count — no new ranking logic), reads the 1-hop impact
// payload (versionsApi.impact), and renders the DETERMINISTIC verdict from
// assessImpact() (lib/impact-risk.ts) plus this artifact's open findings. It
// computes no impact of its own.
//
// LABEL RULE: the verdict is strictly 1-hop, so the headline + counts say
// "direct dependents" / "directly affected" — never "blast radius" / "transitive".
// Deeper-hop exploration lives behind "Open full impact analysis →".
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { OpenLink } from "@/components/ui/open-link";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { versionsApi, type ImpactResponse } from "@/lib/api/versions";
import { errorMessage } from "@/lib/api/error-message";
import {
  assessImpact,
  BAND_COLOR,
  BAND_LABEL,
  verdictColor,
  verdictLabel,
  type ImpactAssessment,
} from "@/lib/impact-risk";
import type { Artifact, ValidationIssue } from "@/lib/types";

function VerdictTile({ label, color, value, reason }: { label: string; color: string; value: string; reason: string }) {
  return (
    <div
      className="bg-bg border rounded-md px-3 py-2"
      style={{ borderColor: `color-mix(in srgb, ${color} 35%, var(--border))` }}
    >
      <div className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="text-[15px] font-semibold mt-0.5" style={{ color }}>{value}</div>
      <div className="text-[11.5px] text-fg-muted mt-1 leading-snug">{reason}</div>
    </div>
  );
}

export function WhatBreaks({
  projectId,
  artifacts,
  issues,
}: {
  projectId: string;
  artifacts: Artifact[];
  issues: ValidationIssue[];
}) {
  // Rank by direct relation count (the artifacts-list degree). The most-connected
  // artifact has the widest direct reach — the natural default to reason about.
  const ranked = useMemo(
    () => [...artifacts].sort((a, b) => (b.relationCount ?? 0) - (a.relationCount ?? 0)),
    [artifacts],
  );
  const defaultId = ranked[0]?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  // Adopt the computed default once artifacts arrive; keep the user's choice after.
  useEffect(() => {
    setSelectedId((cur) => cur ?? defaultId);
  }, [defaultId]);
  // If the current selection vanishes from the list, fall back to the default.
  useEffect(() => {
    if (selectedId && !artifacts.some((a) => a.id === selectedId)) setSelectedId(defaultId);
  }, [artifacts, selectedId, defaultId]);

  const [impact, setImpact] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setImpact(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    versionsApi
      .impact(projectId, selectedId)
      .then((d) => {
        if (!cancelled) setImpact(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(errorMessage(e, "Could not load change impact."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedId]);

  // Deterministic 1-hop verdict from the impact payload + this artifact's open
  // findings. nowMs is injected (matches the Impact page) — frontend display only.
  const verdict = useMemo<ImpactAssessment | null>(() => {
    if (!impact) return null;
    const findings = issues
      .filter((i) => i.status === "OPEN" && (i.artifactId === selectedId || i.subjectId === selectedId))
      .map((f) => ({ severity: f.severity, code: f.meta?.code ?? null }));
    return assessImpact(impact, Date.now(), findings);
  }, [impact, issues, selectedId]);

  const isDefault = selectedId != null && selectedId === defaultId;

  if (artifacts.length === 0) {
    return (
      <Card title="What breaks if I change this?">
        <p className="text-[13px] text-fg-muted">No artifacts yet to analyze.</p>
      </Card>
    );
  }

  return (
    <Card
      title="What breaks if I change this?"
      action={
        selectedId ? (
          <OpenLink
            href={`/projects/${projectId}/impact/${selectedId}`}
            label="Open full impact analysis"
          />
        ) : undefined
      }
    >
      <div className="mb-3">
        <Select
          aria-label="Choose an artifact"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          options={ranked.map((a) => ({
            value: a.id,
            label: a.relationCount
              ? `${a.title}  ·  ${a.relationCount} link${a.relationCount === 1 ? "" : "s"}`
              : a.title,
          }))}
          className="w-full lg:w-[320px]"
        />
        {isDefault && (
          <p className="mt-1.5 text-[11.5px] text-fg-subtle">
            Your most connected artifact — changes here have the widest direct reach.
          </p>
        )}
      </div>

      {loading && <p className="text-[13px] text-fg-muted">Analyzing…</p>}
      {err && !loading && <p className="text-[13px] text-danger">{err}</p>}

      {verdict && !loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: BAND_COLOR[verdict.overall] }} />
            <span className="text-[15px] font-semibold" style={{ color: BAND_COLOR[verdict.overall] }}>
              {BAND_LABEL[verdict.overall]} overall risk
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <VerdictTile
              label="If deleted"
              color={verdictColor(verdict.deletion.verdict)}
              value={verdictLabel(verdict.deletion.verdict)}
              reason={verdict.deletion.reason}
            />
            <VerdictTile
              label="If modified"
              color={BAND_COLOR[verdict.modification.band]}
              value={BAND_LABEL[verdict.modification.band]}
              reason={verdict.modification.reason}
            />
          </div>

          <div className="text-[12.5px] text-fg-muted">
            <strong className="text-fg tabular-nums">{verdict.metrics.dependents}</strong> direct dependent
            {verdict.metrics.dependents === 1 ? "" : "s"}
            {verdict.metrics.activeDependents > 0 && <> ({verdict.metrics.activeDependents} active)</>}
            {" · "}
            <strong className="text-fg tabular-nums">{verdict.metrics.dependencies}</strong> direct dependenc
            {verdict.metrics.dependencies === 1 ? "y" : "ies"}
            {verdict.metrics.assetsToReview > 0 && (
              <>
                {" · "}
                {verdict.metrics.assetsToReview} linked asset{verdict.metrics.assetsToReview === 1 ? "" : "s"}
              </>
            )}
          </div>

          {verdict.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {verdict.reasons.map((r, i) => (
                <Badge key={i}>{r}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
