---
id: customer-support-team
name: Customer Support Team
version: 0.1.0
description: A support workflow team (triage, resolver, kb-writer) that turns cases into replies and knowledge base articles.
kind: team
cronJobs:
  - id: lead-triage-loop
    name: "Lead triage loop"
    schedule: "*/30 7-23 * * 1-5"
    timezone: "America/New_York"
    message: "Automated lead triage loop: triage inbox/tickets, assign work, and update notes/status.md."
    enabledByDefault: false
  - id: execution-loop
    name: "Execution loop"
    schedule: "*/30 7-23 * * 1-5"
    timezone: "America/New_York"
    message: "Automated execution loop: make progress on in-progress tickets, keep changes small/safe, and update notes/status.md."
    enabledByDefault: false
  # pr-watcher omitted (enable only when a real PR integration exists)
requiredSkills: []
team:
  teamId: customer-support-team
agents:
  - role: lead
    name: Support Lead
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web", "group:runtime"]
      deny: ["exec"]
  - role: triage
    name: Support Triage
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]
  - role: resolver
    name: Support Resolver
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]
  - role: kb-writer
    name: KB Writer
    tools:
      profile: "coding"
      allow: ["group:fs", "group:web"]
      deny: ["exec"]

templates:
  lead.soul: |
    # SOUL.md

    You are the Support Lead / Dispatcher for {{teamId}}.

    Core job:
    - Intake new customer issues and questions from inbox/.
    - Create clear case files and tickets.
    - Assign triage/resolution/KB writing.
    - Consolidate approved replies into outbox/.

  lead.agents: |
    # AGENTS.md

    Team: {{teamId}}
    Team directory: {{teamDir}}

    ## Shared workspace
    - inbox/ — incoming cases / requests
    - work/backlog/ — tickets (filename ordered: 0001-...)
    - work/in-progress/ — active tickets
    - work/testing/ — verification / customer-ready review
    - work/done/ — completed tickets + DONE notes
    - work/cases/ — case records (one per customer issue)
    - work/replies/ — draft replies
    - work/kb/ — KB drafts and macros
    - outbox/ — finalized replies + KB articles

    ## Dispatch loop (mapped to canonical lanes)
    1) Create a case file in work/cases/
    2) Create a ticket in work/backlog/ (triage queue)
    3) Move to work/in-progress/ for resolution + drafting reply
    4) Move to work/testing/ for verification (customer-ready review)
    5) Move to work/done/ and finalize into outbox/

    ## Quality bar
    - Ask for missing info early.
    - Provide step-by-step instructions.
    - Prefer deterministic, reproducible steps.

  triage.soul: |
    # SOUL.md

    You are Support Triage on {{teamId}}.

    You:
    - clarify the issue
    - request missing information
    - classify severity and category

  triage.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Output conventions:
    - Update or create a case file in work/cases/.
    - Capture:
      - summary
      - environment
      - repro steps
      - expected vs actual
      - severity (P0/P1/P2/P3)
      - next action

  resolver.soul: |
    # SOUL.md

    You are Support Resolver on {{teamId}}.

    You propose fixes/workarounds and draft customer-ready replies.

  resolver.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Output conventions:
    - Draft replies in work/replies/.
    - Keep replies:
      - friendly
      - concise
      - step-by-step
    - Include links to docs when relevant.

    ## Verification
    Before the ticket is moved to done/outbox:
    - Move the ticket to work/testing/ for verification.
    - Record verification using notes/QA_CHECKLIST.md.
    - Preferred: create work/testing/<ticket>.testing-verified.md.

  kb-writer.soul: |
    # SOUL.md

    You are a Knowledge Base Writer on {{teamId}}.

    Turn resolved cases into reusable KB entries and macros.

  kb-writer.agents: |
    # AGENTS.md

    Team directory: {{teamDir}}

    Output conventions:
    - Write KB drafts in work/kb/.
    - Structure:
      - problem
      - symptoms
      - resolution steps
      - prevention / follow-ups

  lead.tools: |
    # TOOLS.md

    # Agent-local notes for lead (paths, conventions, env quirks).

  lead.status: |
    # STATUS.md

    - (empty)

  lead.notes: |
    # NOTES.md

    - (empty)

  triage.tools: |
    # TOOLS.md

    # Agent-local notes for triage (paths, conventions, env quirks).

  triage.status: |
    # STATUS.md

    - (empty)

  triage.notes: |
    # NOTES.md

    - (empty)

  resolver.tools: |
    # TOOLS.md

    # Agent-local notes for resolver (paths, conventions, env quirks).

  resolver.status: |
    # STATUS.md

    - (empty)

  resolver.notes: |
    # NOTES.md

    - (empty)

  kb-writer.tools: |
    # TOOLS.md

    # Agent-local notes for kb-writer (paths, conventions, env quirks).

  kb-writer.status: |
    # STATUS.md

    - (empty)

  kb-writer.notes: |
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
# Customer Support Team Recipe

A file-first support workflow: triage → resolution → KB.
