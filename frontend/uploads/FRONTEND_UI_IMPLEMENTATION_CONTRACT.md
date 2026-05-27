# FRONTEND UI IMPLEMENTATION CONTRACT

## 1. Purpose

This document defines exactly what the frontend must show, how the user workflow should behave, which pages must exist, which API endpoints each page consumes, and what payloads are expected.

This file is intended for Claude, Codex, or any AI coding agent implementing the frontend.

The frontend must act as the visual and interaction layer of the SSOT Architecture Platform.

---

## 2. Global Frontend Rules

### 2.1 Technology Expectations

Use:

```text
Next.js App Router
React
TypeScript
Tailwind CSS
React Flow
Markdown editor with preview
Mermaid rendering
Central API client
WebSocket client
```

Recommended frontend libraries:

```text
react-hook-form
zod
zustand
react-flow
lucide-react
sonner or toast notification system
```

### 2.2 Architecture Rule

The frontend must never connect directly to PostgreSQL.

All data must flow through the backend REST API and WebSocket server.

```text
Frontend -> REST API / WebSocket -> Express Backend -> PostgreSQL
```

### 2.3 UI Goal

The frontend should make the platform feel like an engineering workspace, not a simple admin panel.

The user must always understand:

```text
What project am I in?
What artifact am I viewing?
How is it connected?
What is incomplete or inconsistent?
What changed recently?
What can be exported as SSOT?
```

---

## 3. Global Layout

### 3.1 App Shell

All authenticated pages must use the same shell.

Visible layout:

```text
Left Sidebar
Top Bar
Main Content Area
Optional Right Context Panel
```

### 3.2 Left Sidebar

Must show:

```text
Dashboard
Projects
Current Project
Artifacts
Knowledge Graph
Documentation
API Specs
Database Model
Diagrams
Validation
Version History
Export SSOT
Settings
```

### 3.3 Top Bar

Must show:

```text
Current project name
Global search input
Validation status indicator
User avatar/menu
Theme switcher
```

### 3.4 Right Context Panel

Used when editing/viewing artifacts.

Must show:

```text
Artifact metadata
Relations
Linked documentation
Linked endpoints
Linked diagrams
Validation warnings
Recent changes
```

---

## 4. Global UI States

Every page must implement:

```text
Loading state
Empty state
Error state
Success state
Permission-denied state
```

Example:

```text
Loading: Skeleton cards or spinner
Empty: Helpful message + primary action button
Error: Message + retry button
Permission denied: Explanation + back button
```

---

## 5. Routing Structure

Use these routes:

```text
/
 /login
 /register
 /dashboard
 /projects
 /projects/new
 /projects/[projectId]
 /projects/[projectId]/artifacts
 /projects/[projectId]/artifacts/new
 /projects/[projectId]/artifacts/[artifactId]
 /projects/[projectId]/docs
 /projects/[projectId]/docs/[artifactId]
 /projects/[projectId]/api-specs
 /projects/[projectId]/api-specs/[apiSpecId]
 /projects/[projectId]/database
 /projects/[projectId]/diagrams
 /projects/[projectId]/diagrams/[diagramId]
 /projects/[projectId]/graph
 /projects/[projectId]/validation
 /projects/[projectId]/versions
 /projects/[projectId]/export
 /settings
```

---

# 6. Page-by-Page Requirements

---

## 6.1 Login Page

### Route

```text
/login
```

### Purpose

Allow existing users to authenticate.

### Must Show

```text
Platform logo/name
Email input
Password input
Login button
Link to register
Error message area
```

### User Workflow

```text
User enters email and password
User clicks Login
Frontend sends POST /api/auth/login
If successful, store access token
Redirect to /dashboard
If failed, show error message
```

### API Endpoint

```http
POST /api/auth/login
```

### Request Payload

```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

### Success Response

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-token",
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "Deyvid",
      "lastName": "Popov",
      "role": "ADMIN"
    }
  },
  "message": "Login successful"
}
```

### Acceptance Criteria

```text
[ ] Login form validates required fields
[ ] Invalid credentials show visible error
[ ] Successful login redirects to dashboard
[ ] Token is stored safely
[ ] API client uses token automatically
```

