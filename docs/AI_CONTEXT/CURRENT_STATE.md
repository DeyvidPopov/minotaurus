# Current Platform State

## Stack
Frontend:
- Next.js
- React
- TypeScript
- Tailwind

Backend:
- Express
- TypeScript
- JSON persistence

## Working Features
- Auth
- Projects
- Artifacts
- Relations
- Documentation
- API Specs
- Database Models (with visual Mermaid ERD)
- Diagrams (Mermaid editor + live preview, polished, readable labels in dark theme)
- Validation (artifact relation, doc, security, API, DB, diagram, churn, deprecated-still-used rules)
- Version History (every CUD records a VersionEvent; timeline + filters)
- Impact Analysis (per-artifact blast radius: deps, dependents, APIs, DBs, diagrams, docs, recent events)
- Export (artifacts, relations, API specs, DB models, diagrams, validation report, graph, version history, impact analysis)
- Graph
- Settings

## Current Persistence
JSON-based persistence using:
backend/src/db/data.json

NOT PostgreSQL.

## Graph Source of Truth
ArtifactRelation

## Export Source of Truth
ExportPackage

## Validation Engine
validation.engine.ts

## Current Modules
- documentation
- api-specs
- database-models
- diagrams
- exports
- validation
- versions (version history + impact analysis)

## Current Commit
254b85b

## Current Goal
Phase 5 shipped: Version History + Impact Analysis. The platform now records every CUD
action as a VersionEvent and exposes a per-artifact blast-radius view. Recommended next
phase: AI architecture analysis (NEXT_STEPS.md).

## Important Constraints
- Do not migrate PostgreSQL yet
- Do not break existing API contracts
- Do not redesign frontend shell
- Keep JSON persistence