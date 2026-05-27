# Next Steps

Phase 6 (PostgreSQL migration) is shipped. All controllers and engines run on
Prisma/Postgres; the JSON file is gone. The frontend is unchanged.

## To bring a fresh checkout online
```
cd backend
npm install
# create the database (one-time):
psql -U postgres -c "CREATE DATABASE minotaurus;"
# apply the initial migration:
npx prisma migrate deploy
# seed the demo project:
npm run seed
# start:
npm run dev
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