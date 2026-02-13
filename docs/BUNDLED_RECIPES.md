# Bundled recipes

ClawRecipes ships with a few recipes in `recipes/default/`.

You can:
- list them: `openclaw recipes list`
- inspect them: `openclaw recipes show <id>`

Below is a guided explanation of what each bundled recipe does.

## 1) `project-manager` (agent)
**Kind:** agent

**Use when:** you want a lightweight agent that keeps plans tidy and maintains a cadence.

Scaffold:
```bash
openclaw recipes scaffold project-manager --agent-id pm --name "Project Manager" --apply-config
```

What it writes:
- `agents/pm/SOUL.md`
- `agents/pm/AGENTS.md`

Default tool policy (recipe-defined):
- allows: `group:fs`, `group:web`, plus `cron` and `message`
- denies: `exec`

## 2) `social-team` (team)
**Kind:** team

**Use when:** you want a multi-role social pipeline: lead + research + writer + editor.

Scaffold:
```bash
openclaw recipes scaffold-team social-team --team-id social-team-team --apply-config
```

What it creates:
- `teams/social-team-team/` shared workspace
- agents:
  - `agents/social-team-team-lead/`
  - `agents/social-team-team-research/`
  - `agents/social-team-team-writer/`
  - `agents/social-team-team-editor/`

Notes:
- Default `tools` in the recipe deny `exec` (safer by default).

## 3) `development-team` (team)
**Kind:** team

**Use when:** you want a small engineering team with a file-first ticket queue.

Scaffold:
```bash
openclaw recipes scaffold-team development-team --team-id development-team-team --apply-config
```

What it creates:
- `teams/development-team-team/` shared workspace
- agents:
  - `agents/development-team-team-lead/`
  - `agents/development-team-team-dev/`
  - `agents/development-team-team-devops/`

Special features:
- A strict ticket workflow documented in the lead’s `AGENTS.md`.
- Recommended ticket naming: `0001-...md`, `0002-...md`, etc.
- Tool policies intended for real work:
  - lead: includes runtime + automation
  - dev: includes runtime
  - devops: includes runtime + automation

## 4) `research-team` (team)
**Kind:** team

**Use when:** you need repeatable, citations-first research output.

Scaffold:
```bash
openclaw recipes scaffold-team research-team --team-id research-team-team --apply-config
```

What it creates:
- shared team workspace with conventional research folders:
  - `work/sources/`, `work/notes/`, `work/briefs/`
- agents:
  - lead (dispatch + quality bar)
  - researcher (web sourcing + notes)
  - fact-checker (verification)
  - summarizer (brief writing)

Default tool policy:
- allows web access + file operations
- denies `exec` (safe-by-default)

## 5) `writing-team` (team)
**Kind:** team

**Use when:** you want a writing pipeline from brief → outline → draft → edit.

Scaffold:
```bash
openclaw recipes scaffold-team writing-team --team-id writing-team-team --apply-config
```

What it creates:
- shared team workspace with writing pipeline folders:
  - `work/briefs/`, `work/outlines/`, `work/drafts/`, `work/edited/`
- agents:
  - lead
  - outliner
  - writer
  - editor

Default tool policy:
- allows web access + file operations
- denies `exec` (safe-by-default)

## 6) `customer-support-team` (team)
**Kind:** team

**Use when:** you want a repeatable support workflow: triage → resolution → KB.

Scaffold:
```bash
openclaw recipes scaffold-team customer-support-team --team-id customer-support-team-team --apply-config
```

What it creates:
- shared workspace conventions:
  - `work/cases/`, `work/replies/`, `work/kb/`
- agents:
  - lead, triage, resolver, kb-writer

Default tool policy:
- allows web access + file operations
- denies `exec` (safe-by-default)

## 7) `product-team` (team)
**Kind:** team

**Use when:** you want a PRD → design → build → QA delivery loop.

Scaffold:
```bash
openclaw recipes scaffold-team product-team --team-id product-team-team --apply-config
```

Notes:
- The `engineer` role allows `group:runtime` and does **not** deny `exec` so it can run local tooling.

## 8) `researcher` (agent)
**Kind:** agent

**Use when:** you want a single, citations-first research agent.

Scaffold:
```bash
openclaw recipes scaffold researcher --agent-id researcher --apply-config
```

Default tool policy:
- allows web access + file operations
- denies `exec`

## 9) `editor` (agent)
**Kind:** agent

**Use when:** you want a single editing agent.

Scaffold:
```bash
openclaw recipes scaffold editor --agent-id editor --apply-config
```

Default tool policy:
- allows web access + file operations
- denies `exec`

## 10) `developer` (agent)
**Kind:** agent

**Use when:** you want a single developer agent with runtime tooling.

Scaffold:
```bash
openclaw recipes scaffold developer --agent-id dev --apply-config
```

Default tool policy:
- allows `group:runtime`
- does not deny `exec`

## Copying and modifying bundled recipes
A good workflow is:
1) Inspect:
```bash
openclaw recipes show development-team > /tmp/development-team.md
```

2) Copy into your workspace recipes folder:
```bash
cp /tmp/development-team.md ~/.openclaw/workspace/recipes/my-dev-team.md
```

3) Edit the new recipe file and scaffold it.
