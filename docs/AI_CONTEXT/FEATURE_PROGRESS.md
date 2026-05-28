# Feature Progress

## DONE
- Auth
- Projects
- Artifacts
- Relations
- Validation
- Export
- Documentation (per-artifact Markdown editor)
- **Documentation Hub (Phase A — project-wide coverage view)**
- **Ingestion Hub (Ingestion Phase 1 + 2)**
  - Phase 1: draft workflow + history + sidebar entry.
  - Phase 2: **Markdown parser + documentation import** — deterministic parser
    (no AI), preview UI, LINK_EXISTING / CREATE_NEW confirm modes, status flow
    DRAFT → PARSED → CONFIRMED (or FAILED). OpenAPI / Mermaid / SQL ingestion
    still not implemented.
- API Specs
- Database Models (with auto-generated Mermaid ERD preview)
- Diagrams (Mermaid editor with live preview, syntax status, template picker)
- Settings
- **Project Team Management + Roles (Phase 7 — multi-user collaboration)**

## ARTIFACT TITLES UNIQUE PER PROJECT (current pass)
- Added `normalizedTitle String` column on `Artifact` + unique index
  `@@unique([projectId, normalizedTitle])`. Migration
  `20260528080000_artifact_unique_title` backfills via
  `lower(btrim(regexp_replace(title, '\s+', ' ', 'g')))`.
- New helper `src/modules/artifacts/artifact-title.ts` exports
  `normalizeArtifactTitle(title)` (trim → collapse internal whitespace →
  lowercase) and `checkArtifactTitleConflict(projectId, title, excludeId?)`.
- Artifact create / update + ingestion `CREATE_NEW` confirm all pre-check
  and return **409 `ARTIFACT_TITLE_TAKEN`** with the message
  "An artifact with this title already exists in this project." on
  duplicates. Update flow ignores self (passes `excludeArtifactId = existing.id`).
- Same title is allowed across different projects — uniqueness is scoped per
  project by the unique index.
- Frontend create form + edit dialog + ingestion CREATE_NEW step show the
  conflict inline (red field border + error message) on top of the existing
  toast. Title field clears the error as soon as the user edits it.
- Seed updated to write `normalizedTitle` (no duplicate titles in the demo).
- 11/11 backend smoke tests still pass.

## INGESTION PHASE 2 — Markdown parser + documentation import (previous pass)
- Schema: added `parserResult Json?` column on `IngestionRecord` (migration
  `20260528070602_ingestion_parser_result`) to hold the preview payload between
  parse and confirm. `createdRecords` now stores the actual artifacts created
  (or linked-to) by the confirm step, e.g.
  `[{ "type": "ARTIFACT", "id": "...", "mode": "LINK_EXISTING" }]`.
- New deterministic Markdown engine at `src/modules/ingestion/markdown.engine.ts`.
  No AI; pure string ops. Strips frontmatter, code fences, link/image markup,
  collects H1-H6 headings, builds a 220-char excerpt, counts words, and suggests
  a title using rules: first H1 → first non-empty non-fence line → "Imported
  Markdown". Suggested artifact type is always DOCUMENTATION.
- Two new endpoints, both DEVELOPER+ for mutations:
  - `POST /api/ingestion/:id/parse-markdown` — JSON body `{ markdown }`. Only
    accepted on MARKDOWN sourceType. Refuses on `CONFIRMED` records. Stores
    `parserResult` (including the raw `markdown`), promotes the record to
    `PARSED`, writes a `PROJECT / UPDATED` VersionEvent
    "Markdown parsed · &lt;title&gt;". On any parser/zod failure the record is
    flipped to `FAILED` and `errorMessage` is set.
  - `POST /api/ingestion/:id/confirm-markdown` — discriminated union
    `{ mode: "LINK_EXISTING", artifactId }` or `{ mode: "CREATE_NEW",
    artifactTitle, artifactType? }`. Requires the record to be `PARSED`.
    LINK_EXISTING replaces `documentationContent` on the target artifact and
    writes a `DOCUMENTATION / UPDATED` (or CREATED if previously empty)
    VersionEvent "Markdown imported into &lt;title&gt;". CREATE_NEW mints a new
    artifact (defaults: ACTIVE status, `imported` tag, description = excerpt),
    attaches the markdown body, and writes TWO VersionEvents: `ARTIFACT/CREATED`
    and `DOCUMENTATION/CREATED`. Either way, the ingestion record is flipped to
    `CONFIRMED` and `createdRecords` is populated.
