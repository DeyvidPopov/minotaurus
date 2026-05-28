# Session Handoff

## Last Completed Feature

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

58c17cb — *Add dedicated documentation hub*

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

**Documentation ingestion** — upload existing Markdown / OpenAPI / README files and
turn them into documented artifacts. The Documentation Hub (Phase A) is the natural
landing page for that flow. See NEXT_STEPS.md.

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
