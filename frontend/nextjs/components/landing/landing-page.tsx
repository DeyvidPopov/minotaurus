// components/landing/landing-page.tsx — story-driven public landing page.
//
// Composes the whole marketing page: nav → hero (with the decorative
// ParallaxGraph behind it and a before/after card pair) → the animated
// PipelineTheater (the artifacts→…→SSOT centerpiece) → the Governance gate →
// "Why SSOT matters" → the platform feature grid → CTA + footer.
//
// Server component: the only client islands are <LandingNav> (the burger-menu
// state), <BrandLogo> (auth-aware link) and <PipelineTheater> (the state
// machine). Colors come exclusively from the
// design-system CSS variables / the documented type-color palette — none are
// invented. The page renders on the public dark+purple brand theme that
// app/layout.tsx + globals.css pin (accent/theme are scoped to the app shell).

import Link from "next/link";
import {
  ArrowRight,
  Check,
  X,
  Network,
  Box,
  Plug,
  Database,
  Shield,
  Sparkles,
  GitMerge,
  Package,
  Command,
  Layers,
  GitCompare,
  Scale,
  Download,
} from "lucide-react";
import { BrandLogo } from "@/components/shell/brand-logo";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { LandingNav } from "./landing-nav";
import { ParallaxGraph } from "./parallax-graph";
import { PipelineTheater } from "./pipeline-theater";
import { Governance } from "./governance";

