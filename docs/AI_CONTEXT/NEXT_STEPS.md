# Next Steps

> Refreshed for the pre-submission documentation pass (2026-06-01). The platform is
> feature-complete for the diploma scope. **Both AI features are shipped** — AI is no
> longer "future work." The remaining work is hardening, testing, and documentation,
> not new feature development.

## Where the project stands
All planned phases are shipped and live against PostgreSQL:
- Core platform (projects, artifacts, relations, documentation, diagrams, team/roles, version history).
- Architecture intelligence (knowledge graph, deterministic validation, deterministic
  analysis engine, traceability, depth-1 impact analysis).
- Ingestion Hub with four deterministic parsers (Markdown / OpenAPI JSON / Mermaid / SQL Schema).
- Export Engine V2 (JSON / Markdown / **real deterministic PDF report**) with an on-demand
  server-side download endpoint.
- **AI Bootstrap Wizard** and **AI Architecture Review** — both fenced outside the
  deterministic core (propose/explain only; human-gated, re-validated apply).

## Recommended final-timeline priorities (in order)

1. **Manual testing.** Walk the demo end-to-end against a freshly seeded DB. Cover the
   export PDF (full + diagrams-only + single-section), validation, ingestion (all four
   parsers), the knowledge graph, and both AI flows. The export/PDF, validation engine,
   ingestion parsers, AI orchestration, and the entire frontend have **no automated tests**,
   so manual verification is the safety net. (See the checklist below.)

2. **Bug fixing.** Fix whatever manual testing surfaces. Prioritise the audit's real
   blockers first (see "Pre-submission hardening" below) — they are small, targeted fixes,
   not rewrites.

3. **UI polish.** Tighten loading/error/empty states (some pages collapse a load error
   into the empty state; one artifact-detail page can show "Loading…" indefinitely on
   failure), modal focus handling, and visual consistency. Keep changes contained — do not
   redesign the shell or touch the graph-canvas / PDF-SVG normalization logic.

4. **Documentation writing.** Diploma write-up. The strongest arguments to foreground:
   the deterministic-first architecture, the AI-as-fenced-additive-layer safety model
   (verified by code inspection), the three-layer export engine with byte-deterministic
   PDFs, and the SSOT knowledge graph. See `CURRENT_STATE.md` and `CLAUDE.md`.

5. **Defense preparation.** Rehearse the demo flow; be ready to explain the determinism
   boundary, the validation rule set, the export determinism strategy, and the RBAC model.

## Pre-submission hardening (small, high-value fixes — do during step 2)
These came out of the pre-submission audit and are blockers for a credible submission:
- **JWT secret fallback** — `middleware/auth.ts` falls back to a hardcoded
  `"dev-secret-change-me"` if `JWT_SECRET` is unset. Remove the fallback / fail fast at
  startup, and set a real secret in `.env`.
- **Rotate the Anthropic API key** sitting in `backend/.env` (it is git-ignored and not
  committed, but it is a live key on disk).
- **Async error wrapper** — Express 4 does not route rejected async-handler promises to the
  error middleware, so an unexpected throw can hang a request. Add `express-async-errors`
  (or wrap handlers).
- **Guard the destructive scripts** — `npm run seed` and `prisma:reset --force` wipe the
  database with no `NODE_ENV` check or confirmation. Add a guard before any shared/prod use.
- **Cap the version-history query** — `listVersionHistory` loads all events then slices in
  memory; add a `take` cap (this is the highest-volume unbounded list).

## Deliberately deferred (post-diploma — do NOT start now)
- Pagination across the remaining list endpoints; N+1 serializer cleanup.
- Validation-engine O(n²) optimisation for large projects.
- Controller / validation-engine / parser unit tests + a frontend test runner.
- ZIP export — **future enhancement only** (removed from the contract surface in migration
  `20260602120000_remove_zip_export_format` since it was never implemented). If revived, ship
  a real multi-file archive (JSON + Markdown + PDF + diagram SVGs) with deterministic entry
  timestamps/order, mirroring the PDF determinism pinning.
- AI generation of DB models / API specs / security policies (Bootstrap is artifacts +
  relations + diagrams only).
- Transitive impact analysis + blast-radius scoring.
- **Dedupe the AI Review score cards onto the shared `HealthScoreCards`** — the Decision
  page uses the shared `lib/health-score.ts` + `components/analysis/health-score-cards.tsx`;
  the AI Review page still has its own copies and can drift. Tracked in
  `docs/REVIEW_SCORECARD_DEDUP_TASK.md`.
- WebSocket live updates; email invitations for non-existent users; per-resource ownership transfer.
- Retention/archival for `VersionEvent` / `AiSession` / `ExportPackage` growth.

## To bring a fresh checkout online
```
cd backend
npm install
psql -U postgres -h localhost -p 5433 -c "CREATE DATABASE minotaurus;"
npx prisma migrate deploy
npm run seed
npm run dev    # backend on :4000

# In another terminal:
cd ../frontend/nextjs && npm install && npm run dev   # frontend on :3000
```

## Final-testing checklist
Automated (expect green):
- `cd backend && npm run test:unit` → 112 passing (pure engines: export analysis, PDF, AI proposal/review).
- `cd backend && npx tsc -p tsconfig.json --noEmit` → clean.
- `cd frontend/nextjs && npm run typecheck` → clean; `npm run lint` → review warnings.
- With backend + seeded DB: `cd backend && npm run test:api` → 11/11 (then re-`npm run seed`
  to clear the orphan users/projects it leaves behind).

Manual (no automated coverage — verify by hand):
- PDF export: full scope, diagrams-only, and a single-section scope; confirm diagrams render
  with readable colors and the TOC matches rendered sections.
- Re-download the same PDF twice → identical bytes.
- JSON + Markdown download → correct Content-Type / filename.
- Role gating: VIEWER/DEVELOPER cannot create an export (403, ARCHITECT+); non-member cannot
  download; bad export id → 404.
- Validation run on the demo project; eyeball the rule output.
- Ingestion: Markdown / OpenAPI / Mermaid / SQL draft → parse → confirm.
- Knowledge graph: drag / persist / relayout / focus; Mermaid viewer pan/zoom.
- AI Bootstrap (on an empty project) and AI Review end-to-end in the UI.

## Constraints (unchanged)
- Do not redesign the UI shell.
- Keep the API envelope contract identical.
- Do not break the graph contract.
- Keep AI outside the deterministic core (the five safety rules in `CLAUDE.md`).
