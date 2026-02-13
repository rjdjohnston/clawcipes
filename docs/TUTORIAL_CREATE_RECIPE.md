# Tutorial: create your first recipe

This tutorial shows how to create a **team recipe** (shared workspace + multiple agents).

You’ll learn:
- where recipes live
- how frontmatter works
- how templates/files are written
- how to scaffold a team and run the file-first workflow

## Step 0 — confirm ClawRecipes is installed
```bash
openclaw plugins list
openclaw recipes list
```

## Step 1 — create a recipe file in your OpenClaw workspace
Create:

- `~/.openclaw/workspace/recipes/my-first-team.md`

Minimal example:

```md
---
id: my-first-team
name: My First Team
kind: team
version: 0.1.0
description: A tiny demo team

# Optional: skill slugs to install with `openclaw recipes install my-first-team`
requiredSkills: []

team:
  teamId: my-first-team

agents:
  - role: lead
    name: Team Lead
    tools:
      profile: coding
      allow: ["group:fs", "group:web"]
      deny: ["exec"]

  - role: worker
    name: Worker
    tools:
      profile: coding
      allow: ["group:fs", "group:web"]
      deny: ["exec"]

templates:
  lead.soul: |
    # SOUL.md

    You are the lead for {{teamId}}.
    Convert requests into tickets and assign work.

  lead.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Workflow:
    - Intake: check `inbox/`
    - Normalize: create tickets in `work/backlog/`
    - Assign: write stubs in `work/assignments/`

  worker.soul: |
    # SOUL.md

    You are a worker on {{teamId}}.

  worker.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    How you work:
    - Pick the lowest numbered ticket assigned to you.
    - Move it to `work/in-progress/`.
    - Do the work.
    - When ready for QA, move it to `work/testing/` and assign Owner to `test`.
    - After QA passes, move it to `work/done/` and write a short completion report.

files:
  - path: SOUL.md
    template: soul
    mode: createOnly
  - path: AGENTS.md
    template: agents
    mode: createOnly

# Default tools if an agent doesn’t override tools above
tools:
  profile: coding
  allow: ["group:fs", "group:web"]
  deny: ["exec"]
---

# My First Team

This is a demo recipe.
```

## Step 2 — scaffold the team
Important: team ids must end with `-team`.

```bash
openclaw recipes scaffold-team my-first-team --team-id my-first-team-team --apply-config
```

You should now have:
- `~/.openclaw/workspace-my-first-team-team/` (team shared workspace)
- `~/.openclaw/workspace-my-first-team-team/roles/lead/`
- `~/.openclaw/workspace-my-first-team-team/roles/worker/`

## Step 3 — dispatch a request
```bash
openclaw recipes dispatch \
  --team-id my-first-team-team \
  --request "Draft a README for the team" \
  --owner worker
```

This will propose (or write, with `--yes`) three artifacts:
- an inbox entry
- a backlog ticket
- an assignment stub

## Step 4 — run the workflow
Tickets move through lanes:
- `work/backlog/` → `work/in-progress/` → `work/testing/` → `work/done/`

- Move the ticket from `work/backlog/` → `work/in-progress/`
- Do the work
- When ready for QA:
  - Move the ticket to `work/testing/`
  - Set `Owner: test` and add **Verification steps** to the ticket
- After verification:
  - Move the ticket to `work/done/` and add a short completion report

## Common mistakes
- **Forgetting the `-team` suffix** on `--team-id` (required).
- Using `deny: ["exec"]` on agents that need to run commands.
- Not restarting the gateway after installing the plugin.

## Next steps
- Read `docs/RECIPE_FORMAT.md` for full frontmatter coverage.
- Copy and modify a bundled recipe from `docs/BUNDLED_RECIPES.md`.
