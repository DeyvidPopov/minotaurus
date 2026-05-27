# Next Steps

Phase 5 (Version History + Impact Analysis) is shipped. Every CUD path on
artifacts, relations, docs, API specs, DB models, diagrams, exports and validation
runs records a `VersionEvent`. Per-artifact impact analysis is available at
`/projects/<id>/impact/<artifactId>` and as part of SSOT export.

## Recommended next phase

**AI architecture analysis** is the natural follow-up:
- The platform now has all the inputs an LLM needs to reason about a system:
  artifacts, relations, documentation, API specs, DB models, diagrams, and
  full change history with impact summaries.
- One backend endpoint (`POST /api/projects/:id/ai/analyze`) wrapping a model
  call would unlock:
  - "Summarize the architecture of this project"
  - "What changed in the last week?"
  - "What would break if I deprecate Authentication Service?"
- Add a Settings tab "Anthropic API key" so the feature stays opt-in.

## After AI analysis
1. PostgreSQL migration (data model is stable; version history makes diffs auditable)
2. WebSocket live updates (re-render the timeline / dashboard counters on event)
3. Project members + RBAC

## Constraints (unchanged)
- Do not rebuild backend
- Do not redesign UI shell
- Keep JSON persistence for now
- Do not break graph contract