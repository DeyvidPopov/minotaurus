/**
 * Normalize a list-page free-text search query exactly once: prefer `search`,
 * fall back to `q`, then lowercase + trim. Callers MUST use this single value for
 * BOTH the empty check and every `.includes()` match (the "List filter/search
 * convention") so a padded query like " patient" can't slip past the match.
 * Equivalent to the legacy `(search || q || "").toLowerCase().trim()`.
 */
export function normalizeSearchTerm(...values: (string | undefined)[]): string {
  return (values.find((v) => v) ?? "").toLowerCase().trim();
}
