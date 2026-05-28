# Session Handoff

## Last Completed Feature

**Diagrams module UX refactor**:
- Diagrams list page rewritten as a visual card gallery. Each card
  renders a live Mermaid thumbnail (clamped via CSS), title, type chip,
  linked artifact chip, description, updated timestamp, and an OpenLink.
  Empty diagrams get a `DiagramFallback` placeholder. Type filter shows a
  one-line `DIAGRAM_TYPE_BLURBS` helper sentence when active.
- Diagram detail page is now read-first: rendered Mermaid up top, source
  in a `<details>` collapsible. Edit toggles a split source/preview
  editor with Templates / Copy / Fullscreen / Save / Done in the header.
  Done warns about unsaved changes. Arriving with `?edit=1` from the new
  flow opens directly in editor mode.
- New-diagram modal is now a **purpose picker**: Architecture overview,
  Request flow, Login sequence, Checkout sequence, Database ERD, Domain
  model, Validation lifecycle, Impact analysis, Roadmap (Gantt). Picking
  one auto-fills title + description, sets the diagram type, and seeds
  the editor with a Minotaurus-relevant Mermaid template that names
  real services / artifacts / DB entities.
- `MERMAID_TEMPLATES` now derives from `DIAGRAM_PURPOSES` — same source,
  same wording. The previous "generic A→B" defaults are gone.
- **Mermaid sequence contrast fix.** themeVariables strengthened
  (`actorBorder: "#5f8fb8"`, `labelBoxBkgColor`, `activationBkgColor`,
  `noteBkgColor: "#111318"`); post-render sweep in
  `components/mermaid-preview.tsx` rewrites `rect.actor /
  rect.actor-top / rect.actor-bottom / rect.actor-box` to dark fill +
  accent border and `rect.note / polygon.labelBox` to darker fill.
  Scoped CSS fallback added to `app/globals.css`. All six MermaidPreview
  callers (gallery thumbnails, detail page, ingestion preview, etc.)
  benefit.
- Template apply on the detail page only confirms replacement when the
  existing source genuinely differs from the new template; an empty or
  identical editor gets a silent "Template applied" toast (no more
  "Replaced source with SEQUENCE template" copy).
- `npx tsc --noEmit` clean. Backend untouched.

## Previous feature pass

**Ingestion detail UI polish**:
- The ingestion history row-end delete / remove-log button is gone for
  every status. The history table now has only the Open action;
  ingestion records read as a permanent audit trail in the UI. The
  backend `DELETE /api/ingestion/:id` endpoint still exists and still
  writes the correct status-aware VersionEvent — there's just no UI
  affordance for it.
- Detail modal's `Created records` block grouped + filtered:
  - Routed types (ARTIFACT / API_SPEC / DIAGRAM / DATABASE_MODEL) each
    get a single row with type chip, truncated id and an `OpenLink` to
    the matching detail page.
  - Child types (API_ENDPOINT / DATABASE_ENTITY / DATABASE_FIELD) collapse
    to one summary row per type ("21 fields created") with a
    `<details>` "show ids" toggle. No more broken "Open database model"
    links for individual fields.
- Modal width: ingestion detail modal is now `xlarge` (`max-w-[960px]`,
  responsive on mobile via `w-full max-h-[85vh]`). The shared `Modal`
  helper learned an explicit `size: "default" | "wide" | "xlarge"`
  prop; the existing `wide` boolean still works for back-compat so the
  Markdown / OpenAPI / Mermaid / SQL wizards continue at 760px.

## Previous feature pass

**Navigation polish + ingestion log semantics**:
- All row-end chevrons and blue `Open →` links replaced with the canonical
  `components/ui/open-link.tsx` (muted neutral, external icon left, "Open"
  label, no arrow). Touched lists/cards: Artifacts, API Specs, Database
  Models, Diagrams, Projects (chevron in card-wide Link removed),
  Dashboard "View all", Project overview Card actions, Documentation Hub
  (Open documentation / Open artifact), Version History per-event Open,
  Impact "All versions", Graph drawer "Open artifact". Mutation buttons,
  the export Open/View toggle (in-page state), and the ingestion history
  Open-modal button keep Button styling.
