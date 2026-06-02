-- Artifact Documentation Assistant: a new AiSession kind for on-demand,
-- per-artifact AI documentation drafts (audit metadata only — never SSOT).
-- Additive, non-destructive.

-- AlterEnum
ALTER TYPE "AiSessionKind" ADD VALUE 'DOCUMENTATION_DRAFT';