---

## 6.2 Register Page

### Route

```text
/register
```

### Purpose

Create a new account.

### Must Show

```text
First name input
Last name input
Email input
Password input
Confirm password input
Register button
Link to login
```

### User Workflow

```text
User fills form
Frontend validates password match
Frontend sends POST /api/auth/register
If successful, redirect to login or dashboard
If failed, show validation errors
```

### API Endpoint

```http
POST /api/auth/register
```

### Request Payload

```json
{
  "firstName": "Deyvid",
  "lastName": "Popov",
  "email": "user@example.com",
  "password": "Password123!"
}
```

### Acceptance Criteria

```text
[ ] Required fields are validated
[ ] Password confirmation is checked
[ ] Email format is validated
[ ] API validation errors are displayed
```

---

## 6.3 Dashboard Page

### Route

```text
/dashboard
```

### Purpose

Main entry point after login.

### Must Show

```text
Welcome section
Project cards
Recent activity
Validation summary
Quick search
Create project button
Graph preview area
```

### Visual Layout

```text
Top row:
- Total projects
- Total artifacts
- Open validation issues
- Recent changes

Middle:
- Project cards grid

Right or bottom:
- Recent activity timeline
```

### User Workflow

```text
User opens dashboard
Frontend loads projects
User can open a project
User can create a new project
User can search globally
```

### API Endpoints

```http
GET /api/projects
GET /api/activity/recent
```

### Project Card Must Show

```text
Project name
Description
Artifact count
Open validation issues
Last updated date
Open button
```

### Acceptance Criteria

```text
[ ] Dashboard loads user's projects
[ ] Empty state appears when no projects exist
[ ] Create project button is visible
[ ] Project cards navigate to workspace
[ ] Validation summary is visible
```

---

## 6.4 Projects List Page

### Route

```text
/projects
```

### Purpose

Show all projects available to the user.

### Must Show

```text
Project table or cards
Search/filter bar
Create new project button
Sort by name/date/status
```

### API Endpoint

```http
GET /api/projects
```

### Success Response

```json
{
  "success": true,
  "data": [
    {
      "id": "project-id",
      "name": "Architecture Platform",
      "description": "SSOT documentation platform",
      "artifactCount": 24,
      "validationIssueCount": 3,
      "updatedAt": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "Projects loaded"
}
```

---

## 6.5 Create Project Page

### Route

```text
/projects/new
```

### Purpose

Create a new software documentation project.

### Must Show

```text
Project name input
Project description textarea
Optional initial template selector
Create button
Cancel button
```

### API Endpoint

```http
POST /api/projects
```

### Request Payload

```json
{
  "name": "My Software System",
  "description": "Central documentation and architecture project"
}
```

### User Workflow

```text
User creates project
Frontend sends POST /api/projects
Backend returns created project
Frontend redirects to /projects/[projectId]
```

---

## 6.6 Project Workspace Page

### Route

```text
/projects/[projectId]
```

### Purpose

Main workspace for a selected project.

### Must Show

```text
Project title
Project description
Project health/validation status
Artifact overview
Knowledge graph preview
Recent version changes
Quick actions
```

### Quick Actions

```text
Create artifact
Import API spec
Create documentation page
Open graph
Run validation
Export SSOT
```

### API Endpoints

```http
GET /api/projects/:projectId
GET /api/projects/:projectId/artifacts
GET /api/projects/:projectId/graph
GET /api/projects/:projectId/validation-issues
GET /api/projects/:projectId/versions
```

### Acceptance Criteria

```text
[ ] Project workspace gives clear overview
[ ] Main platform modules are reachable
[ ] User can run validation from this page
[ ] User can open graph from this page
```

---

## 6.7 Artifacts List Page

### Route

```text
/projects/[projectId]/artifacts
```

### Purpose

Show all artifacts inside a project.

### Must Show

```text
Artifact list/table
Artifact type filter
Status filter
Search input
Create artifact button
Relation count
Validation count
Last updated
```

### Artifact Types

