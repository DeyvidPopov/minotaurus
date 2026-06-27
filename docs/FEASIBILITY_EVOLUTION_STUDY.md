# Feasibility Study — Three Evolution Directions

**Date:** 2026-06-27
**Scope:** Research + feasibility only. No application code was written or modified.
**Method:** Direct inspection of the backend engines, frontend surfaces, Prisma schema, and the ingestion/export pipelines. Every claim below cites a real file.

## The three invariants every proposal is measured against

1. **AI never writes authoritative state directly** — only `propose → review → confirm → deterministic apply`.
2. **The analysis + export engines stay pure/deterministic** — no I/O, no `Date.now()` beyond `snapshot.generatedAt`, no AI. Same snapshot ⇒ byte-identical `AnalysisResult`.
3. **AI may read `AnalysisResult` but may never compute or influence a score.**

Any direction that requires breaking these is called out as "not makeable as-is."

---

## Current State (ground truth)

### Validation engine — what it produces today

[backend/src/modules/validation/validation.engine.ts](backend/src/modules/validation/validation.engine.ts) `runValidationForProject(projectId, triggeredBy?)` returns **`{ issues, newErrorIssues }`** (not a bare array — three callers destructure it). It is **deterministic and AI-free**: it takes one `now = new Date()` at the top, reads SSOT via Prisma, runs pure rules, then in a single `$transaction` **wipes the project's `ValidationIssue` rows and recomputes them**, preserving only `IGNORED` waivers across reruns (fingerprint = `subjectId|category|severity|message`, see [validation.status.ts](backend/src/modules/validation/validation.status.ts)). A `VALIDATED` `VersionEvent` is written; the notification side-effect (`sendValidationAlerts`) lives in the **controller**, never the engine.

A finding is a `ValidationIssue` row: `subjectType` (`ARTIFACT|API_SPEC|DATABASE_MODEL|DIAGRAM|PROJECT`) + `subjectId` (polymorphic) + nullable `artifactId` FK + `severity` + `category` + `message` + `status`. There is **no `code` column** — the rule code is recovered from the message by [finding-classifier.ts](backend/src/modules/findings/finding-classifier.ts) and enriched with actionable `meta` (why/fix/target/actions) by [validation.presenter.ts](backend/src/modules/validation/validation.presenter.ts).

It emits **~28 rule codes** across five pathways: inline rules (docs/security/API/DB/diagram), the shared [findings/finding-rules.ts](backend/src/modules/findings/finding-rules.ts) (`ORPHAN_ARTIFACT`, `DEPENDS_ON_DEPRECATED`, `HIGH_FAN_OUT`, `HIGH_CHURN`, `SINGLE_MEMBER_PROJECT`, …), the 9 FK rules in [findings/database-fk-rule.ts](backend/src/modules/findings/database-fk-rule.ts), and the 4 payload rules from [api-intel/api-validation.ts](backend/src/modules/api-intel/api-validation.ts). Some findings carry SAFE one-click quick-fixes and REVIEW-required relation remediations — but a fix **repairs the underlying resource and re-runs the engine**; it never edits an issue row (Invariant rule 4).

### Analysis engine — what it computes, how the score is built

[backend/src/modules/exports/analysis/metrics.engine.ts](backend/src/modules/exports/analysis/metrics.engine.ts) `analyzeExportSnapshot(content): AnalysisResult` is a **pure function over a snapshot** — no DB, no I/O, the only time reference is `snapshot.generatedAt`. `AnalysisResult` keys: `meta`, `health`, `documentation`, `connectivity`, `traceability`, `governance`, `validation`, `apiIntel`, `risks`.

The health score is a weighted composite of five sub-scores (all weights/thresholds in [analysis.constants.ts](backend/src/modules/exports/analysis/analysis.constants.ts)):

```
HEALTH_WEIGHTS = { documentation: 0.20, connectivity: 0.20, traceability: 0.20, validation: 0.25, governance: 0.15 }
score = round(doc·0.20 + conn·0.20 + trace·0.20 + validate·0.25 + govern·0.15)   // 0–100, or null on an empty project
```

Determinism is pinned by [metrics.engine.test.ts](backend/src/modules/exports/analysis/metrics.engine.test.ts) (`node:test`, run via `npm run test:unit`).

### Impact analysis — the "depth-1" feature

