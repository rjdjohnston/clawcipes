# Team workflow (file-first)

Clawcipes’ differentiator is the **shared team workspace** + a simple, durable, file-first workflow.

## Team workspace structure
When you scaffold a team:

```
~/.openclaw/workspace-<teamId>/
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
  TEAM.md
```

## The loop
1) **Intake**
- New requests land in `inbox/`.

2) **Plan**
- Convert the request into a numbered ticket in `work/backlog/`.
- Filename ordering is the priority queue.

3) **Execute**
- Move ticket file to `work/in-progress/` (or use `take`).
- Do work; write artifacts into `shared/` or agent workspaces.

4) **Test**
- Move ticket to `work/testing/`.
- Assign `Owner: test` (or explicitly tag the tester role) and include clear “Verification steps” in the ticket.
- Tester verifies and either:
  - moves to `work/done/` (pass), or
  - bounces back to `work/in-progress/` with a bug note (fail)

5) **Complete**
- Move ticket to `work/done/` (or use `complete`).
- Add `Completed:` timestamp (automated by `complete` or `move-ticket --completed`).

## Dispatcher command
The lead can convert a natural-language request into artifacts with:

```bash
openclaw recipes dispatch --team-id <teamId> --request "..." --owner dev
```

This creates:
- an inbox entry
- a backlog ticket
- an assignment stub

## Why file-first?
- Works offline
- Easy to version control
- Easy to audit and search
- Doesn’t depend on any single UI