```text
DOCUMENTATION
API_SPEC
API_ENDPOINT
SERVICE
DATABASE_MODEL
DATABASE_ENTITY
DIAGRAM
REQUIREMENT
SECURITY_POLICY
ENVIRONMENT
EXTERNAL_SYSTEM
```

### API Endpoint

```http
GET /api/projects/:projectId/artifacts
```

### Query Parameters

```text
?type=SERVICE&status=ACTIVE&search=auth
```

### Success Response

```json
{
  "success": true,
  "data": [
    {
      "id": "artifact-id",
      "title": "Authentication Service",
      "type": "SERVICE",
      "status": "ACTIVE",
      "description": "Handles login and JWT generation",
      "relationCount": 5,
      "validationIssueCount": 1,
      "updatedAt": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "Artifacts loaded"
}
```

---

## 6.8 Create Artifact Page

### Route

```text
/projects/[projectId]/artifacts/new
```

### Purpose

Create a new engineering artifact.

### Must Show

```text
Artifact title input
Artifact type dropdown
Status dropdown
Description textarea
Tags input
Create button
Cancel button
```

### API Endpoint

```http
POST /api/projects/:projectId/artifacts
```

### Request Payload

```json
{
  "title": "Authentication Service",
  "type": "SERVICE",
  "status": "ACTIVE",
  "description": "Handles authentication and JWT issuance",
  "tags": ["auth", "security"]
}
```

### User Workflow

```text
User creates artifact
Frontend redirects to artifact detail page
User can then add relations, docs, diagrams, or validation metadata
```

---

## 6.9 Artifact Detail Page

### Route

```text
/projects/[projectId]/artifacts/[artifactId]
```

### Purpose

Central view for one artifact.

### Must Show

```text
Artifact title
Type badge
Status badge
Description
Tags
Relations graph preview
Incoming relations
Outgoing relations
Linked documentation
Linked API endpoints
Linked diagrams
Validation issues
Version history preview
Edit button
Delete button
```

### Required Sections

```text
Overview
Relations
Documentation
API Links
Diagrams
Validation
History
```

### API Endpoints

```http
GET /api/artifacts/:artifactId
PATCH /api/artifacts/:artifactId
DELETE /api/artifacts/:artifactId
GET /api/artifacts/:artifactId/relations
GET /api/artifacts/:artifactId/versions
```

### Update Payload

```json
{
  "title": "Authentication Service",
  "status": "ACTIVE",
  "description": "Updated description"
}
```

### Acceptance Criteria

```text
[ ] Artifact detail clearly shows connections
[ ] User can add/remove relations
[ ] User can see validation issues for this artifact
[ ] User can see recent changes
```

---

## 6.10 Relation Editor

### Used On

```text
Artifact detail page
Graph page
Right context panel
```

### Purpose

Create links between artifacts.

### Must Show

```text
Source artifact
Target artifact selector
Relation type dropdown
Description field
Create relation button
Existing relations list
Delete relation option
```

### Relation Types

```text
DEPENDS_ON
DOCUMENTS
IMPLEMENTS
USES
EXPOSES
BELONGS_TO
SECURES
VALIDATES
GENERATES
DEPLOYED_TO
COMMUNICATES_WITH
```

### API Endpoint

```http
POST /api/artifacts/:artifactId/relations
DELETE /api/relations/:relationId
```

### Request Payload

```json
{
  "targetArtifactId": "target-artifact-id",
  "relationType": "DEPENDS_ON",
  "description": "Authentication service depends on user database"
}
```

---

## 6.11 Documentation Pages

### Route

```text
/projects/[projectId]/docs
/projects/[projectId]/docs/[artifactId]
```

### Purpose

Allow users to write and edit Markdown documentation linked to artifacts.

### Docs List Must Show

```text
Documentation artifacts
Title
Linked artifact type
Last edited
Author
Validation warnings
```

### Editor Page Must Show

```text
Markdown editor
Live preview
Save button
Autosave indicator
Linked artifact panel
Mermaid preview support
Version history button
```

### API Endpoints

```http
GET /api/projects/:projectId/docs
GET /api/artifacts/:artifactId/documentation
PUT /api/artifacts/:artifactId/documentation
```

### Save Payload

