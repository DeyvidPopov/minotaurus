// app/(app)/projects/[projectId]/artifacts/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ARTIFACT_TYPES, TYPE_INFO } from "@/lib/mock-data";
import { artifactsApi } from "@/lib/api/artifacts";
import { ApiError } from "@/lib/api/client";
import type { ArtifactStatus, ArtifactType } from "@/lib/types";

export default function NewArtifactPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ArtifactType>("SERVICE");
  const [status, setStatus] = useState<ArtifactStatus>("DRAFT");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    try {
      const created = await artifactsApi.create(projectId, {
        title: trimmed,
        type,
        status,
        description: desc.trim(),
      });
      toast.success(`Artifact "${created.title}" created`);
      router.push(`/projects/${projectId}/artifacts/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create artifact");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-8 py-6 max-w-[720px] mx-auto">
      <PageHeader title="New artifact" subtitle="Create something to document, link, validate and export." />
      <Card>
        <div className="flex flex-col gap-3.5">
          <Field label="Title">
            <input className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent"
              value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Inventory Service" />
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Type">
              <select value={type} onChange={(e) => setType(e.target.value as ArtifactType)} className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
                {ARTIFACT_TYPES.map((t) => <option key={t} value={t}>{TYPE_INFO[t].label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as ArtifactStatus)} className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="DEPRECATED">Deprecated</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[96px] resize-y"
              value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this artifact do?" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => router.push(`/projects/${projectId}/artifacts`)} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={onSubmit} disabled={busy}>
              {busy ? "Creating…" : "Create artifact"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
    </div>
  );
}
