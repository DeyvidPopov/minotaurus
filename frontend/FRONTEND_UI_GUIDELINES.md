# Minotaurus — Frontend UI / UX Guidelines

> Companion to `FRONTEND_UI_IMPLEMENTATION_CONTRACT.md` (which defines **what** the UI must show + the API contracts).
> This doc defines **how** the UI should look, behave, and respond across screen sizes — and inventories the reusable components.
> Backend behavior is unchanged; this is **frontend-only** documentation.

---

## 1. Design intent

Minotaurus should feel like **engineering infrastructure**, not an admin dashboard.

| Yes | No |
|---|---|
| Linear · Vercel · GitHub · Grafana · Neo4j | Marketing template · crypto dashboard · generic admin |
| Subtle borders · soft neutrals · typed badges | Heavy shadows · gradients everywhere · drop-shadow icons |
| Graph + traceability as first-class | Tables as the only metaphor |
| Dark-mode-first, light-mode parity | Either-or |
| Keyboard-first (⌘K) | Mouse-only |

---

## 2. Visual tokens

All tokens live as CSS custom properties in `src/styles.css` and switch automatically by `data-theme="light|dark"` on `<html>`.

### Surfaces
- `--bg` page background
- `--panel` primary card surface
- `--panel-2` nested elevation
- `--panel-hover` hover background
- `--border` / `--border-strong` 1px dividers

### Foreground
- `--fg` primary text
- `--fg-muted` secondary (labels, captions)
- `--fg-subtle` tertiary (placeholder, low-importance)

### Accent (user-tunable)
- `--accent` brand color (Tweaks panel)
- `--accent-soft` 14% tint
- `--accent-ring` focus ring
- `--accent-fg` text on accent fills

### Semantic
- `--c-success` / `--c-warning` / `--c-danger` / `--c-info` / `--c-purple` / `--c-pink` plus `*-soft` tints

### Per-artifact-type
Each artifact type maps to a color via class `.t-{TYPE}` exposing `--t-color` and `--t-soft`. Used by `<TypeChip>`, graph nodes, and inline icons. The mapping (SERVICE blue, API_SPEC purple, DATABASE green, DOCUMENTATION amber, DIAGRAM pink, REQUIREMENT cyan, SECURITY red, ENVIRONMENT slate, EXTERNAL light slate) is intentional and consistent across the app.

### Type
- `--font-sans` — Geist by default; user can pick Inter or IBM Plex Sans
- `--font-mono` — Geist Mono / JetBrains Mono / IBM Plex Mono (paired with the sans choice)
- Numerals are tabular by default for table alignment.

### Density (user-tunable)
`data-density="compact|regular|comfy"` swaps row heights, paddings, gaps and font sizes via CSS variables. **All layout uses these variables** — no fixed pixel paddings.

### Radius
`--r-xs 4px` / `--r-sm 6px` / `--r-md 8px` / `--r-lg 10px` / `--r-xl 14px`. Pick by element size: chip < button < card < modal.

---

## 3. Layout rules

### Spacing scale
Use multiples of 4: 4, 8, 12, 16, 20, 24, 32, 48, 64. `gap` over margins. `display: flex; gap: 8px` for chip rows; `display: grid; gap: 16px` for cards.

### Page width
- Default page width: `max-width: 1320px` (`.content-inner`)
- Wide pages (artifacts list, validation, versions): `.content-inner.wide` — no max width, but 32px gutters
- Full-bleed (graph): `.content-inner.full` — no padding, fills viewport
- Form pages (new artifact, new project): explicit `max-width: 720px`

### Grid system
`.grid.cols-{2|3|4}` — responsive utility classes that collapse:
- `cols-4` → 2 cols < 1100px → 1 col < 720px
- `cols-3` → 2 cols < 1100px → 1 col < 720px
- `cols-2` → 1 col < 720px

### Tables
- Sticky `<thead>` with uppercase 11.5px labels
- Row-level click via `tr.row-link`
- Cells use `padding: 12px 14px` (compact mode reduces it)
- Mobile: tables get a horizontal scroll wrapper

### Cards
Three densities of card content:
1. `<Card>` with header (`title` + `action`) and `padded` content body
2. `<Card padded={false}>` for tables / lists that have their own padding
3. `<Stat>` for KPI tiles

