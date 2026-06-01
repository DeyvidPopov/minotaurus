# Feature Progress

> The newest work is listed first under "DONE". The dated "pass" sections further down are
> a historical changelog kept for context. Refreshed 2026-06-01 (pre-submission pass).

## DONE
- Auth
- Projects
- Artifacts
- Relations
- Validation (rule-based, deterministic — 17 rules)
- **Deterministic Analysis Engine** (`modules/exports/analysis/`, pure — health score,
  documentation coverage, connectivity, traceability, governance, validation roll-up, risks)
- **Export Engine V2** — JSON / Markdown / **real deterministic PDF report** (`pdfmake`,
  section-gated, byte-deterministic from the snapshot) + on-demand server-side download
  endpoint (`GET /exports/:exportId/download`). *(ZIP is advertised but not implemented —
  falls back to JSON.)*
- **AI Bootstrap Wizard** (`modules/ai/`) — propose artifacts (DRAFT) + relations + 1–3
  Mermaid diagrams → human review → deterministic, server-re-validated apply. AI never
  writes SSOT except on the human-gated apply path.
- **AI Architecture Review** (`modules/ai/review/`) — read-only; reads SSOT +
  `AnalysisResult`, emits an evidence-verified narrative, persists an `AiSession(REVIEW)`
  audit row. No apply path; AI explains scores, never computes them.
- **AiSession audit trail**, **Mermaid normalization** (AI Mermaid is structure-only),
  **AI truncation handling** (honest `422`/prefix salvage, repair retry skipped).
- **Database-level unique relation constraint** — the knowledge-graph edge is unique by
  `@@unique([sourceArtifactId, targetArtifactId, relationType])` (migration
  `20260601120000_unique_artifact_relation_edge`); the relation controller maps the P2002
  unique violation to a clean `409 RELATION_EXISTS` (race-safe vs. the pre-check). Plus the
  existing artifact-title constraint `@@unique([projectId, normalizedTitle])`
  (409 ARTIFACT_TITLE_TAKEN) and membership `@@unique([projectId, userId])`.
- Documentation (per-artifact Markdown editor)
- **Documentation Hub (Phase A — project-wide coverage view)**
- **Ingestion Hub (Ingestion Phases 1 + 2 + 3 + 4 + 5)** — every source type
  card now has a parser.
  - Phase 1: draft workflow + history + sidebar entry.
  - Phase 2: **Markdown** → DOCUMENTATION artifact (LINK_EXISTING or CREATE_NEW).
  - Phase 3: **OpenAPI JSON** → ApiSpec + ApiEndpoints (CREATE_API_SPEC,
    editable base URL).
  - Phase 4: **Mermaid** → Diagram (CREATE_DIAGRAM, optional artifact link,
    live preview).
  - Phase 5: **SQL Schema** (subset of CREATE TABLE DDL) → DatabaseModel +
    Entities + Fields with resolved FKs (CREATE_DATABASE_MODEL, generated
    Mermaid ERD preview).
- API Specs
- Database Models (with auto-generated Mermaid ERD preview)
- Diagrams (Mermaid editor with live preview, syntax status, template picker)
- Settings
- **Project Team Management + Roles (Phase 7 — multi-user collaboration)**

## DIAGRAMS MODULE UX REFACTOR (current pass)
- **Diagrams list is now a visual card gallery.** Each diagram card renders
  a live Mermaid thumbnail (clamped to ~140px), title, type chip, linked
  artifact chip, description, updated timestamp, and an `OpenLink`.
  Clicking the thumbnail or the OpenLink opens the detail page. A
  `DiagramFallback` renders title + type chip if the source is empty.
  Search + type filter survive. When a type filter is active, the page
  shows a one-line helper sentence explaining that diagram type
  (`DIAGRAM_TYPE_BLURBS`).
- **Diagram detail is now read-first.** The default view shows the title,
  type, linked artifact, description, type blurb, the rendered Mermaid
  diagram, and a `<details>` "Mermaid source" collapsible. Edit / Copy
  Mermaid / Fullscreen / Metadata / Delete sit in the header. Clicking
  Edit (or arriving with `?edit=1` from a fresh create) flips to the
  split source-and-live-preview editor with Templates / Copy / Fullscreen
  / Save / Done in the header. Done warns about unsaved changes.
