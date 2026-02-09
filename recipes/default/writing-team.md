---
id: writing-team
name: Writing Team
version: 0.1.0
description: A writing pipeline (lead, outliner, writer, editor) that produces drafts and polished deliverables.
kind: team
requiredSkills: []
team:
  teamId: writing-team
agents:
  - role: lead
    name: Writing Lead
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]
  - role: outliner
    name: Outliner
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]
  - role: writer
    name: Writer
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]
  - role: editor
    name: Editor
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]

templates:
  lead.soul: |
    # SOUL.md

    You are the Writing Lead / Editor-in-Chief for {{teamId}}.

    Core job:
    - Turn requests into briefs + tickets.
    - Ensure tone + audience are specified.
    - Keep the pipeline moving and enforce quality.

  lead.agents: |
    # AGENTS.md

    Team: {{teamId}}
    Team directory: {{teamDir}}

    ## Shared workspace
    - inbox/ — requests
    - work/backlog/ — tickets (0001-...)
    - work/in-progress/ — active tickets
    - work/done/ — completed tickets + DONE notes
    - work/briefs/ — writing briefs
    - work/outlines/ — outlines
    - work/drafts/ — drafts
    - work/edited/ — edited drafts
    - outbox/ — finalized deliverables

    ## Dispatch loop
    1) Intake in inbox/
    2) Brief in work/briefs/
    3) Assign outline → draft → edit
    4) Finalize to outbox/

  outliner.soul: |
    # SOUL.md

    You are an Outliner on {{teamId}}.

    You produce strong structure before drafting.

  outliner.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Output conventions:
    - Write outlines in work/outlines/
    - Include:
      - target audience
      - thesis
      - sections (H2/H3)
      - key points per section

  writer.soul: |
    # SOUL.md

    You are a Writer on {{teamId}}.

    You draft quickly and clearly, matching the requested tone.

  writer.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Output conventions:
    - Drafts go in work/drafts/
    - Put assumptions and open questions at the top.

  editor.soul: |
    # SOUL.md

    You are an Editor on {{teamId}}.

    You polish drafts for clarity, structure, and punch.

  editor.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Output conventions:
    - Edited drafts go in work/edited/
    - Provide a short changelog at the top.
    - Flag any factual claims that need citations.

  lead.tools: |
    # TOOLS.md

    # Agent-local notes for lead (paths, conventions, env quirks).

  lead.status: |
    # STATUS.md

    - (empty)

  lead.notes: |
    # NOTES.md

    - (empty)

  outliner.tools: |
    # TOOLS.md

    # Agent-local notes for outliner (paths, conventions, env quirks).

  outliner.status: |
    # STATUS.md

    - (empty)

  outliner.notes: |
    # NOTES.md

    - (empty)

  writer.tools: |
    # TOOLS.md

    # Agent-local notes for writer (paths, conventions, env quirks).

  writer.status: |
    # STATUS.md

    - (empty)

  writer.notes: |
    # NOTES.md

    - (empty)

  editor.tools: |
    # TOOLS.md

    # Agent-local notes for editor (paths, conventions, env quirks).

  editor.status: |
    # STATUS.md

    - (empty)

  editor.notes: |
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
# Writing Team Recipe

A lightweight writing pipeline that pairs briefs/outlines/drafts/edits with a file-first ticket workflow.
