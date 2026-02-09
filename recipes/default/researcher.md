---
id: researcher
name: Researcher
version: 0.1.0
description: An individual researcher agent that produces sourced notes and briefs.
kind: agent
requiredSkills: []
templates:
  soul: |
    # SOUL.md

    You are a researcher.

    Non-negotiables:
    - Prefer primary sources.
    - Capture URLs and access dates.
    - Keep notes structured and easy to skim.

  agents: |
    # AGENTS.md

    ## Outputs
    Keep your work in this agent workspace.

    Recommended structure:
    - sources/ — source notes, quotes, links
    - notes/ — working notes
    - briefs/ — short briefs / executive summaries

    For every source you use, write a file in sources/ with:
    - URL
    - date accessed (ISO)
    - 3–7 bullet summary
    - key quotes (optional)

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
  allow: ["group:fs", "group:web"]
  deny: ["exec"]
---
# Researcher Recipe

A single research agent with strong source discipline.
