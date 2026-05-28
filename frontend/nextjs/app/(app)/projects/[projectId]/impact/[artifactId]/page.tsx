// app/(app)/projects/[projectId]/impact/[artifactId]/page.tsx — impact analysis
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Box, Network, BookOpen, Plug, Database, GitMerge, Shield, History, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Empty } from "@/components/ui/empty";
import { OpenLink } from "@/components/ui/open-link";
import { versionsApi, type ImpactResponse } from "@/lib/api/versions";
import { ApiError } from "@/lib/api/client";
import type { ArtifactType, ArtifactStatus } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export default function ImpactPage({ params }: { params: { projectId: string; artifactId: string } }) {
  const { projectId, artifactId } = params;
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    versionsApi
      .impact(projectId, artifactId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : "Could not load impact analysis";
        setError(msg);
        toast.error(msg);
      });
    return () => { cancelled = true; };
  }, [projectId, artifactId]);

  if (error) {
    return (
      <div className="px-8 py-6 max-w-[1100px] mx-auto">
        <Empty title="Impact unavailable" message={error} />
      </div>
    );
  }
  if (!data) return <div className="px-8 py-6 text-fg-muted">Loading…</div>;

  return (
    <div className="px-8 py-6 max-w-[1100px] mx-auto">
      <PageHeader
        eyebrow={
          <>
            <Badge mono>IMPACT</Badge>
            <TypeChip type={data.artifact.type as ArtifactType} />
            <StatusBadge status={data.artifact.status as ArtifactStatus} />
          </>
        }
        title={data.artifact.title}
        subtitle={data.artifact.description || "What is affected if this changes?"}
        actions={
          <Link href={`/projects/${projectId}/artifacts/${data.artifact.id}`}>
            <Button icon={<ArrowLeft size={13} />}>Back to artifact</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <SummaryTile icon={<Network size={13} />} label="Affected artifacts" value={data.impactSummary.affectedArtifacts} />
        <SummaryTile icon={<Plug size={13} />} label="Affected APIs" value={data.impactSummary.affectedApis} />
        <SummaryTile icon={<Database size={13} />} label="Affected DBs" value={data.impactSummary.affectedDatabases} />
        <SummaryTile icon={<GitMerge size={13} />} label="Affected diagrams" value={data.impactSummary.affectedDiagrams} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title={`Direct dependencies (${data.directDependencies.length})`} subtitle="What this artifact relies on (outgoing relations).">
          {data.directDependencies.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No outgoing relations.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.directDependencies.map((r) => (
                <RelLink key={r.relationId} projectId={projectId} artifact={r.artifact} side="out" relationType={r.relationType} />
              ))}
            </div>
          )}
        </Card>

        <Card title={`Dependent artifacts (${data.dependentArtifacts.length})`} subtitle="What relies on this artifact (incoming relations).">
          {data.dependentArtifacts.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No incoming relations.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.dependentArtifacts.map((r) => (
                <RelLink key={r.relationId} projectId={projectId} artifact={r.artifact} side="in" relationType={r.relationType} />
              ))}
            </div>
          )}
        </Card>

        <Card title={`Linked APIs (${data.apiSpecs.length})`}>
          {data.apiSpecs.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No linked API specs.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.apiSpecs.map((s) => (
                <Link key={s.id} href={`/projects/${projectId}/api/${s.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
                  <Plug size={13} className="text-accent shrink-0" />
                  <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{s.title}</span>
                  <Badge mono>v{s.version}</Badge>
                  <Badge tone="success">{s.endpointCount}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Linked DB models (${data.databaseModels.length})`}>
          {data.databaseModels.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No linked database models.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.databaseModels.map((m) => (
                <Link key={m.id} href={`/projects/${projectId}/database/${m.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
                  <Database size={13} className="text-accent shrink-0" />
                  <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{m.title}</span>
                  <Badge mono>{m.databaseType}</Badge>
                  <Badge tone="success">{m.entityCount}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Linked diagrams (${data.diagrams.length})`}>
          {data.diagrams.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No linked diagrams.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {data.diagrams.map((d) => (
                <Link key={d.id} href={`/projects/${projectId}/diagrams/${d.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
                  <GitMerge size={13} className="text-accent shrink-0" />
                  <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{d.title}</span>
                  <Badge mono>{d.type}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Documentation (${data.documentation.length})`}>
          {data.documentation.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No documentation references.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.documentation.map((d, i) => (
                <Link key={i} href={`/projects/${projectId}/artifacts/${d.artifactId}`} className="block py-2 px-2 rounded hover:bg-panel-hover">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen size={13} className="text-accent shrink-0" />
                    <span className="text-[13px] font-medium">{d.title}</span>
                    <Badge mono>{d.source === "self" ? "self" : "documents this"}</Badge>
                  </div>
                  <div className="text-[12px] text-fg-muted leading-relaxed line-clamp-3">
                    {d.excerpt || <em className="text-fg-subtle">No excerpt</em>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <Card title={`Recent events (${data.recentEvents.length})`} subtitle="Latest changes affecting this artifact." action={
          <OpenLink href={`/projects/${projectId}/versions`} label="All versions" />
        }>
          {data.recentEvents.length === 0 ? (
            <div className="text-fg-muted text-[13px]">No events recorded.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-2 text-[13px]">
                  <Badge mono>{e.action}</Badge>
                  <Badge mono>{e.entityType}</Badge>
                  <span className="flex-1 min-w-0 truncate">{e.title}</span>
                  <span className="text-[11.5px] text-fg-subtle font-mono">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-panel border border-border rounded-md p-3">
      <div className="text-[11.5px] text-fg-muted flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-[24px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RelLink({
  projectId,
  artifact,
  side,
  relationType,
}: {
  projectId: string;
  artifact: { id: string; title: string; type: string; status: string };
  side: "in" | "out";
  relationType: string;
}) {
  return (
    <Link href={`/projects/${projectId}/artifacts/${artifact.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-panel-hover">
      <Box size={13} className="text-accent shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{artifact.title}</span>
      <Badge mono>{artifact.type}</Badge>
      <span className="font-mono text-[10.5px] text-fg-muted inline-flex items-center gap-0.5">
        {side === "out" ? <ArrowRight size={10} /> : <ArrowRight size={10} className="rotate-180" />}
        {relationType}
      </span>
    </Link>
  );
}
