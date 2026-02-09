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
Scaffold a team workspace + multiple agents from a **team** recipe.

```bash
openclaw recipes scaffold-team development-team \
  --team-id development-team \
  --overwrite \
  --apply-config
```

Options:
- `--team-id <teamId>` (required)
  - **Must end with `-team`** (enforced)
- `--overwrite`
- `--apply-config`

Creates a team directory with standard subfolders:
- `teams/<teamId>/{shared,inbox,outbox,notes,work}`
- `teams/<teamId>/work/{backlog,in-progress,done,assignments}`

Also creates agent workspaces under:
- `agents/<teamId>-<role>/...`

## `install <idOrSlug> [--yes]`
Install skills into the **workspace-local** skills directory.

```bash
openclaw recipes install local-places
openclaw recipes install local-places --yes
```

Behavior:
- If `idOrSlug` matches a recipe id, installs that recipe’s `requiredSkills` + `optionalSkills`.
- Otherwise treats it as a ClawHub skill slug.
- Installs via:
  - `npx clawhub@latest --workdir <workspaceRoot> --dir skills install <slug>`
- Confirmation-gated unless `--yes`.
- In non-interactive mode (no TTY), requires `--yes`.

## `dispatch`
Convert a natural-language request into file-first execution artifacts.

```bash
openclaw recipes dispatch \
  --team-id development-team \
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
