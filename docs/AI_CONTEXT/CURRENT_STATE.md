# Current Platform State

> Living snapshot of what is actually shipped. Last refreshed 2026-06-03 (multi-step
> registration wizard, backend + frontend). For the authoritative architecture contract
> see the root `CLAUDE.md`; for honest trade-offs see `KNOWN_LIMITATIONS.md`.

## Stack

Frontend (`frontend/nextjs/`):
- Next.js 14 (App Router), React 18, TypeScript
- Tailwind, React Flow, Mermaid, Zustand

Backend (`backend/`):
- Express + TypeScript (ESM / NodeNext, run via `tsx`)
- Prisma ORM + PostgreSQL (Phase 6 — live)
- Anthropic SDK for the two AI features (opt-in via `ANTHROPIC_API_KEY`)

## Working Features

### Core platform
- **Auth** — JWT bearer, bcrypt password hashing, single `toPublicUser` serializer.
- **Multi-step verified registration (backend + frontend)** — `/auth/register/{start,verify,complete,resend}`
  (emailed 6-digit code → short-lived registration token → password → User + JWT). Backend:
  `modules/auth/registration/` (pure engine + injectable-deps service) + `modules/email/`
  (`DevEmailService` default, `SmtpEmailService` placeholder) + in-memory rate limiting
  (`middleware/rate-limit.ts`, `TRUST_PROXY` opt-in). Frontend: the 4-step wizard at
  `app/(auth)/register/page.tsx` (stepper, OTP input with paste/backspace/arrow nav,
  resend cooldown, inline error mapping, reduced-motion + a11y; token persisted exactly
  like login → `/dashboard`). Legacy single-step `POST /auth/register` kept + deprecated;
  login is not yet gated on `emailVerifiedAt`. See `KNOWN_LIMITATIONS.md → Auth`.
- **Projects** — CRUD; creator auto-inserted as OWNER membership.
- **Project Team Management + Roles (Phase 7)** — `ProjectMember` with OWNER /
  ARCHITECT / DEVELOPER / VIEWER. Access is membership-based across every controller
  via `lib/project-access.ts`. Last-OWNER protection.
- **Artifacts** — CRUD; **title unique per project**, case- and whitespace-insensitive
  (`normalizedTitle` column + unique index `(projectId, normalizedTitle)`).
- **Relations** — `ArtifactRelation`, the single source of truth for the graph.
- **Documentation** — per-artifact Markdown editor + project-wide **Documentation Hub**
  (coverage stats, search, filter, `?tab=documentation` deep-links).
- **API Specs** — specs + endpoints CRUD.
- **Database Models** — models / entities / fields with auto-generated Mermaid ERD.
- **Diagrams** — visual Mermaid gallery + read-first detail page + purpose-picker create flow.
- **Ingestion Hub** — four deterministic parsers (Markdown / OpenAPI JSON / Mermaid /
  SQL Schema), draft → parse → confirm. No AI. `IngestionRecord` is an audit log only.

### Architecture intelligence
- **Knowledge Graph** — React Flow canvas; artifact-only nodes, `ArtifactRelation` edges.
- **Validation engine** — rule-based, deterministic (17 rules: relation hygiene, missing
  docs, security, API/DB completeness, diagram links, churn, deprecated-but-used,
  single-member). Wipe-and-recompute per run; writes a `VALIDATED` VersionEvent.
- **Deterministic Analysis Engine** — `modules/exports/analysis/`, pure (no I/O, no
  `Date.now()`, no AI). Computes health score, documentation coverage, connectivity,
  traceability, governance, validation roll-up, and rule-keyed risks.
- **Traceability** — requirement coverage (IMPLEMENTS) + resource linkage, computed in
  the analysis engine.
- **Impact Analysis** — per-artifact blast radius (depth-1: deps, dependents, linked
  APIs/DBs/diagrams, docs, recent events). No transitive traversal, no scoring (by design).
- **Version History** — every CUD records a `VersionEvent`; timeline + filters + dashboard
  "Recent changes" widget.

### Export (Export Engine V2 — shipped)
- Three strictly separated layers: `buildExportContent` (SSOT assembly) →
  `analyzeExportSnapshot` (pure analysis) → `renderArchitecturePdf` (pure presentation).
- **JSON export** — full SSOT payload.
- **Markdown export** — human-readable document with documentation + Mermaid blocks.
- **PDF Architecture Report** — `pdfmake` (standard-14 fonts, **no headless browser**),
  deterministic (CreationDate/ModDate/`_id` pinned from snapshot identity), section-gated
  via `buildReportPlan`, with frozen client-captured diagram SVGs.
