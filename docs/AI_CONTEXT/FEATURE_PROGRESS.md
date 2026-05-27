# Feature Progress

## DONE
- Auth
- Projects
- Artifacts
- Relations
- Validation
- Export
- Documentation
- API Specs
- Database Models (with auto-generated Mermaid ERD preview)
- Diagrams (Mermaid editor with live preview, syntax status, template picker)
- Settings

## RECENT POLISH (current pass)
- Diagram editor:
  - "Templates…" picker modal (no more accidental overwrite)
  - Confirmation modal when editor is non-empty before replacing
  - Live "Valid Mermaid / Invalid Mermaid" status pill
  - Unsaved-changes badge, centered preview, loading state
- Database Model ERD tab:
  - Visual Mermaid ERD preview (auto-generated from entities + fields)
  - Preview / Source toggle, Copy Mermaid button
  - "Generate diagram" button that mints a Diagram entry pre-filled with the ERD source
- Entity cards: stronger PK / FK chips, hover highlight, FK target shown as `name type FK → users.id`

## TODO (next phases)
- Version History
- Impact Analysis
- PostgreSQL migration
- AI architecture insights