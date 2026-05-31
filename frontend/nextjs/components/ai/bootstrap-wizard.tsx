// components/ai/bootstrap-wizard.tsx — AI Bootstrap Wizard.
// Describe an idea → AI proposes a draft (artifacts + relations + 1–3 diagrams)
// → user reviews/selects every item → confirm → backend applies through the
// deterministic confirm path. AI never writes directly; nothing is saved until
// the user confirms. Re-uses the shared <MermaidPreview> (no second renderer).
"use client";

import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Sparkles, X, ArrowLeft, Loader2, Check, AlertTriangle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MermaidPreview } from "@/components/mermaid-preview";
import { ApiError } from "@/lib/api/client";
import {
  aiApi,
  type BootstrapProposal,
  type ProposeResult,
  type ValidationReport,
} from "@/lib/api/ai";

const EXAMPLES = [
  "Online booking platform for doctors",
  "Football club management platform",
  "Internal ticketing system",
  "Crypto portfolio tracker",
];

// Mirror the backend title normalization (trim + collapse whitespace + lowercase)
// so relation endpoints match selected artifacts the same way the server does.
function normTitle(t: string): string {
  return t.trim().replace(/\s+/g, " ").toLowerCase();
}

function confidenceTone(c: number): "success" | "info" | "warning" {
  if (c >= 0.8) return "success";
  if (c >= 0.5) return "info";
  return "warning";
}

function errInfo(err: unknown): { status: number | null; code: string | null; message: string } {
  if (err instanceof ApiError) {
    const code = (err.body as { error?: { code?: string } } | undefined)?.error?.code ?? null;
    return { status: err.status, code, message: err.message };
  }
  return { status: null, code: null, message: err instanceof Error ? err.message : "Something went wrong" };
}

