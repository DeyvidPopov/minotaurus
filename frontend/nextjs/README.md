# Minotaurus — Frontend

Next.js App Router · React 18 · TypeScript · Tailwind · React Flow · Mermaid · Zustand · Zod

The frontend talks to the Express backend in `../../backend` over HTTP through the typed wrappers in `lib/api/`. All persistence is in PostgreSQL on the backend; the frontend stores nothing except theme preferences and the JWT.

---

## Quick start

```bash
cd frontend/nextjs
npm install
# Optional: override the API base URL in .env.local
echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api' > .env.local
npm run dev
```

Open <http://localhost:3000>. Login with the seeded demo user:

```
Email:    deyvid@minotaurus.dev
Password: minotaurus
```

(Make sure the backend is running and seeded — see `../../backend/README` or `../../docs/AI_CONTEXT/CURRENT_STATE.md`.)

---

## What's implemented

Every route below is functional and backed by real Postgres data:

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/login`, `/register` | Auth (Zod + react-hook-form) |
| `/dashboard` | Stats + demo callout + project cards + first-run "what does this do?" card |
| `/projects` | Filterable / sortable project grid |
| `/projects/new` | Create form |
| `/projects/[id]` | Workspace overview: mini-graph, validation snapshot, quick actions |
| `/projects/[id]/artifacts` | Filterable artifact table |
| `/projects/[id]/artifacts/new` | Create form |
| `/projects/[id]/artifacts/[id]` | Tabs: Overview / Relations / Documentation / Validation, plus Linked resources panel |
| `/projects/[id]/api` | API specs list |
| `/projects/[id]/api/[specId]` | Spec detail with endpoint table + OpenAPI-like preview |
| `/projects/[id]/database` | Database models list |
| `/projects/[id]/database/[modelId]` | Tabs: Entities (CRUD) / ERD view (visual Mermaid) / Mermaid source |
| `/projects/[id]/diagrams` | Diagrams list |
| `/projects/[id]/diagrams/[id]` | Split editor + live Mermaid preview, template picker, fullscreen |
| `/projects/[id]/graph` | React Flow knowledge graph with type filter + selection drawer |
| `/projects/[id]/validation` | Severity tiles + filterable issue table |
| `/projects/[id]/versions` | Version-event timeline grouped by day |
| `/projects/[id]/impact/[artifactId]` | Per-artifact blast radius |
| `/projects/[id]/export` | Create / preview / download SSOT export |
| `/settings` | Profile + password (live), Workspace (local prefs), Notifications / API tokens / Delete account (clearly marked Coming next) |

### Not implemented (and labelled honestly in the UI)

- File / OpenAPI / repo import — manual modelling only
- AI suggestions / assistants
- WebSocket live updates / notifications
- Project members + RBAC
- Avatar upload
- PDF / ZIP export rendering on the server (formats are accepted; payload is the same JSON content)

Standalone routes `/projects/[id]/docs` and `/projects/[id]/docs/[id]` are intentionally stubbed — Markdown documentation lives **inside** each artifact's detail page (Documentation tab), so there is no project-wide docs index.

---

## Architecture

```
frontend/nextjs/
├── app/
│   ├── layout.tsx                  # root HTML + providers + Toaster
│   ├── globals.css                 # design tokens, Mermaid host styles, prose-markdown
│   ├── page.tsx                    # public landing
│   ├── (auth)/login,register       # forms
│   └── (app)/                      # AuthProvider-wrapped workspace
│       ├── layout.tsx              # <AppShell> = Sidebar + Topbar + body
│       ├── dashboard/
│       ├── settings/
│       └── projects/...            # every workspace route
├── components/
│   ├── providers.tsx               # Zustand "tweaks" store (theme/font/accent/graph-node-style) + Sonner
│   ├── shell/                      # AppShell, Sidebar, Topbar, CmdK
│   ├── graph/                      # GraphCanvas (React Flow), GraphLegend
│   ├── documentation-editor.tsx    # Markdown editor with live preview
│   ├── mermaid-preview.tsx         # Lazy-loaded Mermaid renderer with theme + label scan
│   ├── export-preview.tsx          # Structured SSOT export preview
│   └── ui/                         # Button, Card, Stat, Badge, Tabs, Drawer, …
├── lib/
│   ├── auth-context.tsx            # useAuth() + AuthProvider
│   ├── types.ts                    # shared DTO types
│   ├── utils.ts
│   └── api/                        # typed wrappers per resource
│       ├── client.ts               # central fetch + Bearer token + envelope unwrapping
│       ├── auth, projects, artifacts, documentation,
│       │   api-specs, database-models, diagrams, versions
└── lib/mock-data.ts                # design-token tables (TYPE_INFO, EDGE_COLOR) only —
                                    # no mock business data is rendered to users
```

The API client (`lib/api/client.ts`) handles JWT attachment, the `{ success, data, message }` envelope, and surfaces backend error messages as `ApiError`. Pages import the typed wrappers (`projectsApi`, `artifactsApi`, `diagramsApi`, `versionsApi`, etc.) rather than calling fetch directly.

---

## Cross-cutting features

- **Theme** (dark default; light supported on authenticated pages only), font, accent color and graph node style live in Zustand and persist to localStorage.
- **Sidebar** dynamically loads project name + per-project sub-nav (Artifacts / Graph / API Specs / Database / Diagrams / Validation / Version History / Export).
- **Topbar** breadcrumbs lookup real artifact / project / API spec / DB model / diagram titles by id. Theme toggle in the right corner.
- **Command palette** (⌘K / Ctrl+K) — quick-jump to dashboard, projects list, and any project. (Not a full artifact index.)
- **Knowledge graph** — React Flow with custom node types, drag-to-reposition (persisted per project in localStorage), minimap, type filter, selection drawer.
- **Mermaid** — lazy-loaded, dark-themed, with a syntax-status pill that turns green / yellow as you type. Used by the Diagrams editor, the Database Model ERD view, and the Export preview.
- **Toasts** via `sonner`.

---

## Scripts

```
npm run dev        # dev server with HMR
npm run build      # production build
npm run start      # serve production build
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
```

---

## Design tokens

All tokens are CSS variables on `<html>` so theme switching is instant:

```
--bg / --bg-2 / --panel / --panel-2 / --panel-hover    surfaces
--border / --border-strong                             dividers
--fg / --fg-muted / --fg-subtle                        text
--accent / --accent-soft / --accent-fg / --accent-ring brand
--c-success / --c-warning / --c-danger / --c-info      semantic
--font-sans / --font-mono                              type
```

Tailwind classes (`bg-panel`, `border-border`, `text-fg-muted`, …) are defined in `tailwind.config.ts`.

---

## License

Diploma project — Deyvid Popov · minotaurus.dev
