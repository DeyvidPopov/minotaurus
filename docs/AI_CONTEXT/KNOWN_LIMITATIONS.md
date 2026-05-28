# Known Limitations

Living list of trade-offs and partial implementations in the current MVP. Update on every feature pass.

## Persistence
- PostgreSQL via Prisma. Schema in `backend/prisma/schema.prisma`. Connection string in
  `backend/.env` (`DATABASE_URL`). Each controller / engine talks to Prisma directly —
  there is no caching layer.
- The previous JSON file persistence (`backend/src/db/data.json`, `json-db.ts`) is gone.
- Re-seeding wipes every table in dependency-safe order then re-creates the demo dataset.
  Safe to run while the backend is up — there is no stale in-memory cache to invalidate.
- Migrations live under `backend/prisma/migrations/`. Apply with
  `npx prisma migrate deploy`; iterate during dev with `npx prisma migrate dev`.

## Auth
- Multi-user **per project** (Phase 7). Project access is gated by the `ProjectMember`
  table with four roles: OWNER, ARCHITECT, DEVELOPER, VIEWER. No organization scoping
  yet — every user is global; membership is per-project.
- No refresh tokens, no password reset, no email verification.
- Changing the password does **not** invalidate existing JWTs — they remain valid until they expire (default 7d).
- Email changes via `PATCH /auth/me` take effect immediately with no verification flow.

## Team / Roles (Phase 7 — shipped)
- Roles enforced server-side at every mutation endpoint (controllers use the shared
  `getProjectAccess` + `hasAtLeast` helpers from `src/lib/project-access.ts`):
  - OWNER: everything, including managing members and deleting the project.
  - ARCHITECT: edit any project content + run validation + create exports.
  - DEVELOPER: edit artifacts / relations / docs / API specs / DB models / diagrams.
    CANNOT run validation, create exports, manage members.
  - VIEWER: read-only on all resources.
- Last-OWNER protection: the API refuses to demote or remove the only remaining OWNER
  of a project (`LAST_OWNER` error).
- Adding a member needs the user to already have a Minotaurus account (`USER_NOT_FOUND`
  is returned otherwise). No invitation-email flow yet.
- Project creator is auto-inserted as an OWNER membership row at creation time
  (`projects.controller.ts:createProject` does this in a `$transaction`).
- `project.ownerId` is preserved as the "creator pointer" on the Project row; the
  access helper falls back to it as an implicit OWNER membership for any project
  somehow missing its OWNER row, so legacy data keeps working.
- Member changes write VersionEvents: "Maya joined project as DEVELOPER",
  "Maya role changed: DEVELOPER → ARCHITECT", "Maya removed from project". Entity
  type is `PROJECT`; action is `LINKED` / `UPDATED` / `UNLINKED`.

## Graph
- `/api/projects/:id/graph` only emits artifact nodes. API specs, database models, and diagrams are **not** native graph nodes by design (to keep the graph contract stable). Navigation between them goes via the artifact detail page's **Linked resources** card.
- React Flow node positions are persisted in localStorage per-user, not on the server.

## Ingestion (Phase 1 — foundation only)
- New `IngestionRecord` table + Ingestion Hub UI ship the workflow shell. **No
  parsers are implemented yet** — creating a draft only records metadata
  (title / source name / source type), it does NOT read or store file content.
- Status field exists but only `DRAFT` is used in practice — `PARSED`, `CONFIRMED`,
  `FAILED` are reserved for future ingestion phases.
- `createdRecords` is `Json` and always `[]` in Phase 1. Future parsers will fill
  it with the IDs of artifacts / API specs / etc. they create.
- Ingestion records are deliberately **not** included in SSOT export until parsing
  lands — there's nothing useful to include yet.
- VIEWERs can read the Ingestion Hub and history but the Start draft / Delete
  buttons are disabled (UI) and the API returns `INSUFFICIENT_ROLE` (server).
  Draft creation and deletion require DEVELOPER+.

## Documentation
- One Markdown page per artifact. No history, no concurrent-edit locking. Last save wins.
- `documentation.updatedAt` reuses the artifact's `updatedAt`; there is no doc-only timestamp yet.
- **Documentation Hub** (`/projects/:id/docs`, Phase A) is a read-only overview — it
  surfaces coverage stats, the list of documented / undocumented artifacts, and deep-links
  to the artifact detail's Documentation tab via `?tab=documentation`. Editing still
  happens on the artifact detail page (no inline editor on the Hub itself by design).
- No ingestion yet — you can't upload an existing Markdown file or OpenAPI spec and have
  Minotaurus turn it into a documented artifact. Everything is hand-authored in the
  per-artifact editor.
- Excerpts on the Hub are computed from the first ~220 chars of the Markdown body
  with headings / code fences / link markup stripped. Header-only docs render as
  "No prose excerpt — the doc may be header-only."

## API Specs
- Validation rule "endpoint `requiresAuth=false` on a security-related spec" uses a title heuristic and produces false positives on legitimate bootstrap endpoints (`/login`, `/register`). Use Resolve / Ignore on the validation page to dismiss.
- No OpenAPI import/parse — schemas are stored as free-text strings.
- Allowed methods are `GET / POST / PUT / PATCH / DELETE` only.

## Database Models
- Entity/field operations are CRUD only. No migrations, no schema diff, no constraint generation.
- FK targets must live in the same database model. Cross-model references are not supported.
- ERD preview is auto-generated as Mermaid `erDiagram` and rendered client-side; not exportable as a standalone SVG by the server.

