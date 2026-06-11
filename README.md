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

**Prerequisites:** Node.js **18.17+** (developed on Node 20 / 24 LTS) and a reachable
**PostgreSQL** instance. The backend reads `DATABASE_URL` from `backend/.env` (the local
install here runs on **port 5433**).

First copy the env templates and fill them in (the real files are gitignored):

```bash
cp backend/.env.example         backend/.env                # set DATABASE_URL + a real JWT_SECRET
cp frontend/nextjs/.env.example frontend/nextjs/.env.local  # NEXT_PUBLIC_API_BASE_URL for local dev
```

Then:

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

## Production build & deploy

The app is **built locally** and only the compiled output is shipped to the server (a small
1 GB Linode behind Cloudflare). The box never builds — it just runs the Next standalone
server and the backend. Topology is **same-origin**: the frontend is served at
`https://minotaurus.dev` and the Express API is reverse-proxied at `https://minotaurus.dev/api`.

### ⚠ `NEXT_PUBLIC_*` is inlined at build time — build with production values

Next.js bakes every `NEXT_PUBLIC_*` variable into the client bundle when `next build` runs.
Because you build locally, the build **must** see the production value or the bundle will
permanently point at `localhost`.

Beware the env precedence: during a production build Next loads, highest priority first,
**shell env vars → `.env.production.local` → `.env.local` → `.env.production` → `.env`**.
A local `frontend/nextjs/.env.local` (used for dev, pointing at `localhost:4000`) is loaded
even in production and **overrides the committed `.env.production`**. So the safest, override-proof
production build sets the variable in the shell (it wins over every `.env*` file):

```bash
cd frontend/nextjs
npm ci                                   # clean install from the lockfile

# PowerShell:
$env:NEXT_PUBLIC_API_BASE_URL = "https://minotaurus.dev/api"; npm run build
# bash:
NEXT_PUBLIC_API_BASE_URL=https://minotaurus.dev/api npm run build
```

`frontend/nextjs/.env.production` (committed, non-secret) already carries the production URL,
so a build on a clean machine *without* a `.env.local` would pick it up automatically — but
setting it explicitly is the reliable path. **Verify after building** that no dev host leaked
into the bundle:

```bash
grep -r "localhost:4000" .next/standalone .next/static && echo "LEAK — rebuild" || echo "clean"
```

> Run the build from a **clean state** — no `next dev` server may be running, because
> `next build` and `next dev` share `.next/` and will corrupt each other. Stop the dev
> server first.

### Standalone output

`next.config.mjs` sets `output: 'standalone'`, so the build emits a self-contained runtime at
**`frontend/nextjs/.next/standalone/`** (`server.js` + only the traced `node_modules`). Next
does **not** copy static assets into it, so before shipping:

```bash
cp -r .next/static .next/standalone/.next/static
# cp -r public .next/standalone/public      # only if you later add a public/ dir
```

Ship the `.next/standalone/` directory to the server and run it directly (no `next` CLI, no
full `node_modules` needed):

```bash
PORT=3000 node server.js     # from inside the deployed standalone dir
```

> If the build prints a "Next.js inferred your workspace root" warning (it can, because the
> sibling `backend/` tree also has a lockfile), `server.js` may instead be nested at
> `.next/standalone/frontend/nextjs/server.js` — the build log tells you which. Pin it with
> `outputFileTracingRoot` in `next.config.mjs` if you want it deterministic.

### Backend on the server

The backend can run from TypeScript via `tsx` (`npm start`) or compiled (`npm run build` →
`dist/`, then `node dist/server.js`). On the box: copy `backend/.env.production.example` →
`.env`, fill the secrets, `npx prisma migrate deploy`, then start. With `NODE_ENV=production`
the backend **refuses to start** without an explicit `CORS_ORIGIN` and a real (non-placeholder)
`JWT_SECRET`, and `TRUST_PROXY=true` is required so rate limiting sees the real client IP
behind Cloudflare.

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