- **Ingestion is now an audit log, not the source of truth.** Backend
  already had no FK cascade; UX now says so. CONFIRMED rows in the
  history table show "Remove log" (non-destructive copy + tooltip);
  DRAFT/PARSED/FAILED rows show "Delete draft". Confirmation dialog +
  toast + VersionEvent title all status-aware ("Removed ingestion log"
  for CONFIRMED with `logRemovalOnly: true` in metadata, "Ingestion
  draft deleted" otherwise). Detail modal opens with a status-aware
  sentence and renders `createdRecords` as OpenLink rows that route to
  the right module page (artifact / API spec / diagram / database
  model).
- Verified end-to-end: confirmed OpenAPI ingestion → remove log → ApiSpec
  + its endpoint still exist; confirmed Mermaid ingestion → remove log →
  Diagram still exists; DRAFT delete VersionEvent reads "Ingestion draft
  deleted"; CONFIRMED log-removal VersionEvent reads "Removed ingestion
  log".
- `npx tsc --noEmit` clean (backend + frontend). 11/11 backend smoke tests
  still pass.

## Previous feature pass

**Global Mermaid label visibility fix**:
- Shared renderer `components/mermaid-preview.tsx` was rendering shapes +
  arrows correctly but text labels were invisible in many diagrams.
- Root cause: `securityLevel: "strict"` plus Mermaid's default `htmlLabels:
  true` produced `<foreignObject>` HTML labels with inline fills that
  ignored our `themeVariables`. Our previous post-render warning falsely
  triggered instead of fixing the underlying styles.
- Renderer changes:
  - `securityLevel` → `"loose"` so post-render style overrides actually
    apply (Mermaid sources are author-controlled, no XSS surface).
  - `flowchart: { htmlLabels: false }`, same on class / state diagrams —
    native SVG `<text>` honors `fill="..."` and survives the sweep.
  - New `forceLabelVisibility(host)` walks every label selector after each
    render and sets `color`/`opacity`/`visibility` (inline) and `fill` on
    `<text>` / `<tspan>` **only** when the existing fill is empty,
    transparent, or pure black. Authored colors preserved.
  - Edge label backgrounds (`.edgeLabel rect`, `.labelBkg`, etc.) get
    `#1a1d24`.
  - `detectLabelsMissing` widened to also check `.nodeLabel` / `.edgeLabel`
    and runs after the sweep so the yellow warning only fires when text is
    truly absent.
- New scoped CSS rules in `app/globals.css` under `.mermaid-host` cover any
  selector that slips through the JS sweep. Not global — only inside the
  renderer host.
- All six MermaidPreview callers (ingestion preview, diagram detail source
  + ERD tabs, database model ERD, export preview) benefit automatically —
  no call-site code changed.

## Previous feature pass

**Ingestion Phases 4 + 5 — Mermaid + SQL Schema ingestion**:
- Phase 4 — Mermaid: new `mermaid.engine.ts` (no AI, pure regex). Lifts a
  `\`\`\`mermaid` fence from Markdown if present, detects diagram type from
  the first non-comment keyword, extracts a `%% Title: …` comment, counts
  lines, pulls best-effort node hints. Endpoints `POST /ingestion/:id/
  parse-mermaid` + `POST /ingestion/:id/confirm-mermaid` (CREATE_DIAGRAM,
  optional artifact link). Confirm creates a real `Diagram` row + writes a
  `DIAGRAM/CREATED` VersionEvent.
- Phase 5 — SQL Schema: new `sql.engine.ts`. Hand-written DDL scanner that
  matches `CREATE TABLE` heads then uses a paren-depth walker to capture the
  body — needed so `FOREIGN KEY (col) REFERENCES tbl(col)` constraints with
  nested parens are recovered. Supports `NOT NULL`, inline + table-level
  `PRIMARY KEY` and `UNIQUE`, inline `REFERENCES`, and table-level
  `FOREIGN KEY`. Endpoints `POST /ingestion/:id/parse-sql-schema` +
  `POST /ingestion/:id/confirm-sql-schema` (CREATE_DATABASE_MODEL, optional
  artifact link). Confirm runs a single Prisma `$transaction` with a
  two-pass FK resolution (entities first, then update field references).
  Writes one `DATABASE_MODEL/CREATED` + one `DATABASE_ENTITY/CREATED` per
  entity.
- Frontend Ingestion Hub now drives all four source cards (Markdown /
  OpenAPI / Mermaid / SQL) through wizards. The Mermaid wizard renders a
  live MermaidPreview in the preview step; the SQL wizard renders a
  client-generated `erDiagram` Mermaid preview from the parsed entities +
  relationships. New shared `ArtifactLinkPicker` component used by both
  wizards. History "Result" column reports per source. The simple "Start
  draft" form is unreachable from the Hub now.
- Existing Diagrams + Database Model modules are untouched. The wizards
  write to the same Prisma tables so detail pages, ERD views, validation
  rules and SSOT export pick the imported records up unchanged.
- Verification: 11/11 backend smoke tests pass. Mermaid flow tested with
  the brief's sequenceDiagram sample (correct title, type=SEQUENCE, 4 node
  hints) → confirm with artifact link → Diagram detail shows artifactId
  + Mermaid source. SQL flow tested with the brief's users / sessions
  sample → correctly resolved `sessions.user_id` → `users.id` FK after
  fixing the CREATE TABLE body capture to use paren-depth scanning
  instead of a non-greedy regex (the regex stopped at the first `)` of
  `(user_id)`). JSON export with DATABASE_MODELS contains the imported
  model with 2 entities and 1 FK field. VIEWERs blocked from both
  endpoints (`INSUFFICIENT_ROLE`).

