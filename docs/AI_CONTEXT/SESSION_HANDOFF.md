# Session Handoff

## Authentication — final state (complete)

**Lifecycle:** Register → Email verification via Resend → Password setup → JWT login → Dashboard redirect.

**Email providers** (`modules/email/`, selected by `EMAIL_PROVIDER`, single seam `EmailService`):
- `dev` — logs a masked verification code to the console (no credentials; default for local dev).
- `resend` — sends a real verification email via the Resend API (`RESEND_API_KEY`, `MAIL_FROM`; `minotaurus.dev` verified).
- `smtp` — fallback placeholder (not implemented; throws `503 EMAIL_NOT_CONFIGURED`).

**Remaining (deferred, not blockers):**
- Redis-backed rate limiting before any multi-instance deployment (current limiter is in-memory/single-instance).
- Optional CAPTCHA on `register/start` if signup enumeration becomes a concern (start intentionally returns `409 EMAIL_TAKEN` for completed accounts).
- Optional login gating on `emailVerifiedAt` for legacy/unverified users (login is currently not gated).

## Last Completed Feature

**API Payload Intelligence** (`backend/src/modules/api-intel/`) — a deterministic, non-AI
layer that turns endpoint request/response payloads into architecture intelligence.
**`api-intel` is the single deterministic source** for payload/field extraction, entity
matching, workflow inference, validation rules, knowledge-graph inferred edges, analysis
metrics, PDF output, and AI-review evidence — every consumer reads this one module so the
heuristics never drift. Pure, deterministic, never writes the DB, never persists inferences
(no `ArtifactRelation` created), no schema change.
- **Phase 1 — Architecture Links + Workflow Impact.** Per-endpoint, in the API-spec detail
  page's expandable row. Three-tier inference (payload→entity / real-relation walk /
  name-match), each item confidence-graded with a mandatory `basis`. `payloadFields` (all
  extracted) vs `referencedFields` (inference subset).
- **Phase 2 — Knowledge Graph overlay.** Artifact-level inferred edges (`TOUCHES`/
  `SECURED_BY`/`DOCUMENTED_BY`), deduped against real relations, dashed + badged,
  toggle-gated, never persisted, no new node types. Plus explicit **Real relations** /
  **Inferred links** edge toggles on the graph page (honest total counts).
- **Phase 3 — API Impact Analysis.** Synthesized per-endpoint view (Touches / Implemented By /
  Protected By / Referenced In / Workflow / Payload Fields / Warnings), default lens, with a
  toggle to the granular Architecture Links.
- **Phase 4 — Validation rules.** `API_FIELD_UNMAPPED`, `PUBLIC_ENDPOINT_EXPOSES_SENSITIVE_FIELD`,
  `USER_SCOPED_ENDPOINT_WITHOUT_AUTH`, `RESPONSE_EXPOSES_TOKEN_OR_SECRET`, fed into the
  deterministic validation engine (code-in-message, no schema change). Shared `AUTH_ACTIONS`
  allow-list (incl. forgot-/reset-password) suppresses auth-endpoint false positives — and
  now also gates the legacy `isSecuritySpec` "marked public" rule.
- **Phase 5 — Analysis / PDF / AI Review.** `AnalysisResult.apiIntel` (payload coverage %,
  field→entity mapping %, sensitive-exposure count, public-endpoint-risk count) → gated PDF
  "API Payload Intelligence" section + AI-review digest evidence keys (AI may cite, never
  compute; `hashAnalysis` includes it).
- **Refinements (this session, all verified on the testbed):** context-aware ambiguous
  field matching (Authentication API prefers `User`/`Session` over `Patient` via the
  service→DB relation neighborhood — tie-break only, deterministic fallback intact);
  documentation/related false-positive fix (name-match tokens + relation-walk anchors
  restricted to the **primary** entity); "Handles Credentials" wording for public
  credential intake.
- **Testbed:** `scripts/seed-payload-testbed.ts` (`npm run seed:testbed`) — separate,
  idempotent **"Payload Intelligence Testbed"** project with intentionally-bad endpoints
  (`/debug/leak-token`) proving the rules fire; never touches the main demo.
- Verified: backend `npm run typecheck` + `test:unit` (271 pass, incl. the api-intel
  suites); frontend `npm run typecheck` + `lint`; live testbed (`/auth/login` touches
  User + Session; security validation only flags the bad endpoint; PDF apiIntel + inferred
  edges populated).

## Previous feature pass