## Diagrams
- Mermaid is rendered client-side (lazy-loaded, ~1MB on first hit). No server-side SVG generation.
- `securityLevel: "strict"` is set on the Mermaid initializer — some click/href bindings are stripped by design.
- The "Invalid Mermaid syntax" validation rule is a tiny heuristic (header keyword + arrow token), not a real parser. The real syntax check happens client-side when Mermaid renders the source.
- ARCHITECTURE diagrams without a linked artifact produce an INFO-severity issue. Intentional nudge, can be ignored.
- No undo / version history on the editor. Save persists the current source; previous versions are not retained.
- **Label visibility (FIXED, see release notes):** Mermaid `fontFamily` no longer references CSS variables; concrete `themeVariables` ensure light text on dark background. Templates and seeded sources use explicit quoted node labels (`Client["Client"]`). ERD generator pads empty entity bodies with a `_empty` placeholder and always emits a non-empty relationship label. A post-render label scan warns when an SVG renders without any visible text content.
- Custom themes beyond dark are not supported — `themeVariables` are tuned for the platform's dark card background only.

## Validation
- Validation runs replace **all** prior issues for the project. No append/diff mode. Resolved/ignored statuses survive only until the next `POST /validate` run.
- No "Run on save" — validation only fires when the user clicks **Run validation** or the seed runs it.

## Export
- Snapshots are stored at creation time. Editing artifacts/docs/specs/diagrams after export does **not** update the stored export — re-export to refresh.
- Export `MARKDOWN` format renders documentation and Mermaid blocks; `PDF` and `ZIP` are accepted but render the same payload (no PDF generation).
- No download endpoint — preview page builds a blob client-side.

## Frontend
- `useTweaks` (theme / density / sidebar / graph node style) is browser-local Zustand state. Not synced to the backend.
- No avatar upload. The "Upload photo" button on Settings is wired to nothing.
- No notifications backend. The Notifications tab on Settings is disabled stubs.
- No API tokens module yet. The API tokens tab is a "coming next" placeholder.
- **Documentation routes (Phase A).** `/projects/[id]/docs` is now a real Documentation
  Hub (coverage stats, search, filter, deep-links). `/projects/[id]/docs/[artifactId]`
  redirects to the artifact detail with the Documentation tab preselected.
- **No file / OpenAPI / repo import.** All modelling is manual. The UI no longer claims
  otherwise (UX honesty pass).
- **No AI assistant.** The "Ask Minotaurus" button and sparkly topbar icons are removed.
  Validation is rule-based and deterministic; no LLM is involved anywhere.

## Phase 6 runtime (now finalized)
- Database is **live** on `localhost:5433` (PostgreSQL 18). Credentials: `postgres /
  postgres123!`, database name `minotaurus`. Connection string in `backend/.env`.
- Healthcheck: `GET /api/health/db` returns `{ database: "connected", provider:
  "postgresql", port: 5433 }`.
- Initial migration `20260527120000_init` applied. 13 tables + 13 enums + indexes
  verified to exist via `psql \dt` and `pg_type`.
- The local Postgres uses **port 5433**, not the 5432 the spec assumed. If you wire
  this project into another environment, set `DATABASE_URL` to whatever your
  Postgres actually listens on; the schema does not care.
- The seed assumes an empty database; if you run it twice it cleans every table
  first via a single `$transaction` of `deleteMany`s.
- Cascade behavior: deleting a Project cascades to artifacts/relations/specs/etc.;
  deleting an Artifact cascades to its relations and **nulls** the FK on its API
  specs / DB models / diagrams (they survive as "unlinked", matching what the
  frontend already handles).

## Versioning / History (Phase 5 — shipped)
- Implemented in `backend/src/modules/versions/`. Every CUD action on artifacts,
  relations, documentation, API specs/endpoints, DB models/entities/fields,
  diagrams, exports and validation runs writes a `VersionEvent`.
- **No diff or before/after snapshots.** Events carry `metadata` (changed field list,
  status, severity histogram for validations) but the previous values are not stored.
  Restoring an older state of an artifact is not possible.
- **No retention policy.** Events accumulate indefinitely in `data.json`. For a long-running
  demo this is fine; for a real deployment, add archival.
- **`VERSIONING` validation category remains unused.** The three new architecture-intelligence
  rules (excessive deps, recent churn, deprecated-but-referenced) live under the existing
  `ARCHITECTURE` category. Reserved for a future "stale version" rule.
- **Seed events are backdated** with synthetic timestamps. Real runtime events get the
  actual current time.

## Dashboard "Recent changes" widget (current pass)
- Lives on the **project workspace overview** (`/projects/<id>`), not the multi-project
  dashboard, because version events are project-scoped.
- Backed by the existing `GET /api/projects/:projectId/version-history?limit=10`
  endpoint. No new endpoint was added.
- Refreshes whenever the overview's `refresh()` runs — that's on initial load and after
  the "Run validation" button. Other in-page mutations (create artifact, edit relation
  on the artifact detail page, etc.) currently require navigating back to the overview
  to see the new event, by design. No WebSocket-driven live updates.

## Impact Analysis (Phase 5 — shipped)
- Endpoint: `GET /api/projects/:projectId/impact/:artifactId`. Page:
  `/projects/<id>/impact/<artifactId>`. Available via "Analyze impact" on the artifact
  detail page.
- **Direct traversal only (depth = 1).** Transitive impact ("what depends on X, plus
  what depends on those, …") is not computed. Brief explicitly forbade this.
- **No scoring or ranking.** Returned lists are raw — no severity weighting, no
  blast-radius metric beyond count tiles.
- **Documentation surface** = the target's own `documentationContent` plus any
  DOCUMENTATION-typed artifact that has a `DOCUMENTS` relation to the target. Free-text
  references to the artifact inside other docs are not detected.

## Misc
- The "Ask Minotaurus" dashboard button is a static label — no AI integration.
- The CmdK palette only indexes static pages + projects fetched lazily on open. It does not index artifacts/specs/diagrams.