## Previous feature pass

**Ingestion Phase 3 — OpenAPI JSON ingestion**:
- New deterministic engine `backend/src/modules/ingestion/openapi.engine.ts`
  (pure regex / JSON.parse, no AI, no YAML). Validates `openapi`/`swagger` +
  `paths`, extracts title / version / description / `servers[0].url` (with
  Swagger 2.0 best-effort), and per-(path, method) operation summary,
  description, requestSchema (stringified `requestBody`), responseSchema
  (stringified `responses`), and `requiresAuth` (op-level `security[]` OR
  root-level `security[]` with no op override). Only GET / POST / PUT / PATCH /
  DELETE imported.
- Two new endpoints — both DEVELOPER+:
  - `POST /api/ingestion/:id/parse-openapi-json` — JSON `{ openapiJson }`.
    Stores preview + `source: "OPENAPI_JSON"` marker in `parserResult`, flips
    DRAFT → PARSED, writes `PROJECT/UPDATED` event
    `"OpenAPI JSON parsed · <title>"`. On parser error: FAILED + 422
    PARSE_FAILED.
  - `POST /api/ingestion/:id/confirm-openapi-json` — body
    `{ mode: "CREATE_API_SPEC", artifactId?: string | null }`. Single Prisma
    `$transaction` creates `ApiSpec` (linked to optional artifact) + one
    `ApiEndpoint` per parsed endpoint. Writes one `API_SPEC/CREATED` event +
    one `API_ENDPOINT/CREATED` event per endpoint. Flips status PARSED →
    CONFIRMED. `createdRecords` ends as `[API_SPEC + API_ENDPOINT[]]`.
- Frontend Ingestion Hub now drives the OpenAPI JSON card through a multi-step
  wizard mirroring the Markdown one: paste-or-upload `.json` → preview
  (endpoints table with method-toned chips + auth badge) → optional artifact
  picker → confirm. On success → router push to `/projects/:id/api/:newSpecId`.
  History "Result" column shows `<N> endpoint(s) · v<version>` for PARSED and
  `API spec + <N> endpoint(s) created` for CONFIRMED. Detail modal links
  API_SPEC records to the real API spec detail page.
- Existing API Specs module is untouched — wizard creates real rows so the
  API Specs page, validation engine, and SSOT export pick them up unchanged
  (verified end-to-end).
- VIEWER blocked from both endpoints (`INSUFFICIENT_ROLE`).
- Verification: 11/11 backend smoke tests pass. curl flow against the brief's
  sample doc: parse → PARSED (3 endpoints, baseUrl `/api`, requiresAuth
  true/false/true respecting `/auth/me` security) → confirm with artifact link
  → 1 API_SPEC + 3 API_ENDPOINT created → version history shows 5 events
  (PARSED + spec CREATED + 3 endpoints CREATED) → JSON export with
  API_SPECS section contains the imported spec with endpointCount 3.