**Registration wizard — UX follow-up** (two fixes):
- **Duplicate completed-account email now blocks on Step 1.** `register/start` returns
  `409 EMAIL_TAKEN` when a `User` already owns the email (a deliberate signup-enumeration
  tradeoff that replaced the neutral-start response — see `KNOWN_LIMITATIONS.md → Auth`).
  The wizard catches it, stays on Step 1, and shows an inline under-email error
  ("An account with this email already exists. Sign in instead.") with **Sign in** linking
  to `/login`; the error clears as the user edits the email. Pending/incomplete
  registrations (no `User`) and fresh emails still proceed normally. Backend change scoped
  to `startRegistration`; `resend`/`verify`/`complete`/`login` stay neutral/generic.
- **OTP auto-submit removed.** Typing/pasting all 6 digits now only fills the boxes; the
  user submits via the "Verify email" button (or Enter while the form is focused and the
  button is enabled). Autofocus-next, paste-full-code, and backspace behavior are unchanged.
- Verified: backend `npm run typecheck` + `test:unit` (224 pass) + `test:api` smoke (now
  asserts the existing-email block); frontend `npm run typecheck`; live checks for
  duplicate / case-insensitive duplicate / fresh / pending-restart.

## Previous feature pass

**Multi-Step Registration Wizard — Frontend** (`app/(auth)/register/page.tsx`) —
the UI on top of the hardened backend below. Single-file, wired to the real contract
(`authApi.registerStart/Verify/Resend/Complete`); no simulated success, only local
loading spinners. Token is persisted by `registerComplete` exactly like login, then
step 4 → `/dashboard`.
- 4-step flow: Account → Verify → Password → Done, with a numbered stepper whose labels
  collapse on mobile (`hidden sm:inline`). OTP code input supports autofocus, paste
  (incl. iOS `one-time-code` distribution), backspace, Delete/clear, and arrow-key nav.
- 30s resend cooldown driven by `resendAvailableAt` (and `RESEND_COOLDOWN.retryAfterSeconds`);
  inline error mapping for INVALID_CODE / WEAK_PASSWORD (shows `details.failures`) /
  RESEND_COOLDOWN / RATE_LIMITED-429 / EMAIL_NOT_CONFIGURED (neutral wording) / 500.
- Login and the backend were untouched (per scope). Legacy `POST /auth/register` still
  there + deprecated.
- **Post-implementation focused quality audit** (5-lens multi-agent + per-finding verify,
  20 worth-fixing / 9 refuted) → all fixes applied in `register/page.tsx` only:
  - a11y: visible `<label>`s + `id`/`aria-invalid`/`aria-describedby` on all 5 text inputs;
    OTP `role="group"` + label; stepper `role="list"`/`listitem` + sr-only "Step N of 4"
    + decorative icons `aria-hidden`; success step `role="status"` + autofocus; resend
    cooldown text bumped off the low-contrast `--fg-subtle` token.
  - flow: gate "Change email" / step-3 "Back" / "Resend" on in-flight `loading` (no
    navigation racing a resolving request); clear the consumed code when going Back to verify.
  - correctness: terminal stepper node shows the check (not a hollow "4"); OTP boxes redden
    only for code-validity errors (`codeInvalid`), and the error clears on retype; step 2 is
    a real `<form>` so Enter submits; the post-success redirect `setTimeout` is held in a ref
    and cleared on unmount / on "Enter workspace" (no double-navigate).
- Verified: frontend `npm run typecheck` + `npm run lint` clean; `/register` renders 200
  with the new a11y markup; backend contract re-confirmed end-to-end the prior pass.

## Previous feature pass

**Multi-Step Registration Backend** (`modules/auth/registration/` + `modules/email/`) —
production-oriented verified signup, backend only (no UI yet, by design):
- Endpoints (mounted under `/auth/register`, each rate-limited): `start` (account data →
  emailed 6-digit code), `verify` (code → short-lived registration token), `complete`
  (token + password → User + JWT, same shape as login), `resend` (cooldown-gated re-issue).
  Legacy `POST /auth/register` kept + deprecated.
- Layering mirrors the rest of the app: pure `registration.engine.ts` (normalization, code
  gen via injected RNG, expiry/cooldown/attempt math, password strength ≥8+letter+number —
  no clock/randomness/IO) → `registration.service.ts` (Prisma + bcrypt/sha256 + email + JWT,
  with an injectable-deps test seam) → thin `registration.controller.ts` + zod.
- DB: new `EmailVerification` table (separate from User) holding bcrypt-hashed code,
  sha256-hashed registration token, expiry/cooldown/attempt/verified columns; `User`
  gained nullable `emailVerifiedAt`. Migrations `20260603130000_add_email_verified_at` +
  `20260603130100_add_email_verification`. Seeded users marked verified.
