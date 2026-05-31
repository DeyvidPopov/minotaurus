// app/page.tsx — public landing
"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  ArrowRight,
  Check,
  Edit3,
  Link as LinkIcon,
  Shield,
  Package,
  Network,
  Box,
  Plug,
  Database,
  Command,
  GitMerge,
  BookOpen,
  History,
  Activity,
} from "lucide-react"
import { ARTIFACTS, RELATIONS } from "@/lib/mock-data"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { BrandLogo } from "@/components/shell/brand-logo"

export default function LandingPage() {
  // tight subgraph for the hero — a focused, fully-connected cluster around the
  // Orders/Payments/Auth flow (13 nodes). Every node has at least one edge
  // within the set, so the LR layout reads cleanly with no orphans.
  const heroNodes = useMemo(() => {
    const ids = new Set([
      "svc-auth",
      "svc-user",
      "svc-orders",
      "svc-payments",
      "svc-inventory",
      "svc-notifs",
      "db-orders",
      "db-payments",
      "api-orders",
      "api-payments",
      "ext-stripe",
      "doc-arch",
      "sec-mfa",
    ])
    return ARTIFACTS.filter((a) => ids.has(a.id))
  }, [])
  const heroIds = useMemo(
    () => new Set(heroNodes.map((n) => n.id)),
    [heroNodes],
  )
  const heroRels = useMemo(
    () =>
      RELATIONS.filter((r) => heroIds.has(r.source) && heroIds.has(r.target)),
    [heroIds],
  )

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* nav */}
      <nav className="max-w-[1280px] mx-auto px-8 py-4 flex items-center gap-4 text-[14px]">
        <BrandLogo href="/" />
        <div className="flex gap-5 ml-7 text-fg-muted hidden sm:flex">
          <a href="#workflow" className="hover:text-fg">
            Workflow
          </a>
          <a href="#features" className="hover:text-fg">
            Features
          </a>
        </div>
        <div className="flex-1" />
        <Link
          href="/login"
          className="h-8 px-3 inline-flex items-center bg-panel border border-border rounded-sm text-[13px] hover:bg-panel-hover"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="h-8 px-3.5 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[13px] font-medium hover:brightness-95"
        >
          Get started <ArrowRight size={13} />
        </Link>
      </nav>

      {/* hero */}
      <header className="max-w-[1280px] mx-auto px-8 pt-14 pb-7 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <div>
          <span className="inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full text-[12px] text-fg-muted bg-panel border border-border mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            <span className="font-mono text-fg">v1.0</span>
            <span>Source-of-truth for software architecture</span>
          </span>
          <h1 className="text-[60px] leading-[1.04] tracking-tight font-semibold m-0 mb-4">
            Your system, <em className="not-italic text-accent">connected</em>.
            <br />
            One source of truth.
          </h1>
          <p className="text-[18px] leading-relaxed text-fg-muted max-w-[540px] m-0 mb-7">
            Minotaurus is a workspace for modelling your platform&apos;s services,
            APIs, databases, documentation and diagrams as connected artifacts.
            Validate consistency, trace every change, and export the whole thing
            as a single SSOT bundle.
          </p>
          <div className="flex gap-2.5 flex-wrap mb-7">
            <Link
              href="/dashboard"
              className="h-10 px-4 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[14px] font-medium hover:brightness-95"
            >
              <Box size={14} /> Open workspace <ArrowRight size={14} />
            </Link>
            <Link
              href="/login"
              className="h-10 px-4 inline-flex items-center gap-1.5 bg-panel border border-border rounded-sm text-[14px] hover:bg-panel-hover"
            >
              <Network size={14} /> Sign in to the demo
            </Link>
          </div>
          <div className="flex items-center gap-5 flex-wrap text-[12px] text-fg-muted">
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-success" /> Markdown · Mermaid
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-success" /> Self-hosted
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-success" /> PostgreSQL-backed
            </span>
          </div>
        </div>

        {/* hero graph preview */}
        <div
          className="rounded-xl overflow-hidden border border-border shadow-lg relative aspect-[4/3] min-h-[340px]"
          style={{
            background: "linear-gradient(180deg, var(--panel), var(--panel-2))",
          }}
        >
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-panel text-[12px] text-fg-muted">
            <div className="flex gap-1.5">
              <i className="w-2 h-2 rounded-full bg-border-strong" />
              <i className="w-2 h-2 rounded-full bg-border-strong" />
              <i className="w-2 h-2 rounded-full bg-border-strong" />
            </div>
            <span className="font-mono">example / knowledge-graph</span>
            <span className="flex-1" />
            <span className="text-[11px]">
              {heroNodes.length} nodes · {heroRels.length} edges
            </span>
          </div>
          <div className="absolute top-[38px] left-0 right-0 bottom-0">
            <GraphCanvas
              artifacts={heroNodes}
              relations={heroRels}
              nodeStyle="color"
              autoLayout="LR"
              showMiniMap={false}
              highlightSelected={false}
            />
          </div>
        </div>
      </header>

      {/* workflow */}
      <section id="workflow" className="bg-bg-2 border-y border-border py-16">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="text-center mb-11">
            <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
              From scattered notes to a single graph
            </h2>
            <p className="text-[16px] text-fg-muted m-0 max-w-[640px] mx-auto">
              You model your architecture as typed artifacts and link them by
              hand. Minotaurus keeps everything in one place and runs the
              consistency checks for you.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <Step
              n="01 · MODEL"
              t="Add typed artifacts"
              d="Services, API specs, databases, diagrams, security policies, environments — eleven artifact types out of the box, each with its own editor."
              icon={<Edit3 size={16} />}
            />
            <Step
              n="02 · CONNECT"
              t="Link your architecture"
              d="Draw DEPENDS_ON, USES, EXPOSES, SECURES and other relations between artifacts. Documentation, API specs and DB models can also be linked to the artifact they describe."
              icon={<LinkIcon size={16} />}
            />
            <Step
              n="03 · VALIDATE"
              t="Catch drift before it bites"
              d="Rule-based checks: orphaned artifacts, missing docs, active services depending on deprecated ones, security specs with public endpoints, FK targets that don't exist."
              icon={<Shield size={16} />}
            />
            <Step
              n="04 · EXPORT"
              t="Ship the SSOT"
              d="Generate a JSON or Markdown bundle covering artifacts, relations, API specs, databases, diagrams, validation report, version history and per-artifact impact."
              icon={<Package size={16} />}
            />
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="py-18 py-[72px]">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="text-center mb-11">
            <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
              Built like the systems you build
            </h2>
            <p className="text-[16px] text-fg-muted m-0 max-w-[600px] mx-auto">
              An engineering workspace, not a wiki. Typed artifacts, traceable
              relations, full change history.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feat
              icon={<Network size={16} />}
              title="Knowledge graph"
              body="A first-class graph view of every artifact, typed by shape and color. Pan, zoom, filter, drag nodes, open detail from any selection."
            />
            <Feat
              icon={<Box size={16} />}
              title="11 artifact types"
              body="Service, API spec, endpoint, database, entity, doc, diagram, requirement, security policy, environment, external system."
            />
            <Feat
              icon={<Plug size={16} />}
              title="API specs & endpoints"
              body="Define API specs by hand, add endpoints with method, path, summary, request/response schema and auth flag. OpenAPI-style JSON preview."
            />
            <Feat
              icon={<Database size={16} />}
              title="Database model"
              body="Entities and fields with PK/FK markers, including FK references between entities. Auto-generates a Mermaid ERD you can preview live."
            />
            <Feat
              icon={<Shield size={16} />}
              title="Validation engine"
              body="Deterministic, rule-based consistency checks across relationships, documentation, APIs, databases, diagrams and architecture-level heuristics."
            />
            <Feat
              icon={<History size={16} />}
              title="Version history"
              body="Every create / update / delete on any artifact, relation, doc, API spec, DB row, diagram, export or validation run is recorded to a project-scoped timeline."
            />
            <Feat
              icon={<Activity size={16} />}
              title="Impact analysis"
              body="One click from any artifact: direct dependencies, dependents, linked APIs, linked DB models, linked diagrams, documentation references."
            />
            <Feat
              icon={<GitMerge size={16} />}
              title="Mermaid diagrams"
              body="Split-view editor with live SVG preview, template picker, fullscreen view, and a syntax-status pill that lights up green/yellow as you type."
            />
            <Feat
              icon={<BookOpen size={16} />}
              title="Markdown documentation"
              body="One Markdown page per artifact. Split editor, live preview, GFM-flavored rendering (tables, code blocks, task lists)."
            />
            <Feat
              icon={<Package size={16} />}
              title="SSOT export"
              body="JSON and Markdown formats. Pick which sections to include (artifacts, relations, API specs, DB models, diagrams, validation, version history, impact). Copy or download."
            />
            <Feat
              icon={<Command size={16} />}
              title="⌘K palette"
              body="Quick-jump between dashboard, projects list, and project pages. Type-to-filter."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="py-20 px-8 text-center border-t border-border"
        style={{
          background: "linear-gradient(180deg, var(--panel), var(--bg-2))",
        }}
      >
        <h2 className="text-[36px] font-semibold tracking-tight m-0 mb-3">
          Bring your architecture together.
        </h2>
        <p className="text-[16px] text-fg-muted m-0 mb-7 max-w-[520px] mx-auto">
          Open the workspace and tour the seeded <em className="not-italic text-fg">Online Shop Platform</em>{" "}
          — 10 artifacts, an Authentication API, a database model with an ERD, and a full
          12-day version history.
        </p>
        <div className="flex gap-2.5 justify-center flex-wrap">
          <Link
            href="/dashboard"
            className="h-10 px-4 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[14px] font-medium hover:brightness-95"
          >
            <Box size={14} /> Open workspace <ArrowRight size={14} />
          </Link>
          <Link
            href="/login"
            className="h-10 px-4 inline-flex items-center bg-panel border border-border rounded-sm text-[14px] hover:bg-panel-hover"
          >
            Sign in
          </Link>
        </div>
        <p className="text-[12px] text-fg-subtle mt-5">
          Demo credentials: <span className="font-mono text-fg-muted">deyvid@minotaurus.dev</span>{" "}
          / <span className="font-mono text-fg-muted">minotaurus</span>
        </p>
      </section>

      <footer className="max-w-[1280px] mx-auto px-8 py-7 flex items-center gap-4 text-[12px] text-fg-muted border-t border-border flex-wrap">
        <span>
          © Minotaurus · <span className="font-mono">minotaurus.dev</span> ·
          diploma project
        </span>
        <span className="font-mono text-fg-subtle">v1.0.0</span>
        <div className="flex gap-5 ml-auto">
          <Link href="/dashboard" className="hover:text-fg">
            Workspace
          </Link>
          <Link href="/settings" className="hover:text-fg">
            Settings
          </Link>
        </div>
      </footer>
    </div>
  )
}

function Step({
  n,
  t,
  d,
  icon,
}: {
  n: string
  t: string
  d: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-panel p-6 flex flex-col gap-2.5">
      <div className="w-8 h-8 rounded-md grid place-items-center bg-accent-soft text-accent">
        {icon}
      </div>
      <div className="font-mono text-fg-subtle text-[11.5px] tracking-wider">
        {n}
      </div>
      <h3 className="m-0 text-[15px] font-semibold tracking-tight">{t}</h3>
      <p className="m-0 text-[13.5px] text-fg-muted leading-relaxed">{d}</p>
    </div>
  )
}

function Feat({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="bg-panel border border-border rounded-lg p-5 flex flex-col gap-2">
      <div className="w-8 h-8 rounded-md grid place-items-center bg-accent-soft text-accent">
        {icon}
      </div>
      <div className="font-semibold tracking-tight text-[15px]">{title}</div>
      <p className="m-0 text-[13.5px] text-fg-muted leading-relaxed">{body}</p>
    </div>
  )
}
