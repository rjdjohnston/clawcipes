# Changelog — @clawcipes/recipes

All notable changes to this project will be documented in this file.

This project follows (roughly) [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [0.2.3] - 2026-02-10
### Added
- **Recipe-defined cron jobs** (`cronJobs:` in recipe frontmatter) with scaffold-time installation.
- `cronInstallation` mode: `off | prompt | on` (default: `prompt`).
- **Shared context scaffolding**: seed `shared-context/` starter schema and docs.
- Role guardrails in `development-team` templates (read → act → write; curator model).

### Changed
- Cron reconciliation behavior:
  - If user opts out at prompt, jobs are created **disabled**.
  - If a job is removed from a recipe in an upgrade, it is **disabled** (not deleted).
- `openclaw cron add --json` parsing now accepts top-level `id`.

### Notes
- PR: https://github.com/rjdjohnston/clawcipes/pull/1

## [0.2.2] - 2026-02-09
### Added
- Testing lane support and tester role workflow improvements.

## [0.2.1] - 2026-02-??
### Added
- Team scaffolding improvements + docs updates.

## [0.2.0] - 2026-02-??
### Added
- `development-team` recipe: added **test (QA) role** and testing-stage workflow guidance.

## [0.1.9] - 2026-02-??
### Added
- Allow `test` owner for ticket workflow; update scaffolded `TICKETS.md`.

## [0.1.8] - 2026-02-??
### Added
- Documentation for testing stage + ticket workflow commands.

## [0.1.7] - 2026-02-??
### Added
- CLI/docs: include testing stage in tickets help.

## [0.1.6] - 2026-02-??
### Added
- `bind`/`unbind` docs and related recipe improvements.

## [0.1.5] - 2026-02-??
### Added
- Skill install support for global + agent/team scoped installs.


[0.2.3]: https://www.npmjs.com/package/@clawcipes/recipes/v/0.2.3
[0.2.2]: https://www.npmjs.com/package/@clawcipes/recipes/v/0.2.2
