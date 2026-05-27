# Next Steps

Phase 4 (Diagrams) is shipped and polished. Visual ERD wired up.
Database Models and Diagrams modules are now considered stable for the MVP demo.

## Recommended next phase

**Version History** is the highest-leverage next module:
- Every existing module (artifacts, relations, docs, API specs, DB models, diagrams)
  already mutates JSON-persisted rows. Version history would attach a change log
  to the same persistence with no schema migration.
- Frontend has a stubbed `/versions` route ready to receive the module.
- Validation engine has a `VERSIONING` category already declared but unused.

## After Version History
1. Impact Analysis (uses relations + versions to score blast radius)
2. PostgreSQL migration (with versions in place, the data model is finally stable)
3. AI architecture analysis

## Constraints (unchanged)
- Do not rebuild backend
- Do not redesign UI shell
- Keep JSON persistence
- Do not break graph contract