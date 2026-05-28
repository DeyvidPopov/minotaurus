# Current Platform State

## Stack
Frontend:
- Next.js
- React
- TypeScript
- Tailwind

Backend:
- Express
- TypeScript
- Prisma + PostgreSQL (Phase 6)

## Working Features
- Auth
- Projects
- **Project Team Management + Roles (Phase 7)** — ProjectMember table with OWNER /
  ARCHITECT / DEVELOPER / VIEWER roles. Project access is now membership-based across
  every controller. OWNER manages members, ARCHITECT runs validation + exports,
  DEVELOPER edits artifacts/APIs/DB/diagrams/docs, VIEWER is read-only.
- Artifacts (**title unique per project, case- and whitespace-insensitive** —
  enforced by the `normalizedTitle` column + unique index on `(projectId, normalizedTitle)`)
- Relations
- Documentation (per-artifact Markdown editor) + **Documentation Hub** with
  project-wide coverage stats, search, filter, and direct deep-links to the
  artifact detail's Documentation tab via `?tab=documentation`.
- **Ingestion Hub with four live parsers** —
  - Foundation (Ingestion Phase 1): `IngestionRecord` table, draft CRUD API,
    sidebar entry, source type cards, history.
  - **Markdown parser (Phase 2)**: paste / upload `.md` → DOCUMENTATION
    artifact (LINK_EXISTING / CREATE_NEW).
  - **OpenAPI JSON parser (Phase 3)**: paste / upload `.json` → ApiSpec +
    ApiEndpoints (CREATE_API_SPEC), editable base URL.
  - **Mermaid parser (Phase 4)**: paste / upload `.mmd` or `.md` with a
    `\`\`\`mermaid` fence → Diagram (CREATE_DIAGRAM), live MermaidPreview in
    the wizard, optional artifact link.
  - **SQL Schema parser (Phase 5)**: paste / upload `.sql` (subset of
    CREATE TABLE DDL) → DatabaseModel + DatabaseEntity + DatabaseField with
    resolved FKs (CREATE_DATABASE_MODEL), generated Mermaid ERD preview.
- API Specs
- Database Models (with visual Mermaid ERD)
- Diagrams (Mermaid editor + live preview, polished, readable labels in dark
  theme — global renderer now guarantees label visibility via a post-render
  style sweep + scoped CSS fallback + `htmlLabels: false` Mermaid config; all
  6 MermaidPreview callers benefit)
- Validation (artifact relation, doc, security, API, DB, diagram, churn, deprecated-still-used, single-member rules)
- Version History (every CUD records a VersionEvent — including member add/role-change/remove; timeline + filters)
- Impact Analysis (per-artifact blast radius: deps, dependents, APIs, DBs, diagrams, docs, recent events)
- Export (TEAM, artifacts, relations, API specs, DB models, diagrams, validation report, graph, version history, impact analysis)
- Graph
- Settings

## Current Persistence
PostgreSQL (Prisma ORM) — **live and verified**.

- Runtime: PostgreSQL 18 on `localhost:5433` (the local install uses 5433, not the
  spec's default 5432).
- Connection: `DATABASE_URL=postgresql://postgres:postgres123!@localhost:5433/minotaurus`
  in `backend/.env`.
- Initial migration applied: `backend/prisma/migrations/20260527120000_init/migration.sql`.
- 13 tables + `_prisma_migrations`; 13 enums; all FK indexes created.
- Healthcheck: `GET /api/health/db` returns `{ database: "connected", provider: "postgresql", port }`.

To bootstrap a fresh local environment:
```
cd backend
npm install
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE minotaurus;"
npx prisma migrate deploy
npm run seed
npm run dev
```

## Graph Source of Truth
ArtifactRelation

## Export Source of Truth
ExportPackage

## Validation Engine
validation.engine.ts

## Current Modules
- documentation
- api-specs
- database-models
- diagrams
- exports
- validation
- versions (version history + impact analysis)

## Current Commit
cf2611f

## Current Goal
Phase 6 finalized; the platform runs on Prisma + PostgreSQL end-to-end. The project
workspace overview's "Recent changes" widget is wired to live VersionEvent data
(newest-first, refreshes on validate). Recommended next phase: AI architecture
analysis.

## Important Constraints
- Do not break existing API contracts
- Do not redesign frontend shell
- Postgres is the source of truth (was JSON before Phase 6)