```json
{
  "markdownContent": "# Authentication Service\n\nThis service handles login..."
}
```

### Acceptance Criteria

```text
[ ] Markdown editor works
[ ] Live preview works
[ ] Save persists content
[ ] Documentation remains linked to artifact
[ ] Version history is created after changes
```

---

## 6.12 API Specs Page

### Route

```text
/projects/[projectId]/api-specs
```

### Purpose

Import and inspect OpenAPI/API specifications.

### Must Show

```text
Upload OpenAPI file button
Paste OpenAPI JSON/YAML textarea
Imported specs list
Endpoint table
Linked service column
Validation status
```

### API Endpoints

```http
GET /api/projects/:projectId/api-specs
POST /api/projects/:projectId/api-specs/import
GET /api/api-specs/:apiSpecId
```

### Import Payload

```json
{
  "name": "Authentication API",
  "format": "OPENAPI",
  "rawContent": "{... OpenAPI JSON or YAML ...}"
}
```

### Endpoint Table Must Show

```text
Method
Path
Summary
Requires authentication
Linked artifact
Validation status
```

### Acceptance Criteria

```text
[ ] User can import OpenAPI content
[ ] Endpoints appear after parsing
[ ] Endpoints can be linked to services/docs
[ ] Invalid specs show readable errors
```

---

## 6.13 API Spec Detail Page

### Route

```text
/projects/[projectId]/api-specs/[apiSpecId]
```

### Purpose

Inspect one imported API specification.

### Must Show

```text
API spec name
Version
Raw content view
Parsed endpoint table
Endpoint details drawer
Linked services
Linked documentation
Validation issues
```

### API Endpoints

```http
GET /api/api-specs/:apiSpecId
GET /api/api-specs/:apiSpecId/endpoints
```

---

## 6.14 Database Model Page

### Route

```text
/projects/[projectId]/database
```

### Purpose

Display database models and entities.

### Must Show

```text
Database model summary
Tables/entities list
Field viewer
Relationship viewer
Normalization status
Validation warnings
Create entity button
```

### API Endpoints

```http
GET /api/projects/:projectId/database-models
POST /api/projects/:projectId/database-models
GET /api/database-models/:databaseModelId/entities
```

### Database Entity Must Show

```text
Entity name
Type table/collection
Fields
Primary keys
Foreign keys
Relations
Validation status
```

### Example Entity Payload

```json
{
  "name": "users",
  "type": "TABLE",
  "fields": [
    {
      "name": "id",
      "type": "uuid",
      "isPrimaryKey": true,
      "isNullable": false
    },
    {
      "name": "email",
      "type": "varchar",
      "isUnique": true,
      "isNullable": false
    }
  ]
}
```

---

## 6.15 Diagrams Page

### Route

```text
/projects/[projectId]/diagrams
/projects/[projectId]/diagrams/[diagramId]
```

### Purpose

Create and render UML, ERD, flow, and architecture diagrams.

### List Page Must Show

```text
Diagram cards
Diagram type
Linked artifact
Last updated
Create diagram button
```

### Diagram Editor Must Show

```text
Diagram title
Diagram type selector
Source editor
Rendered preview
Linked artifacts panel
Save button
```

### Diagram Types

```text
MERMAID
UML
ERD
ARCHITECTURE_FLOW
SEQUENCE
COMPONENT
```

### API Endpoints

```http
GET /api/projects/:projectId/diagrams
POST /api/projects/:projectId/diagrams
GET /api/diagrams/:diagramId
PATCH /api/diagrams/:diagramId
DELETE /api/diagrams/:diagramId
```

### Create Payload

```json
{
  "title": "Authentication Flow",
  "diagramType": "SEQUENCE",
  "sourceCode": "sequenceDiagram\nUser->>Frontend: Login\nFrontend->>Backend: POST /login",
  "linkedArtifactIds": ["artifact-id-1"]
}
```

---

## 6.16 Knowledge Graph Page

### Route

```text
/projects/[projectId]/graph
```

### Purpose

Visualize interconnected artifacts as a graph.

### Must Show

