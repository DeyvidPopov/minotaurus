"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  accountApi,
  type DeletionPlanItem,
  type DeletionPreview,
} from "@/lib/api/account";

const DELETE_WORD = "DELETE";

function decodeProblems(err: unknown): string[] | null {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { details?: { problems?: string[] } } } | undefined;
    const problems = body?.error?.details?.problems;
    if (Array.isArray(problems) && problems.length) return problems;
  }
  return null;
}

function deletionErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const code = (err.body as { error?: { code?: string } } | undefined)?.error?.code;
    if (code === "INVALID_CREDENTIALS") return "That password is incorrect.";
    if (code === "DELETION_PLAN_INVALID") return "Resolve every shared project below first.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

/**
 * Account-deletion wizard. Soft-delete with a 30-day grace window: the user
 * resolves each shared project (transfer or delete), optionally downloads their
 * data, then confirms. Nothing is destroyed immediately — the server schedules a
 * purge and emails an undo link. `onScheduled` fires on success so the caller can
 * sign the user out.
 */
export function DeleteAccountModal({
  open,
  onClose,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: (scheduledFor: string) => void;
}) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loadError, setLoadError] = useState(false);
  // sharedOwned decisions: projectId → "transfer:<userId>" | "delete".
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setPreview(null); setLoadError(false); setDecisions({});
    setPassword(""); setConfirmText(""); setBusy(false);
    setDownloading(false); setError(null); setProblems([]);
    let cancelled = false;
    accountApi
      .deletionPreview()
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, busy, onClose]);

  const allResolved = useMemo(
    () => !!preview && preview.sharedOwned.every((sp) => decisions[sp.id]),
    [preview, decisions],
  );
  const canSubmit =
    !!preview && allResolved && password.length > 0 && confirmText.trim().toUpperCase() === DELETE_WORD && !busy;

  if (!open) return null;

  const close = () => { if (!busy) onClose(); };

  const buildPlan = (p: DeletionPreview): DeletionPlanItem[] =>
    p.sharedOwned.map((sp) => {
      const v = decisions[sp.id];
      if (v && v.startsWith("transfer:")) {
        return { projectId: sp.id, action: "TRANSFER", transferToUserId: v.slice("transfer:".length) };
      }
      return { projectId: sp.id, action: "DELETE" };
    });

  const download = async () => {
    setDownloading(true);
    try {
      await accountApi.downloadBundle();
      toast.success("Your data export is downloading");
    } catch {
      toast.error("Could not generate your data export");
    } finally {
      setDownloading(false);
    }
  };

  const submit = async () => {
    if (!preview || !canSubmit) return;
    setBusy(true); setError(null); setProblems([]);
    try {
      const res = await accountApi.requestDeletion({ password, plan: buildPlan(preview) });
      onScheduled(res.scheduledFor);
    } catch (err) {
      setError(deletionErrorMessage(err));
      setProblems(decodeProblems(err) ?? []);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete account"
        className="w-[560px] max-w-[94vw] max-h-[90vh] flex flex-col bg-panel border border-border rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <AlertTriangle size={15} className="text-danger" aria-hidden />
          <div className="font-semibold text-[14px]">Delete account</div>
          <button className="ml-auto text-fg-muted hover:text-fg disabled:opacity-50" onClick={close} disabled={busy} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          {loadError ? (
            <div className="text-[13px] text-danger">Couldn’t load your projects. Close and try again.</div>
          ) : !preview ? (
            <div className="flex items-center gap-2 text-[13px] text-fg-muted py-4">
              <Loader2 size={14} className="motion-safe:animate-spin" /> Loading your projects…
            </div>
          ) : (
            <>
              <p className="m-0 text-[12.5px] text-fg-muted">
                Your account will be deactivated now and permanently deleted in{" "}
                <strong className="text-fg">{preview.graceDays} days</strong>. You can undo any time before
                then from the email we’ll send. Resolve the shared projects you own below.
              </p>

              {/* Shared projects requiring a decision */}
              {preview.sharedOwned.length > 0 && (
                <Section title={`Shared projects you own (${preview.sharedOwned.length})`} hint="Choose what happens to each — required.">
                  {preview.sharedOwned.map((sp) => (
                    <div key={sp.id} className="flex items-center gap-3 p-2.5 bg-panel-2 border border-border rounded-md">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{sp.name}</div>
                        <div className="text-[11.5px] text-fg-subtle">{sp.memberCount} members</div>
                      </div>
                      <select
                        value={decisions[sp.id] ?? ""}
                        disabled={busy}
                        onChange={(e) => setDecisions((d) => ({ ...d, [sp.id]: e.target.value }))}
                        className="bg-panel border border-border rounded-sm px-2 py-1.5 text-[12.5px] max-w-[230px] outline-none focus:border-accent"
                      >
                        <option value="" disabled>Choose…</option>
                        {sp.targets.map((t) => (
                          <option key={t.userId} value={`transfer:${t.userId}`}>
                            Transfer to {t.name || t.email}
                          </option>
                        ))}
                        <option value="delete">Delete for everyone ({sp.memberCount - 1} others)</option>
                      </select>
                    </div>
                  ))}
                </Section>
              )}

              {/* Informational buckets */}
              {preview.soloOwned.length > 0 && (
                <Section title={`Projects you’ll lose (${preview.soloOwned.length})`} hint="Only you have these — they’ll be deleted. Download your data first.">
                  <NameList items={preview.soloOwned.map((p) => p.name)} />
                </Section>
              )}
              {preview.continuing.length > 0 && (
                <Section title={`Projects that continue without you (${preview.continuing.length})`} hint="Your contributions stay and are reattributed to “Deleted User”.">
                  <NameList items={preview.continuing.map((p) => p.name)} />
                </Section>
              )}

              {/* Data export */}
              <div className="flex items-center justify-between gap-3 p-3 bg-panel-2 border border-border rounded-md">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Download your data</div>
                  <div className="text-[11.5px] text-fg-subtle">A .zip (JSON + PDF per owned project). We’ll also email you a copy.</div>
                </div>
                <Button size="sm" icon={downloading ? <Loader2 size={13} className="motion-safe:animate-spin" /> : <Download size={13} />} onClick={download} disabled={downloading || busy}>
                  {downloading ? "Preparing…" : "Download .zip"}
                </Button>
              </div>

              {/* Confirm */}
              <div className="flex flex-col gap-2 pt-1 border-t border-border">
                <label className="text-[12.5px] text-fg-muted font-medium mt-1">Confirm your password</label>
                <input
                  type="password" value={password} autoComplete="current-password"
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent"
                />
                <label className="text-[12.5px] text-fg-muted font-medium mt-1">Type <span className="font-mono text-fg">{DELETE_WORD}</span> to confirm</label>
                <input
                  value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent"
                />
              </div>

              {error && (
                <div role="alert" className="rounded-sm border border-[color-mix(in_srgb,var(--c-danger)_40%,transparent)] bg-[var(--c-danger-soft)] px-3 py-2 text-[12px] text-danger">
                  {error}
                  {problems.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button
            variant="danger"
            icon={busy ? <Loader2 size={13} className="motion-safe:animate-spin" /> : <AlertTriangle size={13} />}
            onClick={submit}
            disabled={!canSubmit}
          >
            {busy ? "Scheduling…" : "Delete my account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="text-[11.5px] text-fg-subtle">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function NameList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((name, i) => (
        <span key={i} className="text-[12px] px-2 py-1 bg-panel-2 border border-border rounded-sm">{name}</span>
      ))}
    </div>
  );
}
