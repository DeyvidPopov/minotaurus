# AGENTS.md

## Purpose

This file defines rules for AI coding agents working on the project.

All agents must follow these instructions to avoid architectural drift.

## Project Architecture

The project uses a monorepo structure:

```text
frontend/
backend/
docs/
shared/
```

## Global Rules

- Do not invent features outside the documentation.
- Do not change API contracts without updating docs.
- Do not duplicate business logic across frontend and backend.
- Do not let frontend access the database directly.
- Use TypeScript everywhere.
- Keep modules small and maintainable.
- Write code that is understandable for a bachelor thesis defense.

## Backend Agent Rules

- Backend uses Node.js, Express.js, Prisma, PostgreSQL, Zod, JWT.
- Use modular structure.
- Do not put business logic directly in route files.
- Validate all incoming requests.
- Use centralized error handling.
- Use standard response format.
- Add authorization checks to protected routes.
- Write version history for important mutations.
- Emit WebSocket events after successful mutations.

## Frontend Agent Rules

- Frontend uses Next.js, React, TypeScript, Tailwind CSS.
- Use backend API contracts from docs.
- Do not invent backend endpoints.
- Use centralized API client.
- Implement loading, empty, and error states.
- Keep business logic out of visual components.
- Use React Flow for graph visualization.
- Use Markdown editor/preview for documentation.

## Shared Contract Rules

- Shared types should be reused where practical.
- Enum values must match backend database enums.
- API response shapes must follow the documented format.

## Git Rules

- Make small, focused commits.
- Do not mix backend and frontend refactors unless necessary.
- Update docs when contracts change.

## Implementation Order

1. Backend project setup
2. Database schema
3. Authentication
4. Project CRUD
5. Artifact CRUD
6. Artifact relations
7. Graph endpoint
8. Frontend shell
9. Project dashboard
10. Artifact UI
11. Graph UI
12. Documentation editor
13. API import
14. Validation engine
15. Version history
16. Export flow
