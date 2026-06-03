-- Remove the unimplemented `ZIP` value from the ExportFormat enum.
-- ZIP was never generated: the download path fell through to JSON. Audited at
-- removal time there were 0 ExportPackage rows with format='ZIP', so no data
-- migration is required; if any had existed they would have needed remapping to
-- JSON (what they actually contained) BEFORE this runs, or the USING cast below
-- would fail. Postgres cannot DROP a value from an enum in place, so the type is
-- recreated without ZIP and the column is re-pointed at it.

BEGIN;

CREATE TYPE "ExportFormat_new" AS ENUM ('JSON', 'MARKDOWN', 'PDF');
ALTER TABLE "ExportPackage"
  ALTER COLUMN "format" TYPE "ExportFormat_new"
  USING ("format"::text::"ExportFormat_new");
ALTER TYPE "ExportFormat" RENAME TO "ExportFormat_old";
ALTER TYPE "ExportFormat_new" RENAME TO "ExportFormat";
DROP TYPE "ExportFormat_old";

COMMIT;