- Frontend: existing Ingestion Hub now drives the Markdown card with a
  multi-step wizard modal:
  - Step 1: title, optional source name, paste-or-upload `.md` file (FileReader
    on the client; backend accepts plain JSON).
  - Step 2: preview — detected title, word count, headings list (first 12),
    excerpt, collapsible raw Markdown.
  - Step 3: branches into LINK_EXISTING (searchable artifact picker filtered by
    title/type, shows TypeChip + StatusBadge) or CREATE_NEW (artifact title +
    artifact type selector defaulting to DOCUMENTATION).
  - On confirm: success toast → redirects the user to
    `/projects/:id/artifacts/:newId?tab=documentation` so they land on the live
    Markdown editor.
- History table gained a "Result" column: shows `&lt;words&gt; words ·
  &lt;count&gt; headings` for PARSED records, `&lt;n&gt; record(s) created` for
  CONFIRMED, and a truncated error message for FAILED.
- The non-Markdown source cards still use the existing simple "Start draft"
  form. Their badges read "Coming next".
- VIEWER role enforcement: parse + confirm both require DEVELOPER+ on the
  server (`INSUFFICIENT_ROLE`) and the wizard / action buttons are disabled in
  the UI for VIEWERs.
- Export engine is **unchanged** — imported Markdown ends up on
  `Artifact.documentationContent` and so flows naturally into both JSON and
  MARKDOWN SSOT exports (verified end-to-end).
- Documentation Hub coverage updates the next time it's fetched. After the
  smoke flow above, coverage moved 40% → 45% (CREATE_NEW added a doc'd
  artifact) → 55% (LINK_EXISTING documented a previously-empty artifact).
- 11/11 backend smoke tests still pass.

## INGESTION PHASE 1 — Ingestion Hub foundation (previous pass)
- New Prisma model `IngestionRecord` + enums `IngestionSourceType` (MARKDOWN /
  OPENAPI_JSON / MERMAID / SQL_SCHEMA) and `IngestionStatus` (DRAFT / PARSED /
  CONFIRMED / FAILED). Migration `20260528062826_add_ingestion` applied to the
  live Postgres database.
- Backend module `src/modules/ingestion/` exposes four endpoints:
  - `GET    /api/projects/:projectId/ingestion` — list newest first; any member can read.
  - `POST   /api/projects/:projectId/ingestion/draft` — DEVELOPER+; creates a `DRAFT`
    record with `createdRecords: []`. Writes a `PROJECT / CREATED` VersionEvent titled
    "Ingestion draft created" with the source type in metadata.
  - `GET    /api/ingestion/:ingestionId` — any member of the parent project.
  - `DELETE /api/ingestion/:ingestionId` — DEVELOPER+; writes a `PROJECT / DELETED`
    VersionEvent titled "Ingestion draft deleted".
- **No parsing is performed.** This phase exclusively wires up the workflow shell.
  Source content is not stored on the record yet — only metadata (`title`, `sourceName`,
  `sourceType`, `status`).
