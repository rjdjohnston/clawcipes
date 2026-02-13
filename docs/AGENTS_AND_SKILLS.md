# Agents and skills (OpenClaw + ClawRecipes)

This doc explains the mental model: **what an agent is**, how **skills/tools** work, and how ClawRecipes helps you build agents + teams.

## What is an agent?
In OpenClaw, an **agent** is a configured assistant persona with:
- a **workspace folder** (where it reads/writes files)
- optional **identity** (name, avatar, emoji, tone)
- a **tool policy** (what tools it is allowed to use)
- a **model** configuration (defaults come from OpenClaw)

In ClawRecipes, a **standalone** agent recipe scaffolds a dedicated workspace like:

```
~/.openclaw/workspace-<agentId>/
  SOUL.md
  AGENTS.md
  TOOLS.md
  ...other recipe files...
```

### Why separate agents?
- Separation of concerns (research vs writing vs devops)
- Cleaner prompts/personas
- Safer tool permissions (e.g., only DevOps gets automation)
- Clear ownership of outputs (each agent writes to its own workspace)

## What is a skill?
A **skill** is a packaged integration or capability (e.g. Gmail, Calendar, Places search, Twitter/X tooling).

Skills can provide:
- tools/actions (e.g., `gog gmail ...`, `local-places ...`)
- configuration schemas / env vars
- helper scripts or CLIs

In OpenClaw, skills are surfaced as tools the agent can use.

## Tool policies (allow/deny)
Every agent can have a tool policy in OpenClaw config (written via `--apply-config` when scaffolding).

ClawRecipes recipes commonly use:
- `allow: ["group:fs", "group:web"]` for safe file + web access
- `allow: ["group:runtime"]` when the agent needs to run local commands
- `allow: ["group:automation"]` for automation-oriented tools
- `deny: ["exec"]` for safety on agents that shouldn’t execute commands

The intent:
- Most agents should **not** have `exec`.
- Only agents that truly need it (dev/devops) should get runtime/exec capabilities.

## How to add/update tool access (allow list)
There are two common approaches.

### Option A (recommended): update the recipe, then re-apply config
1) Edit the recipe markdown (either a workspace recipe or your own copy of a bundled recipe) and change `tools.allow` / `tools.deny`.

2) Re-run scaffold with `--apply-config`:

Team:
```bash
openclaw recipes scaffold-team <recipeId> --team-id <teamId> --overwrite --apply-config
openclaw gateway restart
```

Individual agent:
```bash
openclaw recipes scaffold <recipeId> --agent-id <agentId> --overwrite --apply-config
openclaw gateway restart
```

### Option B: edit OpenClaw config directly
1) Edit:
- `~/.openclaw/openclaw.json`

2) Find the matching agent under `agents.list[]` and edit:
- `tools.allow`
- `tools.deny`

3) Restart:
```bash
openclaw gateway restart
```

> Tip: if you later re-run scaffold with `--apply-config`, the recipe’s tool policy may overwrite your manual edits. If you want a change to stick, encode it in the recipe.

## Installing skills (workspace-local)
ClawRecipes favors **workspace-local** installs so each OpenClaw workspace is self-contained.

### Install a skill slug
```bash
openclaw recipes install <skill-slug>
# or non-interactive:
openclaw recipes install <skill-slug> --yes
```

This runs ClawHub under the hood and installs into the **current OpenClaw workspace** skills dir:
- `<workspace>/skills/<skill-slug>`

Examples:
- standalone agent workspace: `~/.openclaw/workspace-<agentId>/skills/<skill-slug>`
- team workspace: `~/.openclaw/workspace-<teamId>/skills/<skill-slug>`

> Note: in the new workspace policy, standalone agents live in `~/.openclaw/workspace-<agentId>` and teams live in `~/.openclaw/workspace-<teamId>`. Skill install targeting is still being refined during the experimental phase.

### Install the skills required by a recipe
If a recipe declares skills in `requiredSkills` or `optionalSkills`:

```bash
openclaw recipes install <recipe-id>
```

That installs the recipe’s declared skills.

### Removing a skill
ClawRecipes currently does **not** implement a remove command.

