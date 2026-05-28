# Next Steps

Ingestion Phase 1 (Ingestion Hub foundation) is shipped: new `IngestionRecord` table,
draft CRUD API at `/api/projects/:id/ingestion` + `/api/ingestion/:id`, sidebar
entry, Ingestion Hub page with four source type cards (Markdown / OpenAPI / Mermaid
/ SQL Schema), draft form, history table, detail modal, and version-history
integration. **No parsing yet** — that's deliberately the next phase. 11/11 backend
smoke tests still pass.

**Recommended next phase: Markdown ingestion parser** — accept the actual file body
on a `POST /api/ingestion/:id/parse` endpoint, parse headings into a
`DOCUMENTATION` artifact tree, populate `createdRecords` with the artifact IDs,
flip status `DRAFT → PARSED`, and let the user CONFIRM to commit the artifacts.
After that: OpenAPI JSON parser, Mermaid parser, SQL Schema parser.

Phase A (Dedicated Documentation Hub) is shipped: new
`GET /api/projects/:projectId/documentation` overview endpoint, real
`/projects/[projectId]/docs` page with coverage stats / search / filter / per-artifact
"Open documentation" deep-links to the artifact detail, sidebar entry restored,
artifact detail now honours `?tab=documentation`. Documentation storage is still
`Artifact.documentationContent` — no schema change. 11/11 backend smoke tests pass.

Phase 7 (Project Team Management + Roles) is shipped and verified end-to-end against
the live Postgres database. ProjectMember table + four roles (OWNER/ARCHITECT/
DEVELOPER/VIEWER) replace the per-controller `ownerId === userId` checks. Members API,
team page, validation rule, export Team section and seeded multi-user demo are all
live. 11/11 backend smoke tests still pass.

Phase 6 (PostgreSQL migration) is shipped and **live-verified**. Local Postgres on
:5433, healthcheck `GET /api/health/db` reports connected, seed populates the demo,
all 11 backend smoke tests + the per-page E2E check pass through Postgres. The
frontend is unchanged.

## To bring a fresh checkout online
```
cd backend
npm install
# Create the database (one-time):
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE minotaurus;"
# Apply the initial migration:
npx prisma migrate deploy
# Seed the demo:
npm run seed
# Run:
npm run dev    # backend on :4000

# In another terminal:
cd ../frontend/nextjs && npm run dev   # frontend on :3000
```

## Sanity check
```
curl http://localhost:4000/api/health/db
# → { "success": true, "data": { "database": "connected", "provider": "postgresql", "port": 5433 } }
```

## Recommended next phase

**AI architecture analysis** is the natural follow-up:
- The platform now has all the inputs an LLM needs to reason about a system,
  and a real query-able relational store to feed them in.
- One backend endpoint (`POST /api/projects/:id/ai/analyze`) wrapping a model
  call would unlock:
  - "Summarize the architecture of this project"
  - "What changed in the last week?"
  - "What would break if I deprecate Authentication Service?"
- Add a Settings tab "Anthropic API key" so the feature stays opt-in.

## After AI analysis
1. WebSocket live updates (re-render the timeline / dashboard counters on event)
2. Email invitations for non-existent users (today the user must already have an account
   for an invite to succeed)
3. PDF / ZIP export rendering on the server
4. Per-resource ownership transfer (createdById is recorded but there's no UI)

## Constraints (unchanged)
- Do not redesign UI shell
- Keep the API envelope contract identical
- Do not break graph contract