## Previous feature pass

**Artifact titles unique per project**:
- New `normalizedTitle String` column on `Artifact` + unique index
  `@@unique([projectId, normalizedTitle])`. Migration
  `20260528080000_artifact_unique_title` backfills existing rows via
  `lower(btrim(regexp_replace(title, '\s+', ' ', 'g')))`.
- Shared helper `src/modules/artifacts/artifact-title.ts` (
  `normalizeArtifactTitle` + `checkArtifactTitleConflict`). Artifact create /
  update and ingestion CREATE_NEW confirm all pre-check, returning
  **409 `ARTIFACT_TITLE_TAKEN`** with a readable message on conflict. Update
  flow ignores self.
- Case- and whitespace-insensitive: `"Authentication Service"`,
  `" authentication service "`, `"AUTHENTICATION SERVICE"`,
  `"Authentication   Service"` all collide. Cross-project titles are
  unaffected.
- Frontend: new-artifact page, edit-artifact dialog, and the Markdown
  ingestion CREATE_NEW step show the conflict **inline** (red field border +
  error message) on top of the existing toast. Field clears the error as
  soon as the user edits the title.
- Seed updated to write `normalizedTitle`. 11/11 backend smoke tests pass.
- Verification: curl flow covered all six rules from the brief — duplicate
  exact + whitespace variant + case variant + collapse variant all → 409;
  rename to existing-title-in-different-case → 409; rename to self (same
  title) → 200; rename to unique → 200; cross-project same title → 200;
  ingestion CREATE_NEW with duplicate title → 409, with fresh title → 200.

## Previous feature pass

**Ingestion Phase 2 — Markdown parser + documentation import**:
- New `parserResult Json?` column on `IngestionRecord` (migration
  `20260528070602_ingestion_parser_result`). `createdRecords` now actually
  carries the artifacts created / linked by the confirm step.
- Deterministic Markdown engine at `src/modules/ingestion/markdown.engine.ts`
  (no AI, pure regex/string ops). Extracts H1-H6 headings, an ~220-char
  excerpt, word count, and a suggested title via first-H1 / first-line /
  fallback rules.
- Two new endpoints — both DEVELOPER+:
  - `POST /api/ingestion/:id/parse-markdown` — JSON `{ markdown }`. Stores the
    preview + raw body in `parserResult`, flips status DRAFT → PARSED, writes
    a `PROJECT/UPDATED` VersionEvent "Markdown parsed · &lt;title&gt;". On
    failure: status FAILED, errorMessage set, no event.
  - `POST /api/ingestion/:id/confirm-markdown` — discriminated union
    `{ mode: "LINK_EXISTING", artifactId }` or `{ mode: "CREATE_NEW",
    artifactTitle, artifactType? }`. Replaces or creates the artifact's
    documentation, populates `createdRecords`, flips status PARSED → CONFIRMED.
    LINK_EXISTING writes a `DOCUMENTATION` VersionEvent "Markdown imported
    into …"; CREATE_NEW writes both an `ARTIFACT/CREATED` and a
    `DOCUMENTATION/CREATED` event.
- Frontend Ingestion Hub now drives the Markdown card through a multi-step
  wizard: paste-or-upload .md → parse → preview (title / word count / heading
  list / excerpt / collapsible raw md) → branch to LINK_EXISTING (searchable
  artifact picker with TypeChip + StatusBadge) or CREATE_NEW (artifact title +
  type defaulting to DOCUMENTATION). On confirm the user is redirected to the
  artifact's Documentation tab.
- History table gained a "Result" column summarizing PARSED (`words ·
  headings`), CONFIRMED (`N record(s) created`), FAILED (error message).
- Export engine unchanged — imported markdown ends up on
  `Artifact.documentationContent` and flows through both JSON and MARKDOWN
  SSOT exports unchanged.
