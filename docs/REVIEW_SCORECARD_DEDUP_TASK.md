# TASK: Dedupe the AI Review score cards onto the shared HealthScoreCards

**Status:** OPEN
**Created:** 2026-06-27 (during the Decision surface build, Increment 2)
**Size:** S — pure presentation refactor, no behavior change.

## Why (parity — this is the point)
The **Decision** page and the **AI Review** page must render **identical** health
score cards (same score number, grade bands, colours, sub-score bars). They read the
**same** deterministic numbers (the score `AnalysisResult.health`, surfaced by
`GET /projects/:id/analysis` and by the AI Review read path). If the two surfaces keep
**separate copies** of the card markup + the band/colour helpers, they can silently
drift — one gets a styling/threshold tweak the other doesn't — and a user comparing the
two would see different cards for the same project. Same class of bug the repo already
guards against elsewhere (e.g. the single `ActivityRow`, and `pipeline-theater` ↔
`TYPE_INFO` colour sync).

## What exists now
Increment 2 extracted the canonical, shared implementation:
- `frontend/nextjs/lib/health-score.ts` — `scoreColorVar`, `scoreLabel`, `SUB_SCORE_LABELS`
  (display-only band mapping; mirrors backend `GRADE_BANDS`).
- `frontend/nextjs/components/analysis/health-score-cards.tsx` — `HealthScoreCards`
  (the Health card + five sub-score cards) and `ScoreStrip` (the animated bottom border).

The **Decision** page already uses these.

## What still has its own copies (to migrate)
`frontend/nextjs/app/(app)/projects/[projectId]/review/page.tsx`:
- `scoreColorVar(...)` (~line 53) → import from `@/lib/health-score`.
- `scoreLabel(...)` (~line 61) → import from `@/lib/health-score`.
- `SUB_LABELS` map (~line 43) → replace with `SUB_SCORE_LABELS` from `@/lib/health-score`.
- `ScoreStrip(...)` (~line 623) → import from `@/components/analysis/health-score-cards`.
- The Full-Review score grid (~lines 357–376) → replace with `<HealthScoreCards health={health} />`.

## Acceptance
- Review page imports the shared helpers/component; its local `scoreColorVar` /
  `scoreLabel` / `SUB_LABELS` / `ScoreStrip` / inline grid are deleted.
- `npm run typecheck` clean; the Review score grid renders pixel-identically to before
  and to the Decision page (visual check both pages on the same project).
- No change to any number, threshold, or the AI generation/verify paths.

## Determinism / invariants (unchanged)
Pure presentation only. No AI, no engine change, no new computation — the score still
comes from the deterministic analysis engine. Invariants 1–3 untouched.

> Deferred deliberately so the Decision surface increments stay focused; the Review
> page is a shipped AI feature and its refactor should land as its own reviewable diff.
