# 08 UI UX Structure

## Design Goal

The platform should feel like a professional engineering workspace, not a generic admin panel.

The interface must support:

- technical clarity
- fast navigation
- visual architecture understanding
- artifact editing
- graph-based exploration
- validation feedback

## Visual Style

Recommended style:

- clean dashboard layout
- dark mode first, light mode optional
- high contrast cards
- subtle borders
- clear status badges
- technical typography
- graph-focused workspace

## Main Navigation

Sidebar items:

```text
Dashboard
Projects
Artifacts
Knowledge Graph
Documentation
APIs
Diagrams
Database
Validation
Versions
Search
Export
Settings
```

## Project Dashboard

Purpose:

Give a quick overview of the project state.

Must show:

- total artifacts
- total relations
- validation issues by severity
- recent changes
- documentation coverage
- API endpoint count
- graph preview

## Artifact List UX

The artifact list should include:

- search field
- type filter
- status filter
- tag filter
- create artifact button
- compact table/card view

Each artifact item should show:

- title
- type
- status
- relation count
- updated date

## Artifact Detail UX

The artifact detail page should show:

- metadata section
- description
- relations
- linked documentation
- validation issues
- version history shortcut

## Relation Editor UX

The relation editor should allow:

- selecting source artifact
- selecting target artifact
- selecting relation type
- adding optional description
- saving relation

It should prevent:

- self-relation
- duplicate relation
- relation across different projects

## Graph UX

Graph view is a core thesis feature.

Must support:

- zoom
- pan
- artifact-type filters
- relation-type filters
- selected node detail panel
- selected edge detail panel
- open artifact from graph node

Node visual hints:

```text
SERVICE: service node
API_SPEC: API node
API_ENDPOINT: endpoint node
DATABASE_MODEL: database node
DIAGRAM: diagram node
DOCUMENTATION: document node
SECURITY_POLICY: shield/security node
```

## Documentation Editor UX

Layout:

```text
Left: Markdown editor
Right: Live preview
Bottom/Side: Relations and validation issues
```

Features:

- save button
- unsaved changes indicator
- Markdown preview
- Mermaid preview support
- version history access

## API UX

API page must support:

- import OpenAPI
- endpoint table
- method badges
- path display
- auth indicator
- link endpoint to documentation/service/security policy

## Validation UX

Validation page must show issue severity clearly.

Suggested sections:

- critical issues
- errors
- warnings
- info

Each issue should show:

- category
- message
- affected artifact
- status
- action buttons: mark resolved / ignore

## Version History UX

Version timeline should show:

- change type
- changed entity
- changed by
- timestamp
- diff preview where possible

## Export UX

Export page should show:

- export format selection
- include validation issues toggle
- include version history toggle
- generate export button
- export history list

## Empty States

Every empty page must explain what to do next.

Examples:

- No artifacts yet: Create your first software artifact.
- No relations yet: Connect artifacts to build the knowledge graph.
- No validation issues: No issues detected.

## Loading States

Every async view must have loading state.

## Error States

Every failed API action must show a clear message.

## UI Acceptance Criteria

The UI is acceptable when:

- user can understand project state in under 10 seconds
- graph view clearly shows architecture relationships
- artifact editing is simple and predictable
- validation issues are visible and actionable
- export flow is understandable
