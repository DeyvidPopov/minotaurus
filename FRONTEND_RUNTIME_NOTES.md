# Runtime notes — running the Minotaurus MVP locally

These are the short-form instructions for running the demo end-to-end on a developer machine. For the longer per-endpoint reference see [backend/API_TEST_EXAMPLES.md](backend/API_TEST_EXAMPLES.md).

## Prerequisites
- Node.js 20+ (24 also works)
- npm 10+
- Bash (Git Bash on Windows is fine — used by the API smoke script)

## First-time setup
```bash
# 1. Install backend deps
cd backend
npm install

# 2. Seed the demo project (creates the user, the Online Shop Platform project,
#    artifacts, relations, documentation, validation issues, and two exports)
npm run seed

# 3. Install frontend deps
cd ../frontend/nextjs
npm install
```

## Run the stack

```bash
# terminal 1 — backend on :4000
cd backend
npm run dev      # tsx watch; reloads on file changes
# or
npm start        # tsx; no watcher

# terminal 2 — frontend on :3000
cd frontend/nextjs
npm run dev
```

The backend respects `PORT` (default 4000). The frontend reads `NEXT_PUBLIC_API_BASE_URL` from `frontend/nextjs/.env.local` (already pointed at `http://localhost:4000/api`).

> **Seed gotcha:** running `npm run seed` while the backend is up overwrites `src/db/data.json` but the running backend keeps its in-memory cache. After seeding, restart the backend so the new data is picked up. The dashboard's demo callout will warn you when the "Online Shop Platform" project is missing.

## Demo login
```
Email:    deyvid@minotaurus.dev
Password: minotaurus
```

The seed always provisions this user as ADMIN.

## Five-minute demo flow (thesis walkthrough)
1. **Sign in** at <http://localhost:3000/login>. You'll land on the dashboard with a "Demo project · Loaded" callout.
2. **Open the demo project** → click *Open Demo Project*. The overview shows the live mini-graph, the validation snapshot (one open ERROR), and quick links.
3. **Open the Knowledge Graph** → sidebar → *Knowledge Graph*. Ten nodes (services, databases, an API endpoint, a security policy, a documentation artifact) wired into a recognizable e-commerce topology. The deprecated **Legacy Payment Service** is visible at the bottom-left.
4. **Run Validation** → click *Validate* in the graph header (or the *Validation* sidebar entry). The seeded rules produce **one ERROR**: *Active artifact "Order Service" depends on deprecated artifact "Legacy Payment Service"*. This is intentional — it's the demo's headline finding.
5. **Open Documentation** → from the Artifacts list (or the graph drawer's "Open artifact" button) open *API Gateway*, *Authentication Service*, *Order Service*, or *System Architecture Documentation*. Each has a *Documentation* tab pre-populated with Purpose / Responsibilities / Dependencies / API notes / Security / Future improvements.
6. **Open Export** → sidebar → *Export SSOT*. Two exports are pre-created by the seed:
   - **JSON** with sections `ARTIFACTS, RELATIONS, GRAPH, VALIDATION_REPORT` — clicking *View* renders the rich preview with summary counts, an artifact card grid (with inline collapsible documentation), the relations table, and the validation issues table.
   - **MARKDOWN** with sections `ARTIFACTS, RELATIONS, VALIDATION_REPORT` — rendered through `react-markdown` for a publication-ready view.
   You can also *Create export* from this page to mint a fresh one and see the auto-open behaviour.

## Resetting the demo

```bash
cd backend
npm run seed
# then restart the backend so it picks up the fresh data
```

## API smoke test (independent of the frontend)

```bash
cd backend
npm run test:api    # creates a fresh user, exercises every endpoint
```

## Where things live
- **Backend** — `backend/src/`: Express + TypeScript + JSON-file persistence. Validation rules in `modules/validation/validation.engine.ts`; export builder in `modules/exports/exports.engine.ts`; both are pure functions reused by the seed.
- **Frontend** — `frontend/nextjs/`: Next.js 14 App Router. API client in `lib/api/`; auth context in `lib/auth-context.tsx`; pages under `app/(app)/`.
- **Spec docs** — `docs/01..11_*.md`: original product spec — useful background, not the contract.
