# Known Limitations

Living list of trade-offs and partial implementations in the current MVP. Update on every feature pass.

## Persistence
- JSON file store at `backend/src/db/data.json`. Single-process, last-write-wins, no concurrent-write safety. Acceptable for the demo; not for multi-tenant production.
- Re-seeding (`npm run seed`) while the backend is running overwrites disk but the in-memory cache stays stale. Restart the backend after seeding.

## Auth
- Single-tenant. Project access is gated by `ownerId === userId`. No member/role tables, no organization scoping.
- No refresh tokens, no password reset, no email verification.
- Changing the password does **not** invalidate existing JWTs — they remain valid until they expire (default 7d).
- Email changes via `PATCH /auth/me` take effect immediately with no verification flow.

## Graph
- `/api/projects/:id/graph` only emits artifact nodes. API specs, database models, and diagrams are **not** native graph nodes by design (to keep the graph contract stable). Navigation between them goes via the artifact detail page's **Linked resources** card.
- React Flow node positions are persisted in localStorage per-user, not on the server.

## Documentation
- One Markdown page per artifact. No history, no concurrent-edit locking. Last save wins.
- `documentation.updatedAt` reuses the artifact's `updatedAt`; there is no doc-only timestamp yet.

## API Specs
- Validation rule "endpoint `requiresAuth=false` on a security-related spec" uses a title heuristic and produces false positives on legitimate bootstrap endpoints (`/login`, `/register`). Use Resolve / Ignore on the validation page to dismiss.
- No OpenAPI import/parse — schemas are stored as free-text strings.
- Allowed methods are `GET / POST / PUT / PATCH / DELETE` only.

## Database Models
- Entity/field operations are CRUD only. No migrations, no schema diff, no constraint generation.
- FK targets must live in the same database model. Cross-model references are not supported.
- ERD preview is auto-generated as Mermaid `erDiagram` and rendered client-side; not exportable as a standalone SVG by the server.

## Diagrams
- Mermaid is rendered client-side (lazy-loaded, ~1MB on first hit). No server-side SVG generation.
- `securityLevel: "strict"` is set on the Mermaid initializer — some click/href bindings are stripped by design.
- The "Invalid Mermaid syntax" validation rule is a tiny heuristic (header keyword + arrow token), not a real parser. The real syntax check happens client-side when Mermaid renders the source.
- ARCHITECTURE diagrams without a linked artifact produce an INFO-severity issue. Intentional nudge, can be ignored.
- No undo / version history on the editor. Save persists the current source; previous versions are not retained.
- **Label visibility (FIXED, see release notes):** Mermaid `fontFamily` no longer references CSS variables; concrete `themeVariables` ensure light text on dark background. Templates and seeded sources use explicit quoted node labels (`Client["Client"]`). ERD generator pads empty entity bodies with a `_empty` placeholder and always emits a non-empty relationship label. A post-render label scan warns when an SVG renders without any visible text content.
- Custom themes beyond dark are not supported — `themeVariables` are tuned for the platform's dark card background only.

## Validation
- Validation runs replace **all** prior issues for the project. No append/diff mode. Resolved/ignored statuses survive only until the next `POST /validate` run.
- No "Run on save" — validation only fires when the user clicks **Run validation** or the seed runs it.

## Export
- Snapshots are stored at creation time. Editing artifacts/docs/specs/diagrams after export does **not** update the stored export — re-export to refresh.
- Export `MARKDOWN` format renders documentation and Mermaid blocks; `PDF` and `ZIP` are accepted but render the same payload (no PDF generation).
- No download endpoint — preview page builds a blob client-side.

## Frontend
- `useTweaks` (theme / density / sidebar / graph node style) is browser-local Zustand state. Not synced to the backend.
- No avatar upload. The "Upload photo" button on Settings is wired to nothing.
- No notifications backend. The Notifications tab on Settings is disabled stubs.
- No API tokens module yet. The API tokens tab is a "coming next" placeholder.

## Versioning / History (Phase 5 — shipped)
- Implemented in `backend/src/modules/versions/`. Every CUD action on artifacts,
  relations, documentation, API specs/endpoints, DB models/entities/fields,
  diagrams, exports and validation runs writes a `VersionEvent`.
- **No diff or before/after snapshots.** Events carry `metadata` (changed field list,
  status, severity histogram for validations) but the previous values are not stored.
  Restoring an older state of an artifact is not possible.
- **No retention policy.** Events accumulate indefinitely in `data.json`. For a long-running
  demo this is fine; for a real deployment, add archival.
- **`VERSIONING` validation category remains unused.** The three new architecture-intelligence
  rules (excessive deps, recent churn, deprecated-but-referenced) live under the existing
  `ARCHITECTURE` category. Reserved for a future "stale version" rule.
- **Seed events are backdated** with synthetic timestamps. Real runtime events get the
  actual current time.

## Impact Analysis (Phase 5 — shipped)
- Endpoint: `GET /api/projects/:projectId/impact/:artifactId`. Page:
  `/projects/<id>/impact/<artifactId>`. Available via "Analyze impact" on the artifact
  detail page.
- **Direct traversal only (depth = 1).** Transitive impact ("what depends on X, plus
  what depends on those, …") is not computed. Brief explicitly forbade this.
- **No scoring or ranking.** Returned lists are raw — no severity weighting, no
  blast-radius metric beyond count tiles.
- **Documentation surface** = the target's own `documentationContent` plus any
  DOCUMENTATION-typed artifact that has a `DOCUMENTS` relation to the target. Free-text
  references to the artifact inside other docs are not detected.

## Misc
- The "Ask Minotaurus" dashboard button is a static label — no AI integration.
- The CmdK palette only indexes static pages + projects fetched lazily on open. It does not index artifacts/specs/diagrams.