- Verification: 11/11 backend smoke tests pass. curl flow: draft → parse
  (PARSED, 4 headings / 18 words) → CREATE_NEW (coverage 40 → 45%) →
  LINK_EXISTING on Legacy Payment Service (coverage 45 → 55%); VIEWER (Ren)
  parse + confirm → 403 INSUFFICIENT_ROLE; JSON + MARKDOWN exports both
  include the imported markdown content.

## Previous feature pass

**Ingestion Phase 1 — Ingestion Hub foundation**:
- New Prisma model `IngestionRecord` + enums `IngestionSourceType` (MARKDOWN /
  OPENAPI_JSON / MERMAID / SQL_SCHEMA) and `IngestionStatus` (DRAFT / PARSED /
  CONFIRMED / FAILED). Migration `20260528062826_add_ingestion` applied to the
  live Postgres database.
- Backend module `src/modules/ingestion/` ships four endpoints — `GET / POST`
  scoped under `/projects/:id/ingestion`, `GET / DELETE` on `/ingestion/:id`.
  DEVELOPER+ for mutations, any member for reads. Create + delete both write
  `PROJECT` VersionEvents ("Ingestion draft created" / "Ingestion draft deleted").
- **No parsers are implemented yet** — this phase only wires the workflow shell.
  Creating a draft records metadata (title / source name / source type) and that's
  it; `createdRecords` is always `[]` in Phase 1.
- Frontend: new route `/projects/[projectId]/ingestion` with project header, an
  honest "Parsers are not implemented yet" disclaimer, four source type cards,
  draft creation modal, ingestion history table (title / source / status / created
  / by / actions), and a detail modal. Sidebar entry "Ingestion" sits between
  Documentation and Validation (Download icon). VIEWERs see everything but have
  the action buttons disabled and the API returns `INSUFFICIENT_ROLE` on bypass.
- Export engine and validation rules are unchanged on purpose.
- Verification: 11/11 backend smoke tests pass. curl flow: list (empty) → create
  Markdown → create OpenAPI → list (2) → GET by id → VIEWER delete attempt → 403
  INSUFFICIENT_ROLE → VIEWER create attempt → 403 INSUFFICIENT_ROLE → VIEWER read
  list → 200 → OWNER delete → 200 → version history shows two CREATED + one
  DELETED ingestion events.

## Previous feature pass

**Phase A — Dedicated Documentation Hub**:
- New backend endpoint `GET /api/projects/:projectId/documentation` returns
  `{ summary, documents[], missing[] }`. Membership-gated, VIEWER+ can read. Reads
  from `Artifact.documentationContent` — no new tables, no duplicate state.
- `/projects/[projectId]/docs` is now a real Documentation Hub: header with coverage
  %, four stat cards (total / documented / missing / coverage), search + segmented
  All/Documented/Missing filter, documented-artifact cards with excerpt and two
  buttons ("Open documentation" → `?tab=documentation`; "Open artifact" → overview),
  missing-artifacts list with "Add documentation" deep-links, empty states, and an
  inline hint pointing to validation.
- `/projects/[projectId]/docs/[artifactId]` stub now redirects to the artifact
  detail with the Documentation tab preselected (preserves any old bookmarks).
- Sidebar restored: "Documentation" entry between Diagrams and Validation
  (icon: BookOpen).
- Artifact detail respects `?tab=documentation` (valid tabs: overview / relations
  / documentation / validation). Initial tab is read from the search param and
  re-syncs if it changes.
- Export engine is **unchanged** — `ARTIFACTS` section still inlines artifact
  documentation. Verified post-change via a fresh JSON export.
- Verification: 11/11 backend smoke tests pass. Manual flow: VIEWER (Ren) reading
  the Hub → 200; non-member outsider → 403; adding docs to one artifact bumped
  coverage from 40% → 50% on a re-fetch.

## Previous feature pass

**Phase 7 — Project Team Management + Roles** (multi-user collaboration):
- New Prisma model `ProjectMember` + enum `ProjectRole` (OWNER / ARCHITECT / DEVELOPER /
  VIEWER). Migration `20260527220334_add_project_members` applied to the live Postgres.
- Shared membership helpers in `backend/src/lib/project-access.ts`. Every controller
  that used to call `project.ownerId === userId` now goes through `getProjectAccess` +
  `hasAtLeast`, with `minRole` per handler (mutations → DEVELOPER+; validation runs +
  exports → ARCHITECT+; member management → OWNER; delete project → OWNER).
