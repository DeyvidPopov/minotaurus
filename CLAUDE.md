# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Two-tree monorepo with no root `package.json`. Always `cd` into the right tree first.

- `backend/` — Express + TypeScript + Prisma/PostgreSQL. ESM (`NodeNext`), run via `tsx` (no separate build step in dev).
- `frontend/nextjs/` — Next.js 14 App Router, React 18, Tailwind, React Flow, Mermaid, Zustand. Talks to the backend over HTTP through `lib/api/`.
- `frontend/src/`, `frontend/tweaks-panel.jsx`, `frontend/index.html` — **legacy** Vite/JSX prototype, kept only as a design reference. Do not edit unless explicitly asked.
- `docs/` — original product spec (`01_..11_*.md`) plus `docs/AI_CONTEXT/` which holds the **living** state docs (`CURRENT_STATE.md`, `FEATURE_PROGRESS.md`, `KNOWN_LIMITATIONS.md`, `NEXT_STEPS.md`, `SESSION_HANDOFF.md`, `ARCHITECTURE_RULES.md`). Read those before guessing at intent — they are kept current per feature pass.
- `FRONTEND_RUNTIME_NOTES.md` — short-form local-runtime walkthrough (also covers the seeded demo flow).

## Common commands

### Backend (`cd backend`)

```
npm run dev              # tsx watch src/server.ts  (backend on :4000)
npm start                # tsx (no watcher)
npm run build            # prisma generate && tsc -p tsconfig.json  → dist/
npm run seed             # tsx scripts/seed-demo.ts — wipes + reseeds demo dataset
npm run test:api         # bash scripts/test-api.sh — full HTTP smoke pass (needs backend running)
npm run test:unit        # node --import tsx --test "src/**/*.test.ts" — pure-logic unit tests
npm run prisma:generate  # regenerate Prisma client
npm run prisma:migrate   # prisma migrate dev (interactive)
npm run prisma:reset     # prisma migrate reset --force (DESTRUCTIVE)
npm run prisma:studio    # Prisma Studio GUI
```

Two test layers: `scripts/test-api.sh` is the HTTP smoke pass, and `test:unit` runs Node's built-in test runner (`node:test` + `node:assert`, no Jest/Vitest) over `*.test.ts` files for pure-logic modules — currently the Export Engine V2 analysis engine and PDF SVG normalizer. New pure engines should ship a colocated `*.test.ts`. To run a single endpoint, hit it with `curl` (patterns in `backend/API_TEST_EXAMPLES.md`).

### Frontend (`cd frontend/nextjs`)

```
npm run dev        # next dev    (frontend on :3000)
npm run build      # next build
npm run start      # next start
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
```

### First-time bootstrap

PostgreSQL must be reachable at the URL in `backend/.env` (`DATABASE_URL`). The local install runs on **port 5433**, not the Postgres default 5432.

```
cd backend
npm install
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE minotaurus;"
npx prisma migrate deploy
npm run seed
npm run dev

# separate terminal:
cd frontend/nextjs && npm install && npm run dev
```

Demo login (always provisioned by the seed): `deyvid@minotaurus.dev` / `minotaurus`.

## Architecture — what requires reading multiple files to grasp

### Backend request flow

`server.ts` → `app.ts` (cors + json + `/api` mount) → `routes.ts` (one master router that wires per-module sub-routers under nested paths, e.g. `/projects/:projectId/artifacts`, `/artifacts/:artifactId/relations`) → `modules/<feature>/<feature>.routes.ts` → `<feature>.controller.ts` → optional `<feature>.engine.ts` for pure logic.

