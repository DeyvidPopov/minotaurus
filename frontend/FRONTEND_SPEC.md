# Minotaurus — Frontend Prototype Spec

> Pairs with **`FRONTEND_UI_GUIDELINES.md`** (visual tokens · layout · responsive rules · reusable component inventory · UI-only TODOs).

Living document. Pairs the **clickable prototype** (`index.html`) with the **API contracts** it consumes, and flags what still needs to be built before this can be wired to a real backend.

- **Stack target:** Next.js App Router · React · TypeScript · Tailwind · React Flow
- **Prototype stack:** static React via Babel-in-browser, hash routing, in-memory mock data (see `src/data.jsx`)
- **Aesthetic:** Vercel/Geist, light + dark, accent-tunable, density-aware

---

## 1. What's built in the prototype

Every page in the implementation contract has a working screen. Mock data lives in `src/data.jsx` (a fictional "Helix Commerce" platform — 36 artifacts, 45 relations, 9 validation issues, full version history).

### Pages

| Route | Page | Status |
|---|---|---|
| `/` | **Public landing** with hero + live graph preview + workflow band + features grid | ✅ |
| `/login` | Login | ✅ visual only |
| `/register` | Register | ✅ visual only |
| `/dashboard` | Global dashboard with stats, project cards, activity feed | ✅ |
| `/projects` | Projects list (grid + list view, search, sort) | ✅ |
| `/projects/new` | Create project | ✅ form only |
| `/projects/:id` | Workspace overview with embedded mini-graph + validation snapshot + recent changes + composition | ✅ |
| `/projects/:id/artifacts` | Artifacts list (filter by type/status, list + grid views) | ✅ |
| `/projects/:id/artifacts/new` | Create artifact | ✅ form only |
| `/projects/:id/artifacts/:artifactId` | Artifact detail with 7 tabs (Overview, Relations, Documentation, API Links, Diagrams, Validation, History) + relation drawer | ✅ |
| `/projects/:id/docs` | Documentation list | ✅ |
| `/projects/:id/docs/:artifactId` | Markdown editor + live preview + Mermaid renderer | ✅ |
| `/projects/:id/api` | API specs grid + import drawer | ✅ |
| `/projects/:id/api/:artifactId` | API spec detail with endpoint table + endpoint drawer | ✅ |
| `/projects/:id/database` | Database model viewer (entities, fields, PKs/FKs, warnings) | ✅ |
| `/projects/:id/diagrams` | Diagrams list with previews | ✅ |
| `/projects/:id/diagrams/:artifactId` | Diagram editor (Mermaid source ↔ preview) | ✅ |
| `/projects/:id/graph` | **Knowledge Graph (hero)** — custom canvas, pan/zoom, 3 node styles (shape/color/minimal), filter legend, selection drawer | ✅ |
| `/projects/:id/validation` | Validation page with severity/category/status filters | ✅ |
| `/projects/:id/versions` | Version history timeline with type/change filters | ✅ |
| `/projects/:id/export` | SSOT export wizard (format + sections + preview + history) | ✅ |
| `/settings` | Profile / Workspace / Notifications / Tokens / Danger zone | ✅ |

### Cross-cutting

- Sidebar with global + project sub-nav, 3 layout modes (expanded / icons-only / floating)
- **Mobile off-canvas sidebar** with hamburger trigger and scrim backdrop
- Topbar with breadcrumbs, global search trigger, validation status pill, theme toggle, tweaks button
- Responsive layout: desktop / tablet / mobile breakpoints at 1024px / 720px / 600px (full table in `FRONTEND_UI_GUIDELINES.md`)
- `⌘K` command palette searches projects, artifacts, endpoints, pages
- Right context drawers (add relation, endpoint inspector, graph node details, import OpenAPI)
- Toast notifications
- Loading / empty / error states scaffolded
- Markdown renderer (headings, code, lists, tables, blockquotes, links)
- Mermaid renderer (hand-rolled — supports `sequenceDiagram` and `flowchart`)
- Live Tweaks panel: theme · accent · density · sidebar · graph node style · fonts

