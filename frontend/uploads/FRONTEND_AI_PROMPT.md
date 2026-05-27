# Frontend AI Prompt

You are implementing the frontend for the Perfect Documentation Platform.

## Goal

Build a Next.js + React + TypeScript frontend for a software documentation and architecture management platform.

The frontend consumes a separate Express backend through REST APIs and WebSocket events.

## Required Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui where useful
- React Flow
- Markdown editor/preview
- Mermaid rendering

## Must Follow

Read and follow these documents before coding:

- docs/01_SYSTEM_OVERVIEW.md
- docs/03_FRONTEND_REQUIREMENTS.md
- docs/05_API_CONTRACTS.md
- docs/06_WEBSOCKET_EVENTS.md
- docs/08_UI_UX_STRUCTURE.md
- docs/09_SECURITY_MODEL.md
- docs/11_AGENTS.md

## Required Pages

Implement:

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

## Required Components

Implement reusable components:

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

## Rules

- Do not invent backend endpoints.
- Use the API contracts exactly as documented.
- Use centralized API client.
- Implement loading states.
- Implement empty states.
- Implement error states.
- Do not put backend business logic in frontend components.
- Use React Flow for graph visualization.
- Use clean professional dashboard design.

## Deliverable

A working frontend that connects to the backend API and supports the documented workflows.