- Security: codes/tokens never persisted in plaintext; `start`/`resend` enumeration-neutral
  for verified accounts (with constant-time bcrypt compensation on the duplicate/no-record
  paths); attempt cap enforced by an **atomic** conditional `updateMany` reservation BEFORE
  bcrypt (no TOCTOU under concurrent `/verify`); `HttpError` gained optional `details`
  (carried verbatim by the error handler — the generic-500 no-leak branch is unchanged).
- Email seam: `EmailService` with `DevEmailService` (masked dev-only log) default +
  `SmtpEmailService` placeholder (`503 EMAIL_NOT_CONFIGURED`). Optional env in `.env.example`.
- Rate limiting: pure `rate-limit.engine.ts` + in-memory `rate-limit.ts`; `clientIp()` uses
  `req.ip` only (never raw XFF) with `TRUST_PROXY` opt-in. Per-route limiters on login +
  all four registration routes.
- Tests: engine + rate-limit-engine + middleware + email-service + full service
  orchestration (incl. concurrency-cap and P2002→EMAIL_TAKEN race). `npm run test:unit`
  223 pass; backend + frontend typecheck clean.
- Frontend contract only (no UI): typed `registerStart/Verify/Complete/Resend` in
  `frontend/nextjs/lib/api/auth.ts`.
- **Post-implementation adversarial review** (5-lens multi-agent + per-finding verify):
  16 findings confirmed, 5 refuted. Fixed the real ones (XFF-spoofing IP-trust bypass,
  verify attempt-cap TOCTOU, start/verify timing oracles, verify limiter keying) + added
  the missing test coverage; the remaining low-risk items are recorded under
  `KNOWN_LIMITATIONS.md → Auth → Accepted low-risk items`.
- **Deferred follow-ups**: real SMTP transport; move rate-limit + verification state to
  Redis before multi-instance; the frontend wizard; decide whether login should require
  `emailVerifiedAt` for all users.

## Previous feature pass

**AI Architecture Review** (`modules/ai/review/`) — the first read-only AI feature:
- Chain is strictly one-directional and AI-free until the model call:
  `SSOT → buildExportContent → analyzeExportSnapshot → buildReviewDigest → AI review`.
  `AnalysisResult → AI` is allowed; `AI → AnalysisResult` is forbidden (Safety Rule 3).
- `POST /projects/:id/ai/review` generates (DEVELOPER+, the only AI call); three read-only
  GETs (`/review/latest`, `/reviews`, `/reviews/:reviewId`) reuse persisted reviews with no
  AI call. The digest is built from `AnalysisResult` (not raw SSOT), output is bounded by
  `review.schema.ts` caps, evidence is verified against a deterministic `evidenceKeys`
  allow-list (`review.verify.ts`), and a `max_tokens` stop salvages the completed prefix
  (`review.salvage.ts`).
- Persisted as `AiSession(REVIEW)` with a nullable `analysisHash` (migration
  `20260531234232_ai_review_session`); `hashAnalysis` excludes `meta.generatedAt` so the
  hash fingerprints project state, not assembly time. History is preserved (new row per
  generate). Frontend: `app/(app)/projects/[projectId]/review/page.tsx` loads the latest
  review on mount (no AI), shows staleness (`Current` vs `Project changed`), a history
  dropdown, evidence chips, and deterministic score cards; regeneration is always explicit.

## Previous feature pass

**AI Bootstrap Wizard** (`modules/ai/`) — the first AI feature, on the AI Safety &
Determinism Rules:
- `POST /projects/:id/ai/bootstrap/{propose,apply}` (DEVELOPER+). `proposeBootstrap`:
  prompt → Anthropic provider (forced tool use, cached system block, non-streaming) →
  Zod-parse (one repair retry) → Mermaid normalize → deterministic preview validation →
  persist a `PROPOSED` `AiSession`. `applyBootstrap` is the only DB path: re-validates the
  user-edited proposal against the live project (never trusts the client), creates artifacts
  (`DRAFT`, `description:""`) + relations + diagrams in a `$transaction`, records a
  `VersionEvent` per entity with `metadata.origin:"AI"`, flips the session to `APPLIED`.
- Generation contract expressed twice from the Prisma enums (Zod schema + Claude tool
  `input_schema`), field/emit order `summary → artifacts → diagrams → relations`. AI Mermaid
  is structure-only (styling stripped at propose + apply + validate). Honest error taxonomy
  (`503/502/422/409`); truncation → `422 AI_OUTPUT_TRUNCATED`, repair retry skipped.
