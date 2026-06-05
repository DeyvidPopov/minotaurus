// components/api/impact-analysis.tsx — Phase 3 "Impact Analysis (Inferred)".
// A synthesized, impact-oriented re-grouping of the SAME EndpointIntel as the
// Architecture Links view: it answers "what does this endpoint affect?" rather
// than listing structural links. Read-only, deterministic, never persisted.
"use client";

import Link from "next/link";
import { Check, Link2 } from "lucide-react";
import type {
  EndpointIntel,
  IntelArtifactLink,
  IntelEntityMatch,
  IntelWorkflowSignal,
} from "@/lib/api/api-intel";
import { ConfidenceDot, InferredBadge, IntelWarnings } from "./intel-bits";

export function ImpactAnalysis({ intel, projectId }: { intel: EndpointIntel; projectId: string }) {
  const hasAny =
    intel.databaseEntities.length +
      intel.relatedArtifacts.length +
      intel.security.length +
      intel.documentation.length +
      intel.workflow.length +
      intel.payloadFields.length +
      intel.warnings.length >
    0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted font-semibold">◎ Impact Analysis</span>
        <InferredBadge />
      </div>

      {!hasAny ? (
        <div className="text-[12.5px] text-fg-subtle italic">No architectural impact inferred from this payload.</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Section label="Touches">
            {intel.databaseEntities.map((e) => (
              <EntityItem key={e.entityId} entity={e} projectId={projectId} />
            ))}
          </Section>

          <Section label="Implemented By">
            {intel.relatedArtifacts.map((a) => (
              <ArtifactItem key={a.artifactId} link={a} projectId={projectId} />
            ))}
          </Section>

          <Section label="Protected By">
            {intel.security.map((a) => (
              <ArtifactItem key={a.artifactId} link={a} projectId={projectId} />
            ))}
          </Section>

          <Section label="Referenced In">
            {intel.documentation.map((a) => (
              <ArtifactItem key={a.artifactId} link={a} projectId={projectId} />
            ))}
          </Section>

          <Section label="Workflow">
            {intel.workflow.map((w) => (
              <WorkflowItem key={w.label} signal={w} />
            ))}
          </Section>

          <Section label="Payload Fields">
            {intel.payloadFields.map((f) => (
              <div key={f} className="flex items-center gap-1.5 text-[12.5px]">
                <Check size={12} className="text-accent shrink-0" />
                <span className="font-mono text-[11.5px] text-fg">{f}</span>
              </div>
            ))}
          </Section>

          <IntelWarnings warnings={intel.warnings} />
        </div>
      )}
    </div>
  );
}

/** A labeled block of ✓ items; renders nothing when empty. */
function Section({ label, children }: { label: string; children: React.ReactNode[] }) {
  const items = children.filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 items-start">
      <div className="text-[11px] uppercase tracking-wider text-fg-muted font-medium pt-0.5 select-none">{label}</div>
      <div className="flex flex-col gap-0.5">{items}</div>
    </div>
  );
}

function EntityItem({ entity, projectId }: { entity: IntelEntityMatch; projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/database/${entity.modelId}`}
      title={entity.basis}
      className="flex items-center gap-1.5 text-[12.5px] hover:underline w-fit"
    >
      <Check size={12} className="text-accent shrink-0" />
      <span className="text-fg">{entity.entityName}</span>
      <ConfidenceDot confidence={entity.confidence} />
    </Link>
  );
}

function ArtifactItem({ link, projectId }: { link: IntelArtifactLink; projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/artifacts/${link.artifactId}`}
      title={link.basis}
      className="flex items-center gap-1.5 text-[12.5px] hover:underline w-fit"
    >
      <Check size={12} className="text-accent shrink-0" />
      {link.reason === "relation" && <Link2 size={11} className="text-fg-subtle shrink-0" />}
      <span className="text-fg">{link.title}</span>
      <ConfidenceDot confidence={link.confidence} />
    </Link>
  );
}

function WorkflowItem({ signal }: { signal: IntelWorkflowSignal }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px]" title={signal.basis}>
      <Check size={12} className="text-accent shrink-0" />
      <span className="text-fg">{signal.label}</span>
      <ConfidenceDot confidence={signal.confidence} />
    </div>
  );
}