export function BootstrapWizard({
  projectId,
  onClose,
  onApplied,
}: {
  projectId: string;
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<"describe" | "review">("describe");
  const [idea, setIdea] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<BootstrapProposal | null>(null);
  const [validation, setValidation] = useState<ValidationReport | null>(null);

  const [selArtifacts, setSelArtifacts] = useState<boolean[]>([]);
  const [selRelations, setSelRelations] = useState<boolean[]>([]);
  const [selDiagrams, setSelDiagrams] = useState<boolean[]>([]);

  const ideaValid = idea.trim().length >= 10;

  const generate = async () => {
    if (!ideaValid || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res: ProposeResult = await aiApi.proposeBootstrap(projectId, idea.trim());
      setSessionId(res.sessionId);
      setProposal(res.proposal);
      setValidation(res.validation);
      // Default: validator-accepted items checked, flagged items unchecked.
      setSelArtifacts(res.validation.artifacts.map((d) => d.accepted));
      setSelRelations(res.validation.relations.map((d) => d.accepted));
      setSelDiagrams(res.validation.diagrams.map((d) => d.accepted));
      setStep("review");
    } catch (err) {
      const { status, code, message } = errInfo(err);
      if (code === "AI_OUTPUT_TRUNCATED") {
        setGenError(
          'The idea is too broad for one AI draft. Try narrowing the scope, or ask for fewer architecture elements.\n\nExample: "Focus only on appointment booking and medical records."',
        );
      } else if (status === 503 || code === "AI_NOT_CONFIGURED") {
        setGenError("AI is not configured. Add ANTHROPIC_API_KEY to the backend environment.");
      } else if (status === 502) {
        setGenError("AI provider failed. Try again.");
      } else if (status === 403) {
        setGenError(message || "You don't have permission to use AI in this project.");
      } else {
        setGenError(message || "Failed to generate a draft.");
      }
    } finally {
      setGenerating(false);
    }
  };

  // Selected artifact titles (normalized) + live counts of what would actually apply.
  const { selected, titles } = useMemo(() => {
    const titles = new Set<string>();
    if (!proposal) return { selected: { a: 0, r: 0, d: 0 }, titles };
    let a = 0;
    proposal.artifacts.forEach((art, i) => {
      if (selArtifacts[i]) {
        a++;
        titles.add(normTitle(art.title));
      }
    });
    let r = 0;
    proposal.relations.forEach((rel, i) => {
      if (selRelations[i] && titles.has(normTitle(rel.sourceTitle)) && titles.has(normTitle(rel.targetTitle))) r++;
    });
    let d = 0;
    proposal.diagrams.forEach((_, i) => {
      if (selDiagrams[i]) d++;
    });
    return { selected: { a, r, d }, titles };
  }, [proposal, selArtifacts, selRelations, selDiagrams]);

  const endpointSelected = (r: { sourceTitle: string; targetTitle: string }) =>
    titles.has(normTitle(r.sourceTitle)) && titles.has(normTitle(r.targetTitle));

  const nothingSelected = selected.a + selected.r + selected.d === 0;

  const toggleAt = (setter: Dispatch<SetStateAction<boolean[]>>, i: number) =>
    setter((arr) => arr.map((v, idx) => (idx === i ? !v : v)));

  const apply = async () => {
    if (!proposal || nothingSelected || applying) return;
    const artifacts = proposal.artifacts.filter((_, i) => selArtifacts[i]);
    const keep = new Set(artifacts.map((a) => normTitle(a.title)));
    const relations = proposal.relations.filter(
      (r, i) => selRelations[i] && keep.has(normTitle(r.sourceTitle)) && keep.has(normTitle(r.targetTitle)),
    );
    const diagrams = proposal.diagrams.filter((_, i) => selDiagrams[i]);
    const selectedProposal: BootstrapProposal = { summary: proposal.summary, artifacts, relations, diagrams };

    setApplying(true);
    try {
      const res = await aiApi.applyBootstrap(projectId, selectedProposal, sessionId);
      const a = res.applied.artifacts.length;
      const r = res.applied.relations.length;
      const d = res.applied.diagrams.length;
      toast.success(
        `Applied ${a} artifact${a === 1 ? "" : "s"}, ${r} relation${r === 1 ? "" : "s"}, ${d} diagram${d === 1 ? "" : "s"}`,
      );
      if (res.skipped.length > 0) {
        toast.message(`${res.skipped.length} item${res.skipped.length === 1 ? "" : "s"} skipped during apply.`);
      }
      await onApplied();
      onClose();
    } catch (err) {
      const { status, code, message } = errInfo(err);
      if (status === 422) toast.error(message || "The selection didn't pass validation. Adjust and try again.");
      else if (status === 503 || code === "AI_NOT_CONFIGURED")
        toast.error("AI is not configured. Add ANTHROPIC_API_KEY to the backend environment.");
      else if (status === 502) toast.error("AI provider failed. Try again.");
      else if (status === 403) toast.error(message || "You don't have permission to apply changes.");
      else toast.error(message || "Failed to apply.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal title="Generate Initial Architecture with AI" onClose={onClose}>
      {generating ? (
        <GeneratingView />
      ) : step === "describe" ? (
        <div className="flex flex-col gap-3">
          <div className="text-[13px] text-fg-muted">
            Describe your software idea. AI proposes an initial set of artifacts, relations, and one to three
            diagrams for you to review.
          </div>
          <textarea
            value={idea}
            onChange={(e) => {
              setIdea(e.target.value);
              if (genError) setGenError(null);
            }}
            placeholder="Describe your software idea…  e.g. A platform to manage a football club: players, matches, training, and membership payments."
            spellCheck={false}
            className="min-h-[150px] max-h-[280px] px-3 py-2 bg-panel-2 border border-border rounded-sm text-[13px] leading-relaxed focus:outline-none focus:border-border-strong"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11.5px] text-fg-subtle">
              {idea.trim().length < 10 ? `${idea.trim().length}/10 characters minimum` : "Looks good"}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setIdea(ex)}
                  className="text-[11.5px] px-2 py-1 rounded-full border border-border bg-panel-2 text-fg-muted hover:text-fg hover:border-border-strong"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {genError && (
            <div
              className="flex items-start gap-2 rounded-md border p-3 text-[12.5px]"
              style={{
                borderColor: "color-mix(in srgb, var(--c-danger) 35%, transparent)",
                background: "color-mix(in srgb, var(--c-danger) 10%, transparent)",
              }}
            >
              <AlertTriangle size={14} className="mt-0.5 text-danger shrink-0" />
              <span className="text-fg whitespace-pre-line">{genError}</span>
            </div>
          )}
          <div className="rounded-md bg-panel-2 border border-border px-3 py-2 text-[12px] text-fg-muted">
            AI creates a draft only. Nothing is saved until you confirm.
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={<Sparkles size={14} />}
              onClick={generate}
              disabled={!ideaValid}
            >
              Generate Draft
            </Button>
          </div>
        </div>
      ) : (
        proposal &&
        validation && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-panel-2 border border-border px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1">Proposed architecture</div>
              <div className="text-[13px] text-fg leading-relaxed">
                {proposal.summary || "Review the proposed items below, then confirm the ones you want."}
              </div>
            </div>
            <div
              className="rounded-md px-3 py-2 text-[12px]"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "color-mix(in srgb, var(--c-info) 30%, transparent)",
                background: "color-mix(in srgb, var(--c-info) 8%, transparent)",
                color: "var(--fg-muted)",
              }}
            >
              You can select, deselect, and review every item before applying. Nothing is saved until you confirm.
            </div>

            {/* Artifacts */}
            <Section title="Artifacts" count={proposal.artifacts.length}>
              {proposal.artifacts.map((a, i) => {
                const dec = validation.artifacts[i];
                return (
                  <ItemRow key={i} checked={!!selArtifacts[i]} onToggle={() => toggleAt(setSelArtifacts, i)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-medium">{a.title}</span>
                      <Badge tone="default" mono square>
                        {a.type}
                      </Badge>
                      <Badge tone={confidenceTone(a.confidence)}>{Math.round(a.confidence * 100)}%</Badge>
                    </div>
                    {a.rationale && <div className="text-[12px] text-fg-muted mt-0.5">{a.rationale}</div>}
                    {dec && !dec.accepted && <Warn reason={dec.reason} />}
                  </ItemRow>
                );
              })}
            </Section>

            {/* Relations */}
            {proposal.relations.length > 0 && (
              <Section title="Relations" count={proposal.relations.length}>
                {proposal.relations.map((r, i) => {
                  const dec = validation.relations[i];
                  const ok = endpointSelected(r);
                  return (
                    <ItemRow
                      key={i}
                      checked={!!selRelations[i] && ok}
                      disabled={!ok}
                      onToggle={() => toggleAt(setSelRelations, i)}
                    >
                      <div className="flex items-center gap-2 flex-wrap text-[13px]">
                        <span className="font-medium">{r.sourceTitle}</span>
                        <span className="text-fg-subtle">→</span>
                        <span className="font-medium">{r.targetTitle}</span>
                        <Badge tone="info" mono>
                          {r.relationType}
                        </Badge>
                        <Badge tone={confidenceTone(r.confidence)}>{Math.round(r.confidence * 100)}%</Badge>
                      </div>
                      {r.rationale && <div className="text-[12px] text-fg-muted mt-0.5">{r.rationale}</div>}
                      {!ok ? (
                        <div className="flex items-center gap-1.5 text-[11.5px] text-warning mt-0.5">
                          <AlertTriangle size={12} /> Endpoint artifact is not selected — this relation will be skipped.
                        </div>
                      ) : (
                        dec && !dec.accepted && <Warn reason={dec.reason} />
                      )}
                    </ItemRow>
                  );
                })}
              </Section>
            )}

            {/* Diagrams */}
            {proposal.diagrams.length > 0 && (
              <Section title="Diagrams" count={proposal.diagrams.length}>
                {proposal.diagrams.map((d, i) => {
                  const dec = validation.diagrams[i];
                  const invalid = dec && !dec.accepted;
                  // Live referential check against the CURRENT selection: a selected
                  // diagram whose nodes reference an unselected artifact will be
                  // rejected on apply. Recompute from server-extracted `nodes` so the
                  // warning tracks the user's checkboxes (the propose-time decision
                  // was made against the full proposal).
                  const missingRefs = (dec?.nodes ?? []).filter((n) => !titles.has(normTitle(n)));
                  const showRefWarning = !invalid && !!selDiagrams[i] && missingRefs.length > 0;
                  return (
                    <div key={i} className="rounded-md border border-border bg-panel-2 p-3 flex flex-col gap-2">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selDiagrams[i]}
                          onChange={() => toggleAt(setSelDiagrams, i)}
                          className="w-4 h-4 accent-[var(--accent)]"
                        />
                        <span className="text-[13.5px] font-medium flex-1">{d.title}</span>
                        <Badge tone={confidenceTone(d.confidence)}>{Math.round(d.confidence * 100)}%</Badge>
                      </label>
                      {invalid ? (
                        <Warn reason={dec?.reason} />
                      ) : (
                        <>
                          {showRefWarning && <DiagramRefWarning missing={missingRefs} />}
                          <div className="border border-border rounded-md bg-panel overflow-auto max-h-[320px] p-2">
                            <MermaidPreview source={d.mermaidSource} />
                          </div>
                        </>
                      )}
                      <details className="group text-[12px] text-fg-muted">
                        <summary className="cursor-pointer select-none inline-flex items-center gap-1 list-none">
                          <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                          Mermaid source
                        </summary>
                        <pre className="mt-2 px-3 py-2 bg-panel border border-border rounded-sm text-[12px] font-mono leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                          {d.mermaidSource}
                        </pre>
                      </details>
                    </div>
                  );
                })}
              </Section>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 mt-1 sticky bottom-0 bg-panel pt-3 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                icon={<ArrowLeft size={13} />}
                onClick={() => setStep("describe")}
                disabled={applying}
              >
                Back
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-fg-muted hidden sm:inline">
                  {selected.a} artifact{selected.a === 1 ? "" : "s"} · {selected.r} relation
                  {selected.r === 1 ? "" : "s"} · {selected.d} diagram{selected.d === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="primary"
                  icon={applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  onClick={apply}
                  disabled={applying || nothingSelected}
                >
                  {applying ? "Applying…" : "Confirm Selected"}
                </Button>
              </div>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}

function GeneratingView() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <Loader2 size={28} className="animate-spin text-accent" />
      <div className="text-[14px] font-medium">Generating architecture draft…</div>
      <div className="text-[12.5px] text-fg-muted">This usually takes a few seconds. Nothing is saved yet.</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12.5px] font-semibold tracking-tight flex items-center gap-2">
        {title} <span className="text-fg-subtle font-normal">{count}</span>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function ItemRow({
  checked,
  disabled,
  onToggle,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={
        "flex items-start gap-2.5 rounded-md border border-border bg-panel-2 px-3 py-2 " +
        (disabled ? "opacity-55" : "cursor-pointer hover:border-border-strong")
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)]"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function Warn({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-warning mt-0.5">
      <AlertTriangle size={12} /> {reason || "Flagged by validation — unchecked by default."}
    </div>
  );
}

// Live warning when a selected diagram references artifacts the user hasn't
// selected. The diagram would be rejected on apply (SSOT integrity), so surface
// it here with the exact artifacts to re-select.
function DiagramRefWarning({ missing }: { missing: string[] }) {
  return (
    <div
      className="rounded-md px-2.5 py-2 text-[11.5px]"
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "color-mix(in srgb, var(--c-warning) 35%, transparent)",
        background: "color-mix(in srgb, var(--c-warning) 8%, transparent)",
      }}
    >
      <div className="flex items-center gap-1.5 font-medium text-warning">
        <AlertTriangle size={12} /> Diagram references artifacts that are not selected — it will be skipped on apply.
      </div>
      <ul className="mt-1 ml-5 list-disc text-fg-muted">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-lg w-full max-w-[860px] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-panel z-10">
          <div className="text-[14px] font-semibold truncate flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            {title}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 grid place-items-center rounded-sm text-fg-muted hover:bg-panel-hover hover:text-fg"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
