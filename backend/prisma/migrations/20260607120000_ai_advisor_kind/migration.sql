-- AI Architecture Advisor consolidation: the Advisor becomes a persisted second
-- mode of AI Review (Project → AI Review → [Full Review | Advisor]). A new
-- AiSession kind stores advisor results so they survive refresh, support history,
-- and get staleness detection — exactly like REVIEW. Audit metadata only: an
-- AiSession is never a graph node and never SSOT. Additive, non-destructive.

-- AlterEnum
ALTER TYPE "AiSessionKind" ADD VALUE 'ADVISOR';