const RIBBON = ["Artifacts", "Graph", "Validation", "Docs", "SSOT"];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* ----------------------------------------------------------- nav */}
      <LandingNav />

      {/* ---------------------------------------------------------- hero */}
      <header className="relative overflow-hidden border-b border-border min-h-[calc(100dvh-61px)] flex flex-col justify-center">
        <ParallaxGraph />
        <div className="relative w-full max-w-[1280px] mx-auto px-8 py-12 grid lg:grid-cols-[1.08fr_1fr] gap-12 items-center">
          <div>
            <h1 className="text-[clamp(40px,6vw,62px)] leading-[1.04] tracking-tight font-semibold m-0 mb-5">
              Your architecture, in one{" "}
              <em className="not-italic text-accent">governed source of truth</em>.
            </h1>
            <p className="text-[18px] leading-relaxed text-fg-muted max-w-[560px] m-0 mb-6">
              Minotaurus is a software architecture platform that keeps your
              services, APIs, databases, diagrams and documentation connected,
              validated and traceable — so your architecture and what you ship
              never drift apart.
            </p>

            {/* mono pipeline ribbon */}
            <div className="inline-flex items-center flex-wrap gap-x-1 gap-y-1 font-mono text-[13px] mb-7 rounded-md border border-border bg-panel px-3 py-2">
              {RIBBON.map((step, i) => (
                <span key={step} className="inline-flex items-center gap-1">
                  <span className={i === RIBBON.length - 1 ? "text-accent" : "text-fg"}>
                    {step}
                  </span>
                  {i < RIBBON.length - 1 && (
                    <ArrowRight size={12} className="text-fg-subtle mx-0.5" />
                  )}
                </span>
              ))}
            </div>

            <div className="flex gap-2.5 flex-wrap mb-7">
              <Link
                href="/register"
                className="h-10 px-4 inline-flex items-center gap-1.5 bg-accent text-accent-fg border border-transparent rounded-sm text-[14px] font-medium transition-colors hover:brightness-[0.95] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
              >
                <Box size={14} /> Get started <ArrowRight size={14} />
              </Link>
              <a
                href="#workflow"
                className="h-10 px-4 inline-flex items-center gap-1.5 bg-panel border border-border rounded-sm text-[14px] transition-colors hover:bg-panel-hover"
              >
                <Network size={14} /> View workflow
              </a>
            </div>
          </div>

          {/* before / after card pair */}
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-panel p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-md grid place-items-center bg-danger/15 text-danger">
                  <X size={14} />
                </span>
                <span className="text-[13px] font-semibold text-fg">Today: scattered docs</span>
              </div>
              <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[12.5px] text-fg-muted">
                {[
                  "Wiki, tickets, diagrams — all out of sync",
                  "No way to know what depends on what",
                  "Drift discovered in production, too late",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <X size={13} className="text-danger shrink-0 mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-center text-fg-subtle">
              <ArrowRight size={16} className="rotate-90" />
            </div>

            <div
              className="rounded-xl border p-5"
              style={{
                borderColor: "var(--accent-ring)",
                background: "linear-gradient(180deg, var(--panel), var(--panel-2))",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-md grid place-items-center bg-success/15 text-success">
                  <Check size={14} />
                </span>
                <span className="text-[13px] font-semibold text-fg">With Minotaurus: one verified graph</span>
              </div>
              <ul className="m-0 p-0 list-none flex flex-col gap-2 text-[12.5px] text-fg-muted">
                {[
                  "Every artifact typed, linked and traceable",
                  "Rules catch drift before it ships",
                  "One sealed SSOT bundle, versioned with diffs",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <Check size={13} className="text-success shrink-0 mt-0.5" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------- pipeline theater */}
      <section id="workflow" className="bg-bg-2 border-b border-border py-16">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="text-center mb-10">
            <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
              Watch your architecture become connected.
            </h2>
            <p className="text-[16px] text-fg-muted m-0 max-w-[680px] mx-auto">
              Every artifact — services, APIs, database models, diagrams and docs —
              is typed, wired into one navigable graph, validated for consistency,
              and sealed into a single versioned source of truth. Hover to pause;
              click a step to jump.
            </p>
          </div>
          <PipelineTheater />
        </div>
      </section>

      {/* ------------------------------------------------------ governance */}
      <Governance />

      {/* --------------------------------------------------- why SSOT matters */}
      <section id="why" className="bg-bg-2 border-t border-border py-[72px]">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="text-center mb-11">
            <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
              Why a single source of truth matters
            </h2>
            <p className="text-[16px] text-fg-muted m-0 max-w-[620px] mx-auto">
              Documentation that lies is worse than none. An SSOT is the
              difference between hoping your architecture is right and knowing it.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Why
              icon={<Layers size={16} />}
              title="Consistency"
              body="One model, no drift. Services, APIs, databases and docs reference the same artifacts — change it once, it changes everywhere."
            />
            <Why
              icon={<GitCompare size={16} />}
              title="Traceability"
              body="Every create, update and delete is versioned with a diff and an author. You can always answer who changed what, and when."
            />
            <Why
              icon={<Scale size={16} />}
              title="Trust"
              body="Deterministic rules — not guesswork — decide whether the architecture is consistent. The same input always gives the same verdict."
            />
            <Why
              icon={<Download size={16} />}
              title="Portability"
              body="Export the whole verified system as a JSON, Markdown or PDF bundle. The SSOT travels with you, reproducible byte-for-byte."
            />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- platform features */}
      <section id="platform" className="py-[72px]">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="text-center mb-11">
            <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
              Built like the systems you build
            </h2>
            <p className="text-[16px] text-fg-muted m-0 max-w-[600px] mx-auto">
              An engineering workspace, not a wiki — typed artifacts, traceable
              relations and deterministic checks across your whole architecture.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feat
              icon={<Network size={16} />}
              title="Knowledge graph"
              body="A first-class graph of every artifact, typed by shape and color. Pan, zoom, focus a node's neighborhood, open detail from any selection."
            />
            <Feat
              icon={<Box size={16} />}
              title="11 artifact types"
              body="Service, API spec, endpoint, database model, entity, documentation, diagram, requirement, security policy, environment, external system."
            />
            <Feat
              icon={<Plug size={16} />}
              title="OpenAPI ingest"
              body="Paste an OpenAPI spec, Mermaid diagram, SQL or Markdown — Minotaurus parses it into draft artifacts you review before they're confirmed."
            />
            <Feat
              icon={<Database size={16} />}
              title="Database models"
              body="Entities and fields with PK/FK markers and FK references between entities, auto-generating a live Mermaid ERD."
            />
            <Feat
              icon={<Shield size={16} />}
              title="Validation engine"
              body="Deterministic, rule-based consistency checks across relations, docs, APIs, databases, diagrams and architecture-level heuristics."
            />
            <Feat
              icon={<Sparkles size={16} />}
              title="Assisted, never autonomous"
              body="Optional intelligent assistance can draft a starting point, suggest per-artifact docs and review your architecture — always as reviewable suggestions, never source of truth until you accept them."
            />
            <Feat
              icon={<GitMerge size={16} />}
              title="Markdown + Mermaid"
              body="Split-view editors with live preview for per-artifact docs and diagrams, with a syntax-status pill that lights up as you type."
            />
            <Feat
              icon={<Package size={16} />}
              title="SSOT export"
              body="JSON, Markdown or a polished PDF report. Choose which sections to include; the analysis and renderer are pure and deterministic."
            />
            <Feat
              icon={<Command size={16} />}
              title="Keyboard-first"
              body={
                <>
                  A <ShortcutHint /> command palette quick-jumps between the
                  dashboard, projects and every project page. Type to filter.
                </>
              }
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section
        className="py-20 px-8 text-center border-t border-border"
        style={{ background: "linear-gradient(180deg, var(--panel), var(--bg-2))" }}
      >
        <h2 className="text-[36px] font-semibold tracking-tight m-0 mb-3">
          Bring your whole architecture into one source of truth.
        </h2>
        <p className="text-[16px] text-fg-muted m-0 mb-7 max-w-[560px] mx-auto">
          Open the workspace and tour the seeded{" "}
          <em className="not-italic text-fg">Online Shop Platform</em> — real
          artifacts, an API spec, a database ERD, validation and a full version
          history.
        </p>
        <div className="flex gap-2.5 justify-center flex-wrap">
          <Link
            href="/register"
            className="h-10 px-4 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[14px] font-medium hover:brightness-95"
          >
            <Box size={14} /> Get started <ArrowRight size={14} />
          </Link>
          <Link
            href="/login"
            className="h-10 px-4 inline-flex items-center bg-panel border border-border rounded-sm text-[14px] transition-colors hover:bg-panel-hover"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      {/* border-t lives on the full-width <footer> so the divider spans 100vw;
          the content stays constrained to the 1280px container inside. */}
      <footer className="border-t border-border text-[12px] text-fg-muted">
        <div className="max-w-[1280px] mx-auto px-8 py-7 flex items-center gap-4">
          <BrandLogo markSize={20} />
          <span className="ml-auto font-mono text-[11px] text-fg-subtle">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

function Why({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-2">
      <div className="w-9 h-9 rounded-md grid place-items-center bg-accent-soft text-accent">
        {icon}
      </div>
      <h3 className="m-0 text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="m-0 text-[13px] text-fg-muted leading-relaxed">{body}</p>
    </div>
  );
}

function Feat({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-2 hover:bg-panel-hover transition-colors">
      <div className="w-8 h-8 rounded-md grid place-items-center bg-accent-soft text-accent">
        {icon}
      </div>
      <div className="font-semibold tracking-tight text-[15px]">{title}</div>
      <p className="m-0 text-[13.5px] text-fg-muted leading-relaxed">{body}</p>
    </div>
  );
}
