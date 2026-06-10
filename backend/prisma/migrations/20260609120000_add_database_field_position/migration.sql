-- Add an explicit display order to database fields (was previously unordered —
-- the fields relation had no orderBy, so Postgres returned heap order).
ALTER TABLE "DatabaseField" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill a stable per-entity order from current physical row order (ctid ≈
-- insertion order), so existing models keep the order users see today. New rows
-- get max(position)+1 in the controller; the reorder endpoint rewrites positions.
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "entityId" ORDER BY ctid) - 1) AS pos
  FROM "DatabaseField"
)
UPDATE "DatabaseField" f
SET "position" = ordered.pos
FROM ordered
WHERE f.id = ordered.id;
