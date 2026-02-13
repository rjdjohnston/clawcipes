# Clawcipes (OpenClaw Recipes Plugin)

<p align="center">
  <img src="./clawcipes_cook.jpg" alt="Clawcipes logo" width="240" />
</p>

Clawcipes is an OpenClaw plugin that provides **CLI-first recipes** for scaffolding specialist agents and teams from Markdown.

If you like durable workflows: Clawcipes is built around a **file-first team workspace** (inbox/backlog/in-progress/testing/done) that plays nicely with git.

## Quickstart
### 1) Install
#### Option A (preferred): install from npm
Once published:

```bash
openclaw plugins install @clawcipes/recipes
openclaw gateway restart
openclaw plugins list
```

#### Option B: install from GitHub
```bash
git clone https://github.com/rjdjohnston/clawcipes.git ~/clawcipes
openclaw plugins install --link ~/clawcipes
openclaw gateway restart
openclaw plugins list
```

### 2) List available recipes
```bash
openclaw recipes list
```

### 3) Scaffold a team
```bash
openclaw recipes scaffold-team development-team \
  --team-id development-team-team \
  --overwrite \
  --apply-config
```

### 4) Dispatch a request into work artifacts
```bash
openclaw recipes dispatch \
  --team-id development-team-team \
  --request "Add a new recipe for a customer-support team" \
  --owner lead
```

## Commands (high level)
- `openclaw recipes list|show|status`
- `openclaw recipes scaffold` (agent → `workspace-<agentId>`)
- `openclaw recipes scaffold-team` (team → `workspace-<teamId>` + `roles/<role>/`)
- `openclaw recipes install <idOrSlug> [--yes] [--global|--agent-id <id>|--team-id <id>]` (skills: global or scoped)
- `openclaw recipes bind|unbind|bindings` (multi-agent routing)
- `openclaw recipes dispatch ...` (request → inbox + ticket + assignment)
- `openclaw recipes tickets|move-ticket|assign|take|handoff|complete` (file-first ticket workflow)
- `openclaw recipes cleanup-workspaces` (safe cleanup of temporary test/scaffold workspaces)

For full details, see `docs/COMMANDS.md`.

## Configuration
The plugin supports these config keys (with defaults):
- `workspaceRecipesDir` (default: `recipes`)
- `workspaceAgentsDir` (default: `agents`)
- `workspaceSkillsDir` (default: `skills`)
- `workspaceTeamsDir` (default: `teams`)
- `autoInstallMissingSkills` (default: `false`)
- `confirmAutoInstall` (default: `true`)
- `cronInstallation` (default: `prompt`; values: `off|prompt|on`)

Config schema is defined in `openclaw.plugin.json`.

## Documentation
Start here:
- Installation: `docs/INSTALLATION.md`
- Agents + skills: `docs/AGENTS_AND_SKILLS.md`
- Tutorial (create a recipe): `docs/TUTORIAL_CREATE_RECIPE.md`

## Development
### Unit tests (vitest)
Run:
- `npm test`

### Scaffold smoke test (regression)
A lightweight smoke check validates scaffold-team output contains the required testing workflow docs (ticket 0004).

Run:
- `npm run test:smoke` (or `npm run scaffold:smoke`)

Notes:
- Creates a temporary `workspace-smoke-<timestamp>-team` under `~/.openclaw/` and then deletes it.
- Exits non-zero on mismatch.

Reference:
- Commands: `docs/COMMANDS.md`
- Recipe format: `docs/RECIPE_FORMAT.md`
- Bundled recipes: `docs/BUNDLED_RECIPES.md`
- Team workflow: `docs/TEAM_WORKFLOW.md`
- Clawcipes Kitchen (UI): `docs/CLAWCIPES_KITCHEN.md`

(Also see: GitHub repo https://github.com/rjdjohnston/clawcipes)
## Notes / principles
- Workspaces:
  - Standalone agents: `~/.openclaw/workspace-<agentId>/`
  - Teams: `~/.openclaw/workspace-<teamId>/` with `roles/<role>/...`
- Skills:
  - Global (shared): `~/.openclaw/skills/<skill>`
  - Scoped (agent/team): `~/.openclaw/workspace-*/skills/<skill>`
- Team IDs end with `-team`; agent IDs are namespaced: `<teamId>-<role>`.
- Recipe template rendering is intentionally simple: `{{var}}` replacement only.

## Removing (uninstalling) a scaffolded team
Clawcipes does not (yet) include a first-class `remove-team` command.

To remove a scaffolded team created with `scaffold-team --apply-config`, do two things:

1) Remove the team workspace (recommended: send to trash):
```bash
trash ~/.openclaw/workspace-<teamId>
```

2) Remove the agents from OpenClaw config:
- Edit `~/.openclaw/openclaw.json`
- Delete the matching entries under `agents.list[]` whose `id` starts with `<teamId>-`
- Restart:
```bash
openclaw gateway restart
```

## Links
- GitHub: https://github.com/rjdjohnston/clawcipes
- Docs:
  - Installation: `docs/INSTALLATION.md`
  - Commands: `docs/COMMANDS.md`
  - Recipe format: `docs/RECIPE_FORMAT.md`
  - Team workflow: `docs/TEAM_WORKFLOW.md`

## What you should be developing (not this plugin)
Clawcipes is meant to be *installed* and then used to build **agents + teams**.

Most users should focus on:
- authoring recipes in their OpenClaw workspace (`<workspace>/recipes/*.md`)
- scaffolding teams (`openclaw recipes scaffold-team ...`)
- running the file-first workflow (dispatch → backlog → in-progress → testing → done)