To remove a workspace-local skill:
- delete the folder: `<workspace>/skills/<skill-slug>`
- restart: `openclaw gateway restart`

(We can add `openclaw recipes uninstall <slug>` later if you want it to be first-class.)

## Removing (uninstalling) a scaffolded team
ClawRecipes includes a safe uninstall command:

```bash
openclaw recipes remove-team --team-id <teamId> --plan --json
openclaw recipes remove-team --team-id <teamId> --yes
openclaw gateway restart
```

Notes:
- Cron cleanup is conservative: it removes only cron jobs explicitly stamped with `recipes.teamId=<teamId>`.
- You can still do it manually by deleting `~/.openclaw/workspace-<teamId>` and removing `<teamId>-*` entries from `agents.list[]` in `~/.openclaw/openclaw.json`.

## Teams: shared workspace + multiple agents
A **team** recipe scaffolds a **shared workspace root** plus role folders:

```
~/.openclaw/workspace-<teamId>/
  TEAM.md
  inbox/
  outbox/
  shared/
  notes/
  work/
    backlog/
    in-progress/
    testing/
    done/
    assignments/
  roles/
    <role>/
      ...role-specific recipe files...
```

Each role agent is a separate OpenClaw agent id (`<teamId>-<role>`), but they share the same workspace root (`workspace-<teamId>`) so collaboration is file-based.

The shared workspace is the source of truth for:
- intake (`inbox/`)
- work queue (`work/backlog`, `work/in-progress`, `work/testing`, `work/done`)
- assignments (`work/assignments`)
- deliverables (`outbox/`)

## Updating agents after you scaffold them
Once an agent exists, there are **two layers** you can update:

### 1) The agent’s files (workspace)
Agents are just folders under:
- standalone: `~/.openclaw/workspace-<agentId>/`
- team roles: `~/.openclaw/workspace-<teamId>/roles/<role>/`

Common files:
- `SOUL.md` — the persona / operating style
- `AGENTS.md` — operating instructions / workflow
- `TOOLS.md` — agent-local notes (paths, conventions, env quirks)
- `STATUS.md` — current focus / next actions
- `NOTES.md` — scratchpad

To change behavior, edit these files and then just use the agent again.

If the agent was created from a recipe, re-running scaffold with `--overwrite` will overwrite recipe-managed files:

```bash
openclaw recipes scaffold <recipeId> --agent-id <agentId> --overwrite
```

For teams, you typically re-run `scaffold-team` (role files live under `roles/<role>/`):

```bash
openclaw recipes scaffold-team <recipeId> --team-id <teamId> --overwrite
```

### 2) The agent’s OpenClaw config (tool permissions, identity, model)
When you scaffold with `--apply-config`, ClawRecipes writes the agent entry into OpenClaw config:
- `~/.openclaw/openclaw.json` → `agents.list[]`

Re-run scaffold/scaffold-team with `--apply-config` any time you want the recipe’s tool policy (allow/deny) to be re-applied.

```bash
openclaw recipes scaffold-team <recipeId> --team-id <teamId> --apply-config
openclaw gateway restart
```

## Where to find agent config in the OpenClaw UI
OpenClaw exposes agent configuration in its UI (labels/paths depend on your build), typically under something like:
- **Settings → Agents**

From there you can:
- select an agent
- view/edit its identity
- review tool permissions
- confirm which workspace it uses

If you prefer files, the source-of-truth config file is:
- `~/.openclaw/openclaw.json`

## How to create your own agents/teams
You have three main options:

1) Use a bundled recipe (fast start)
- `openclaw recipes scaffold-team development-team --team-id my-dev-team-team --apply-config`

2) Write your own recipe in your workspace
- Create: `~/.openclaw/workspace/recipes/my-team.md`
- Then: `openclaw recipes scaffold-team my-team --team-id my-team-team --apply-config`

3) Copy a bundled recipe and modify it
- Use `openclaw recipes show <id>` to view it
- Copy into your workspace recipes dir and edit

Next: read `docs/TUTORIAL_CREATE_RECIPE.md` for a step-by-step guide.