Backend: [backend/src/modules/versions/impact.controller.ts](backend/src/modules/versions/impact.controller.ts) `GET /projects/:projectId/impact/:artifactId` (VIEWER+) is **strictly 1-hop**. It returns `{ artifact, directDependencies, dependentArtifacts, apiSpecs, databaseModels, diagrams, documentation, recentEvents (last 10), impactSummary }`.

Frontend is where the real product lives — and it's **frontend composition over read-only endpoints, no backend change**: [impact/[artifactId]/page.tsx](frontend/nextjs/app/(app)/projects/[projectId]/impact/[artifactId]/page.tsx) composes **six** endpoints via `Promise.allSettled` (impact, validation list, artifacts, `/graph`, api-intel, diagrams). [lib/impact-risk.ts](frontend/nextjs/lib/impact-risk.ts) `assessImpact(data, nowMs, findings)` is a **pure deterministic verdict** — a Deletion verdict (`SAFE/LOW/MEDIUM/HIGH`, first-match rules) + a Modification band (additive points) + an Overall band, each shipping its `rules[]` trace for a "How is this calculated?" panel. The blast-radius graph ([lib/impact-graph.ts](frontend/nextjs/lib/impact-graph.ts)) does a client-side depth-1/2/3 BFS over the full relation set, but **the verdict is always 1-hop and never changes with depth**.

> **Key finding:** this is the most product-complete capability in the app, and it is **buried** — it has no sidebar entry ([sidebar.tsx](frontend/nextjs/components/shell/sidebar.tsx) `inProj` contains no impact item). It is reachable only via an "Analyze impact" button on the artifact detail page.

### Export engine — what it assembles, what consumes it

Three strictly-separated layers (SSOT assembly → analysis → PDF), each consuming the previous and never reaching back. [exports.engine.ts](backend/src/modules/exports/exports.engine.ts) `buildExportContent(projectId, format, sections, aiReview?)` is the **only** place export data is assembled; it emits an **internal snapshot** (`project`, `artifacts`, `relations`, `apiSpecs`+endpoints, `databaseModels`+entities+fields, `diagrams`, `validationIssues`, `versionHistory`, `team`, and a per-artifact 1-hop `impactAnalysis` block). Formats are **`JSON | MARKDOWN | PDF` only** — `ZIP` was removed (`ExportFormat` is a Prisma enum). Persisted immutably to `ExportPackage.content` (JSONB), then consumed by `analyzeExportSnapshot`, the pdfmake renderer ([pdf/](backend/src/modules/exports/pdf/)), and the AI-review digest.

> **Key finding:** the export emits a *snapshot for documentation/analysis* — a `grep` for `openapi|swagger|CREATE TABLE|toSql|toOpenApi` across `modules/exports` returns **nothing**. There is no generative output today. The stored shapes that *would* feed one: API endpoints carry `method/path/summary/requiresAuth` + **free-text** `requestSchema`/`responseSchema` strings ([format-schema.ts](backend/src/modules/exports/format-schema.ts) pretty-prints them only if they happen to parse as JSON); DB fields carry `type` (free-form string), `required`, `isPrimaryKey`, `isForeignKey`, and precise FK targets resolved by [database-models/fk-resolve.ts](backend/src/modules/database-models/fk-resolve.ts).

### AI features — where they plug in, how determinism is enforced

[backend/src/modules/ai/](backend/src/modules/ai/) holds bootstrap (`proposal/`), review (`review/`), advisor (`advisor/`), documentation (`documentation/`), the shared `architecture/` runner, and the `providers/` seam. The boundary is enforced in code:

- **Only one AI→DB write path exists**: [proposal/bootstrap.apply.ts](backend/src/modules/ai/proposal/bootstrap.apply.ts) `applyBootstrap` re-validates the user-selected proposal server-side, then creates `DRAFT` artifacts (with `description: ""` — AI prose never lands on entity fields) inside a `$transaction`. Review/advisor/doc services write **only their own `AiSession`** audit row, never SSOT.
- **Read-only chain** for review/advisor: `SSOT → buildExportContent → analyzeExportSnapshot → buildReviewDigest → AI`. `AI → AnalysisResult` is forbidden by construction. Citations are stripped/flagged against a deterministic evidence allow-list ([review.verify.ts](backend/src/modules/ai/review/review.verify.ts), [advisor.verify.ts](backend/src/modules/ai/advisor/advisor.verify.ts)).
- **Provider seam**: [providers/ai.provider.ts](backend/src/modules/ai/providers/ai.provider.ts) `getAiProvider()` throws `AiNotConfiguredError` → `503 AI_NOT_CONFIGURED` when `ANTHROPIC_API_KEY` is absent, so the whole AI layer is cleanly optional.