```text
Interactive graph canvas
Artifact nodes
Relationship edges
Node type colors/icons
Zoom controls
Search/filter panel
Selected node details
Create relation from graph
Run validation button
```

### Node Types

```text
Service
API
Database
Documentation
Diagram
Requirement
Security Policy
Environment
External System
```

### Edge Types

```text
DEPENDS_ON
DOCUMENTS
IMPLEMENTS
USES
EXPOSES
BELONGS_TO
SECURES
VALIDATES
GENERATES
DEPLOYED_TO
COMMUNICATES_WITH
```

### API Endpoint

```http
GET /api/projects/:projectId/graph
```

### Success Response

```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "id": "artifact-id",
        "label": "Authentication Service",
        "type": "SERVICE",
        "status": "ACTIVE"
      }
    ],
    "edges": [
      {
        "id": "relation-id",
        "source": "artifact-id",
        "target": "target-id",
        "type": "DEPENDS_ON",
        "label": "depends on"
      }
    ]
  },
  "message": "Graph loaded"
}
```

### User Workflow

```text
User opens graph
Frontend loads all artifacts and relations
User clicks node
Right panel shows artifact details
User can filter graph by type/status
User can create new relation by selecting source and target
User can open selected artifact detail
```

### Acceptance Criteria

```text
[ ] Graph renders correctly
[ ] Nodes are clickable
[ ] Selected node opens context panel
[ ] Filters affect visible graph
[ ] Relation creation updates graph
```

---

## 6.17 Validation Page

### Route

```text
/projects/[projectId]/validation
```

### Purpose

Show consistency, traceability, documentation, API, database, and security issues.

### Must Show

```text
Run validation button
Validation summary cards
Issues table
Severity filter
Category filter
Status filter
Linked artifact column
Resolve/ignore buttons
```

### Severity Levels

```text
INFO
WARNING
ERROR
CRITICAL
```

### Categories

```text
DOCUMENTATION
API
DATABASE
SECURITY
ARCHITECTURE
RELATIONSHIP
VERSIONING
```

### API Endpoints

```http
POST /api/projects/:projectId/validate
GET /api/projects/:projectId/validation-issues
PATCH /api/validation-issues/:issueId
```

### Validation Issue Response

```json
{
  "id": "issue-id",
  "severity": "WARNING",
  "category": "DOCUMENTATION",
  "message": "API endpoint has no linked documentation",
  "artifactId": "artifact-id",
  "artifactTitle": "POST /auth/login",
  "status": "OPEN",
  "createdAt": "2026-05-26T10:00:00.000Z"
}
```

### Acceptance Criteria

```text
[ ] User can run validation
[ ] Issues are grouped by severity/category
[ ] User can open affected artifact
[ ] User can mark issue resolved or ignored
```

---

## 6.18 Version History Page

### Route

```text
/projects/[projectId]/versions
```

### Purpose

Show how the architecture evolved over time.

### Must Show

```text
Timeline of changes
Entity type filter
Changed by filter
Change type filter
Before/after comparison
Open related artifact button
```

### Change Types

```text
CREATED
UPDATED
DELETED
LINKED
UNLINKED
VALIDATED
EXPORTED
```

### API Endpoint

```http
GET /api/projects/:projectId/versions
```

### Response Example

```json
{
  "success": true,
  "data": [
    {
      "id": "version-id",
      "entityType": "ARTIFACT",
      "entityId": "artifact-id",
      "changeType": "UPDATED",
      "oldValue": {
        "status": "DRAFT"
      },
      "newValue": {
        "status": "ACTIVE"
      },
      "changedBy": {
        "id": "user-id",
        "name": "Deyvid Popov"
      },
      "createdAt": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "Version history loaded"
}
```

---

## 6.19 Export SSOT Page

### Route

```text
/projects/[projectId]/export
```

### Purpose

Generate and download the Single Source of Truth package.

### Must Show

```text
Export explanation
Export format selection
Included sections checklist
Preview summary
Generate export button
Download button
Previous exports list
```

### Export Formats

```text
JSON
MARKDOWN
PDF
ZIP
```

### Included Sections

```text
Requirements
Artifacts
Relations
Knowledge Graph
API Specifications
Database Models
Diagrams
Validation Report
Version History
Security Policies
```

