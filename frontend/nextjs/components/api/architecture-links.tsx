// components/api/architecture-links.tsx — Phase 1 "Architecture Links (Inferred)"
// panel. Renders the deterministic EndpointIntel from /api-intel as navigable
// chips. Everything is inferred + read-only; nothing is persisted here.
"use client";

import Link from "next/link";
import { Link2 } from "lucide-react";
import type { EndpointIntel, IntelArtifactLink, IntelEntityMatch } from "@/lib/api/api-intel";
import { ConfidenceDot, InferredBadge, RowLabel } from "./intel-bits";

export function ArchitectureLinks({ intel, projectId }: { intel: EndpointIntel; projectId: string }) {
  const hasAny =
    intel.databaseEntities.length +
      intel.referencedFields.length +
      intel.relatedArtifacts.length +
      intel.documentation.length +
      intel.security.length >
    0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted font-semibold">⟡ Architecture Links</span>
        <InferredBadge />
      </div>

      {!hasAny ? (
        <div className="text-[12.5px] text-fg-subtle italic">No architecture links inferred from this payload.</div>
      ) : (
        <div className="flex flex-col gap-2">
          <LinkRow label="Database Entities" show={intel.databaseEntities.length > 0}>
            {intel.databaseEntities.map((e) => (
              <EntityChip key={e.entityId} entity={e} projectId={projectId} />
            ))}
          </LinkRow>

          <LinkRow label="Referenced Fields" show={intel.referencedFields.length > 0}>
            {intel.referencedFields.map((f) => (
              <span
                key={f}
                className="inline-flex items-center font-mono text-[11.5px] text-fg bg-panel border border-border rounded px-1.5 py-0.5"
              >
                {f}
              </span>
            ))}
          </LinkRow>

          <LinkRow label="Related Artifacts" show={intel.relatedArtifacts.length > 0}>
            {intel.relatedArtifacts.map((a) => (
              <ArtifactChip key={a.artifactId} link={a} projectId={projectId} />
            ))}
          </LinkRow>

          <LinkRow label="Documentation" show={intel.documentation.length > 0}>
            {intel.documentation.map((a) => (
              <ArtifactChip key={a.artifactId} link={a} projectId={projectId} />
            ))}
          </LinkRow>

          <LinkRow label="Security" show={intel.security.length > 0}>
            {intel.security.map((a) => (
              <ArtifactChip key={a.artifactId} link={a} projectId={projectId} />
            ))}
          </LinkRow>
        </div>
      )}
    </div>
  );
}

function LinkRow({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 items-start">
      <RowLabel>{label}</RowLabel>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function EntityChip({ entity, projectId }: { entity: IntelEntityMatch; projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/database/${entity.modelId}`}
      title={entity.basis}
      className="inline-flex items-center gap-1.5 text-[12px] bg-panel border border-border rounded px-2 py-0.5 hover:border-accent hover:bg-panel-hover transition-colors"
    >
      <span className="text-fg">{entity.entityName}</span>
      <ConfidenceDot confidence={entity.confidence} />
    </Link>
  );
}

function ArtifactChip({ link, projectId }: { link: IntelArtifactLink; projectId: string }) {
  return (
    <Link
      href={`/projects/${projectId}/artifacts/${link.artifactId}`}
      title={link.basis}
      className="inline-flex items-center gap-1.5 text-[12px] bg-panel border border-border rounded px-2 py-0.5 hover:border-accent hover:bg-panel-hover transition-colors"
    >
      {link.reason === "relation" && <Link2 size={11} className="text-fg-subtle shrink-0" />}
      <span className="text-fg">{link.title}</span>
      <ConfidenceDot confidence={link.confidence} />
    </Link>
  );
}
