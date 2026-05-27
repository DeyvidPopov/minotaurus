# Session Handoff

## Last Completed Feature

Mermaid label-rendering fix on top of Phase 4 polish:
- Concrete font stack + explicit `themeVariables` so labels are visible in dark theme
- Templates and seeded sources now use quoted node labels (`Client["Client"]`)
- ERD generator pads empty entities and always emits non-empty relationship labels
- Post-render label scan warns when an SVG comes back with no visible text

Earlier in this session:
- Diagram editor: template-picker modal, live syntax status, save-state badge, centered preview
- Database Model detail: visual Mermaid ERD preview with Preview/Source toggle, polished entity cards with FK target shown as `name type FK → users.id`, "Generate diagram" shortcut

## Current Commit

80515ed — *Fix Mermaid diagram label rendering*

## Current Working State

- frontend works
- backend works
- exports work (artifacts, relations, API specs, DB models, diagrams, validation report, graph)
- validation works (rules across artifacts, relations, API specs, DB models, diagrams)
- Mermaid rendering works (lazy-loaded, `securityLevel: strict`, surfaces syntax errors as UI state)
- Demo project ("Online Shop Platform") seeded with 10 artifacts, 10 relations, 4 docs, 1 API spec with 3 endpoints, 1 DB model with 3 entities + FK, 1 architecture diagram

## Current Goal

Phase 5 — Version History (proposed; see NEXT_STEPS.md)

## Important Constraints

- no PostgreSQL yet
- do not break graph contract
- keep JSON persistence
- do not redesign frontend shell
- do not regress existing flows (auth, projects, artifacts, relations, docs, API specs, DB models, diagrams, validation, export)

## Known Risks

- graph becoming overloaded
- export payload growth (now includes Mermaid sources)
- AI context compaction
- Mermaid bundle size on first render (~1MB, lazy-loaded)
