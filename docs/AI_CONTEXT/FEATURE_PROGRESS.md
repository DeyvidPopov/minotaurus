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
- API Specs
- Database Models (with auto-generated Mermaid ERD preview)
- Diagrams (Mermaid editor with live preview, syntax status, template picker)
- Settings
- **Project Team Management + Roles (Phase 7 — multi-user collaboration)**

## PHASE A — Dedicated Documentation Hub (current pass)
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