### API Endpoints

```http
POST /api/projects/:projectId/export
GET /api/projects/:projectId/exports
GET /api/exports/:exportId/download
```

### Export Payload

```json
{
  "format": "ZIP",
  "sections": [
    "ARTIFACTS",
    "RELATIONS",
    "GRAPH",
    "API_SPECS",
    "DATABASE_MODELS",
    "DIAGRAMS",
    "VALIDATION_REPORT",
    "VERSION_HISTORY"
  ]
}
```

### Acceptance Criteria

```text
[ ] User can choose export format
[ ] User can select included sections
[ ] Export request creates package
[ ] Download link appears after successful generation
```

---

## 6.20 Settings Page

### Route

```text
/settings
```

### Purpose

User and application preferences.

### Must Show

```text
Profile details
Change password
Theme preference
Notification preference
API token section if needed
Logout button
```

---

# 7. Main User Workflows

---

## 7.1 Workflow: Create Project and First Artifact

```text
Login
Open Dashboard
Click Create Project
Enter project name and description
Open new project workspace
Click Create Artifact
Select artifact type SERVICE
Enter title and description
Save
Open artifact detail page
```

Expected result:

```text
Project exists
Artifact exists
Artifact appears in project artifact list
Artifact appears as node in graph
Version history records creation
```

---

## 7.2 Workflow: Link Artifacts

```text
Open Artifact Detail
Open Relations section
Select target artifact
Select relation type
Add description
Save relation
Open Knowledge Graph
Verify edge appears
```

Expected result:

```text
Relation is stored
Graph updates
Version history records link creation
Validation can use the relation
```

---

## 7.3 Workflow: Write Documentation

```text
Open Documentation page
Select artifact
Write Markdown content
Preview rendered document
Save
Open artifact detail
Verify documentation is linked
```

Expected result:

```text
Markdown content is saved
Preview works
Artifact shows linked documentation
Version history records change
```

---

## 7.4 Workflow: Import API Spec

```text
Open API Specs page
Upload or paste OpenAPI content
Click Import
Backend parses endpoints
Frontend shows endpoint table
User links endpoints to service artifacts
```

Expected result:

```text
API spec is saved
Endpoints are created
Endpoints can be linked to documentation/services
Validation can detect undocumented endpoints
```

---

## 7.5 Workflow: Visualize Knowledge Graph

```text
Open graph page
Inspect nodes and edges
Filter by artifact type
Click artifact node
Open details panel
Create relation from selected nodes
```

Expected result:

```text
Graph represents artifact relations
User can navigate architecture visually
Graph updates after relation changes
```

---

## 7.6 Workflow: Run Validation

```text
Open Validation page
Click Run Validation
Backend checks consistency rules
Frontend displays issues
User opens affected artifact
User fixes missing relation/documentation
Run validation again
```

Expected result:

```text
Issues are visible
Issues are actionable
Resolved issues disappear or change status
```

---

## 7.7 Workflow: Export SSOT

```text
Open Export page
Select ZIP or Markdown
Choose included sections
Generate export
Download package
```

Expected result:

```text
Export contains project architecture
Export includes artifacts, relations, docs, APIs, diagrams, validation report
```

---

# 8. WebSocket Expectations

The frontend must connect to the backend WebSocket server after authentication.

## 8.1 Subscribe to Project

When user opens a project workspace:

```json
{
  "event": "project:subscribe",
  "payload": {
    "projectId": "project-id"
  }
}
```

## 8.2 Events to Handle

```text
artifact:created
artifact:updated
artifact:deleted
relation:created
relation:deleted
validation:completed
version:created
export:completed
```

## 8.3 Example Event

```json
{
  "event": "artifact:updated",
  "payload": {
    "projectId": "project-id",
    "artifactId": "artifact-id",
    "title": "Authentication Service",
    "updatedAt": "2026-05-26T10:00:00.000Z"
  }
}
```

Frontend behavior:

```text
Update related cache/state
Show small notification
Refresh graph if relation/artifact changed
Refresh validation page if validation changed
```

---

# 9. Central API Client Rules