---

## 4. Responsive behavior

### Breakpoints
- `< 600px` — phone
- `600 – 720px` — large phone / small tablet (still "mobile" rules)
- `720 – 1024px` — tablet
- `1024 – 1320px` — small desktop
- `≥ 1320px` — full desktop

### Sidebar
| Mode | Desktop | Tablet | Mobile (<720px) |
|---|---|---|---|
| Expanded | 232px column, all labels | 200px column | Off-canvas drawer (280px), slides in over scrim |
| Icons only | 56px column, tooltips on hover | same | Same drawer as expanded (mobile always shows full labels) |
| Floating | Detached card, 232px | Detached, 200px | Off-canvas drawer |

Drawer state driven by `body[data-mobile-nav="open"]`. Hamburger button (`.tb-hamburger`) only appears in topbar on `< 720px`.

### Topbar
- Desktop: breadcrumbs · search field · validation pill · theme · bell · tweaks
- Tablet: same, search slightly narrower
- Mobile: hamburger · current-page breadcrumb only · theme · bell · tweaks (search collapses into ⌘K palette, validation pill hidden)

### Content padding
- Desktop: 28px 32px (regular) / 24px 32px (wide) / 36px 40px (comfy density)
- Tablet: 22px 22px
- Mobile: 16px 14px

### Page header
- Desktop: title + sub-title left, actions right, single row
- Mobile: actions wrap below title, full-width search inputs, selects shrink to 50%

### Tabs
- Desktop: horizontal tab list
- Mobile: horizontal **scroll** (no wrap) — fingers swipe

### Drawers
- Desktop: 380–520px right-side slide-in with backdrop
- Mobile: 100vw full-screen drawer

### Forms
- Multi-column field rows (`grid cols-2`) on desktop
- Single column < 720px

### Graph
- Desktop: full canvas + 220px legend overlay top-left + zoom controls bottom-left
- Tablet: same, slightly smaller controls
- Mobile: legend collapses to 184px, controls bigger (32×32 hit targets), pan via touch drag, zoom via pinch *(touch pinch zoom is a UI-only TODO — see §9)*

### Tables on mobile
Cards wrap tables, the card itself scrolls horizontally. Header cells stay sticky. Consider a `Show as cards` toggle for the long ones in a future iteration.

---

## 5. Component inventory (reusable)

All primitives live in `src/ui.jsx` and are exposed on `window` so any page script can use them without imports.

### Layout
- `<PageHeader title subtitle eyebrow actions>` — standard top-of-page block, handles wrap
- `<FilterBar>` — wraps a row of filter controls with mobile wrap
- `<Card title subtitle action padded>` — every page uses this
- `<Stat label value delta deltaDir icon spark>` — KPI tile with sparkline
- `<Tabs value onChange tabs>` — supports `count` badge on each tab; scrolls on mobile
- `<Segmented value onChange options>` — pill-style toggle (3-up max)
- `<Drawer open onClose title width footer>` — right-side slide-in; full screen on mobile

### Inputs
- `<SearchInput value onChange placeholder width>` — icon + input combo, used everywhere
- Plain `.input`, `.select`, `.textarea` for raw form fields
- `<Toggle defaultOn onChange>` — settings page binary
- `<Btn variant size icon iconRight>` — `default | primary | ghost | danger`

### Status / labels
- `<Badge tone mono square>` — neutral default; tones map to semantic colors
- `<TypeChip type>` — typed pill, color-coded per artifact type
- `<StatusBadge status>` — ACTIVE / DRAFT / DEPRECATED / OPEN / RESOLVED / IGNORED / READY
- `<MethodBadge method>` — HTTP method (color per verb)
- `<SeverityBadge severity>` — CRITICAL / ERROR / WARNING / INFO

### Identity / brand
- `<Avatar user size>` — initials in neutral circle
- `<ProjectMark color size letter>` — gradient cube for projects

### State views
- `<Empty icon title message action>` — shown when a list returns 0 items
- `<Skel w h r>` — animated skeleton block

### Feedback
- `<ToastProvider>` + `useToast()` — call `toast("Done")` from any handler
- `pulse-ring` keyframe for new-selection animations