- Frontend: new route `/projects/[projectId]/ingestion`.
  - Header with project name + a clear "Parsers are not implemented yet" disclaimer.
  - Four source type cards (Markdown / OpenAPI JSON / Mermaid / SQL Schema) with
    icon, description, status chip ("Draft workflow ready" / "Coming next") and a
    Start draft button.
  - Modal form for the draft (title + optional source name).
  - History table: title (with source name in mono), source type chip, status badge,
    relative createdAt, created-by name, Open / Delete actions.
  - Open opens a detail modal listing metadata + a "Parsing will be implemented in
    the next ingestion phase" hint.
  - VIEWERs see the page and history but the Start draft / Delete buttons are
    disabled (and the API blocks them with `INSUFFICIENT_ROLE` if they bypass UI).
- Sidebar entry "Ingestion" added between Documentation and Validation (Download icon).
- Export engine **unchanged** — ingestion records are deliberately not included in
  SSOT exports in this phase. Validation rules are unchanged too.
- 11/11 backend smoke tests still pass.

## PHASE A — Dedicated Documentation Hub (previous pass)
- New backend endpoint `GET /api/projects/:projectId/documentation` returns a
  documentation overview: `summary { totalArtifacts, documentedArtifacts,
  missingDocumentation, coveragePercent }`, `documents[]` (each with title, type,
  status, full `markdownContent`, a sanitized `excerpt`, `updatedAt`), and `missing[]`
  (artifacts without documentation). Membership-gated, VIEWER+ can read.
- Documentation storage is unchanged — the new endpoint reads `Artifact.documentationContent`
  directly. No new tables, no duplicate state.
- Frontend: `/projects/[projectId]/docs` is now a real Documentation Hub page.
  - Header shows project name + coverage percent.
  - Four stat cards: total artifacts / documented / missing / coverage %.
  - Search box (matches title + excerpt) and Segmented filter (All / Documented / Missing).
  - "Documented artifacts" cards: type chip, status badge, excerpt, updatedAt, and
    two buttons — "Open documentation" links to the artifact detail with
    `?tab=documentation`, "Open artifact" goes to the overview tab.
  - "Missing documentation" list: row per undocumented artifact with an "Add
    documentation" button that lands directly on the artifact's Documentation tab.
  - Empty states for no artifacts / no documentation yet / all documented.
  - Inline hint: "Run validation to detect undocumented documentation artifacts."
  - Sidebar entry "Documentation" restored between Diagrams and Validation
    (icon: BookOpen).
- Artifact detail page now respects `?tab=documentation` (and `?tab=relations` /
  `?tab=validation` / `?tab=overview`). The hash isn't used — Next.js search params drive
  the initial tab and re-sync if the search params change.
- `/projects/[projectId]/docs/[artifactId]` is no longer a stub — it redirects to the
  artifact detail with the documentation tab preselected, so old bookmarks keep working.
- Export engine is **unchanged** — `ARTIFACTS` section still inlines `documentation`
  per artifact for every artifact whose `documentationContent` is non-empty. Verified
  end-to-end after Phase A.

## PHASE 7 — Project Team Management + Roles (previous pass)
- New Prisma model `ProjectMember` + enum `ProjectRole` (OWNER / ARCHITECT / DEVELOPER / VIEWER).
  Migration `20260527220334_add_project_members` applied to live Postgres.
- Shared membership helpers in `backend/src/lib/project-access.ts`:
  `getProjectAccess(projectId, userId) → { status, role }`, `hasAtLeast(role, minRole)`,
  `assertProjectRole(...)`, `assertCanMutate(...)`, plus middleware
  `requireProjectMembership()` / `requireProjectRole(minRole)`.
- Every per-controller `project.ownerId === userId` check (api-specs, db-models, diagrams,
  exports, validation, versions, impact, graph, artifacts, documentation, relations,
  projects) replaced with the shared membership-based helper, with a `minRole` parameter:
    - GET → VIEWER (any member)
    - POST/PATCH/DELETE on artifacts/relations/docs/APIs/DBs/diagrams → DEVELOPER+
    - POST /validate + PATCH validation-issue + POST /export → ARCHITECT+
    - PATCH project → ARCHITECT+, DELETE project → OWNER
