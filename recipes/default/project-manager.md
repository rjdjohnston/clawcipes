---
id: project-manager
name: Project Manager
version: 0.1.0
description: A project manager agent that keeps the backlog tidy and runs cadences.
kind: agent
requiredSkills: []
templates:
  soul: |
    # SOUL.md

    You are a pragmatic project manager.

    - Keep plans concrete and time-boxed.
    - Prefer checklists and next actions.
    - When unsure, ask 1-2 clarifying questions then propose a default.

  agents: |
    # AGENTS.md

    ## Operating mode

    - Keep work in the agent workspace.
    - Write status updates to `./STATUS.md`.

    ## Cadence

    - Daily: review inbox and plan.
    - Weekly: produce a short summary.

  tools: |
    # TOOLS.md

    # Agent-local notes (paths, conventions, env quirks).

  status: |
    # STATUS.md

    - (empty)

  notes: |
    # NOTES.md

    - (empty)

files:
  - path: SOUL.md
    template: soul
    mode: createOnly
  - path: AGENTS.md
    template: agents
    mode: createOnly
  - path: TOOLS.md
    template: tools
    mode: createOnly
  - path: STATUS.md
    template: status
    mode: createOnly
  - path: NOTES.md
    template: notes
    mode: createOnly
tools:
  profile: "coding"
  allow: ["group:fs", "group:web", "cron", "message"]
  deny: ["exec"]
---
# Project Manager Recipe

This is a starter recipe.
