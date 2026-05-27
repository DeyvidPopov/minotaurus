// components/documentation-editor.tsx — split editor + live preview for artifact docs
"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { documentationApi } from "@/lib/api/documentation";
import { ApiError } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";

type Mode = "view" | "edit";

export function DocumentationEditor({ artifactId }: { artifactId: string }) {
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    documentationApi
      .get(artifactId)
      .then((doc) => {
        if (cancelled) return;
        setContent(doc.content);
        setDraft(doc.content);
        setUpdatedAt(doc.updatedAt);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load documentation");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [artifactId]);

  const save = async () => {
    setSaving(true);
    try {
      const doc = await documentationApi.save(artifactId, draft);
      setContent(doc.content);
      setUpdatedAt(doc.updatedAt);
      toast.success("Documentation saved");
      setMode("view");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-fg-muted text-[13px]">Loading documentation…</div>;
  }

  if (error) {
    return (
      <Card>
        <div className="text-danger text-[13.5px]">{error}</div>
      </Card>
    );
  }

  if (mode === "view") {
    return (
      <Card
        title="Documentation"
        subtitle={updatedAt ? `Last updated ${timeAgo(updatedAt)}` : undefined}
        action={
          <Button size="sm" onClick={() => { setDraft(content); setMode("edit"); }}>
            {content.trim() ? "Edit" : "Add documentation"}
          </Button>
        }
      >
        {content.trim() ? (
          <article className="prose-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        ) : (
          <Empty
            icon={<BookOpen size={28} />}
            title="No documentation yet"
            message="Add Markdown notes about this artifact — purpose, runbooks, contracts."
            action={
              <Button variant="primary" onClick={() => { setDraft(""); setMode("edit"); }}>
                Add documentation
              </Button>
            }
          />
        )}
      </Card>
    );
  }

  return (
    <Card
      title="Documentation"
      subtitle="Markdown supports headings, lists, tables, code blocks."
      action={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { setDraft(content); setMode("view"); }} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" icon={saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
            onClick={save} disabled={saving || draft === content}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
      padded={false}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          placeholder="# Title&#10;&#10;Write Markdown here…"
          className="min-h-[420px] bg-panel-2 border-0 border-r border-border outline-none p-4 text-[13px] font-mono leading-relaxed resize-none"
        />
        <div className="min-h-[420px] p-4 overflow-auto">
          {draft.trim() ? (
            <article className="prose-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </article>
          ) : (
            <div className="text-fg-subtle text-[13px] italic">Preview appears here.</div>
          )}
        </div>
      </div>
    </Card>
  );
}