- `GET / POST / PATCH / DELETE /api/projects/:projectId/members` — full CRUD with
  duplicate / unknown-user / last-OWNER guardrails. Member changes emit VersionEvents
  ("Maya joined project as DEVELOPER", "role changed", "removed from project").
- Project create transactionally inserts an OWNER membership for the creator. Project
  list now returns every project where the user is a member (not just owner).
- Validation rule (INFO, ARCHITECTURE): "Single-user project may reduce collaboration
  visibility."
- Export engine: new TEAM section. JSON gets `team[]`; MARKDOWN gets a `## Team` table.
  Seed exports include TEAM.
- Frontend: `/projects/[projectId]/team` page (member list with role chips, OWNER-only
  role selects + remove buttons, "You" marker, invite form). New sidebar entry "Team"
  between Version History and Export SSOT, badged with member count. Members API
  client at `lib/api/members.ts`. Export page picker now includes "Team & roles".
- Seed: creates Maya Okafor / Iris Lindholm / Ren Tanaka. Demo memberships:
  Deyvid=OWNER, Iris=ARCHITECT, Maya=DEVELOPER, Ren=VIEWER. All four share password
  `minotaurus`. 31 backdated VersionEvents now realistically spread across all four
  authors.
- Verification: 11/11 backend smoke tests pass; manual role-enforcement curl checks
  confirm VIEWER (Ren) blocked from artifact create (403), DEVELOPER (Maya) blocked
  from adding members (403), OWNER (David) can manage everything, last-OWNER demotion
  refused (400 LAST_OWNER), duplicate add refused (409 ALREADY_MEMBER), unknown email
  refused (404 USER_NOT_FOUND).

## Dashboard widgets polish (previous pass)
- Project workspace overview's "Recent changes" card now pulls live `VersionEvent` data
  from Postgres via the existing `/version-history?limit=10` endpoint. Newest-first,
  color-coded action chips, entity-type badges, relative timestamps. Empty state copy:
  "No recent changes yet." Open button navigates to `/projects/<id>/versions`.
- Timeline-style redesign for Recent changes row: dot + vertical rail, format
  `<bold author> <verb> <entity-type> · <relative time>`. Author name pulled from
  `triggeredByName` (added to serializer in `versions.controller.ts`).
- Impact page runtime bug fixed: `RelLink` had a prop named `ref` which React
  intercepts as a forwarded-ref. Renamed to `artifact`; clicking "Analyze impact" no
  longer throws.

## UX honesty + consistency pass (previous pass)
- Landing page rewritten — every claim now matches a real shipped feature. No more
  "Minotaurus parses your OpenAPI", no "let validation suggest relations", no "PDF/ZIP"
  export, no "SSO ready". Workflow steps and feature grid replaced with the modules
  that actually exist (API specs, DB models with auto ERD, validation, version history,
  impact analysis, Mermaid editor, Markdown docs, SSOT export, ⌘K).
- Dashboard "Ask Minotaurus" button + topbar Bell/Sparkles icon buttons removed.
  Dashboard subtitle adapts to first-run vs returning. A "What does Minotaurus do?"
  card explains capabilities for empty workspaces.
- `/docs` link in public nav (404) removed. `/projects/[id]/docs` stub re-worded to
  redirect users to the per-artifact Documentation tab.
- Frontend README rewritten to reflect the actual current state.

