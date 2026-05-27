// app/(app)/projects/[projectId]/artifacts/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { TypeChip } from "@/components/ui/type-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { ARTIFACT_TYPES, TYPE_INFO } from "@/lib/mock-data";
import { artifactsApi } from "@/lib/api/artifacts";
import { projectsApi } from "@/lib/api/projects";
import { timeAgo } from "@/lib/utils";
import type { Artifact, Project } from "@/lib/types";

export default function ArtifactsListPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const [project, setProject] = useState<Project | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);

  const [type, setType] = useState<string>("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch(() => setProject(null));
    artifactsApi.list(projectId).then(setArtifacts).catch(() => setArtifacts([]));
  }, [projectId]);

  const items = artifacts ?? [];
  const list = items.filter((a) =>
    (type === "ALL" || a.type === type) &&
    (status === "ALL" || a.status === status) &&
    (!q.trim() || a.title.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="px-8 py-6">
      <PageHeader
        title="Artifacts"
        subtitle={
          artifacts === null
            ? "Loading…"
            : `${list.length} of ${items.length} artifacts · building blocks of ${project?.name ?? "this project"}`
        }
        actions={<>
          <SearchInput value={q} onChange={setQ} placeholder="Filter…" className="w-[220px]" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
            <option value="ALL">All types</option>
            {ARTIFACT_TYPES.map((t) => <option key={t} value={t}>{TYPE_INFO[t].label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 px-2.5 pr-7 bg-panel border border-border rounded-sm text-[13.5px]">
            <option value="ALL">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="DEPRECATED">Deprecated</option>
          </select>
          <Link href={`/projects/${projectId}/artifacts/new`}><Button variant="primary" icon={<Plus size={14} />}>New</Button></Link>
        </>}
      />

      {artifacts !== null && items.length === 0 ? (
        <Empty
          title="No artifacts yet"
          message="Create your first artifact to start documenting this system."
          action={<Link href={`/projects/${projectId}/artifacts/new`}><Button variant="primary" icon={<Plus size={14} />}>New artifact</Button></Link>}
        />
      ) : list.length === 0 ? (
        <Empty title="No artifacts match" message="Try different filters." />
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-panel">
                <tr className="text-fg-muted text-[11.5px] uppercase tracking-wider">
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Artifact</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Type</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Status</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Relations</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Issues</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Author</th>
                  <th className="text-left font-medium px-3.5 py-2.5 border-b border-border">Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="hover:bg-panel-hover cursor-pointer">
                    <td className="px-3.5 py-3 border-b border-border">
                      <Link href={`/projects/${projectId}/artifacts/${a.id}`} className="block">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-[12px] text-fg-muted truncate max-w-[420px]">{a.description}</div>
                      </Link>
                    </td>
                    <td className="px-3.5 py-3 border-b border-border"><TypeChip type={a.type} /></td>
                    <td className="px-3.5 py-3 border-b border-border"><StatusBadge status={a.status} /></td>
                    <td className="px-3.5 py-3 border-b border-border tabular-nums">{a.relationCount ?? 0}</td>
                    <td className="px-3.5 py-3 border-b border-border tabular-nums">
                      {(a.validationIssueCount ?? 0) > 0 ? <Badge tone="warning">{a.validationIssueCount}</Badge> : "—"}
                    </td>
                    <td className="px-3.5 py-3 border-b border-border">
                      <div className="flex items-center gap-2"><Avatar user={a.author} size={20} /><span className="text-[12.5px]">{a.author.firstName}</span></div>
                    </td>
                    <td className="px-3.5 py-3 border-b border-border text-fg-muted text-[12.5px]">{timeAgo(a.updatedAt)}</td>
                    <td className="px-3.5 py-3 border-b border-border"><ChevronRight size={13} className="text-fg-subtle" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
