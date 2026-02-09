# Recipe format

Recipes are Markdown files with YAML frontmatter.

They can be:
- **agent** recipes: scaffold a single agent workspace
- **team** recipes: scaffold a team workspace and multiple agents

## File locations
Recipes are discovered from:
- Built-in: `recipes/default/*.md` inside this plugin
- Workspace-local: `<workspaceRoot>/recipes/*.md` (default)

## Frontmatter (common)
```yaml
---
id: development-team
name: Development Team
kind: team # or agent
version: 0.1.0
description: ...

requiredSkills:
  - some-skill
optionalSkills:
  - another-skill
---
```

### `requiredSkills` / `optionalSkills`
These are **ClawHub skill slugs**.

They’re used by:
- `openclaw recipes status` (detect missing skills)
- `openclaw recipes install <recipeId>` (install the listed skills)

## Agent recipes
Agent recipes use templates + files.

### `templates`
A string map of template keys → template bodies.

### `files`
Each file entry writes a file under the agent’s workspace:

```yaml
files:
  - path: SOUL.md
    template: soul
    mode: createOnly # or overwrite
```

Template rendering:
- Simple `{{var}}` replacement.
- No conditionals / no code execution.

Common vars:
- `agentId`
- `agentName`

## Team recipes
Team recipes define a team plus multiple agents:

```yaml
team:
  teamId: development-team
  name: Development Team

agents:
  - role: lead
    name: Dev Team Lead
  - role: dev
    name: Software Engineer
  - role: devops
    name: DevOps / SRE
```

### Team ID and agent IDs
- **Team IDs must end with `-team`** (enforced by `scaffold-team`).
- Agent IDs default to: `<teamId>-<role>`

### Template namespacing for teams
For team recipes, file templates are namespaced by role:
- `lead.soul`, `dev.soul`, etc.

If a `files[].template` key does not contain a `.`, Clawcipes prefixes it with `<role>.`.

## Tool policy
Recipes can include tool policy, which is written into `agents.list[].tools` when `--apply-config` is used:

```yaml
tools:
  profile: coding
  allow:
    - group:fs
    - group:web
    - group:runtime
  deny: []
```

Team recipes can override tools per-agent via `agents[].tools`.

## Recommended conventions
- Keep `requiredSkills` minimal; use `optionalSkills` for “nice to have”.
- For teams, use file-first work queues:
  - `work/backlog/0001-...md` style tickets
  - filename ordering is the queue ordering
