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

## MERMAID LABEL RENDERING FIX
- Replaced `fontFamily: "var(--font-mono)"` with a concrete font stack — the CSS variable
  was being baked literally into SVG `font-family` attributes and not resolving, which
  rendered text invisibly in some browsers.
- Added explicit `themeVariables` covering `primaryTextColor / secondaryTextColor /
  tertiaryTextColor / nodeTextColor / textColor / mainBkg / background / lineColor /
  edgeLabelBackground` and ERD/sequence/class-diagram specific variants — text is now
  guaranteed light on dark.
- Switched the Mermaid theme from `"dark"` to `"base"` so our themeVariables fully
  override defaults instead of being half-merged.
- All MERMAID_TEMPLATES now use explicit quoted labels: `Client["Client"]` instead of
  `Client`. Same for the seeded Architecture Overview diagram.
- ERD generator (`generateMermaidErd`):
  - empty entity bodies emit `string _empty "No fields defined"` placeholder (Mermaid
    silently elides empty `{}`)
  - relationship labels are sanitized via `safeLabel()` and never empty
  - entity name escaping falls back to `"unnamed"` instead of an empty identifier
- MermaidPreview added a post-render label scan: if Mermaid produces an SVG but every
  `<text>` / `<foreignObject>` node is empty, the preview shows a yellow
  "Diagram rendered, but labels may be missing" warning with a collapsible source view.

## TODO (next phases)
- Version History
- Impact Analysis
- PostgreSQL migration
- AI architecture insights