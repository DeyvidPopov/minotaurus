# Minotaurus — Next.js scaffold

The production frontend for the **Minotaurus SSOT Architecture Platform**, built per the implementation contract.

```
Next.js App Router · React 18 · TypeScript · Tailwind · React Flow · zustand · zod
```

> Sibling to the React design prototype in `../index.html` + `../src/`.
> The prototype is the **visual spec**; this directory is the **real codebase** to evolve.

---

## Quick start

```bash
cd nextjs
npm install
cp .env.example .env.local        # point NEXT_PUBLIC_API_URL at your backend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## What's wired

### Pages (all routed)

| Route | Status |
|---|---|
| `/` | ✅ Landing page (hero + live graph preview + workflow + features) |
| `/login`, `/register` | ✅ Auth (form validation via Zod + react-hook-form) |
| `/dashboard` | ✅ Stats, project cards, activity feed |
| `/projects` | ✅ Filter, sort, card grid |
| `/projects/new` | ✅ Form (template chooser) |
| `/projects/[projectId]` | ✅ Workspace overview + quick actions + embedded graph |
| `/projects/[projectId]/artifacts` | ✅ Filterable artifact table |
| `/projects/[projectId]/artifacts/new` | ✅ Create form |
| `/projects/[projectId]/artifacts/[artifactId]` | ✅ 5-tab detail view (overview, relations, doc, validation, history) |
| `/projects/[projectId]/graph` | ✅ Full React Flow knowledge graph with type filter + selection drawer |
| `/projects/[projectId]/validation` | ✅ Severity tiles + filterable issue table |
| `/projects/[projectId]/docs`, `…/api`, `…/database`, `…/diagrams`, `…/versions`, `…/export` | 🟡 Stub (placeholder pages — see prototype for full UI) |
| `/settings` | 🟡 Stub |

### Cross-cutting

- **Theme** (light / dark) + **density** + **font pair** + **sidebar mode** + **accent color** all via Zustand store, persisted to `localStorage`, applied as `<html>` data-attributes
- **Sidebar** with global + project sub-nav, **off-canvas mobile drawer**
- **Topbar** with breadcrumbs, ⌘K search trigger, theme toggle
- **Command palette** (⌘K / Ctrl+K) indexing pages, projects, artifacts
- **Knowledge graph** powered by **React Flow** with custom node types, position drag persistence per project, minimap, type filter
- **Toast notifications** via `sonner`
- **Tailwind** with the same design tokens as the prototype (CSS variables for theme switching)

---

## Architecture

```
nextjs/
├── app/                              # App Router
│   ├── layout.tsx                    # root HTML + fonts + providers
│   ├── globals.css                   # design tokens + Tailwind
│   ├── page.tsx                      # public landing
│   ├── not-found.tsx
│   ├── (auth)/                       # auth route group — no shell
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── (app)/                        # authenticated route group — has sidebar+topbar
│       ├── layout.tsx                # wraps with <AppShell>
│       ├── dashboard/page.tsx
│       ├── projects/                 # …list, new, [projectId]/…
│       └── settings/page.tsx
├── components/
│   ├── providers.tsx                 # theme/tweaks store + sonner toaster
│   ├── shell/                        # Sidebar, Topbar, CmdK, AppShell
│   ├── graph/                        # GraphCanvas (React Flow), GraphLegend
│   └── ui/                           # Button, Card, Stat, Badge, Tabs, Drawer, …
├── lib/
│   ├── types.ts                      # shared DTOs (mirror the API contract)
│   ├── utils.ts                      # cn(), timeAgo(), truncate()
│   ├── api/
│   │   ├── client.ts                 # central fetch wrapper (Bearer token, envelope)
│   │   ├── projects.ts
│   │   ├── artifacts.ts              # + relations
│   │   └── index.ts                  # graph, validation, versions, export
│   ├── ws.ts                         # WebSocket client stub
│   ├── mock-data.ts                  # placeholder data (swap for API calls)
│   └── mock-data-extra.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── next.config.mjs
└── package.json
```

---

## Replacing mock data with real API

Mock data lives in `lib/mock-data.ts`. Every page currently imports from it directly. To switch to live API calls:

1. Build the backend per `../FRONTEND_UI_IMPLEMENTATION_CONTRACT.md`
2. Set `NEXT_PUBLIC_API_URL` in `.env.local`
3. In each page, replace `import { PROJECTS } from "@/lib/mock-data"` with a `useSWR`/`useQuery` hook calling `projectsApi.list()` etc. from `@/lib/api`
4. Wire the WebSocket client (`@/lib/ws`) in a top-level effect to subscribe to project updates

The API client (`lib/api/client.ts`) already handles:
- Bearer token attachment (call `setAccessToken(jwt)` after login)
- The standard `{ success, data, message }` response envelope
- Typed methods per resource (`projectsApi`, `artifactsApi`, `relationsApi`, `graphApi`, `validationApi`, `versionsApi`, `exportApi`)

---

## Frontend-only TODOs (port from the prototype)

Items that exist in `../src/pages-tools.jsx` and `../src/pages-artifact.jsx` but aren't in this scaffold yet:

- [ ] Documentation list + markdown editor with live preview (port `DocsListPage` + `DocDetailPage`)
- [ ] API specs grid + spec detail with endpoint table + drawer
- [ ] Database model viewer (entities, fields, PKs/FKs)
- [ ] Diagrams list + editor with Mermaid preview
- [ ] Version history timeline
- [ ] Export SSOT wizard (format + sections + preview)
- [ ] Settings page tabs (profile, workspace, notifications, tokens, danger zone)
- [ ] Tweaks panel UI inside the app shell (the store + persistence are wired; only the panel UI needs porting)
- [ ] Real Mermaid via the `mermaid` npm package
- [ ] Pinch-to-zoom on touch devices for the graph (React Flow handles touch but verify on iOS)

---

## Design tokens

All tokens are CSS variables on `<html>` so theme switching is instant:

```css
--bg / --bg-2 / --panel / --panel-2 / --panel-hover     /* surfaces */
--border / --border-strong                              /* dividers */
--fg / --fg-muted / --fg-subtle                         /* text */
--accent / --accent-soft / --accent-fg / --accent-ring  /* brand */
--c-success / --c-warning / --c-danger / --c-info       /* semantic */
--font-sans / --font-mono                               /* type */
--d-pad / --d-gap / --d-fs                              /* density */
--r-sm / --r-md / --r-lg                                /* radius */
```

Tailwind classes that reference these (`bg-panel`, `border-border`, `text-fg-muted`, `rounded-lg`, etc.) are defined in `tailwind.config.ts`.

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

## License

Diploma project — Deyvid Popov · minotaurus.dev
