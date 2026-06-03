// components/landing/ai-gate.tsx — the key differentiator section.
//
// Three cards left→right (AI SUGGESTS → RULES DECIDE → YOU APPROVE) with
// animated connector arrows between them, then a pill note that states the
// gate plainly. AI is deliberately NOT presented as autonomous: the model can
// PROPOSE, but only deterministic rules + a human can COMMIT — which is exactly
// the AI Safety & Determinism contract the platform is built on.
//
// Pure presentation (CSS-driven arrows); collapses to one column on mobile and
// the connector arrows rotate 90° (see globals.css @media max-width: 860px).

import { Sparkles, ShieldCheck, CircleCheck, ArrowRight } from "lucide-react";

interface GateCard {
  badge: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  color: string;
  chipLabel: string;
  chip: React.ReactNode;
}

const CARDS: GateCard[] = [
  {
    badge: "AI proposes",
    title: "AI suggests",
    blurb:
      "The model drafts artifacts, relations and fixes from your intent — fast, but never trusted on its own.",
    icon: <Sparkles size={18} />,
    color: "#8b5cf6",
    chipLabel: "suggestion",
    chip: (
      <>
        Link <span className="text-fg">/auth/reset</span> →{" "}
        <span className="text-fg">reset_tokens</span>{" "}
        <span className="text-fg-subtle">(USES)</span>
      </>
    ),
  },
  {
    badge: "Deterministic validation",
    title: "Rules decide",
    blurb:
      "Every suggestion is checked against explicit, repeatable rules. The engine — not the model — has the final say.",
    icon: <ShieldCheck size={18} />,
    color: "var(--accent)",
    chipLabel: "checks",
    chip: (
      <span className="text-fg">
        schema ✓ · FK ✓ · policy ✓ · no cycle ✓
      </span>
    ),
  },
  {
    badge: "Approved architecture",
    title: "You approve",
    blurb:
      "Only verified, human-approved changes enter the SSOT — versioned with a diff and an author.",
    icon: <CircleCheck size={18} />,
    color: "#10b981",
    chipLabel: "committed",
    chip: (
      <>
        <span className="text-fg">rel #218</span> approved by you ·{" "}
        <span className="text-fg">v1.0.0</span>
      </>
    ),
  },
];

export function AiGate() {
  return (
    <section id="ai" className="py-[72px] border-t border-border">
      <div className="max-w-[1280px] mx-auto px-8">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] text-fg-muted bg-panel border border-border mb-5">
            <Sparkles size={13} className="text-accent" />
            AI-assisted, deterministically governed
          </span>
          <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
            AI proposes. Rules and a human dispose.
          </h2>
          <p className="text-[16px] text-fg-muted m-0 max-w-[640px] mx-auto">
            Pure AI generation drifts and hallucinates. Minotaurus puts a
            deterministic gate between the model and your source of truth — so
            speed never costs you trust.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-4 md:gap-0">
          {CARDS.map((c, i) => (
            <div key={c.title} className="flex flex-col md:flex-row items-stretch flex-1">
              <div className="flex-1 rounded-xl border border-border bg-panel p-6 flex flex-col gap-3">
                <div
                  className="w-10 h-10 rounded-lg grid place-items-center"
                  style={{ background: `color-mix(in srgb, ${c.color} 14%, transparent)`, color: c.color }}
                >
                  {c.icon}
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-wider text-fg-subtle uppercase">
                    {c.badge}
                  </div>
                  <h3 className="m-0 text-[17px] font-semibold tracking-tight" style={{ color: c.color }}>
                    {c.title}
                  </h3>
                </div>
                <p className="m-0 text-[13.5px] text-fg-muted leading-relaxed flex-1">
                  {c.blurb}
                </p>
                <div className="rounded-md border border-border bg-panel-2 px-3 py-2">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1">
                    {c.chipLabel}
                  </div>
                  <div className="font-mono text-[12px] text-fg-muted leading-snug">
                    {c.chip}
                  </div>
                </div>
              </div>

              {/* connector arrow between cards */}
              {i < CARDS.length - 1 && (
                <div className="flex items-center justify-center px-1 py-2 md:py-0 md:px-3 shrink-0">
                  <ArrowRight
                    size={22}
                    className="aigate-arrow text-fg-subtle"
                    style={{ animationDelay: `${i * 0.4}s` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center">
          <p className="m-0 inline-flex items-start gap-2.5 max-w-[760px] text-center text-[13.5px] text-fg-muted bg-panel border border-border rounded-full px-5 py-3 leading-relaxed">
            <ShieldCheck size={16} className="text-accent shrink-0 mt-0.5" />
            <span>
              The model can{" "}
              <span className="font-semibold text-fg">PROPOSE</span>. Only
              deterministic rules + a human can{" "}
              <span className="font-semibold text-fg">COMMIT</span>. That gate is
              what makes the SSOT trustworthy.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
