// app/page.tsx — public landing
"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  ArrowRight,
  Check,
  Upload,
  Link as LinkIcon,
  Shield,
  Package,
  Network,
  Box,
  Plug,
  Database,
  Command,
  Sparkles,
  BookOpen,
  History,
} from "lucide-react"
import { ARTIFACTS, RELATIONS } from "@/lib/mock-data"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { Badge } from "@/components/ui/badge"

export default function LandingPage() {
  // tight subgraph for the hero — only services and their immediate links
  const heroNodes = useMemo(() => {
    const ids = new Set([
      "svc-auth",
      "svc-user",
      "svc-orders",
      "svc-payments",
      "svc-inventory",
      "svc-search",
      "svc-notifs",
      "db-users",
      "db-orders",
      "db-payments",
      "api-auth",
      "api-orders",
      "api-payments",
      "ext-stripe",
      "ext-sendgrid",
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
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md grid place-items-center text-white font-bold font-mono text-[13px]"
            style={{
              background:
                "linear-gradient(140deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #000))",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.18)",
            }}
          >
            M
          </div>
          <span className="font-semibold tracking-tight">Minotaurus</span>
          <Badge mono>minotaurus.dev</Badge>
        </Link>
        <div className="flex gap-5 ml-7 text-fg-muted hidden sm:flex">
          <a href="#workflow" className="hover:text-fg">
            Workflow
          </a>
          <a href="#features" className="hover:text-fg">
            Features
          </a>
          <a href="/docs" className="hover:text-fg">
            Docs
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
            Minotaurus maps every service, API, database, document and diagram
            in your platform into a living knowledge graph. Validate
            consistency, trace changes, and export the whole stack as a single
            SSOT bundle.
          </p>
          <div className="flex gap-2.5 flex-wrap mb-7">
            <Link
              href="/dashboard"
              className="h-10 px-4 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[14px] font-medium hover:brightness-95"
            >
              <Box size={14} /> Open workspace <ArrowRight size={14} />
            </Link>
            <Link
              href="/projects/p_helix/graph"
              className="h-10 px-4 inline-flex items-center gap-1.5 bg-panel border border-border rounded-sm text-[14px] hover:bg-panel-hover"
            >
              <Network size={14} /> Tour the graph
            </Link>
          </div>
          <div className="flex items-center gap-5 flex-wrap text-[12px] text-fg-muted">
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-success" /> OpenAPI · GraphQL ·
              Mermaid · ERD
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-success" /> Self-hosted
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={13} className="text-success" /> SSO ready
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
            <span className="font-mono">helix-commerce / knowledge-graph</span>
            <span className="flex-1" />
            <span className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-success" /> live
            </span>
            <span className="text-[11px]">
              {heroNodes.length} nodes · {heroRels.length} edges
            </span>
          </div>
          <div className="absolute top-[38px] left-0 right-0 bottom-0">
            <GraphCanvas
              artifacts={heroNodes}
              relations={heroRels}
              nodeStyle="color"
              selectedId="svc-orders"
            />
          </div>
        </div>
      </header>

      {/* workflow */}
      <section id="workflow" className="bg-bg-2 border-y border-border py-16">
        <div className="max-w-[1280px] mx-auto px-8">
          <div className="text-center mb-11">
            <h2 className="text-[36px] tracking-tight font-semibold m-0 mb-3">
              From scattered docs to a single graph
            </h2>
            <p className="text-[16px] text-fg-muted m-0 max-w-[600px] mx-auto">
              Minotaurus pulls everything you already write into one connected
              workspace. No new format to learn — bring your OpenAPI, your
              Markdown, your Mermaid.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <Step
              n="01 · INGEST"
              t="Import what you have"
              d="Drop in OpenAPI specs, Markdown docs, Mermaid diagrams, and database schemas. Minotaurus parses and turns them into typed artifacts."
              icon={<Upload size={16} />}
            />
            <Step
              n="02 · CONNECT"
              t="Link your architecture"
              d="Draw relations between services, endpoints, databases, requirements and policies — or let validation suggest the obvious ones."
              icon={<LinkIcon size={16} />}
            />
            <Step
              n="03 · VALIDATE"
              t="Catch drift before it bites"
              d="Missing docs, undocumented endpoints, deprecated services still in production. Issues open inline next to the artifact that caused them."
              icon={<Shield size={16} />}
            />
            <Step
              n="04 · EXPORT"
              t="Ship the SSOT"
              d="Generate a JSON, Markdown, PDF or ZIP bundle that documents the whole system — versioned, reproducible, ready for handoff."
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
              relations, real keyboard shortcuts.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Feat
              icon={<Network size={16} />}
              title="Knowledge graph"
              body="A first-class graph view of every artifact, typed by shape and color. Pan, zoom, filter, and open detail from any node."
            />
            <Feat
              icon={<Box size={16} />}
              title="11 artifact types"
              body="Service, API spec, endpoint, database, entity, doc, diagram, requirement, security policy, environment, external system."
            />
            <Feat
              icon={<Plug size={16} />}
              title="OpenAPI ingest"
              body="Paste or upload an OpenAPI / GraphQL spec; endpoints appear as linked artifacts you can validate and document."
            />
            <Feat
              icon={<Database size={16} />}
              title="Database model"
              body="Tables, fields, primary and foreign keys, normalization warnings — all linked to the services that own them."
            />
            <Feat
              icon={<Shield size={16} />}
              title="Validation engine"
              body="Consistency rules across documentation, APIs, databases, security and relationships. Severity-tiered."
            />
            <Feat
              icon={<History size={16} />}
              title="Versioned everything"
              body="Every artifact, relation, doc edit and validation run is recorded — a full audit trail with diffs."
            />
            <Feat
              icon={<BookOpen size={16} />}
              title="Markdown + Mermaid"
              body="Editor with live preview. Sequence diagrams, flowcharts and ERDs render inline next to the code they describe."
            />
            <Feat
              icon={<Package size={16} />}
              title="One-click SSOT export"
              body="Bundle the whole project — artifacts, graph, validation report, version history — as ZIP, JSON, Markdown or PDF."
            />
            <Feat
              icon={<Command size={16} />}
              title="Keyboard-first"
              body="⌘K palette indexes everything. Open any artifact, endpoint or doc from one keystroke."
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
          Open the workspace and explore Helix Commerce — a fully-loaded
          reference project with 32 artifacts and a live graph.
        </p>
        <div className="flex gap-2.5 justify-center flex-wrap">
          <Link
            href="/dashboard"
            className="h-10 px-4 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[14px] font-medium hover:brightness-95"
          >
            <Sparkles size={14} /> Open workspace <ArrowRight size={14} />
          </Link>
          <Link
            href="/login"
            className="h-10 px-4 inline-flex items-center bg-panel border border-border rounded-sm text-[14px] hover:bg-panel-hover"
          >
            Sign in
          </Link>
        </div>
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
    <div className="p-5 border border-border rounded-lg bg-panel">
      <div className="w-[30px] h-[30px] rounded-md grid place-items-center bg-accent-soft text-accent mb-3.5">
        {icon}
      </div>
      <h3 className="m-0 mb-1.5 text-[15px] font-semibold tracking-tight">
        {title}
      </h3>
      <p className="m-0 text-[13.5px] text-fg-muted leading-relaxed">{body}</p>
    </div>
  )
}