### Import infrastructure (relevant to Direction C)

[backend/src/modules/ingestion/](backend/src/modules/ingestion/) has four **pure** parsers reachable only by **pasting text over HTTP** (no file/git access): `openapi.engine.ts` parses real OpenAPI 3.x / Swagger 2.0 **JSON** into endpoints; `sql.engine.ts` parses `CREATE TABLE` DDL (regex-based, 2-pass FK resolution) into entities/fields; plus markdown + mermaid. `draft → parse → confirm`, and **confirm reuses the normal creation controllers**. A repo-wide grep for `git|clone|simple-git|octokit|fs.readdir|webhook` in application code finds **zero** matches; the only async infra is **`node-cron`** (digest/cleanup schedulers) — no queue, no Redis, single-instance.

---

## Direction A — Decision-support reframing

*Foreground impact + validation + review as the product's spine instead of the entity editors.*

**What already exists**
- A complete, deterministic **impact verdict + blast-radius** feature ([lib/impact-risk.ts](frontend/nextjs/lib/impact-risk.ts), [impact.controller.ts](backend/src/modules/versions/impact.controller.ts)) — already answers *"what breaks if I change X?"*.
- A 28-rule validation surface with actionable fixes ([validation.engine.ts](backend/src/modules/validation/validation.engine.ts), [validation.presenter.ts](backend/src/modules/validation/validation.presenter.ts)) — already answers *"what's missing?"*.
- AI Review/Advisor + the deterministic health score ([metrics.engine.ts](backend/src/modules/exports/analysis/metrics.engine.ts)) — already answers *"is this healthy?"*.
- A cross-project dashboard summary ([modules/dashboard/](backend/src/modules/dashboard/)).

**What must be built (ordered)**
1. **Promote impact analysis to a first-class destination** — add it to `inProj` in [sidebar.tsx](frontend/nextjs/components/shell/sidebar.tsx); add a project-level entry point that doesn't require pre-selecting an artifact (a picker/landing).
2. **A unified "decision" landing surface** per project that fronts the three questions (health card + open-findings triage + "analyze impact" entry), composed from endpoints that already exist.
3. **Wire validation findings into the impact "Change Signals"** more visibly (the page already reads them; lift them into the spine).
4. IA/copy reordering so editors become "edit the model," not the home screen.

**Determinism check** — Fully respects 1–3. It is pure reframing/composition over already-deterministic outputs; AI stays read-only; no engine is touched.

**Effort** — **S** (mostly frontend IA + a thin landing surface). Main risk is *product definition* (what the spine should say), not technical.

**Verdict — Makeable as-is.** Every capability exists; the work is surfacing and composing it, which the codebase is already structured for (typed `lib/api/` wrappers, `Promise.allSettled` composition).

---

## Direction B — Generative / authoritative SSOT

*Make stored models produce load-bearing artifacts (real OpenAPI, ERD/SQL, types).*

**What already exists**
- The layered, **pure/deterministic** export engine — a generator is just another pure consumer of the snapshot, exactly like the existing pdfmake renderer ([pdf/pdf.renderer.ts](backend/src/modules/exports/pdf/pdf.renderer.ts)).
- DB data sufficient for **SQL DDL / ERD**: per-field `type`, `required`, `isPrimaryKey`, `isForeignKey`, entity- and column-level FK targets, `databaseType` (dialect), `position` (column order).
- A solid **endpoint catalog** for OpenAPI *paths*: `method`, `path`, `summary`, `requiresAuth` per endpoint.
- Proof the transformation is tractable: the ingestion parsers already do the **inverse** (OpenAPI JSON → endpoints, DDL → entities) in [openapi.engine.ts](backend/src/modules/ingestion/openapi.engine.ts) / [sql.engine.ts](backend/src/modules/ingestion/sql.engine.ts).

**What must be built (ordered)**
1. **SQL DDL generator** (`snapshot → CREATE TABLE`), a pure function with a colocated determinism test; a `type`-string → dialect-type mapping per `databaseType`, FK constraints from the resolved targets, dependency-ordered tables.
2. **ERD/standalone SVG export** — the PDF already renders an ERD; decouple it into a downloadable artifact (low marginal cost).
3. **OpenAPI document generator** (`snapshot → openapi.json`) — paths/methods/auth are authoritative; request/response bodies are best-effort.
4. **Delivery**: either add `ExportFormat` enum values (a Prisma migration — note `EXPORT_FORMATS` and the TS types must stay in sync) or expose new download endpoints; set correct content-types.
5. (Later) TypeScript types / scaffolds derived from the same snapshot.

