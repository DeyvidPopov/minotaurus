# Minotaurus

A **deterministic-first architecture-modeling platform**. Teams model a software system as
typed **artifacts** connected by **relations**, document and diagram it, and get a
deterministic **knowledge graph**, rule-based **validation**, a pure **analysis engine**
(health score, coverage, traceability, risks), and a layered **export engine** that produces
a byte-deterministic **PDF Architecture Report**. Two **opt-in AI features** sit *outside* the
deterministic core: a Bootstrap Wizard that proposes a draft architecture for human review,
and a read-only Architecture Review that explains the deterministic analysis.

> Diploma / MVP build. It is feature-complete for its scope but **not production-hardened** —
> see [`docs/AI_CONTEXT/KNOWN_LIMITATIONS.md`](docs/AI_CONTEXT/KNOWN_LIMITATIONS.md).

## Architecture thesis

Minotaurus is deterministic-first. The graph, validation, analysis, and export are pure and
reproducible. **AI is an additive proposal/explanation layer that never writes to the
database directly and never computes a score** — its only route to persisted state is the
same human-gated path ingestion uses: `propose → review → confirm → deterministic apply`.
The five mandatory AI Safety & Determinism Rules are spelled out in
[`CLAUDE.md`](CLAUDE.md) and were verified by code inspection.

## Stack

- **Backend** (`backend/`) — Express + TypeScript (ESM/NodeNext, run via `tsx`),
  Prisma ORM + PostgreSQL, Anthropic SDK (for the opt-in AI features).
- **Frontend** (`frontend/nextjs/`) — Next.js 14 (App Router), React 18, Tailwind,
  React Flow, Mermaid, Zustand.
- `frontend/src/` + `*.jsx` are a **legacy** Vite prototype kept only as a design reference.

## Features

- **Core:** projects, artifacts (titles unique per project), relations, per-artifact
  documentation + Documentation Hub, API specs, database models (with auto Mermaid ERD),
  Mermaid diagrams, team management with OWNER/ARCHITECT/DEVELOPER/VIEWER roles, version
  history.
- **Architecture intelligence:** knowledge graph (artifact nodes, `ArtifactRelation` edges),
  deterministic validation engine, deterministic analysis engine, traceability, depth-1
  impact analysis.
- **Ingestion:** four deterministic parsers — Markdown / OpenAPI JSON / Mermaid / SQL Schema
  (draft → parse → confirm; no AI).
- **Export:** JSON, Markdown, and a real deterministic **PDF report** (`pdfmake`, no headless
  browser) with on-demand server-side download. *(A bundled ZIP archive is a possible future
  enhancement — deliberately kept out of the format list until implemented.)*
- **AI (opt-in, advisory):** Bootstrap Wizard + read-only Architecture Review, both fenced
  outside the deterministic core, with an `AiSession` audit trail.

## Quick start

PostgreSQL must be reachable at `DATABASE_URL` in `backend/.env` (the local install runs on
**port 5433**).

```bash
# Backend
cd backend
npm install
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE minotaurus;"
npx prisma migrate deploy
npm run seed        # wipes + reseeds the demo dataset
npm run dev         # backend on :4000

# Frontend (separate terminal)
cd frontend/nextjs
npm install
npm run dev         # frontend on :3000
```

Demo login: **`deyvid@minotaurus.dev` / `minotaurus`**.

### Environment (`backend/.env`)
`DATABASE_URL` (required), `JWT_SECRET` (set a real value — there must be no fallback in
production), `CORS_ORIGIN`, and — only if you want the AI features — `ANTHROPIC_API_KEY`
(plus optional `AI_MODEL`, `AI_MAX_TOKENS`, `AI_REVIEW_MAX_TOKENS`). Without the key the AI
endpoints return `503 AI_NOT_CONFIGURED`; everything else works.

> ⚠ `npm run seed` and `npm run prisma:reset` wipe the database with no confirmation. Only
> point them at a disposable local database.

## Tests

```bash
cd backend && npm run test:unit     # 112 unit tests over the pure engines (node:test)
cd backend && npx tsc --noEmit      # backend typecheck
cd frontend/nextjs && npm run typecheck && npm run lint
cd backend && npm run test:api      # HTTP smoke pass (needs the backend running)
```
Automated coverage is currently **pure engines only** — controllers, the validation engine,
the ingestion parsers, AI orchestration, and the entire frontend have no automated tests and
are verified manually (see the checklist in
[`docs/AI_CONTEXT/NEXT_STEPS.md`](docs/AI_CONTEXT/NEXT_STEPS.md)).

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — the authoritative architecture contract and conventions.
- [`docs/AI_CONTEXT/`](docs/AI_CONTEXT/) — living state docs: `CURRENT_STATE.md`,
  `FEATURE_PROGRESS.md`, `KNOWN_LIMITATIONS.md`, `NEXT_STEPS.md`, `SESSION_HANDOFF.md`,
  `ARCHITECTURE_RULES.md`.
- [`docs/01..11_*.md`](docs/) — the original product specification (background, not the
  current contract).
- [`FRONTEND_RUNTIME_NOTES.md`](FRONTEND_RUNTIME_NOTES.md) — local-runtime walkthrough.
