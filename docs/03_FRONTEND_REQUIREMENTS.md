# 03 Frontend Requirements

## Frontend Stack

The frontend must use:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui where useful
- React Flow for graph visualization
- Markdown editor and preview
- Mermaid renderer for diagrams
- Zustand or React Query for state/data management

## Frontend Role

The frontend is responsible for interaction, navigation, visualization, and editing. It must consume the backend REST API and WebSocket events. It must not directly access the database.

## Required Pages

```text
/login
/register
/dashboard
/projects
/projects/[projectId]
/projects/[projectId]/artifacts
/projects/[projectId]/graph
/projects/[projectId]/docs/[artifactId]
/projects/[projectId]/api
/projects/[projectId]/diagrams
/projects/[projectId]/database
/projects/[projectId]/validation
/projects/[projectId]/versions
/projects/[projectId]/search
/projects/[projectId]/export
/settings
```

## Layout Requirements

### Main Application Layout

Must contain:

- sidebar navigation
- top bar
- project switcher
- global search
- user profile menu
- notification area

### Project Workspace Layout

Must contain:

- project name
- project status summary
- artifact navigation
- graph shortcut
- validation issue indicator
- recent activity panel

## Core Components

```text
AuthForm
DashboardStats
ProjectCard
ProjectSidebar
ArtifactList
ArtifactCard
ArtifactEditor
RelationEditor
GraphViewer
MarkdownEditor
MarkdownPreview
ApiSpecImporter
EndpointTable
DiagramEditor
DatabaseModelViewer
ValidationPanel
VersionTimeline
SearchResults
ExportPanel
```

## Dashboard Requirements

The dashboard must show:

- accessible projects
- number of artifacts per project
- validation warning count
- recent changes
- quick actions

## Artifact Management UI

The artifact page must allow:

- listing artifacts
- filtering by type
- filtering by status
- searching artifacts
- creating new artifacts
- editing artifact metadata
- deleting artifacts
- opening artifact-specific views

## Artifact Editor Requirements

The artifact editor must include:

- title
- type
- description
- status
- tags
- relation editor
- save button
- change history shortcut

## Graph Viewer Requirements

Use React Flow.

Nodes must represent artifacts.

Edges must represent artifact relations.

Graph features:

- zoom
- pan
- node selection
- edge selection
- filter by artifact type
- filter by relationship type
- open artifact from node
- highlight dependencies

## Documentation Editor Requirements

The documentation editor must support:

- Markdown input
- live preview
- code blocks
- Mermaid blocks
- autosave or manual save
- relation panel
- version history link

## API View Requirements

The API page must support:

- upload/import OpenAPI JSON or YAML
- display endpoints in table
- show method/path/summary/auth status
- link endpoint to service artifact
- link endpoint to documentation page
- show validation warnings

## Diagram View Requirements

The diagram page must support:

- diagram creation
- diagram type selection
- source editor
- rendered preview
- relation linking

## Validation View Requirements

The validation page must show:

- severity
- category
- message
- affected artifact
- status
- created date

Users must be able to mark issues as:

- open
- resolved
- ignored

## Version History View Requirements

The version page must show:

- changed entity
- change type
- changed by
- timestamp
- old value
- new value

## Search Requirements

The search page must support:

- global search input
- filtering by artifact type
- filtering by result type
- opening result directly

## Export Requirements

The export page must allow:

- generating SSOT export
- previewing included sections
- downloading JSON export
- downloading Markdown report if implemented

## Frontend API Rules

- All backend calls must go through a centralized API client.
- Token handling must be centralized.
- Errors must be displayed consistently.
- Loading states must exist for all async views.
- Empty states must exist for lists.
- Forms must use schema-based validation where possible.

## Frontend Acceptance Criteria

The frontend is complete when:

- users can log in
- users can view projects
- users can create and edit artifacts
- users can connect artifacts
- graph view visualizes relationships
- documentation editor works
- API endpoints are visible
- validation issues are visible
- version history is visible
- SSOT export can be triggered