- **On-demand download** — `GET /exports/:exportId/download` renders the PDF from the
  persisted snapshot and streams it; JSON/MARKDOWN stream the stored content.
- **ZIP** — **removed** from `EXPORT_FORMATS` and the Prisma `ExportFormat` enum
  (migration `20260602120000_remove_zip_export_format`). It was never implemented (the
  download path fell through to JSON). A bundled multi-file ZIP archive is a possible
  future enhancement, not current functionality.

### AI (additive, proposal/explanation only — never writes SSOT directly)
- **AI Bootstrap Wizard** (`modules/ai/`) — from an empty project, the user describes an
  idea → Claude proposes artifacts (created `DRAFT`) + relations + 1–3 Mermaid diagrams →
  the user reviews/selects → confirmed items are applied through a deterministic,
  server-re-validated apply step. AI never calls `prisma.create/update/delete` except on
  the human-gated apply path.
- **AI Architecture Review** (`modules/ai/review/`) — the first **read-only** AI feature:
  reads the SSOT + deterministic `AnalysisResult`, emits an evidence-verified narrative,
  persisted as an `AiSession(REVIEW)` audit row. AI explains scores; it never computes them.
- **AiSession audit trail** — lightweight audit metadata (idea, model, tokens, status,
  proposal snapshot, `analysisHash`). Never a graph node, never scored.
- **Mermaid normalization** — AI Mermaid is structure-only; styling stripped at propose +
  apply + validate.
- **Truncation handling** — `stop_reason:"max_tokens"` → honest `422 AI_OUTPUT_TRUNCATED`
  (bootstrap) / prefix salvage with `truncated:true` (review); repair retry is skipped.

### Settings
- Theme / accent / font / graph node style (Zustand "tweaks" store, localStorage).

## Persistence

PostgreSQL (Prisma ORM) — **live and verified**.

- Runtime: PostgreSQL on `localhost:5433` (the local install uses 5433, not 5432).
- Connection: `DATABASE_URL` in `backend/.env`.
- **16 models** + `_prisma_migrations`; **18 enums**; FK indexes throughout; **9 migrations**
  (linear, drift-free) under `backend/prisma/migrations/`.
- **Database-level unique constraints back the SSOT:** artifact titles
  `(projectId, normalizedTitle)`, project membership `(projectId, userId)`, and the
  knowledge-graph edge `(sourceArtifactId, targetArtifactId, relationType)` (migration
  `20260601120000_unique_artifact_relation_edge`). The relation controller maps the unique
  violation to a clean `409 RELATION_EXISTS` (race-safe vs. the application pre-check).
- Healthcheck: `GET /api/health/db` → `{ database: "connected", provider: "postgresql", port }`.

To bootstrap a fresh local environment:
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
Demo login: `deyvid@minotaurus.dev` / `minotaurus`.

## Sources of truth
- **Graph:** `ArtifactRelation` (artifact nodes only).
- **Export:** `ExportPackage` snapshot (`content` Json, frozen at create time).
- **Validation:** `validation.engine.ts` (rule-based, deterministic).
- **Analysis / scores:** `modules/exports/analysis/` (pure, deterministic).

## Current modules (`backend/src/modules/`)
auth · projects · artifacts (+ documentation, artifact-title) · relations · graph ·
api-specs · database-models · diagrams · validation · versions (history + impact) ·
members · ingestion (4 parser engines) · exports (engine + analysis/ + pdf/) ·
ai (providers/, proposal/ bootstrap, review/)

## AI safety posture (deterministic-first)
Minotaurus is deterministic-first. AI is an additive proposal/explanation layer **outside**
the deterministic core. The five mandatory rules (see `CLAUDE.md` → *AI Safety & Determinism
Rules*) are all enforced in code and were re-verified in the pre-submission audit:
1. AI never writes the DB directly (only the human-gated apply path writes, after re-validation).
2. AI output is not SSOT until a user confirms it.
3. `AnalysisResult` stays deterministic — `AnalysisResult → AI` is allowed; `AI → AnalysisResult` is forbidden.
4. Validation stays deterministic — AI may explain findings, never create/resolve them.
5. Every AI-proposed entity passes the same deterministic validation as hand-authored entities before apply.

## Current goal
Pre-submission hardening: manual testing, bug fixing, UI polish, diploma documentation,
and defense preparation. No large new features. See `NEXT_STEPS.md`.

## Important constraints
- Do not break the API envelope contract (`{ success, data | error }`).
- Do not redesign the frontend shell.
- PostgreSQL is the source of truth (the old `data.json` JSON store is gone).
- Keep the graph contract intact (`ArtifactRelation` only; artifact nodes only).
- Keep AI outside the deterministic core (the five safety rules).