## Phase 6 finalization (previous pass) — Postgres runtime live and verified:
- Detected Postgres on **:5433** (the local install uses 5433, not the spec's 5432).
- Credentials `postgres / postgres123!` confirmed working.
- Created `minotaurus` database; applied `20260527120000_init` migration; verified 13
  tables + 13 enums on disk.
- Added `GET /api/health/db` → `{ database, provider, port }`.
- `npm run seed` populated the demo end-to-end against Postgres: 10 artifacts, 10
  relations, 1 API spec + 3 endpoints, 1 DB model + 3 entities, 1 diagram,
  27 version events, 3 validation issues, 2 exports.
- E2E smoke through the running backend: login OK, projects load, artifacts/graph/api
  specs/db models/diagrams/version history/impact/exports all read from Postgres.
- `npm run test:api` 11/11 PASS.

## Phase 6 code (shipped earlier in the session)
Phase 6 — PostgreSQL migration:
- Prisma schema with 14 models replacing the JSON DbShape (User, Project, Artifact,
  ArtifactRelation, ApiSpec, ApiEndpoint, DatabaseModel, DatabaseEntity, DatabaseField,
  Diagram, ValidationIssue, ExportPackage, VersionEvent + enums).
- `src/lib/prisma.ts` singleton; every controller, engine, middleware and the seed
  now uses Prisma directly.
- `backend/src/db/json-db.ts` and `data.json` deleted; `src/db/` removed.
- Initial SQL migration committed under
  `backend/prisma/migrations/20260527120000_init/migration.sql` (365 lines), so a fresh
  deploy can run `prisma migrate deploy` instead of needing a shadow DB.
- Validation engine, export engine, version-event helper all async + Prisma-backed.
- Seed wipes + reloads the entire dataset transactionally.
- Backend + frontend typechecks clean. Live DB verification was deferred — Postgres on
  this machine listens on :5433 and the seeded password was rejected. The user
  authorized "write all code, skip live verification." First run on a real DB needs:
  `npx prisma migrate deploy && npm run seed`.

## Phase 5 — Version History + Impact Analysis (previous pass)
- New `versionEvents[]` collection; pure `recordVersionEvent()` helper used by every CUD path
- Every artifact / relation / documentation / API spec / API endpoint / DB model / DB entity /
  DB field / diagram / export / validation run now writes a `VersionEvent`
- New endpoints:
  - `GET /api/projects/:projectId/version-history` (entityType / action / search / limit filters)
  - `GET /api/version-events/:eventId`
  - `GET /api/projects/:projectId/impact/:artifactId`
- Three new validation heuristics: excessive deps (>6 relations), recent churn (>5 events / 7d),
  deprecated artifact still heavily referenced
- Export engine: `VERSION_HISTORY` and `IMPACT_ANALYSIS` sections; MARKDOWN gets a
  `## Version history` block
- Frontend: real `/projects/<id>/versions` timeline (color-coded, day-grouped) replaces stub;
  new `/projects/<id>/impact/<artifactId>` page; "Analyze impact" button on artifact detail
- Seed: 26 backdated events + the auto-recorded validation event spanning 12 days

Earlier in this session: Mermaid label-rendering fix; Phase 4 polish (template picker, ERD view).

## Current Commit

8963010 — *Polish diagrams gallery and Mermaid readability*

## Current Working State

- frontend works (Team page live)
- backend works (members API live, role enforcement live)
- exports work (TEAM, artifacts, relations, API specs, DB models, diagrams, validation report, graph, version history, impact analysis)
- validation works (artifact/relation/doc/security/API/DB/diagram/churn/deprecated/single-member rules)
- Mermaid rendering works (lazy-loaded, `securityLevel: strict`, surfaces syntax errors as UI state)
- Demo project ("Online Shop Platform") seeded with 4 team members
  (Deyvid OWNER · Iris ARCHITECT · Maya DEVELOPER · Ren VIEWER), 10 artifacts,
  10 relations, 4 docs, 1 API spec with 3 endpoints, 1 DB model with 3 entities + FK,
  1 architecture diagram, 31 version events spread across all four authors

## Current Goal

**AI architecture review** — wrap a model call in a backend endpoint to
summarise architecture, flag cross-artifact inconsistencies the deterministic
validation rules can't catch, and answer impact questions. Settings already
has a place for an Anthropic API key field to keep it opt-in. See
NEXT_STEPS.md.

## Important Constraints

- do not break graph contract
- do not redesign frontend shell
- do not regress existing flows (auth, projects, artifacts, relations, docs, API specs,
  DB models, diagrams, validation, export, version history, impact analysis, **team**)
- preserve seeded demo login (`deyvid@minotaurus.dev` / `minotaurus`) — confirmed
  unaffected by Phase 7 changes

## Known Risks

- graph becoming overloaded
- export payload growth (now includes Mermaid sources)
- AI context compaction
- Mermaid bundle size on first render (~1MB, lazy-loaded)
