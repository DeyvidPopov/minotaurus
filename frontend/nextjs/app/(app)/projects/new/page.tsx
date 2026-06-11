// app/(app)/projects/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { projectsApi } from "@/lib/api/projects";
import { errorMessage } from "@/lib/api/error-message";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Project name is required");
      return;
    }
    setBusy(true);
    try {
      const project = await projectsApi.create({ name: trimmed, description: desc.trim() });
      toast.success(`Project "${project.name}" created`);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      const message = errorMessage(err, "Could not create project");
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-8 py-6 max-w-[720px] mx-auto">
      <PageHeader title="New project" subtitle="Create a workspace for documenting and validating a system." />
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12.5px] text-fg-muted font-medium">Project name</label>
            <input className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Helix Commerce" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12.5px] text-fg-muted font-medium">Description</label>
            <textarea className="bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent min-h-[96px] resize-y"
              value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this project document?" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={() => router.push("/projects")} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={<Plus size={14} />} onClick={onSubmit} disabled={busy}>
              {busy ? "Creating…" : "Create project"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