- **New diagram flow is a purpose picker.** The modal opens to a grid of
  purpose cards — Architecture overview / Request flow / Login sequence /
  Checkout sequence / Database ERD / Domain model / Validation lifecycle /
  Impact analysis / Roadmap (Gantt). Picking one auto-fills the title +
  description, sets the diagram type, and seeds the editor with a
  Minotaurus-relevant Mermaid source (real services / artifacts /
  database entities). The previous "Type → empty template" flow is gone.
  After create, the detail page opens directly in editor mode via
  `?edit=1`.
- **Templates are project-relevant.** `lib/api/diagrams.ts` exports
  `DIAGRAM_PURPOSES` and a re-derived `MERMAID_TEMPLATES`. Templates use
  real platform names — API Gateway / Authentication Service / Product
  Catalog API / Order Service / Payment Service / Customer Records /
  Users + Sessions + Roles ERD / Validation issue lifecycle / Impact
  analysis flow / Roadmap of phases.
- **Mermaid sequence contrast fixed.** Theme variables strengthened:
  `actorBorder: "#5f8fb8"`, `labelBoxBkgColor: "#1a1d24"`,
  `activationBkgColor: "#2a2e36"`, `noteBkgColor: "#111318"`. The
  post-render sweep in `components/mermaid-preview.tsx` now also rewrites
  `rect.actor / rect.actor-top / rect.actor-bottom / rect.actor-box`
  (fill `#1a1d24`, stroke `#5f8fb8`) and `rect.note / polygon.labelBox`
  (fill `#111318`). Scoped CSS in `app/globals.css` carries the same
  rules as `!important` fallbacks. Authored colours on `<text>` /
  `<tspan>` are still preserved by the existing fill-check.
- **Template insert is honest.** Applying the canonical-by-type template
  is silent ("Template applied") when the editor is empty or already
  matches the template, and only triggers the replacement confirmation
  modal when the existing source actually differs from the new template.
  No more "Replaced source with SEQUENCE template" copy.

## INGESTION DETAIL UI POLISH (previous pass)
- Ingestion history is now an audit trail in the UI. The row-end
  delete / remove-log button is gone entirely. Both confirmed and draft
  records show only the Open action; deletion still works via the
  `DELETE /api/ingestion/:id` endpoint but isn't exposed from this page.
- Detail modal's `Created records` block is now grouped + filtered, not
  a flat list:
  - Routed types (ARTIFACT / API_SPEC / DIAGRAM / DATABASE_MODEL) get
    their own row with the type chip, truncated id, and an `OpenLink`
    routing to the matching detail page.
  - Child types (API_ENDPOINT / DATABASE_ENTITY / DATABASE_FIELD) get
    a single summary row per type ("21 fields created"), with a
    `<details>` "show ids" toggle that reveals the raw id list. No more
    broken "Open database model" links for individual fields.
- Detail modal is now `xlarge` (`max-w-[960px]`), responsive on mobile,
  `max-h-[85vh]` with internal scroll. The Modal helper learned an
  explicit `size: "default" | "wide" | "xlarge"` prop; the existing
  `wide` boolean still works for backwards compatibility.

## NAVIGATION POLISH + INGESTION LOG SEMANTICS (previous pass)
- Reusable `components/ui/open-link.tsx` is the canonical "Open"
  navigation link app-wide: muted neutral foreground, `SquareArrowOutUpRight`
  icon on the left, "Open" label by default, brighter on hover, visible
  focus ring, no blue text, no arrow suffix. Drop-in for table row-end
  navigation, card actions, and inline "View all"-style links.
- Every row-end chevron / `Open →` / blue inline link that meant "navigate
  to this detail" was replaced with `OpenLink`. Touched pages: Artifacts
  list, API Specs list, Database Models list, Diagrams list, Projects
  list (chevron was redundant inside a card-wide `<Link>`, removed),
  Dashboard "View all", Project overview Card actions (Knowledge graph /
  Validation snapshot / Recent changes), Documentation Hub (Open
  documentation + Open artifact), Version History timeline (per-event
  Open), Impact page (All versions), Graph drawer (Open artifact).
  Mutation buttons (Edit / Delete / Run validation / Save), the export
  preview Open/View toggle (in-page state, not navigation), and the
  ingestion history Open-modal button (opens a modal, not a route) keep
  their existing Button styling.
