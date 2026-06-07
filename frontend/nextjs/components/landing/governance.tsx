// components/landing/governance.tsx — the Governance differentiator section.
//
// Three cards left→right (DRAFTED → VALIDATED → ACCEPTED) with animated
// connector arrows between them, then a pill note that states the gate plainly.
// The governance model is the point: suggested or imported content is never
// source of truth until it passes deterministic rules AND a human accepts it —
// exactly the AI Safety & Determinism contract the platform is built on.
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
    badge: "Suggested",
    title: "Drafted",
    blurb:
      "Intelligent assistance and imports propose artifacts, relations and fixes from your intent and existing graph — fast to produce, never trusted on their own.",
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
    badge: "Deterministic rules",
    title: "Validated",
    blurb:
      "Every proposal is checked against explicit, repeatable rules. The engine — not a guess — has the final say.",
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
    badge: "Human-approved",
    title: "Accepted",
    blurb:
      "Only verified, approved changes enter the source of truth — versioned with a diff and an author.",
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

export function Governance() {
  return (
    <section id="governance" className="py-[72px] border-t border-border">
      <div className="max-w-[1280px] mx-auto px-8">
        <div className="text-center mb-12">
          <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
            Nothing enters your source of truth unverified.
          </h2>
          <p className="text-[16px] text-fg-muted m-0 max-w-[640px] mx-auto">
            Every suggested or imported change is checked against explicit,
            repeatable rules and approved by a person before it joins your
            architecture. Suggestions move fast — only verified changes become real.
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
              A suggestion can only{" "}
              <span className="font-semibold text-fg">PROPOSE</span>. Only
              deterministic rules and a human can{" "}
              <span className="font-semibold text-fg">COMMIT</span>. That gate is
              what keeps your source of truth trustworthy.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