Create a central API client.

Suggested files:

```text
frontend/lib/api/client.ts
frontend/lib/api/auth-api.ts
frontend/lib/api/project-api.ts
frontend/lib/api/artifact-api.ts
frontend/lib/api/relation-api.ts
frontend/lib/api/documentation-api.ts
frontend/lib/api/graph-api.ts
frontend/lib/api/validation-api.ts
frontend/lib/api/version-api.ts
frontend/lib/api/export-api.ts
```

The API client must:

```text
Attach auth token
Handle JSON parsing
Handle error responses
Expose typed methods
Avoid duplicated fetch calls inside components
```

Example:

```ts
export async function getProjectArtifacts(
  projectId: string,
): Promise<ArtifactDto[]> {
  return apiClient.get(`/api/projects/${projectId}/artifacts`)
}
```

---

# 10. Shared DTO Expectations

Frontend should use shared TypeScript types.

Example:

```ts
export type ArtifactType =
  | "DOCUMENTATION"
  | "API_SPEC"
  | "API_ENDPOINT"
  | "SERVICE"
  | "DATABASE_MODEL"
  | "DATABASE_ENTITY"
  | "DIAGRAM"
  | "REQUIREMENT"
  | "SECURITY_POLICY"
  | "ENVIRONMENT"
  | "EXTERNAL_SYSTEM"

export interface ArtifactDto {
  id: string
  projectId: string
  title: string
  type: ArtifactType
  status: "DRAFT" | "ACTIVE" | "DEPRECATED"
  description?: string
  relationCount?: number
  validationIssueCount?: number
  createdAt: string
  updatedAt: string
}
```

---

# 11. UI Design Expectations

## 11.1 Visual Style

The UI should feel:

```text
technical
structured
modern
dashboard-oriented
engineering-focused
clean
clear
```

Avoid:

```text
game-like UI
overly decorative animations
unclear colors
random layouts
```

## 11.2 Recommended Visual Elements

```text
Cards for summaries
Tables for structured lists
Graph canvas for relationships
Badges for status/type/severity
Timeline for version history
Split editor/preview for Markdown and diagrams
Right side drawer for context details
```

## 11.3 Status Colors

Use consistent semantic colors:

```text
DRAFT = neutral
ACTIVE = positive
DEPRECATED = warning
ERROR/CRITICAL = destructive
WARNING = caution
INFO = neutral/info
```

---

# 12. Frontend Acceptance Checklist

Claude/Codex should treat this as the final checklist.

```text
[ ] All listed routes exist
[ ] Protected routes require authentication
[ ] Sidebar navigation works
[ ] Dashboard loads projects
[ ] Projects can be created
[ ] Artifacts can be created, viewed, updated, deleted
[ ] Artifact relations can be created and removed
[ ] Knowledge graph renders real backend data
[ ] Markdown documentation can be edited and previewed
[ ] API specs can be imported and viewed
[ ] Database model page displays entities and fields
[ ] Diagram editor displays source and preview
[ ] Validation page can run and display validation
[ ] Version history page displays timeline
[ ] Export page can generate and download SSOT package
[ ] API calls use central API client
[ ] WebSocket updates are handled
[ ] Loading, empty, error, and success states exist
[ ] UI follows clean engineering workspace style
```

---

# 13. Claude Implementation Instruction

When implementing the frontend:

```text
1. Read this document fully.
2. Do not invent backend behavior.
3. Use the defined routes, endpoints, and payloads.
4. Build reusable components.
5. Keep API calls inside /lib/api.
6. Keep UI components focused and small.
7. Use placeholder data only when backend is unavailable.
8. Mark placeholder areas clearly with TODO comments.
9. Do not remove API contracts.
10. Do not directly access the database.
```

---

# 14. Recommended Implementation Order

```text
1. Next.js project setup
2. Global layout and navigation
3. API client
4. Auth pages
5. Dashboard
6. Projects pages
7. Artifacts pages
8. Relation editor
9. Knowledge graph
10. Documentation editor
11. API specs
12. Database model page
13. Diagrams
14. Validation
15. Version history
16. Export SSOT
17. Polish loading/error/empty states
```