- **Ingestion log semantics clarified.** `IngestionRecord` is now treated
  as an audit / import log everywhere, not the source of truth. The
  database confirms this: `createdRecords` is a JSON list of ids, with
  no foreign keys back to the IngestionRecord, so deleting the log can
  never cascade-delete a created Artifact / ApiSpec / ApiEndpoint /
  Diagram / DatabaseModel / DatabaseEntity / DatabaseField.
  - History table: DRAFT / PARSED / FAILED rows show a destructive
    "Delete draft" action with a tooltip explaining no project assets
    will be affected. CONFIRMED rows show a non-destructive "Remove log"
    action with the tooltip "Removes only the ingestion history entry.
    Created project assets remain unchanged."
  - Confirmation dialog copy is now status-aware: removing a CONFIRMED
    log shows "Remove ingestion log? This only removes the import history
    record. Created artifacts, API specs, diagrams, or database models
    will remain in the project.".
  - Success toast: "Ingestion log removed · created assets unchanged"
    for CONFIRMED, "Ingestion draft deleted" otherwise.
  - Detail modal opens with a status-aware sentence at the top (DRAFT
    "has not created project assets yet", PARSED "parsed but not
    confirmed", CONFIRMED "Removing the log will not delete those
    assets", FAILED "Delete this draft and start over").
  - `createdRecords` rows in the detail modal are now `OpenLink` buttons
    routing to the correct module (Artifact → artifact detail with
    documentation tab; ApiSpec / ApiEndpoint → API spec detail;
    Diagram → diagram detail; DatabaseModel / DatabaseEntity /
    DatabaseField → database model detail). The raw id is shown next
    to the link as a small mono caption.
- Backend `DELETE /api/ingestion/:id` writes a status-aware VersionEvent:
  `"Removed ingestion log"` when the record was CONFIRMED (with
  `logRemovalOnly: true` in metadata), `"Ingestion draft deleted"`
  otherwise. End-to-end curl tests verified: removing a CONFIRMED OpenAPI
  log leaves the ApiSpec + its 1 endpoint intact (`GET /api/api-specs/:id`
  → 200; `/endpoints` still lists the path); removing a CONFIRMED Mermaid
  log leaves the Diagram intact.
- 11/11 backend smoke tests still pass.

## GLOBAL MERMAID LABEL VISIBILITY FIX (previous pass)
- Root cause: the shared `components/mermaid-preview.tsx` ran with
  `securityLevel: "strict"` and (in newer Mermaid versions) emitted HTML
  labels via `foreignObject`. Strict mode plus HTML labels meant Mermaid
  applied an inline color (often near-black or theme default) that ignored
  our `themeVariables`, and our previous post-render warning fell back to
  showing "labels may be missing" instead of fixing the underlying CSS.
- Renderer fix in `components/mermaid-preview.tsx`:
  - Switched to `securityLevel: "loose"` so post-render style overrides take
    effect — Mermaid no longer scrubs the inline styles we set.
  - Forced `flowchart: { htmlLabels: false }`, plus the same on class /
    state diagrams. Native SVG `<text>` honors our `fill="..."` set from
    themeVariables and survives the style sweep.
  - New `forceLabelVisibility(host)` post-render sweep walks every label-
    bearing selector (`text`, `tspan`, `.nodeLabel`, `.edgeLabel`,
    `.edgeLabel span`, `.edgeLabel div`, `foreignObject`, `.label`,
    `.messageText`, `.actor`, `.labelText`, `.loopText`, `.noteText`, ERD
    attribute rows) and forces `color: #e6e8ec`, `opacity: 1`,
    `visibility: visible`, and for `<text>`/`<tspan>` sets `fill="#e6e8ec"`
    **only** when the existing fill is empty / transparent / pure black.
    Authored colored fills are preserved.
  - Edge label backgrounds (`.edgeLabel .label-container / rect`,
    `.labelBkg`, `foreignObject div`) get `background: #1a1d24`.
  - `detectLabelsMissing` runs AFTER the sweep so the warning only fires
    when labels are genuinely absent; selector list also widened to
    `.nodeLabel`, `.edgeLabel`.
- Scoped CSS fallback in `app/globals.css` under `.mermaid-host` so any
  selector that slips through the JS sweep is still rendered visibly:
  `text / tspan / .messageText / .actor / .labelText` get
  `fill: #e6e8ec !important`; `.nodeLabel / .edgeLabel / .label /
  foreignObject` get `color: #e6e8ec !important`; `.edgeLabel rect /
  .labelBkg` get `fill: #1a1d24 !important`. Scoped so the rest of the app
  is untouched.
- All six MermaidPreview callers (ingestion preview, diagram detail page
  source + ERD tabs, database model ERD, export preview) benefit because
  they all go through the same component. No call site code changed.

## INGESTION PHASE 4 + 5 — Mermaid + SQL Schema ingestion (previous pass)
- **Phase 4 — Mermaid**:
  - New `backend/src/modules/ingestion/mermaid.engine.ts`. Pure regex. Lifts
    out a `\`\`\`mermaid` fence if the input is Markdown, detects diagram type
    from the first non-comment line (FLOWCHART for `flowchart` / `graph`,
    SEQUENCE / ERD / CLASS / STATE / GANTT, else ARCHITECTURE), extracts a
    title from a `%% Title: …` comment, counts lines, and pulls best-effort
    node hints (bracket labels for flowchart, participant/actor + arrow targets
    for sequence, entity declarations for ERD).
  - Endpoints `POST /api/ingestion/:id/parse-mermaid` (DEVELOPER+, body
    `{ mermaidSource }`) and `POST /api/ingestion/:id/confirm-mermaid` (body
    `{ mode: "CREATE_DIAGRAM", artifactId?, title, diagramType }`). Confirm
    creates a real `Diagram` row, writes a `DIAGRAM/CREATED` VersionEvent
    `"Mermaid diagram imported · <title>"`, optionally links to an artifact.
  - Frontend wizard: paste-or-upload .mmd / .md → preview with **live
    MermaidPreview render** + node-hint chips + collapsible raw source →
    confirm with editable title, diagram type select, optional artifact
    picker. On commit → router push to `/projects/:id/diagrams/:id`.
- **Phase 5 — SQL Schema**:
  - New `backend/src/modules/ingestion/sql.engine.ts`. Hand-written DDL
    scanner — strips line/block comments, finds each `CREATE TABLE …`
    head, then uses a paren-depth walker to capture the table body so
    constraints like `FOREIGN KEY (col) REFERENCES tbl(col)` with nested
    parens are recovered correctly. Per column: type (with paren'd suffixes
    like `varchar(255)`), `NOT NULL`, inline `PRIMARY KEY`, inline `UNIQUE`,
    inline `REFERENCES`. Per table-level constraint: `PRIMARY KEY (...)`,
    `UNIQUE (...)`, `FOREIGN KEY (...) REFERENCES …(…)`. Identifiers can be
    `"quoted"`, `` `backticked` ``, `[bracketed]`, or schema-prefixed.
  - Endpoints `POST /api/ingestion/:id/parse-sql-schema` (DEVELOPER+, body
    `{ sql }`) and `POST /api/ingestion/:id/confirm-sql-schema` (body
    `{ mode: "CREATE_DATABASE_MODEL", artifactId?, title, databaseType }`).
    Confirm runs a single Prisma `$transaction`: creates `DatabaseModel`,
    then in pass 1 creates every `DatabaseEntity` + `DatabaseField` with
    `referencesEntityId: null`, then in pass 2 resolves FKs by name and
    updates the field rows. Writes one `DATABASE_MODEL/CREATED` event +
    one `DATABASE_ENTITY/CREATED` event per entity.
  - Frontend wizard: paste-or-upload .sql → preview entities + fields (PK
    + FK chips), generated Mermaid ERD preview rendered client-side, FK
    relationship summary → confirm with editable title, database type
    select, optional artifact picker. On commit → router push to
    `/projects/:id/database/:id`.
- Both wizards reuse a new shared `ArtifactLinkPicker` component (search
  + `— No artifact link —` row + selected highlight).
- Ingestion Hub history "Result" column now reports per source:
  - PARSED Mermaid: `<diagramType> · <N> lines`.
  - PARSED SQL: `<N> entities · <M> fields · <K> FK`.
  - CONFIRMED Mermaid: `Diagram created`.
  - CONFIRMED SQL: `DB model + <N> entities · <M> fields`.
- All four source-type cards are now "Parser ready". The simple "Start
  draft" form is unreachable from the Hub.
- The existing Diagrams + Database Model modules are unchanged. The wizards
  write to the same Prisma tables (`Diagram`, `DatabaseModel`,
  `DatabaseEntity`, `DatabaseField`), so the existing detail pages, ERD
  views, validation rules and SSOT export pick up the imported records
  unchanged (verified end-to-end).
- 11/11 backend smoke tests still pass.

## INGESTION PHASE 3 — OpenAPI JSON ingestion (previous pass)
- New deterministic engine at `backend/src/modules/ingestion/openapi.engine.ts`.
  No AI, no YAML. Validates basic OpenAPI structure (must have `openapi` or
  `swagger` field plus a `paths` object), then extracts:
  - `info.title`, `info.version`, `info.description`
  - `servers[0].url` (with Swagger 2.0 best-effort: `scheme://host + basePath`)
  - per (path, method) operation → `{ method, path, summary, description,
    requiresAuth, requestSchema, responseSchema }`. `requiresAuth` is true if
    the operation has its own `security` array OR if a root-level `security`
    exists and the operation didn't override it. `requestSchema` /
    `responseSchema` are `JSON.stringify`'d versions of `requestBody` /
    `responses` so they fit the existing `ApiEndpoint` schema fields.
  - Only the five supported HTTP methods (GET / POST / PUT / PATCH / DELETE)
    are imported; options/head/trace are silently dropped.
- Two new ingestion endpoints — both DEVELOPER+:
  - `POST /api/ingestion/:id/parse-openapi-json` — JSON `{ openapiJson }`. Only
    on `OPENAPI_JSON` sourceType. Stores the preview (+ source marker
    `source: "OPENAPI_JSON"`) in `parserResult`, flips status DRAFT → PARSED,
    writes `PROJECT/UPDATED` VersionEvent `"OpenAPI JSON parsed · <title>"`. On
    failure: status FAILED, errorMessage set, returns 422 PARSE_FAILED.
  - `POST /api/ingestion/:id/confirm-openapi-json` — body
    `{ mode: "CREATE_API_SPEC", artifactId?: string | null }`. Requires the
    record to be PARSED. Creates an `ApiSpec` (linked to the optional artifact)
    + one `ApiEndpoint` per parsed endpoint **in a single `$transaction`**.
    Writes one `API_SPEC/CREATED` and one `API_ENDPOINT/CREATED` event per
    endpoint. Flips status PARSED → CONFIRMED. `createdRecords` ends up as
    `[{ type: "API_SPEC", id, mode: "CREATE_API_SPEC" }, { type: "API_ENDPOINT", id }, …]`.
- Frontend: existing Ingestion Hub now drives the OpenAPI JSON card with a
  multi-step wizard modal that mirrors the Markdown wizard:
  - Step 1: title + optional source name + paste-or-upload `.json`.
  - Step 2: preview — API title / version / base URL / description / endpoint
    table (method chip with tone per HTTP verb, path, summary, auth chip).
  - Step 3: confirm — searchable artifact picker (with a `— No artifact link —`
    option), Create API spec button. On success → router push to
    `/projects/:id/api/:newSpecId`.
  - History "Result" column: PARSED rows show `<N> endpoint(s) · v<version>`;
    CONFIRMED rows show `API spec + <N> endpoint(s) created`.
  - Detail modal shows API title / version / base URL / endpoint count and
    links each created record to its real detail page (API spec for `API_SPEC`,
    artifact detail for `ARTIFACT`).
  - VIEWERs see the wizard disabled; the API returns `INSUFFICIENT_ROLE` on
    bypass.
- The existing API Specs module is **unchanged** — the wizard creates real
  `ApiSpec` + `ApiEndpoint` rows via Prisma, so the API Specs page, detail
  view, validation engine and SSOT export all pick them up unchanged.
- 11/11 backend smoke tests still pass.

## ARTIFACT TITLES UNIQUE PER PROJECT (previous pass)
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

## AI FEATURES (shipped — current pass)
- **AI Bootstrap Wizard** (`modules/ai/`): `POST /projects/:id/ai/bootstrap/{propose,apply}`
  (DEVELOPER+). `proposeBootstrap` builds a prompt → Anthropic provider (forced tool use,
  cached system block, non-streaming) → Zod-parse (one repair retry) → Mermaid normalize →
  deterministic preview validation → persist a `PROPOSED` `AiSession`. `applyBootstrap` is
  the only DB path: re-validates the user-edited proposal against the live project, creates
  artifacts (`DRAFT`, `description:""`) + relations + diagrams in a `$transaction`, records a
  `VersionEvent` per entity with `metadata.origin:"AI"`, flips the session to `APPLIED`.
- **AI Architecture Review** (`modules/ai/review/`): `POST /projects/:id/ai/review`
  (generate; DEVELOPER+; the only AI call) + three read-only GETs (`/review/latest`,
  `/reviews`, `/reviews/:id`) that reuse persisted reviews with no AI call. Chain:
  `SSOT → buildExportContent → analyzeExportSnapshot → buildReviewDigest → AI`. Output is
  bounded by `review.schema.ts` caps; evidence is verified against a deterministic
  `evidenceKeys` allow-list (`review.verify.ts`); truncation salvages the completed prefix
  (`review.salvage.ts`). Persisted as `AiSession(REVIEW)` with an `analysisHash` for
  staleness (`hashAnalysis` excludes `generatedAt`).
- Error taxonomy: `503 AI_NOT_CONFIGURED`, `502 AI_PROVIDER_ERROR`, `422 AI_OUTPUT_TRUNCATED`,
  `502 AI_SCHEMA_ERROR`; apply adds `422 AI_VALIDATION_FAILED` / `409 AI_APPLY_CONFLICT`.
- Frontend: `components/ai/bootstrap-wizard.tsx` (describe → review → confirm, live
  re-validation) and `app/(app)/projects/[projectId]/review/page.tsx` (loads the latest
  persisted review on mount, history dropdown, staleness badge, evidence chips, deterministic
  score cards). Regeneration is always explicit.
- 11/11 backend smoke tests still pass; 112 backend unit tests cover the pure AI
  proposal/review sub-engines.

## EXPORT ENGINE V2 (shipped — current pass)
- Three strictly separated layers: `buildExportContent` (SSOT assembly) →
  `analyzeExportSnapshot` (pure analysis) → `renderArchitecturePdf` (pure presentation).
- Real PDF via `pdfmake` (standard-14 fonts, no headless browser), section-gated by
  `buildReportPlan`, deterministic (CreationDate/ModDate/`_id` pinned from snapshot identity).
- Diagram SVGs captured by the frontend at export-create time and frozen into the snapshot;
  normalized for `svg-to-pdfkit` in `pdf/diagram-svg.ts`.
- On-demand download: `GET /exports/:exportId/download` (registered before the `:exportId`
  catch-all) renders PDF from the persisted snapshot; JSON/MARKDOWN stream stored content.
- ZIP is advertised but not implemented (falls back to JSON).

## REMAINING WORK (pre-submission → post-diploma)
Pre-submission hardening (small, see `NEXT_STEPS.md`):
- Remove the hardcoded JWT-secret fallback; set a real secret; rotate the Anthropic key.
- Add an async error wrapper (Express 4 doesn't route async-handler rejections).
- Guard the destructive scripts (`seed`, `prisma:reset`) with a `NODE_ENV` check.
- Cap the version-history query (`take`).
- Tighten frontend loading/error states; modal focus handling.

Deferred (post-diploma, do not start now):
- Pagination + N+1 cleanup across list endpoints; validation-engine O(n²) optimisation.
- Controller / validation-engine / parser unit tests + a frontend test runner.
- ZIP export; AI generation of DB models / API specs / security policies.
- Transitive impact analysis + scoring.
- WebSocket live updates; email invitations for non-existent users; per-resource ownership
  transfer; retention/archival for version events / AI sessions / export packages.