- Members CRUD: `GET / POST / PATCH / DELETE /api/projects/:projectId/members`. Add looks
  up users by email; refuses duplicates (`ALREADY_MEMBER`) and unknown users
  (`USER_NOT_FOUND`); demotion or removal of the last OWNER is refused (`LAST_OWNER`).
- Project create now auto-inserts an OWNER membership row in the same transaction.
- Project list filters by `OR: [{ownerId}, {members.some.userId}]` so members see every
  project they belong to, not just projects they own.
- VersionEvent integration on member changes: "Maya joined project as DEVELOPER",
  "Maya role changed: DEVELOPER → ARCHITECT", "Maya removed from project".
- Validation rule (`ARCHITECTURE` category, INFO severity): "Single-user project may
  reduce collaboration visibility."
- Export engine: new `TEAM` section. JSON gets `team[]`; MARKDOWN gets a `## Team` table.
  Section added to the frontend export picker and to the seed's bundled exports.
- Seed: creates Maya Okafor (maya@helix.dev), Iris Lindholm (iris@helix.dev), Ren Tanaka
  (ren@helix.dev) — all share password `minotaurus`. Memberships seeded as
  Deyvid=OWNER, Iris=ARCHITECT, Maya=DEVELOPER, Ren=VIEWER. 31 backdated version events
  now spread realistically across all four authors.
- Frontend: new route `/projects/[projectId]/team` with member list, role chips, OWNER-only
  role selects + remove buttons, "You" self-marker, and an invite form (email + role).
  Sidebar entry "Team" added between "Version History" and "Export SSOT", showing the
  member count as a badge. Members API client at `lib/api/members.ts`.

## RECENT POLISH (previous pass)
- Diagram editor:
  - "Templates…" picker modal (no more accidental overwrite)
  - Confirmation modal when editor is non-empty before replacing
  - Live "Valid Mermaid / Invalid Mermaid" status pill
  - Unsaved-changes badge, centered preview, loading state
- Database Model ERD tab:
  - Visual Mermaid ERD preview (auto-generated from entities + fields)
  - Preview / Source toggle, Copy Mermaid button
  - "Generate diagram" button that mints a Diagram entry pre-filled with the ERD source
- Entity cards: stronger PK / FK chips, hover highlight, FK target shown as `name type FK → users.id`

## MERMAID LABEL RENDERING FIX
- Replaced `fontFamily: "var(--font-mono)"` with a concrete font stack — the CSS variable
  was being baked literally into SVG `font-family` attributes and not resolving, which
  rendered text invisibly in some browsers.
- Added explicit `themeVariables` covering `primaryTextColor / secondaryTextColor /
  tertiaryTextColor / nodeTextColor / textColor / mainBkg / background / lineColor /
  edgeLabelBackground` and ERD/sequence/class-diagram specific variants — text is now
  guaranteed light on dark.
- Switched the Mermaid theme from `"dark"` to `"base"` so our themeVariables fully
  override defaults instead of being half-merged.
- All MERMAID_TEMPLATES now use explicit quoted labels: `Client["Client"]` instead of
  `Client`. Same for the seeded Architecture Overview diagram.
- ERD generator (`generateMermaidErd`):
  - empty entity bodies emit `string _empty "No fields defined"` placeholder (Mermaid
    silently elides empty `{}`)
  - relationship labels are sanitized via `safeLabel()` and never empty
  - entity name escaping falls back to `"unnamed"` instead of an empty identifier
- MermaidPreview added a post-render label scan: if Mermaid produces an SVG but every
  `<text>` / `<foreignObject>` node is empty, the preview shows a yellow
  "Diagram rendered, but labels may be missing" warning with a collapsible source view.

## PHASE 5 (current pass) — Version History + Impact Analysis
- New `versionEvents[]` collection in the JSON store; new `VersionEvent` type
- `recordVersionEvent()` shared helper used by every CUD path
- Instrumented controllers: artifacts (CRUD), relations (LINKED/UNLINKED), documentation
  (CREATED/UPDATED/DELETED inferred from before/after content), API specs + endpoints
  (CRUD), DB models + entities + fields (CRUD), diagrams (CRUD), exports (EXPORTED),
  validation (VALIDATED with bySeverity metadata)