---

## 2. API contract

The prototype assumes a **central API client** (`/lib/api/*`). All requests carry a bearer token (`Authorization: Bearer <jwt>`). All responses use this envelope:

```ts
type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
};
```

### 2.1 Auth

#### `POST /api/auth/login`
**Request**
```json
{ "email": "user@example.com", "password": "Password123!" }
```
**Response** `200`
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-token",
    "user": { "id": "user-id", "email": "user@example.com", "firstName": "Deyvid", "lastName": "Popov", "role": "ADMIN" }
  },
  "message": "Login successful"
}
```
Errors: `401 invalid_credentials`

#### `POST /api/auth/register`
**Request**
```json
{ "firstName": "Deyvid", "lastName": "Popov", "email": "user@example.com", "password": "Password123!" }
```

#### `POST /api/auth/refresh`
Refreshes the access token using the refresh token cookie.

#### `POST /api/auth/logout`
Revokes the current session.

#### `GET /api/auth/me`
Returns the current user.

---

### 2.2 Projects

#### `GET /api/projects`
Returns the list of projects visible to the user.
```json
{
  "success": true,
  "data": [{
    "id": "project-id",
    "name": "Architecture Platform",
    "description": "SSOT documentation platform",
    "artifactCount": 24,
    "validationIssueCount": 3,
    "members": 12,
    "updatedAt": "2026-05-26T10:00:00.000Z",
    "starred": false
  }],
  "message": "Projects loaded"
}
```

#### `POST /api/projects`
```json
{ "name": "My Software System", "description": "Central documentation and architecture project" }
```

#### `GET /api/projects/:projectId`
Returns one project with member info.

#### `PATCH /api/projects/:projectId`
Partial update (name, description, starred).

#### `DELETE /api/projects/:projectId`
Delete a project.

---

### 2.3 Artifacts

`ArtifactType` enum: `DOCUMENTATION | API_SPEC | API_ENDPOINT | SERVICE | DATABASE_MODEL | DATABASE_ENTITY | DIAGRAM | REQUIREMENT | SECURITY_POLICY | ENVIRONMENT | EXTERNAL_SYSTEM`

`Status` enum: `DRAFT | ACTIVE | DEPRECATED`

#### `GET /api/projects/:projectId/artifacts?type=&status=&search=`
```json
{
  "success": true,
  "data": [{
    "id": "artifact-id",
    "title": "Authentication Service",
    "type": "SERVICE",
    "status": "ACTIVE",
    "description": "Handles login and JWT generation",
    "tags": ["auth", "security"],
    "relationCount": 5,
    "validationIssueCount": 1,
    "createdAt": "...",
    "updatedAt": "..."
  }],
  "message": "Artifacts loaded"
}
```

#### `POST /api/projects/:projectId/artifacts`
```json
{
  "title": "Authentication Service",
  "type": "SERVICE",
  "status": "ACTIVE",
  "description": "Handles authentication and JWT issuance",
  "tags": ["auth", "security"]
}
```

#### `GET /api/artifacts/:artifactId`
Returns the artifact plus inline metadata (author, counts).

#### `PATCH /api/artifacts/:artifactId`
```json
{ "title": "Authentication Service", "status": "ACTIVE", "description": "Updated description" }
```

#### `DELETE /api/artifacts/:artifactId`

#### `GET /api/artifacts/:artifactId/relations`
Returns `{ incoming: Relation[], outgoing: Relation[] }`.

#### `GET /api/artifacts/:artifactId/versions`
Returns the version log for this artifact.

---

### 2.4 Relations

`RelationType`: `DEPENDS_ON | DOCUMENTS | IMPLEMENTS | USES | EXPOSES | BELONGS_TO | SECURES | VALIDATES | GENERATES | DEPLOYED_TO | COMMUNICATES_WITH`

#### `POST /api/artifacts/:artifactId/relations`
```json
{
  "targetArtifactId": "target-artifact-id",
  "relationType": "DEPENDS_ON",
  "description": "Authentication service depends on user database"
}
```

#### `DELETE /api/relations/:relationId`

---

### 2.5 Documentation

#### `GET /api/projects/:projectId/docs`
List of documentation artifacts (with linked-artifact stub).

#### `GET /api/artifacts/:artifactId/documentation`
```json
{ "success": true, "data": { "markdownContent": "# ..." }, "message": "OK" }
```

#### `PUT /api/artifacts/:artifactId/documentation`
```json
{ "markdownContent": "# Authentication Service\n\nThis service handles login..." }
```

---

### 2.6 API specs

#### `GET /api/projects/:projectId/api-specs`
List of API spec artifacts.

#### `POST /api/projects/:projectId/api-specs/import`
```json
{
  "name": "Authentication API",
  "format": "OPENAPI",
  "rawContent": "{... OpenAPI JSON or YAML ...}"
}
```
Backend parses and creates `API_ENDPOINT` artifacts. Returns the created spec.

#### `GET /api/api-specs/:apiSpecId`
Returns spec metadata + raw content.

#### `GET /api/api-specs/:apiSpecId/endpoints`
```json
{
  "success": true,
  "data": [{
    "id": "ep-...",
    "method": "POST",
    "path": "/auth/login",
    "summary": "Email + password login",
    "auth": false,
    "linkedArtifactId": "svc-auth",
    "validationStatus": "OK"
  }],
  "message": "Endpoints loaded"
}
```

---

### 2.7 Database models

#### `GET /api/projects/:projectId/database-models`

#### `POST /api/projects/:projectId/database-models`

#### `GET /api/database-models/:databaseModelId/entities`
```json
{
  "success": true,
  "data": [{
    "name": "users",
    "type": "TABLE",
    "fields": [
      { "name": "id", "type": "uuid", "isPrimaryKey": true, "isNullable": false },
      { "name": "email", "type": "varchar", "isUnique": true, "isNullable": false }
    ]
  }],
  "message": "Entities loaded"
}
```

---

### 2.8 Diagrams

`DiagramType`: `MERMAID | UML | ERD | ARCHITECTURE_FLOW | SEQUENCE | COMPONENT`

#### `GET /api/projects/:projectId/diagrams`
#### `POST /api/projects/:projectId/diagrams`
```json
{
  "title": "Authentication Flow",
  "diagramType": "SEQUENCE",
  "sourceCode": "sequenceDiagram\nUser->>Frontend: Login\nFrontend->>Backend: POST /login",
  "linkedArtifactIds": ["artifact-id-1"]
}
```
#### `GET /api/diagrams/:diagramId`
#### `PATCH /api/diagrams/:diagramId`
#### `DELETE /api/diagrams/:diagramId`

---

### 2.9 Knowledge graph

#### `GET /api/projects/:projectId/graph`
```json
{
  "success": true,
  "data": {
    "nodes": [{ "id": "artifact-id", "label": "Authentication Service", "type": "SERVICE", "status": "ACTIVE" }],
    "edges": [{ "id": "relation-id", "source": "artifact-id", "target": "target-id", "type": "DEPENDS_ON", "label": "depends on" }]
  },
  "message": "Graph loaded"
}
```

> **Frontend note:** the prototype hardcodes node positions in mock data. In production the backend should either return positions or the frontend should run a layout algorithm (force-directed via React Flow / d3-force) on first load and persist user adjustments.

---

### 2.10 Validation

`Severity`: `INFO | WARNING | ERROR | CRITICAL`
`Category`: `DOCUMENTATION | API | DATABASE | SECURITY | ARCHITECTURE | RELATIONSHIP | VERSIONING`
`IssueStatus`: `OPEN | RESOLVED | IGNORED`

#### `POST /api/projects/:projectId/validate`
Triggers a run. Returns immediately with a run id; emits `validation:completed` via WebSocket when done.

#### `GET /api/projects/:projectId/validation-issues?severity=&category=&status=`
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

#### `PATCH /api/validation-issues/:issueId`
```json
{ "status": "RESOLVED" }
```

---

### 2.11 Version history

`EntityType`: `ARTIFACT | RELATION | DOCUMENTATION | DIAGRAM | API_SPEC | EXPORT`
`ChangeType`: `CREATED | UPDATED | DELETED | LINKED | UNLINKED | VALIDATED | EXPORTED`

#### `GET /api/projects/:projectId/versions?entityType=&changeType=&changedBy=`
```json
{
  "id": "version-id",
  "entityType": "ARTIFACT",
  "entityId": "artifact-id",
  "changeType": "UPDATED",
  "oldValue": { "status": "DRAFT" },
  "newValue": { "status": "ACTIVE" },
  "changedBy": { "id": "user-id", "name": "Deyvid Popov" },
  "createdAt": "2026-05-26T10:00:00.000Z"
}
```

---

### 2.12 Export

`ExportFormat`: `JSON | MARKDOWN | PDF | ZIP`
`Section`: `REQUIREMENTS | ARTIFACTS | RELATIONS | GRAPH | API_SPECS | DATABASE_MODELS | DIAGRAMS | VALIDATION_REPORT | VERSION_HISTORY | SECURITY_POLICIES`

#### `POST /api/projects/:projectId/export`
```json
{
  "format": "ZIP",
  "sections": ["ARTIFACTS", "RELATIONS", "GRAPH", "API_SPECS", "DATABASE_MODELS", "DIAGRAMS", "VALIDATION_REPORT", "VERSION_HISTORY"]
}
```
Returns `{ id, status: "PENDING" }`. Emits `export:completed` when ready.

#### `GET /api/projects/:projectId/exports`
List of past exports for this project.

#### `GET /api/exports/:exportId/download`
Streams the file (or returns a signed URL).

---

### 2.13 Activity / dashboard

#### `GET /api/activity/recent?limit=10`
Returns recent actions across all projects the user can see (mocked as `ACTIVITY` in `src/data.jsx`).

---

## 3. WebSocket events

Connect after auth. Subscribe per project:

```json
{ "event": "project:subscribe", "payload": { "projectId": "project-id" } }
```

Events to handle:

| Event | Payload | Frontend reaction |
|---|---|---|
| `artifact:created` | `{ projectId, artifact }` | Insert into list cache; toast |
| `artifact:updated` | `{ projectId, artifactId, ...fields }` | Patch cache; toast if not self |
| `artifact:deleted` | `{ projectId, artifactId }` | Remove from cache |
| `relation:created` | `{ projectId, relation }` | Patch graph + artifact detail |
| `relation:deleted` | `{ projectId, relationId }` | Patch graph |
| `validation:completed` | `{ projectId, issueCount, issuesBySeverity }` | Refresh validation page; update status pill |
| `version:created` | `{ projectId, version }` | Prepend to versions feed |
| `export:completed` | `{ projectId, exportId, downloadUrl }` | Toast with "Download" CTA |

---

## 4. What's missing / out of scope

### Backend dependencies (must be built or mocked)
- [ ] **All REST endpoints above** — currently the prototype reads from in-memory mock data
- [ ] **WebSocket server** with the events above
- [ ] **OpenAPI parser** for `POST /api-specs/import` — needs to derive `API_ENDPOINT` artifacts from the uploaded spec
- [ ] **Validation engine** — rules for each `Category` listed above (currently: 9 hand-authored issues)
- [ ] **Export generator** — JSON / Markdown / PDF / ZIP packagers
- [ ] **Graph layout persistence** — if we keep hand-positioned nodes, decide where they live (artifact metadata or per-user)
- [ ] **Real auth + session management** — refresh tokens, MFA enrollment flow, session revocation

### Frontend gaps to fill before launch
- [ ] **State management** — replace in-memory mocks with React Query / Zustand against the API client (`/lib/api/*` per the contract)
- [ ] **Form validation** — Zod schemas + `react-hook-form` on every form (currently no validation, fields just submit)
- [ ] **Real graph engine** — swap the custom SVG canvas for **React Flow** as specified. The custom one renders well but doesn't handle node dragging, smart routing, or large graphs (>200 nodes) — current is a visual stand-in
- [ ] **Real Mermaid** — the hand-rolled `sequenceDiagram` / `flowchart` renderer covers ~80% of common syntax. Swap in `mermaid` from npm for full coverage (UML, ERD, state, gantt)
- [ ] **Search** — `⌘K` palette searches in-memory data; needs `GET /api/search?q=` (not in the contract — propose adding)
- [ ] **Permissions** — role gating on actions (delete project, manage tokens). Backend has `role` in user payload; frontend doesn't enforce yet
- [ ] **i18n** — the date in the artifact detail "Created" field is locale-formatted; no infrastructure for translated copy
- [ ] **Accessibility** — keyboard nav across the graph, ARIA on the drawer, focus traps on modals (some, not all, are in place)
- [ ] **Audit-log filtering by author** — the contract mentions `changedBy` filter; UI doesn't expose it yet
- [ ] **Empty / loading skeletons** — primitives exist (`<Empty>`, `<Skel>`); not every page wires them
- [ ] **Error boundaries** — none yet; a top-level boundary should wrap each route
- [ ] **Realtime presence** (settings toggle exists; the feature does not)
- [ ] **Comments & @-mentions** — settings page mentions notifications for them; no implementation
- [ ] **Bulk actions** — selecting many artifacts in the list view to delete / re-tag

### Endpoints the UI uses but the contract doesn't fully spell out
These came up while building. **Confirm with backend before assuming they exist.**

- `POST /api/projects/:projectId/api-specs/import` returning created endpoint artifacts (contract has the import payload but not the response shape)
- `GET /api/api-specs/:apiSpecId/endpoints` for the endpoint table on the spec detail page
- `GET /api/projects/:projectId/database-models` list endpoint (contract mentions models but not a list endpoint)
- `GET /api/artifacts/:artifactId/documentation` — read endpoint paired with the documented `PUT`
- `GET /api/artifacts/:artifactId/api-links` — what's shown on the Artifact › API Links tab; currently derived from relations
- A **search endpoint** for the `⌘K` palette

### Open product questions
1. **Project membership / sharing UI** — sidebar shows project members; no invite or role-management screen exists yet
2. **Diagram editor:** do we want WYSIWYG (drag boxes around) or stay code-first (current — Mermaid source ↔ preview)?
3. **API endpoint linking** — should endpoints auto-link to services on import, or always require manual confirmation?
4. **Multiple environments** — do `ENVIRONMENT` artifacts get a dedicated page (deployments view), or stay as nodes in the graph only?

---

## 5. File map

```
index.html              ── entry: fonts, tweaks defaults, script tags
src/
  styles.css            ── design tokens (light/dark), components, layout
  icons.jsx             ── Lucide-style SVG icon set
  data.jsx              ── mock dataset (artifacts, relations, issues, versions)
  ui.jsx                ── primitives (Btn, Card, Stat, Badge, Tabs, Drawer…)
  router.jsx            ── tiny hash router
  shell.jsx             ── Sidebar, Topbar, ⌘K command palette
  graph.jsx             ── Knowledge graph canvas + legend
  pages-core.jsx        ── auth, dashboard, projects list/new, settings
  pages-artifact.jsx    ── workspace, artifacts list/new/detail, docs
  pages-tools.jsx       ── API specs, database, diagrams, graph, validation, versions, export
  app.jsx               ── route table + tweaks panel mount
tweaks-panel.jsx        ── Tweaks panel scaffold
```

Mock data uses a fictional "Helix Commerce" platform (auth/orders/payments/inventory/search). Swap to your real data by replacing `src/data.jsx` (or, in production, by reading from the API client).
