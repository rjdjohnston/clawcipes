# Shared context conventions (team workspaces)

This is a **file-first** coordination convention for scaffolded teams.

## Goals
- Reduce cross-agent messaging; coordinate via shared files.
- Prevent shared context from becoming a junk drawer.
- Make work auditable: read → act → write loops.

## Directory layout
Team workspaces include:

- `notes/plan.md` — curated plan / priorities (lead-owned)
- `notes/status.md` — current snapshot (short, updated frequently)
- `shared-context/` — shared context + append-only inputs
  - `priorities.md` — curated priorities (lead-owned)
  - `agent-outputs/` — append-only outputs from non-lead roles
  - `feedback/` — QA findings / feedback
  - `kpis/` — metrics
  - `calendar/` — optional notes

Back-compat:
- `shared/` may exist as a legacy folder. Prefer `shared-context/`.

## Curator model
- **Lead** curates:
  - `notes/plan.md`
  - `shared-context/priorities.md`
- **Non-lead roles** should not edit curated files.
  - Append instead to `shared-context/agent-outputs/` (or `feedback/`).

## Read → Act → Write
Every role should:
1) **Read** plan/status + ticket before acting
2) **Act** (small, safe changes)
3) **Write back**
   - update ticket
   - add 3–5 bullets to `notes/status.md`
   - append detailed outputs to `shared-context/agent-outputs/`

## Migration guidance (existing teams)
Safe migration:
1) Create `shared-context/` and starter subdirs.
2) Add `shared-context/priorities.md` (create-only; do not overwrite).
3) Update agent instructions to reference shared-context and curator model.

No existing files need to be deleted or renamed.
