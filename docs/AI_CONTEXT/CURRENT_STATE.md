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
- Diagrams (Mermaid editor + live preview, polished)
- Validation
- Export (artifacts, relations, API specs, DB models, diagrams, validation report, graph)
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

## Current Commit
3708d80

## Current Goal
Phase 4 polish complete. Diagrams + visual ERD are stable; ready for the next phase.

## Important Constraints
- Do not migrate PostgreSQL yet
- Do not break existing API contracts
- Do not redesign frontend shell
- Keep JSON persistence