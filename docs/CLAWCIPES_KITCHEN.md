# ClawRecipes Kitchen (UI)

ClawRecipes Kitchen is our UI for managing ClawRecipes workflows.

## What it’s for
- **Team dashboards** — backlog / in progress / testing / done (Kanban)
- Activity feed (high-level semantic events)
- Weekly scheduled-task view
- Global search across workspace + memory/docs + tasks
- Agent chat room
- Goals system (file-based source of truth)
- Approvals inbox + routing (e.g., Telegram)

## Status
ClawRecipes Kitchen is under active development. Team dashboards are available.

## How to run

**Prerequisites:**
- `openclaw` on `PATH`
- ClawRecipes plugin installed (`openclaw plugins add ./ClawRecipes`)
- OpenClaw config at `~/.openclaw/openclaw.json` (or `OPENCLAW_STATE_DIR` / `OPENCLAW_CONFIG_PATH` if set)
- `agents.defaults.workspace` set in OpenClaw config (e.g. via `openclaw config set agents.defaults.workspace ~/.openclaw/workspace-my-team-team`)
- At least one scaffolded team (e.g. `openclaw recipes scaffold-team development-team --team-id my-team-team --apply-config`). Or use **demo data** (button when no teams) to try the UI without OpenClaw.

**From the ClawRecipes repo root:**

```bash
npm run kitchen
```

This starts the Kitchen backend (Express on port 3456) and the Vite dev server (port 5174). Open:

- **http://localhost:5174** — Kitchen UI (dev mode with hot reload)
- **http://localhost:3456** — backend API; serves built frontend when running `npm start` in `kitchen/`

**Production simulation** (build + single-server, no Vite dev server; avoids dev-only vulnerabilities):

```bash
npm run kitchen:prod
```

Or from `kitchen/`:
```bash
npm run prod
```

Then open http://localhost:3456. The API and built frontend are served from the same process; no hot reload.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3456 | HTTP port for the Kitchen server |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | OpenClaw state directory (use if your config is elsewhere) |
| `NODE_ENV` | — | Set to `production` for production CORS (same-origin only) |
| `ACCESS_CONTROL_ALLOW_ORIGIN` | — | When `NODE_ENV=production`, if set, allows this origin for CORS (e.g. if frontend is on a different host) |

## API

- `GET /api/teams` — List teams
- `GET /api/teams/:teamId/tickets` — List tickets for a team (with titles from markdown)

Ticket cards show an "Open" button to open the ticket file in VS Code (`vscode://file/...`). This works when the browser allows the custom URL scheme; Cursor and VS Code will handle the open request.

**Demo mode** creates real ticket files under `kitchen/demo-data/workspace-demo-team/` on first load, so "Open" works for demo tickets too.
- `GET /api/health` — Returns `{ ok: true, openclaw: boolean }` for monitoring

## Relationship to the plugin
- The **ClawRecipes plugin** is CLI-first and works without any UI.
- ClawRecipes Kitchen is an optional UI companion for:
  - visibility (activity/search)
  - approvals
  - human review of plans and changes

## Roadmap (high level)
- Approvals UI (approve/deny + audit trail)
- Recipe browser and scaffold flows
- Team dashboards (backlog/in-progress/testing/done) — **implemented**
- Publishing workflow integration
