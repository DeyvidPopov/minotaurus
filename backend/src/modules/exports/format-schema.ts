// Pure, shared formatter for an API endpoint's request/response payload schema
// in human-readable exports (Markdown + PDF). One source so the two renderers
// can't drift. Valid JSON is normalized to 2-space-indented JSON (deterministic);
// anything else (free-text schema, prose) is returned trimmed and verbatim.
// Empty / whitespace / nullish input yields "" so callers can skip rendering.
// No IO, no clock, no randomness.

export function formatSchemaForExport(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}