**Determinism check** — Fully respects 1–3. A generator is a pure function of the immutable snapshot (mirror the PDF determinism pinning). No AI, no score involvement.

**Honest caveat** — API `requestSchema`/`responseSchema` are **free-text strings, not structured JSON Schema** ([schema.prisma](backend/prisma/schema.prisma) `ApiEndpoint`, [format-schema.ts](backend/src/modules/exports/format-schema.ts)). So generated OpenAPI **bodies** can only be pass-through-if-valid-JSON; a fully typed, validating OpenAPI requires first giving endpoints structured schemas (a data-model + editor change). SQL/ERD has no such gap — the DB field data is structured enough today.

**Effort** — **M** overall. SQL DDL + ERD: **S–M** (data is sufficient). OpenAPI: **M** (the free-text payload gap is the unknown). Main risk: OpenAPI fidelity, and `type`-string normalization for SQL dialects.

**Verdict — Makeable with caveats.** SQL/ERD/types are makeable as-is and deterministically; OpenAPI is partial until endpoints gain structured schemas. Best sequenced SQL/ERD first.

---

## Direction C — Reflective / verifying

*Connect the model to a real repo to detect divergence (code-not-in-model, model-not-in-code).*

**What already exists**
- Reusable pure parsers for committed spec files ([openapi.engine.ts](backend/src/modules/ingestion/openapi.engine.ts), [sql.engine.ts](backend/src/modules/ingestion/sql.engine.ts)).
- The `propose → review → confirm` philosophy and ingestion's `draft → confirm` pattern map cleanly onto "detect divergence → propose reconciliation."
- `VersionEvent` provenance infra for recording reconciliations.

**What must be built (ordered)**
1. **Git/filesystem connectivity** — *none exists today*. New subsystem: repo auth, clone/fetch (`simple-git`/`octokit`), secret handling.
2. **A code extractor** — the hard, fuzzy, framework-specific part. The existing parsers only read `openapi.json`/`schema.sql`/`.md`/`.mmd`; extracting endpoints/models from *arbitrary* Express routes, decorators, or Prisma/ORM source is net-new and inherently approximate.
3. **A divergence engine** — compare extracted set vs SSOT, classify (in-code-not-model / in-model-not-code / drifted). This part *can* be deterministic.
4. **Async job infrastructure** — `node-cron` is single-instance/in-memory; repo scans are long-running and concurrent → needs a real queue (BullMQ/Redis) before this is safe.

**Determinism check** — Achievable **only if** reconciliation stays human-gated: divergence detection is a deterministic set-diff (fine under 1–3), and any model change must flow through `propose → review → confirm → apply` (rule 1). Divergence findings must **not** be minted by AI into validation/score state (rules 3–4); surface them as a separate deterministic report or feed the deterministic engine. So the invariants don't block it — but the *infrastructure* gap is large.

**Effort** — **L**. Main risk/unknown: **code extraction from real source is framework-specific and fuzzy**, on top of two net-new subsystems (git access, durable async jobs) and a security surface.

**Verdict — Not within current MVP scope** as "scan arbitrary code." **But a narrow slice is Makeable with caveats:** diff the SSOT against a **committed `openapi.json` / SQL schema / Prisma schema file** fetched from a repo — this reuses the existing parsers, sidesteps the hardest extraction problem, and is the realistic single-developer on-ramp. Treat full code-AST extraction as a later bet.

---

## Prioritized recommendation

**Do Direction A first** — specifically, **promote impact analysis into a first-class "decision" surface** (sidebar entry + a project-level landing that fronts *what's missing / is this healthy / what breaks if I change X*).

**Why:** the most product-defining capability in the codebase — a complete, deterministic, explainable impact verdict plus blast-radius graph — is **already built and shipped but buried behind an artifact-detail button and absent from the sidebar**. Surfacing and composing it is **S-effort frontend work over existing deterministic outputs**, it trivially respects all three invariants (no engine touched, AI stays read-only), and it is the precondition that makes B (load-bearing outputs) and C (divergence) land somewhere meaningful. It is the highest value-to-cost move available.

**Then:** Direction B's **SQL DDL + ERD export** as the first genuinely load-bearing output (makeable as-is, deterministic), deferring OpenAPI until endpoints gain structured schemas. Direction C remains a future bet, entered through the narrow committed-spec-file diff rather than full code extraction.
