# Next Steps

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
2. Project members + RBAC (Prisma schema can be extended cleanly)
3. PDF / ZIP export rendering on the server

## Constraints (unchanged)
- Do not redesign UI shell
- Keep the API envelope contract identical
- Do not break graph contract