- `GET /api/projects/:projectId/version-history` with filters: entityType, action, search, limit
- `GET /api/version-events/:eventId`
- `GET /api/projects/:projectId/impact/:artifactId` — direct/dependent artifacts, linked
  APIs, DBs, diagrams, documentation, recent events, impactSummary
- New validation heuristics: excessive-dependencies, recent-churn (>5 events / 7 days),
  deprecated-but-heavily-referenced
- Export engine: new `VERSION_HISTORY` and `IMPACT_ANALYSIS` sections, plus MARKDOWN
  `## Version history` block
- Frontend: `/projects/<id>/versions` timeline (color-coded, day-grouped, filtered) and
  `/projects/<id>/impact/<artifactId>` page with summary tiles + 6 sections
- Sidebar: restored "Version History" entry; artifact detail page gained an
  "Analyze impact" button
- Export preview: new Events count tile, Recent changes card, Impact analysis card
- Seed: 26 backdated version events spanning 12 days so the timeline is populated
  out of the box; seeded exports include VERSION_HISTORY and IMPACT_ANALYSIS

## DASHBOARD WIDGETS POLISH — current pass
- **Project workspace overview** (`app/(app)/projects/[projectId]/page.tsx`) — the
  placeholder "Updated · Last updated …" card has been replaced with a real
  **Recent changes** card backed by the existing `GET /api/projects/:projectId/version-history?limit=10`
  endpoint. The card loads on page open, shows newest-first events with color-coded
  action chips, entity-type badges, relative timestamps and an **Open** button that
  navigates to `/projects/<id>/versions`. Empty state copy: "No recent changes yet."
- **Re-fetch on mutation** — the existing `refresh()` flow already runs after a
  validation run from the overview's "Run validation" button; that same call now also
  refreshes the version history list, so new events appear without a page reload.
- **Impact page runtime error fix** — `RelLink` was using `ref` as a prop name, which
  React intercepts as a forwarded ref. Renamed to `artifact`; impact page no longer
  throws `TypeError: Cannot read properties of undefined (reading 'id')`.

## UX HONESTY PASS — previous pass
- **Landing page** (`app/page.tsx`) rewritten to remove every claim the product can't deliver:
  - Hero blurb no longer says it "pulls everything you already write" — replaced with "a
    workspace for modelling … as connected artifacts."
  - "Tour the graph" CTA (was linking to non-existent `/projects/p_helix/graph`) replaced
    with "Sign in to the demo."
  - Trust strip pruned: removed "OpenAPI · GraphQL · Mermaid · ERD" (we don't import any
    of those) and "SSO ready" (not implemented). Now: "Markdown · Mermaid", "Self-hosted",
    "PostgreSQL-backed."
  - Workflow Step 1 retitled "Add typed artifacts" — no more "Drop in OpenAPI specs …
    Minotaurus parses and turns them into typed artifacts."
  - Workflow Step 2 dropped the false "let validation suggest the obvious ones" claim.
  - Workflow Step 4 trimmed "PDF or ZIP" to "JSON or Markdown" (matching real export
    rendering) and listed every section the bundle actually covers.
  - Features grid: dropped the false "OpenAPI ingest" card; added honest cards for the
    real modules (API specs & endpoints, Database model with auto ERD, Validation engine,
    Version history, Impact analysis, Mermaid diagrams editor, Markdown documentation,
    SSOT export, ⌘K palette). "Versioned everything … with diffs" → "Version history" (no
    diff/restore yet).
  - Footer + final CTA refer to the real seeded project ("Online Shop Platform") and
    surface the demo credentials so first-time users can sign in directly.