### Rendering
- `renderMarkdown(src)` — headings, lists, links, code, tables, blockquotes, mermaid blocks
- `<MermaidBlock source>` — auto-detects `sequenceDiagram` / `flowchart` and renders a stylized version. **Stand-in for the real `mermaid` package** — swap before launch (see §9)

### Graph
- `<GraphCanvas artifacts relations selectedId onSelect nodeStyle typeFilter edgeFilter search initialZoom autoFit>` — the workhorse canvas
- `<GraphLegend typeFilter onToggle counts>` — type filter sidebar

### Shell (in `src/shell.jsx`)
- `<Sidebar projectId route>` — global + project nav
- `<Topbar route projectId onOpenSearch onOpenMobileNav onToggleTheme onToggleTweaks theme>`
- `<CmdK open onClose>` — ⌘K palette

---

## 6. Page-level UX rules

### Landing (`/`)
- Hero with single H1, single subtitle, one primary CTA + one secondary
- Live graph preview using real reference data (not a static image)
- Workflow band: 4-step ingest → connect → validate → export
- Feature grid: 3×3, no marketing fluff — concrete capability claims
- Footer minimal

### Dashboard
- Greet + summary headline ("You have N open issues across M projects")
- 4 KPI stat tiles with sparklines, then project cards, then activity feed + table
- Each project card lifts on hover (border-color change, no shadow)

### Workspace overview (`/projects/:id`)
- Project mark + name + status badge + meta row
- 6 quick-action tiles (artifact / API / docs / graph / validation / export)
- Live mini-graph (auto-fit) + validation snapshot + recent changes
- Composition row: artifact type tally with mini bars

### Knowledge graph (`/projects/:id/graph`)
- Compact header bar (title, find, node-style segmented, validate, create-relation)
- Auto-fit on mount
- Click empty space to deselect; click node to open right drawer
- Hover dims non-neighbors to 18%
- Filters affect both nodes and the edges between them
- Three node styles for different use cases:
  - **Shape** — node geometry encodes type (default for power users)
  - **Color** — uniform rounded rect, color bar encodes type (most legible)
  - **Minimal** — dots only (for very large graphs, layout review)

### Artifact detail
- Eyebrow row: type chip + status badge + tags
- Title + description
- Meta row: author + created + updated + id (mono)
- 7 tabs with counts: Overview / Relations / Documentation / API Links / Diagrams / Validation / History
- Overview = mini-graph + metadata sidebar + outgoing-relations list
- Tab content stays in the same scroll context; no double scrolling

### Documentation editor
- Three view modes: Edit · Split · Preview (segmented)
- Autosave indicator next to the Save button
- Linked-artifact badge stays visible

### API specs
- Card grid summarizing methods + endpoint counts + linked services
- Spec detail = endpoint table; click row opens an inspector drawer (request/response/auth)

### Database model
- Left column lists databases; right column shows entities for the selected DB
- Entities render as small cards with a field table inside
- PK / FK / unique are inline indicators

### Validation
- 4 severity tiles at top
- Filters: severity · category · status
- Issue rows are clickable → go to the affected artifact's Validation tab
- Resolve / Ignore are inline row actions

### Versions
- Vertical timeline with per-change diff card
- Filters: entity type · change type
- Author avatars in-line

### Export
- 3-step wizard inside one page: Format → Sections → Preview
- Generate button shows progress; download appears when ready
- Past exports list at right with format/size/author/age

---

## 7. Interaction rules

### Keyboard
- `⌘K` (Mac) / `Ctrl+K` (Win) opens the command palette from anywhere
- `↑ / ↓` navigate palette results, `↵` opens, `Esc` closes
- Focus rings: 2px `var(--accent-ring)` outline, offset 1px

### Mouse
- 80ms ease on hover state changes (background, border, color)
- 220ms cubic-bezier (.32, .72, .36, 1) for drawer slide
- Click feedback: no scale transform; just the border / background change

### Loading
- Skeleton blocks (`<Skel>`) match the final element's shape — never spinners over a card
- Toasts (`useToast`) auto-dismiss after 2.4s

### Empty states
- Always include an explanation + a primary action button
- Icon, title, body, action — in that order