- Frontend `components/ai/bootstrap-wizard.tsx`: describe → review (per-item checkboxes,
  live relation-endpoint + diagram-reference re-validation) → confirm.

## Previous feature pass

**Export Engine V2** — SSOT export + real deterministic PDF report:
- Three strictly separated layers: `buildExportContent` (SSOT assembly) →
  `analyzeExportSnapshot` (pure analysis) → `renderArchitecturePdf` (pure presentation).
- Real PDF via `pdfmake` (standard-14 fonts, no headless browser), section-gated by
  `buildReportPlan`, deterministic (CreationDate/ModDate/`_id` pinned from snapshot
  identity → byte-identical re-renders). Diagram SVGs captured by the frontend at
  export-create time, frozen into the snapshot, normalized in `pdf/diagram-svg.ts`.
- On-demand download `GET /exports/:exportId/download` (registered before the `:exportId`
  catch-all) renders PDF from the persisted snapshot; JSON/MARKDOWN stream stored content.
  Create requires ARCHITECT+; download mirrors read access. ZIP was **removed** from the
  format list / Prisma enum (migration `20260602120000_remove_zip_export_format`) — it was
  never implemented; a bundled archive is a possible future enhancement.

## Previous feature pass

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

118cea2 — *AI Review* (latest on `main`).

## Current Working State

- frontend works (all module pages live, incl. AI Bootstrap wizard + AI Review page)
- backend works (16 Prisma models, role enforcement live, AI endpoints live)
- **AI works** (opt-in via `ANTHROPIC_API_KEY`): Bootstrap propose/apply + read-only Review
  with persisted `AiSession` audit rows. Without the key the endpoints return `503`.
- **exports work** — JSON / Markdown / **real deterministic PDF** + on-demand download
  endpoint. ZIP removed from the format list (never implemented; future enhancement).
- validation works (rule-based, deterministic — relation/doc/security/API/DB/diagram/churn/
  deprecated/single-member rules **+ the 4 API-payload rules from `modules/api-intel/`**)
- **API Payload Intelligence works** (`modules/api-intel/`, the single deterministic source
  for payload heuristics) — read-only `GET /projects/:id/api-intel`; feeds the API-spec page
  panels, the graph inferred-edge overlay, the validation rules, `AnalysisResult.apiIntel`,
  the PDF section, and the AI-review evidence. No AI, no DB writes, nothing persisted.
- analysis engine works (pure, deterministic — health score, coverage, traceability, risks,
  **apiIntel metrics**)
- Mermaid rendering works (lazy-loaded, surfaces syntax errors as UI state)
- Demo project ("Online Shop Platform") seeded with 4 team members
  (Deyvid OWNER · Iris ARCHITECT · Maya DEVELOPER · Ren VIEWER), artifacts, relations, docs,
  1 API spec + endpoints, 1 DB model + entities + FK, diagrams, version events, seeded exports
- Tests: 271 backend unit tests (pure engines, incl. the full `modules/api-intel/` suite)
  pass; backend + frontend `tsc` clean; 11/11 `test:api` smoke. No controller /
  validation-engine / frontend tests.
- A second seeded project, **"Payload Intelligence Testbed"** (`npm run seed:testbed`),
  exists alongside the demo to exercise the API Payload Intelligence chain end-to-end.

## Current Goal

**Pre-submission hardening** — manual testing, bug fixing, UI polish, diploma documentation,
and defense preparation. No new features. First priorities (see `NEXT_STEPS.md`): remove the
hardcoded JWT-secret fallback, rotate the Anthropic key, add an async error wrapper, guard
the destructive scripts, cap the version-history query.

## Important Constraints

- do not break the graph contract (`ArtifactRelation` only; artifact nodes only)
- do not redesign the frontend shell
- do not regress existing flows (auth, projects, artifacts, relations, docs, API specs,
  DB models, diagrams, validation, export, version history, impact analysis, team, **AI**)
- keep AI outside the deterministic core (the five AI Safety & Determinism Rules in `CLAUDE.md`)
- preserve the seeded demo login (`deyvid@minotaurus.dev` / `minotaurus`)

## Known Risks

- no pagination on list endpoints; version-history loads all events into memory
- validation engine is O(n²) and loads the whole project — fine for demo, slow at scale
- export payload growth (`ExportPackage.content` freezes the snapshot + diagram SVGs)
- PDF diagram color remap is hardcoded to the current frontend theme (verify visually)
- AI latency / cost (non-streaming, opt-in); Mermaid bundle ~1MB on first render
- JWT secret fallback + unguarded destructive scripts (hardening items, see NEXT_STEPS.md)