Each module is self-contained: routes + controller + (engine when there's non-trivial logic). The same engines are reused by `scripts/seed-demo.ts` to bootstrap the demo, so engines must be pure functions over Prisma — no Express types inside.

ESM gotcha: relative imports inside `backend/src/` use `.js` suffixes (e.g. `from "./auth.controller.js"`) even though the source is `.ts`. This is required by `module: NodeNext` — preserve it when adding new files.

### API envelope (contract — do not break)

Every backend response is either:

```
{ "success": true,  "data": <T>, "message": "..." }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

Wrappers: `utils/response.ts` (`ok`, `created`, `fail`, `HttpError`) on the backend; `lib/api/client.ts` on the frontend unwraps `.data` and throws `ApiError` on failure. Pages call typed wrappers (`projectsApi`, `artifactsApi`, …) from `lib/api/*.ts` — **never `fetch` directly from a page or component**.

### Auth + project access

- JWT bearer tokens. `requireAuth` middleware in `middleware/auth.ts` validates the token and reloads the user from Prisma on every request.
- Project authorization lives in `lib/project-access.ts`, **not** in individual controllers. Use these helpers:
  - `getProjectAccess(projectId, userId)` — returns `{ status, role? }`.
  - `assertProjectRole(projectId, userId, res, minRole)` / `assertCanMutate(...)` — sends the right error response and returns `null` if denied.
  - Role hierarchy (low→high): `VIEWER < DEVELOPER < ARCHITECT < OWNER`. Mutations require `DEVELOPER`+; validation/export require `ARCHITECT`+; member management and project delete require `OWNER`.
- `Project.ownerId` is preserved as the "creator pointer" and is treated as an implicit OWNER membership if no `ProjectMember` row exists — this is the fallback that keeps legacy projects working. Do not remove it.
- Last-OWNER protection: the members API refuses to demote/remove the only remaining OWNER (`LAST_OWNER` error).

### Prisma client singleton

`lib/prisma.ts` exports one `PrismaClient` instance, cached on `globalThis.__prisma__` so `tsx watch` reloads don't pile up connection pools. Always import from there — do not `new PrismaClient()` anywhere else.

### Knowledge graph contract

`ArtifactRelation` is the **single source of truth** for the graph. `/api/projects/:id/graph` only emits artifact nodes — API specs, database models, and diagrams are intentionally **not** native graph nodes. Cross-resource navigation happens via the artifact detail page's "Linked resources" card. Keep this contract intact; the frontend graph code assumes it.

### Validation engine

`modules/validation/validation.engine.ts` is rule-based and **deterministic** — no AI / heuristic-soup logic. It wipes the project's existing `ValidationIssue` rows and recomputes them in one pass, then writes a single `VALIDATED` `VersionEvent`. Rules cover: artifact-relation hygiene, missing docs, security policies, API completeness, DB model integrity, diagram links, churn (≥5 CUDs in 7d), deprecated-but-still-used, single-member projects. Add new rules as pure functions inside the same engine.

### Artifact title uniqueness

Titles are unique **per project**, case-insensitive and whitespace-normalized (trim + collapse internal whitespace + lowercase). Enforced two ways and both must stay in sync:

1. DB: `Artifact.normalizedTitle` column + unique index `(projectId, normalizedTitle)`.
2. Controller: pre-check in create/update (and in the ingestion `CREATE_NEW` confirm path), returning 409 `ARTIFACT_TITLE_TAKEN`.

This applies **only** to `Artifact`. API specs, diagrams, database models, etc. allow duplicate titles within a project.

### Version events

Every CUD across the platform (artifacts, relations, API specs, endpoints, DB models/entities/fields, diagrams, documentation, members, validation runs, ingestion confirms) appends a `VersionEvent` via `modules/versions/versions.engine.ts:recordVersionEvent`. This feeds the version history timeline, the dashboard "Recent changes" widget, and the impact-analysis recent-events list. New mutations must record their event.

### Ingestion

`modules/ingestion/` has one controller plus four parser engines (`markdown`, `openapi`, `mermaid`, `sql`). Flow: draft → parse → confirm. Confirm uses the same artifact / API spec / diagram / DB model creation paths as the regular controllers (including the artifact title check) so ingestion never bypasses validation. Ingestion is an audit log — deleting an `IngestionRecord` does **not** cascade-delete the resources it produced (no FK on the join). UI copy reflects this ("Remove log" vs "Delete draft").

### AI Bootstrap Wizard (`modules/ai/`)

The first (and currently only) AI feature. From an existing **empty** project, the user describes an idea → AI proposes a draft → the user reviews/selects → confirmed items are applied through the **existing** artifact/relation/diagram creation paths. It implements the `## AI Safety & Determinism Rules` above: **AI proposes; a human-gated deterministic step disposes.** Code in `modules/ai/` never calls `prisma.*.create/update/delete`.

**Flow & files.** `ai.routes.ts` mounts `POST /projects/:projectId/ai/bootstrap/{propose,apply}` (both `DEVELOPER`+). `ai.controller.ts` is thin (role check + envelope). `ai.service.ts:proposeBootstrap` orchestrates: build prompt → provider → Zod-parse (one repair retry) → normalize Mermaid → deterministic preview validation → persist an `AiSession`. `proposal/bootstrap.apply.ts:applyBootstrap` is the **only** path to the DB: it re-validates the (user-edited) proposal server-side, then creates artifacts/relations/diagrams reusing the regular controllers' fields, records a `VersionEvent` per entity with `metadata.origin:"AI"`, and updates the `AiSession`.

**Stateless proposal + audit.** The proposal is **not** persisted as a source of truth — the client holds it between propose and apply, and apply re-validates from scratch (never trust the client). `AiSession` (Prisma) is **lightweight audit metadata only** — like `IngestionRecord`, never a graph node — recording idea, model, tokens, status (PROPOSED/APPLIED/DISCARDED), counts, and the proposal snapshot.

**The generation contract is expressed twice, derived from the Prisma enums** (`proposal/bootstrap.schema.ts`): a Zod schema (validates Claude's output at propose and the user subset at apply) and a Claude tool `input_schema` (forces conforming JSON via `tool_choice`). **Field/emit order is load-bearing:** `summary → artifacts → diagrams → relations` — `relations` (the bulkiest, most expendable field) is last, so a truncated response loses relations rather than the required `diagrams`.

**Artifacts are created `DRAFT`; AI prose never lands on entity fields** — rationale/confidence live only in the proposal/audit snapshot, not in `Artifact.description` (kept `""`). Confidence is advisory (review UI pre-checks ≥0.6); it never gates apply.

**AI Mermaid is structure-only.** `prompts/bootstrap.prompt.ts` forbids styling; `proposal/mermaid-normalize.ts` strips any `classDef`/`class`/`style`/`linkStyle`/`:::class`/`%%{init}%%` at propose + apply (the validator parses the normalized form, so styling never causes rejection). The shared renderer owns appearance: `mermaid-preview.tsx:forceLabelVisibility` darkens near-white shape fills (luminance-based) as a **runtime fallback** for user-pasted / imported styled Mermaid — not the primary strategy. Don't reintroduce AI-side styling.

**Provider & token budget (`providers/`).** `ai.provider.ts` is the only LLM seam; `ai.provider.anthropic.ts` calls **non-streaming** `messages.create` with forced tool use and a cached system block (`AI_MODEL` default `claude-sonnet-4-6`, `AI_MAX_TOKENS` default `8192`). `StructuredResult` preserves `stopReason`/`usage`/`model`/`maxTokens`/`durationMs` — **do not discard them**; that lossiness once made a truncated response look like a provider failure.

**Error taxonomy (honest, not generic).** A large proposal can exhaust `max_tokens` → Anthropic returns **200 with `stop_reason:"max_tokens"`** and a complete-but-partial tool object. The service treats this as truncation, **not** a provider failure: it throws `AiOutputTruncatedError` → **422 `AI_OUTPUT_TRUNCATED`** (`details:{maxTokens,outputTokens,suggestion}`) and **skips the repair retry** (it would truncate identically). Codes: `503 AI_NOT_CONFIGURED`, `502 AI_PROVIDER_ERROR` (transport / no tool block), `422 AI_OUTPUT_TRUNCATED`, `502 AI_SCHEMA_ERROR` (complete but off-schema after one retry); apply adds `422 AI_VALIDATION_FAILED` / `409 AI_APPLY_CONFLICT`. Every failure logs a scalar `[ai] bootstrap proposal failed {…}` line (projectId/userId/model/stopReason/tokens/durationMs/code) — **never** the prompt, AI output, or secrets.

**Determinism untouched, scope bounded.** AI lives outside the deterministic core — the validator and apply are deterministic, and the analysis/validation engines are neither consulted nor modified. **Phase-1 scope is artifacts + relations + 1–3 diagrams only**; DB models / API specs / security policies / docs are future work, to be added through the same propose → validate → review → confirm pattern (extend the schema + validator + apply, reuse the existing creation controllers).

### Export Engine V2 (SSOT export + PDF report)

Three layers, strictly separated — each consumes the previous and never reaches back:

```
buildExportContent(projectId, format, sections)   ← SSOT assembly (single source)
        ↓ persisted to ExportPackage.content (Json)
analyzeExportSnapshot(content) → AnalysisResult    ← deterministic analysis (pure)
        ↓
renderArchitecturePdf({content, analysis, meta})   ← PDF presentation (pure)
```

- **SSOT assembly** — `modules/exports/exports.engine.ts:buildExportContent` is the **only** place export data is assembled. JSON returns the payload object; MARKDOWN returns a string; PDF/ZIP get the same object. Do not duplicate this assembly anywhere; the analysis and PDF layers read its output, never the DB.
- **Analysis engine** — `modules/exports/analysis/` (`metrics.engine.ts` + `analysis.constants.ts` + `analysis.types.ts`). `analyzeExportSnapshot(content)` is a **pure, deterministic** function: no I/O, no Prisma, no `Date.now()` (the only time reference is `snapshot.generatedAt`), no AI. Same snapshot ⇒ deep-equal `AnalysisResult`. It computes health score (weighted composite), documentation coverage, connectivity, traceability, governance, validation, and rule-keyed risks. All weights/thresholds live in `analysis.constants.ts`. This is the foundation any future AI analysis must build on — keep it independent of the renderer.
- **PDF renderer** — `modules/exports/pdf/` on `pdfmake` (standard-14 fonts, no embedded TTF, **no headless browser**). `pdf.renderer.ts` is presentation-only: it reads numbers from `AnalysisResult`, never recomputes a score. Determinism is pinned by overriding pdfkit's `CreationDate`/`ModDate` and the file `_id` from the snapshot identity (otherwise every render differs). Missing logo → text fallback (`pdf/logo.ts`, the MINOTAURUS mark as inline SVG).
- **Report composition** — `pdf/report-plan.ts:buildReportPlan(sections, analysis, content)` is a pure, deterministic step that decides **which** PDF sections render from the selected `ExportPackage.sections` scope plus available data. The renderer gates every section on `plan.include`, so a `DIAGRAMS`-only export yields a short diagram report (cover + contents + Diagram Inventory + metadata) instead of ~18 empty architecture pages. Because unrendered sections never reach the document and section headers carry `tocItem`, the auto-TOC always matches what rendered — no phantom rows. Empty scope = full report (back-compat). The cover/title adapt via `plan.cover` / `plan.reportTitle` ("Architecture Diagram Report" vs "Architecture Intelligence Report"); diagrams are a **primary** section (`diagramsSection`), and each appendix subsection is gated to its scope. When adding a new section, add its flag here and gate it in `buildDocDefinition` — don't spread it unconditionally.
- **Download** — `GET /exports/:exportId/download` (`exports.controller.ts:downloadExport`, registered **before** the `:exportId` catch-all). PDF is rendered on demand from the persisted snapshot and streamed `application/pdf`; JSON/MARKDOWN stream the stored content. Create still requires `ARCHITECT`+; download mirrors read access.

**Diagrams in the PDF (the fiddly part — `pdf/diagram-svg.ts`).** Mermaid only renders in a browser, so the **frontend captures each diagram's SVG at export-create time** (`renderMermaidToSvg` in `mermaid-preview.tsx`, using `htmlLabels:false` so labels are native `<text>`) and POSTs a `diagramSvgs` map; the controller freezes it into the snapshot's `diagrams[].renderedSvg`. At render time `normalizeMermaidSvgForPdf` rewrites that SVG for `pdfmake`'s bundled `svg-to-pdfkit`, which has real limitations that drove a series of fixes — **understand these before touching that file**:

- **Sizing**: `SVGMeasure` reads the first non-percentage `width=` in the document; Mermaid's root is `width="100%"`, so it would match a child `<rect width=…>` and render the whole diagram compressed. Fix: rewrite the root `<svg>` with explicit numeric width/height from the viewBox.
- **`<foreignObject>` is silently dropped** → such SVG is rejected and falls back to the Mermaid source block (which is **always shown** beneath the rendered diagram regardless).
- **Contrast**: the frontend captures a dark UI theme; `svg-to-pdfkit` resolves CSS by specificity with no `!important`, so the `<style>` block is stripped and colors are rewritten at the string level to the print palette (`PRINT` constants).
- **`stroke-dasharray:"1,0"`** crashes pdfkit's `dash()` → invalid (non-positive) dasharrays are stripped.
- **Labels**: node/edge labels are recentred on their group origin (`text-anchor=middle`, `dominant-baseline=central`); their background `<rect>` is filled **white** (recentred to match) to mask connector lines; `<line>` lifelines get a visible stroke + 1pt min width.

Everything here is presentation-only — **never** change scoring, `AnalysisResult`, the SSOT assembly, or the JSON/Markdown outputs to fix a PDF rendering issue. `pdf/*.test.ts` and `analysis/*.test.ts` are the determinism contract; run `test:unit` after edits.

### Frontend shell

- `app/(app)/layout.tsx` wraps every workspace route with `AuthProvider` + `AppShell` (Sidebar + Topbar). `app/(auth)/` is the unauthenticated tree (login / register).
- Sidebar dynamically loads per-project sub-nav (Artifacts / Graph / API Specs / Database / Diagrams / Validation / Version History / Export). Topbar breadcrumbs resolve real entity titles by id.
- Theme / density / accent / font / graph node style live in a Zustand "tweaks" store in `components/providers.tsx` and persist to `localStorage` (key `mino:tweaks`). React Flow node positions also persist per-project in `localStorage` — not on the server.
- **Accent AND light/dark theme are deliberately scoped to authenticated pages** (to avoid a brand FOUC and stop user prefs leaking onto public pages). The global `Providers` effect applies **only `data-font`** — it intentionally does NOT touch `--accent` or `data-theme`. The first-paint/SSR defaults live in markup/CSS: `app/layout.tsx` sets `data-theme="dark"`, and `--accent` defaults to brand purple `#8b5cf6` (== `--c-purple`) in `globals.css`. The *selected* accent and theme are applied only inside `AppShell`; its effects clean up on unmount (`removeProperty("--accent")`, `setAttribute("data-theme","dark")`) so navigating back to landing/`(auth)` reverts to the fixed dark + purple brand look instead of leaking the user's choices. Don't move accent or theme back into `Providers` — that reintroduces the flash and themes the public pages. Keep the purple value in sync across `globals.css`, the store default, and the Settings "Purple" swatch. (**Density was removed** — the app is standardized on the former "comfy" scale via a static `zoom: 1.1` on `.mino-app-content`; there is no `data-density`.)
- Brand wordmark is a single shared component: `components/shell/brand-logo.tsx` (`<BrandLogo>`, `layout="row"|"stacked"`) over `components/ui/minotaurus-mark.tsx` (the bull-head SVG, `fill="currentColor"` so it inherits the accent). Reused by the sidebar, landing nav, and auth screens; the app favicon is the same mark at `app/icon.svg`. **Its link is auth-aware**: omit `href` (the default) and it routes logged-in users to `/dashboard` and everyone else to `/` — it reads `useAuth()` (authoritative in-app) and falls back to probing the `mino:token` localStorage key so a logged-in visitor on the public landing page still lands on the dashboard. Pass an explicit `href` only to override; don't hardcode `href="/"`.
- Standalone routes `/projects/[id]/docs` and `/projects/[id]/docs/[id]` are intentionally stubbed. Per-artifact Markdown lives inside the artifact detail page's Documentation tab; the project-wide Documentation Hub uses `?tab=documentation` deep-links into it.

### Viewport chrome (graph + Mermaid)

The Knowledge Graph uses React Flow's native `<Controls>` (horizontal, `position="bottom-center"`) and a custom `LabeledSmoothStepEdge` — see "Knowledge graph rendering" below. The Mermaid viewer uses the [`ViewportControls`](frontend/nextjs/components/ui/viewport-controls.tsx) primitive. Both share a single visual contract via the `.react-flow__controls` and `.viewport-controls` blocks in [app/globals.css](frontend/nextjs/app/globals.css) — edit both blocks together when changing the chrome. `ViewportControls` is headless: the caller owns positioning and the zoom/pan state.

[`MermaidPreview`](frontend/nextjs/components/mermaid-preview.tsx) has an `interactive` prop (default `false`). Interactive mode wraps the SVG in a pan/zoom viewport with auto-fit on render and `ViewportControls` mounted bottom-center; it requires a fixed-size parent (caller passes `className="w-full h-full"` inside a sized container). Static callers — gallery thumbnails, ingestion preview, export preview, DB ERD — keep the default so thumbnail layouts don't break.

`.mermaid-host--interactive` deliberately omits `will-change: transform`. Adding it back composites the SVG to a GPU texture at its source resolution; zooming then bilinearly upscales the bitmap → pixelated diagrams. The current setup forces re-rasterization of the vector on each transform → crisp output.

### Knowledge graph rendering (edges, layout, persistence)

[`components/graph/graph-canvas.tsx`](frontend/nextjs/components/graph/graph-canvas.tsx) is React Flow plus four custom layers; changes to any one need to stay aware of the others.

**1. Edges — `LabeledSmoothStepEdge` (custom edge type).** All edges render through this component instead of React Flow's built-in `smoothstep`:

- **Routing is smoothstep-first.** The clean orthogonal `getSmoothStepPath` is the default; the edge only escalates to the expensive `getSmartEdge` pathfinding (`@tisoap/react-flow-smart-edge`, **pinned to v3** — v4 is for `@xyflow/react` 12, incompatible with `reactflow` 11) when a cheap-path crossing test (`pathCrossesNode` of the reconstructed smoothstep waypoints vs every node box, inflated by `SMOOTHSTEP_NODE_PADDING`) shows the straight route would clip a node. This is *inverted* from the old smart-first default: it gives cleaner lines **and** runs pathfinding on only the few crossing edges. `getSmartEdge` is memoized on its routing inputs so unrelated re-renders don't re-pathfind.
- **During an active drag, all edges force the cheap `getSmoothStepPath`** (no `getSmartEdge`, no label work) so lines follow the moving node at 60fps; smart routing returns on drop. The drag flag rides on `data.dragging` (set from the `Inner`-level `draggingId`). Running smart routing live re-pathfinds every edge per frame → jank; don't.
- **Label placement + global de-collision.** Each edge measures its label anchor (`getPointAtLength(len/2)` on a duplicate invisible `<path>` — `getSmartEdge`'s `edgeCenterX/Y` is a routing *waypoint* and lands off-center) and **reports it to a shared `LabelLayoutContext` coordinator in `Inner`**, which runs a deterministic greedy pass (`resolveLabelLayout`: id-ordered, push overlapping boxes apart in y until clear) and hands each edge a final, guaranteed-non-overlapping position to render at. Two invariants keep this loop-free: (1) the reported anchor is the measured *path* point, **independent** of the label's resolved offset — so re-resolving never moves what's reported; (2) the measurement effect depends on the **stable `report` callback**, never the whole context value (whose `resolved` map changes every pass) — depending on the context object infinite-loops. Label state starts `null` so it never flashes pre-measurement.
- **Perf — labels & zoom.** Edges hide their labels below `LABEL_ZOOM_THRESHOLD` by subscribing to `useStore((s) => s.transform[2] >= THRESHOLD)` — a **boolean**, so edges re-render only when crossing the threshold, not on every zoom tick. Subscribing to the raw zoom number re-renders all edges per delta (which then re-pathfind and re-measure) → the graph stutters; keep it a boolean. The reflow-heavy `getTotalLength`/`getPointAtLength` measurement is also gated to "label actually visible" (not zoomed out, not mid-drag).
- **Label DOM**: rendered through `<EdgeLabelRenderer>` (a React Flow portal above the nodes layer) instead of the edge SVG (below nodes). A defensive `.react-flow__edgelabel-renderer { z-index: 10 }` in [`app/globals.css`](frontend/nextjs/app/globals.css) keeps it above nodes even if React Flow's internal DOM order changes.
- Edge color travels on `data.color`; the edge component reads it from there so the label border can tint to match the relation type.

**2. Layout — [`lib/graph-layout.ts`](frontend/nextjs/lib/graph-layout.ts).** Dagre LR/TB auto-layout, wired into `GraphCanvas` via two props that *both* defer to persisted drag positions per-node:

- `autoLayout="LR"|"TB"` — used by the artifact-detail mini-graph (a focused 1-hop subgraph) so neighbors line up cleanly.
- `relayoutSignal: number` — a parent-owned counter; incrementing it (from a toolbar button) wipes saved drag positions and re-runs dagre. The full project graph page's "Relayout" toolbar button drives this. After a relayout writes new positions the canvas also re-runs `fitView` (gated on a `pendingFitRef` so drag-persist and mount don't refit) via a **nested `requestAnimationFrame`** — a single frame fires before React Flow has committed the new positions and would frame the stale layout.
- `minZoom` prop (default `0.25`) — the floor `fitView` can zoom out to. Embedded mini-graphs (e.g. the dashboard, `minZoom={0.05}`) need a lower floor or `fitView` clamps and a large graph overflows the small container instead of fitting.

**3. Position persistence + cross-view sync.** Drag positions persist to `localStorage` under `mino:graph:<storageKey>`. The **dashboard mini-graph and the full project graph share the same `storageKey` (`project:${projectId}`)**, so dragging in either view updates positions in the other on the next mount. Don't accidentally re-namespace one without the other. The artifact-detail subgraph and landing hero have no `storageKey` by design.

**4. Drag, selection, node style.** Non-trivial bits in `GraphCanvas`:

- **Live drag via controlled nodes**: nodes flow through `useNodesState`/`onNodesChange`, with `rfNodes` mirrored from the derived `derivedNodes` by an effect. The node follows the cursor because React Flow can apply per-frame deltas. The mirror effect must **not** fire mid-drag — none of `derivedNodes`' inputs change during a drag, so it doesn't; if you add a dep that changes during drag, the dragged node snaps back. (Earlier versions had no `onNodesChange` and the node only jumped on drop.)
- **Drop-time collision resolution** still runs only in `onNodeDragStop`: an iterative AABB push-out (≤16 passes) slides the dropped node out of overlaps, writing to `rfNodes` (the controlled source). **Don't** move this *collision* step into `onNodeDrag` — `setNodes` inside the live loop fights React Flow's drag delta and the node feels stuck. (Live *movement* is fine; live *collision* is not — they're independent.)
- **Last-dragged on top**: `lastDraggedId` assigns `zIndex: 1` to the most recently dropped node; React Flow already elevates the actively-dragged one, so the transition is seamless.
- **Focus mode**: when a node is selected (and `highlightSelected`), the canvas dims everything outside the selected node's 1-hop neighborhood (`neighborIds` from `relations`) — node opacity via `node.style`, edges via reduced `style.opacity`/emphasized `strokeWidth`. Pure render-time; no data change. `null` neighbor set = no focus, so the graph looks normal when nothing is selected.
- **`highlightSelected` prop** controls whether `selectedId` paints the accent border *and* whether focus mode runs. Off on the artifact-detail mini-graph (focal node implied by the route).
- **Node style is global to authenticated graphs.** All in-app graphs (full graph page, dashboard mini-graph, artifact-detail subgraph) pass `nodeStyle={graphNodeStyle}` from the `useTweaks` store, so the Settings → Workspace "Graph node style" preference drives every one live. The **landing hero stays fixed `"color"`** — it's a public page and must not read the auth store (same public/auth separation as the accent FOUC split).

## AI Safety & Determinism Rules

Minotaurus is a deterministic-first platform. AI is an **additive proposal-and-explanation layer that lives outside the deterministic core**: it may *read* the SSOT and `AnalysisResult` and *emit* structured proposals, but it re-enters the system only through the same human-gated, AI-free path ingestion uses — `propose → review → confirm → deterministic apply`. These rules are mandatory for every present and future AI feature and extend the determinism conventions below.

1. **AI never writes to the database directly.** AI code must not call `prisma.*.create / update / delete`. The only route from model output to persisted state is `AI → proposal → user review → user confirm → deterministic apply → DB`, where *apply* reuses the existing controllers/engines (the same creation logic ingestion-confirm calls) — never a parallel AI write path.
2. **AI output is not SSOT until a user confirms it.** Everything the model emits stays draft/proposed — never persisted, scored, validated, exported, or shown as real project state — until explicit user confirmation.
3. **`AnalysisResult` stays deterministic.** `AnalysisResult → AI` is allowed (AI may *explain* a score). `AI → AnalysisResult` is forbidden (AI may never *compute* or influence a score). The analysis engine stays pure (no AI, no `Date.now()`). If AI prose is ever embedded in an export, freeze it into the snapshot first — like diagram SVGs — so the PDF stays a pure function of stored bytes.
4. **Validation stays deterministic.** AI may *explain* validation findings and *suggest* fixes; AI may **not** create, modify, or resolve `ValidationIssue` rows. The rule-based validation engine remains the only writer of validation state.
5. **Every AI-proposed entity must pass deterministic validation before it joins the project.** Proposals are checked against the same invariants the controllers enforce — artifact title normalization + per-project uniqueness, in-range enums, relation endpoints that resolve, no duplicate relations, valid Mermaid, schema validity — *before* apply. Invalid items are rejected or flagged for the user, never silently applied.

**Provenance.** Every AI-applied change records a `VersionEvent` like any other mutation, with the confirming human as `triggeredBy` and origin metadata — e.g. `{ "origin": "AI", "source": "BOOTSTRAP_WIZARD", "confirmedBy": "<user-id>" }` — so the timeline never misrepresents what produced a change.

The first feature built on these rules is the **AI Bootstrap Wizard** (`modules/ai/`): from an existing empty project, the user describes an idea, AI proposes artifacts (created as `DRAFT`) + relations + one to three Mermaid diagrams, the user reviews and selects, and confirmed items are applied through the existing artifact/relation/diagram creation paths. A lightweight `AiSession` row (audit metadata, like `IngestionRecord`) records each propose/apply. AI does not create the project (it already exists) and does not write anything until confirm.

## Conventions (from `docs/AI_CONTEXT/ARCHITECTURE_RULES.md`)

- Thin controllers — push non-trivial logic into `<feature>.engine.ts`.
- Frontend pages import typed wrappers from `lib/api/`; do not call `fetch` directly and do not duplicate DTO types (use `lib/types.ts`).
- Validation is rule-based and deterministic. Do not introduce AI-generated validation logic.
- Export Engine V2 is layered: SSOT assembly → analysis → PDF. The analysis engine and PDF renderer are pure and deterministic (no AI, no `Date.now()`). Don't recompute scores in the renderer or assemble SSOT data outside `buildExportContent`.
- `ArtifactRelation` is the graph source of truth — don't add a parallel "links" table or emit non-artifact nodes from the graph endpoint.
- Postgres is the source of truth (since Phase 6). The old `backend/src/db/data.json` JSON store is gone — don't reintroduce it.
- AI proposes, a deterministic apply disposes — `modules/ai/` never writes to the DB directly, and AI-generated Mermaid is structure-only (the renderer owns styling). See the AI Bootstrap Wizard section.

## When in doubt

`docs/AI_CONTEXT/CURRENT_STATE.md` and `docs/AI_CONTEXT/SESSION_HANDOFF.md` are the up-to-date snapshots of what's shipped and what was just changed. Read them before assuming a feature is or isn't implemented — the original `docs/01..11_*.md` spec is product background, not the current contract.