### Errors
- Toast for transient errors ("Failed to save · retry")
- Empty-state variant for page-level failures with a `Retry` button
- Validation errors inline next to the field

---

## 8. Mobile-specific rules

1. **No horizontal page scroll, ever.** All content adapts.
2. **Sidebar is a drawer.** Hamburger in topbar opens it; tapping a link or the scrim closes it.
3. **Tables scroll horizontally inside the card,** not the page.
4. **Tabs scroll horizontally,** never wrap.
5. **Drawers fill the screen** (100vw) — no narrow side panel on a 360px phone.
6. **Form rows stack** to single column.
7. **Button rows wrap** with `flex-wrap` + 6px row gap.
8. **Truncation everywhere:** breadcrumbs hide all but the current crumb; long titles ellipsis.
9. **Graph touch:** drag to pan works today; pinch-to-zoom is a TODO (currently zoom via the +/− buttons).

---

## 9. Remaining UI-only TODOs

These are frontend issues that need attention before a public release. **None require backend work** — they're pure UX / interaction polish or library swaps.

### High priority
- [ ] **Real React Flow integration.** Current graph is a custom SVG canvas; React Flow gives free node-drag, smart edge routing, minimap, better large-graph perf, and matches the spec.
- [ ] **Real `mermaid` library.** Hand-rolled renderer covers ~80% of sequence + flowchart syntax; doesn't cover state, gantt, classes, gitGraph, mindmap.
- [ ] **Pinch-to-zoom on graph.** Touch drag works; need to wire `Pointer` events with multi-touch distance for mobile zoom.
- [ ] **Real form validation.** Add Zod schemas + `react-hook-form` per the implementation contract.
- [ ] **Error boundaries** around each route — currently a child crash blanks the whole shell.

### Medium priority
- [ ] **Bulk actions** on artifacts list (multi-select rows → archive / re-tag / delete)
- [ ] **Persistent column visibility** on tables (let user hide columns)
- [ ] **Saved filters / views** on artifacts and validation
- [ ] **@-mention autocomplete** in markdown editor
- [ ] **Realtime presence avatars** on artifact detail (settings toggle already exists)
- [ ] **Skeleton loading states** wired to every page (primitives exist, only some pages use them)
- [ ] **Hover preview cards** on artifact links (peek at type/status/relations without navigating)

### Polish
- [ ] **Reduced-motion** support (`prefers-reduced-motion`) — kill drawer slide and skel shimmer
- [ ] **High-contrast pass** (WCAG AA on muted text in light theme — some borderline cases)
- [ ] **Logo / favicon** beyond the placeholder "A" mark
- [ ] **Onboarding** when a project has zero artifacts (current empty state is generic)
- [ ] **Print stylesheet** for the Export › PDF preview path

### Endpoints the UI uses but the contract under-specifies
*(carried over from `FRONTEND_SPEC.md`; backend should confirm these shapes before frontend wires them to the API client)*
- Response shape of `POST /api-specs/import` (parsed endpoint list)
- `GET /api-specs/:id/endpoints`
- `GET /api/database-models` list endpoint
- `GET /api/artifacts/:id/documentation` (read pair for the documented `PUT`)
- `GET /api/search?q=` for the ⌘K palette

---

## 10. File map (UI-relevant)

```
index.html
src/
  styles.css             — tokens, components, layout, responsive
  icons.jsx              — Lucide-style icon set, single source of truth
  data.jsx               — mock data (replace with API calls)
  ui.jsx                 — primitives (Btn, Card, Stat, Badge, Tabs, Drawer, PageHeader, FilterBar, SearchInput…)
  router.jsx             — hash router + matchRoute helper
  shell.jsx              — Sidebar, Topbar, CmdK palette
  graph.jsx              — GraphCanvas + GraphLegend
  pages-landing.jsx      — public landing page at `/`
  pages-core.jsx         — auth, dashboard, projects, settings
  pages-artifact.jsx     — workspace, artifacts, docs
  pages-tools.jsx        — API, database, diagrams, graph, validation, versions, export
  app.jsx                — route table, Tweaks panel, theme/density sync
tweaks-panel.jsx         — Tweaks panel scaffold (theme, accent, density, sidebar, fonts, graph)
```
