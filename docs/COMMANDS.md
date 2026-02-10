# Command reference

All commands live under:

```bash
openclaw recipes <command>
```

## `list`
List available recipes (builtin + workspace).

```bash
openclaw recipes list
```

Outputs JSON rows:
- `id`, `name`, `kind`, `source`

## `show <id>`
Print the raw recipe markdown.

```bash
openclaw recipes show development-team
```

## `status [id]`
Check missing skills for a recipe (or all recipes).

```bash
openclaw recipes status
openclaw recipes status development-team
```

## `scaffold <recipeId>`
Scaffold a single agent workspace from an **agent** recipe.

```bash
openclaw recipes scaffold project-manager --agent-id pm --name "Project Manager" --apply-config
```

Options:
- `--agent-id <id>` (required)
- `--name <name>`
- `--overwrite` (overwrite recipe-managed files)
- `--apply-config` (write/update `agents.list[]` in OpenClaw config)

## `scaffold-team <recipeId>`
Scaffold a shared **team workspace** + multiple agents from a **team** recipe.

```bash
openclaw recipes scaffold-team development-team \
  --team-id development-team-team \
  --overwrite \
  --apply-config
```

Options:
- `--team-id <teamId>` (required)
  - **Must end with `-team`** (enforced)
- `--overwrite`
- `--apply-config`

Creates a shared team workspace root:

- `~/.openclaw/workspace-<teamId>/...`

Standard folders:
- `inbox/`, `outbox/`, `shared/`, `notes/`
- `work/{backlog,in-progress,done,assignments}`
- `roles/<role>/...` (role-specific recipe files)

Also creates agent config entries under `agents.list[]` (when `--apply-config`), with agent ids:
- `<teamId>-<role>`

## `install <idOrSlug> [--yes]`
Install skills from ClawHub (confirmation-gated).

Default behavior: **global install** into `~/.openclaw/skills`.

```bash
# Global (shared across all agents)
openclaw recipes install agentchat --yes

# Agent-scoped (into workspace-<agentId>/skills)
openclaw recipes install agentchat --yes --agent-id dev

# Team-scoped (into workspace-<teamId>/skills)
openclaw recipes install agentchat --yes --team-id development-team-team
```

Behavior:
- If `idOrSlug` matches a recipe id, installs that recipe’s `requiredSkills` + `optionalSkills`.
- Otherwise treats it as a ClawHub skill slug.
- Installs via:
  - `npx clawhub@latest --workdir <targetWorkspace> --dir skills install <slug>` (agent/team)
  - `npx clawhub@latest --workdir ~/.openclaw --dir skills install <slug>` (global)
- Confirmation-gated unless `--yes`.
- In non-interactive mode (no TTY), requires `--yes`.

## `bind`
Add/update a multi-agent routing binding (writes `bindings[]` in `~/.openclaw/openclaw.json`).

Examples:

```bash
# Route one Telegram DM to an agent
openclaw recipes bind --agent-id dev --channel telegram --peer-kind dm --peer-id 6477250615

# Route all Telegram traffic to an agent (broad match)
openclaw recipes bind --agent-id dev --channel telegram
```

Notes:
- `peer.kind` must be one of: `dm|group|channel`.
- Peer-specific bindings are inserted first (more specific wins).

## `bindings`
Print the current `bindings[]` from OpenClaw config.

```bash
openclaw recipes bindings
```

## `migrate-team`
Migrate a legacy team scaffold into the new `workspace-<teamId>` layout.

```bash
openclaw recipes migrate-team --team-id development-team-team --dry-run
openclaw recipes migrate-team --team-id development-team-team --mode move
```

Options:
- `--dry-run`
- `--mode move|copy`
- `--overwrite` (merge into existing destination)

## `dispatch`
Convert a natural-language request into file-first execution artifacts.

```bash
openclaw recipes dispatch \
  --team-id development-team-team \
  --request "Add a customer-support team recipe" \
  --owner lead
```

Options:
- `--team-id <teamId>` (required)
- `--request <text>` (optional; prompts in TTY)
- `--owner dev|devops|lead` (default: `dev`)
- `--yes` (skip review prompt)

Creates (createOnly):
- `teams/<teamId>/inbox/<timestamp>-<slug>.md`
- `teams/<teamId>/work/backlog/<NNNN>-<slug>.md`
- `teams/<teamId>/work/assignments/<NNNN>-assigned-<owner>.md`

Ticket numbering:
- Scans `work/backlog`, `work/in-progress`, `work/done` and uses max+1.

Review-before-write:
- Prints a JSON plan and asks for confirmation unless `--yes`.
