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
PostgreSQL (Prisma ORM). Schema in `backend/prisma/schema.prisma`.
Connection via `DATABASE_URL` in `backend/.env`.
Initial migration in `backend/prisma/migrations/20260527120000_init/migration.sql`.

To bootstrap a fresh local environment:
```
cd backend
npm install
createdb minotaurus       # (or `CREATE DATABASE minotaurus` via psql)
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
e896ca3

## Current Goal
Phase 6 shipped: PostgreSQL migration. Every controller and engine now reads/writes
through Prisma; the JSON file persistence is gone. API surface and frontend
contracts are unchanged. Recommended next phase: AI architecture analysis.

## Important Constraints
- Do not migrate PostgreSQL yet
- Do not break existing API contracts
- Do not redesign frontend shell
- Keep JSON persistence