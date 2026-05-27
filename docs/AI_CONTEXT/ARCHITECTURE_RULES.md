# Architecture Rules

## Backend
- Thin controllers
- Logic in services/engines
- JSON persistence currently
- Standard API envelope
- requireAuth on protected routes

## Frontend
- API wrappers in lib/api
- No direct fetch in pages
- Use existing UI primitives
- Do not duplicate DTOs

## Validation
- Rule-based deterministic validation
- No AI-generated validation logic

## Graph
- ArtifactRelation is graph source of truth
- Do not break graph contract