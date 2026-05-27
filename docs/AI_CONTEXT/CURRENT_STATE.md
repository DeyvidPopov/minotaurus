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
- Artifacts
- Relations
- Documentation
- API Specs
- Database Models (with visual Mermaid ERD)
- Diagrams (Mermaid editor + live preview, polished, readable labels in dark theme)
- Validation (artifact relation, doc, security, API, DB, diagram, churn, deprecated-still-used rules)
- Version History (every CUD records a VersionEvent; timeline + filters)
- Impact Analysis (per-artifact blast radius: deps, dependents, APIs, DBs, diagrams, docs, recent events)
- Export (artifacts, relations, API specs, DB models, diagrams, validation report, graph, version history, impact analysis)
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