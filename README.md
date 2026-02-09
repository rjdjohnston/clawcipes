# Clawcipes (OpenClaw Recipes Plugin)

Clawcipes is an OpenClaw plugin that provides **CLI-first recipes** for scaffolding specialist agents and teams from Markdown.

If you like durable workflows: Clawcipes is built around a **file-first team workspace** (inbox/backlog/in-progress/done) that plays nicely with git.

## Quickstart
### 1) Install
#### Option A: clone from GitHub
```bash
git clone https://github.com/rjdjohnston/clawcipes.git ~/Sites/clawcipes
openclaw plugins install -l ~/Sites/clawcipes
openclaw gateway restart
openclaw plugins list
```

#### Option B: local dev path (already cloned)
```bash
openclaw plugins install -l ~/Sites/clawcipes
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
  --team-id development-team \
  --overwrite \
  --apply-config
```

### 4) Dispatch a request into work artifacts
```bash
openclaw recipes dispatch \
  --team-id development-team \
  --request "Add a new recipe for a customer-support team" \
  --owner lead
```

## Commands (high level)
- `openclaw recipes list|show|status`
- `openclaw recipes scaffold` (agent)
- `openclaw recipes scaffold-team` (team)
- `openclaw recipes install <idOrSlug> [--yes]` (workspace-local skill install)
- `openclaw recipes dispatch ...` (request → inbox + ticket + assignment)

For full details, see `docs/COMMANDS.md`.

## Configuration
The plugin supports these config keys (with defaults):
- `workspaceRecipesDir` (default: `recipes`)
- `workspaceAgentsDir` (default: `agents`)
- `workspaceSkillsDir` (default: `skills`)
- `workspaceTeamsDir` (default: `teams`)
- `autoInstallMissingSkills` (default: `false`)
- `confirmAutoInstall` (default: `true`)

Config schema is defined in `openclaw.plugin.json`.

## Documentation
- Installation: `docs/INSTALLATION.md`
- Commands: `docs/COMMANDS.md`
- Recipe format: `docs/RECIPE_FORMAT.md`
- Team workflow: `docs/TEAM_WORKFLOW.md`

## Notes / principles
- Workspace-local skills live in `~/.openclaw/workspace/skills` by default.
- Team IDs end with `-team`; agent IDs are namespaced: `<teamId>-<role>`.
- Recipe template rendering is intentionally simple: `{{var}}` replacement only.

## Development
```bash
npm install
# OpenClaw loads the plugin from index.ts directly.
# Restart the gateway after changes:
openclaw gateway restart
```