- **Public nav**: removed the dead `/docs` link.
- **Dashboard** (`app/(app)/dashboard/page.tsx`):
  - "Ask Minotaurus" sparkly button (no handler, no AI behind it) replaced with "All
    projects" linking to the projects list.
  - Subtitle now adapts to first-run vs returning user; pluralization fixed.
  - New first-run "What does Minotaurus do?" card listing the real capabilities — visible
    only when the user has zero projects, so it doesn't add noise to returning sessions.
- **Topbar** (`components/shell/topbar.tsx`): dropped the bell and sparkles icon buttons
  (no notifications backend, no AI). Only the working theme toggle remains.
- **Docs route stubs** (`/projects/[id]/docs` and `…/docs/[id]`): re-worded to clearly
  redirect the user mentally to the per-artifact Documentation tab (which is where the
  real editor lives). No more "Coming next" promises about a separate doc editor.
- **Frontend README** rewritten to match the current shipped state — replaced the
  multi-phase-old mock-data narrative with an accurate route-by-route status table.

## PHASE 6 FINALIZED — live Postgres runtime (previous pass)
- Postgres detected on **:5433** (the local install uses 5433, not the spec's :5432).
- Working credentials: `postgres / postgres123!`.
- Created `minotaurus` database; applied `20260527120000_init` migration.
- Verified 13 tables + 13 enums + indexes exist on disk.
- Added `GET /api/health/db` → `{ database: "connected", provider: "postgresql", port }`.
- `npm run seed` populates the demo project end-to-end against Postgres (10 artifacts,
  10 relations, 1 API spec + 3 endpoints, 1 DB model + 3 entities, 1 diagram,
  27 version events, 3 validation issues, 2 exports).
- `npm run start` boots cleanly; backend smoke `test:api` passes 11/11 endpoints;
  custom end-to-end check confirms login, projects, artifacts, graph, API specs,
  DB models, diagrams, version history, impact analysis and exports all read from
  Postgres.

## PHASE 6 — PostgreSQL migration (code shipped earlier in this session)
- New `backend/prisma/schema.prisma` with 14 models matching the previous JSON shape one-to-one
  (User, Project, Artifact, ArtifactRelation, ApiSpec, ApiEndpoint, DatabaseModel, DatabaseEntity,
  DatabaseField, Diagram, ValidationIssue, ExportPackage, VersionEvent + enums for every union
  that was previously a string literal type).
- `src/lib/prisma.ts` exposes a singleton `PrismaClient`.
- `backend/src/db/json-db.ts` and `data.json` deleted. Every controller, engine, middleware and
  the seed now imports `prisma` directly. Reads use `prisma.<model>.findMany / findUnique`;
  writes use `create / update / delete / createMany / $transaction` where appropriate.
- `recordVersionEvent()` is now async (returns the created row) — every CUD path awaits it.
- `runValidationForProject()` and `buildExportContent()` are async; they orchestrate
  parallel `Promise.all` fetches across all related tables, compute the same payloads as
  before, and write back via `prisma.validationIssue.createMany` (for validation).
- `npm run seed` wipes every table in dependency-safe order, then re-inserts the demo project,
  10 artifacts, 10 relations, 1 API spec + 3 endpoints, 1 DB model + 3 entities + 10 fields,
  1 diagram, 26 backdated version events, runs validation, and creates two seeded exports.
- Initial SQL migration generated via `prisma migrate diff` and stored at
  `backend/prisma/migrations/20260527120000_init/migration.sql` so a fresh deploy can run
  `prisma migrate deploy` instead of needing dev shadow DB.
- New scripts: `prisma:generate`, `prisma:migrate`, `prisma:reset`, `prisma:studio`.

## TODO (next phases)
- AI architecture analysis (uses version history + impact + relations as feature inputs)
- WebSocket live updates / live "X is editing" presence
- Email invitations for non-existent users (today an email must already match a Minotaurus
  account; sending an actual invite email is not implemented)
- Per-resource ownership transfer (createdById is recorded but there is no UI to reassign)