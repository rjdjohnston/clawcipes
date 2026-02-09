# Installation

This repo is an **OpenClaw plugin** (not a standalone CLI). OpenClaw loads it and exposes the commands under:

- `openclaw recipes ...`

## Prerequisites
- OpenClaw installed and working (`openclaw --version`)
- Node.js available (OpenClaw uses Node to load plugins)
- (For `recipes install`) you’ll need access to ClawHub (the command runs `npx clawhub@latest ...`).

## Install (local dev path)
This is the recommended workflow while developing.

1) Clone or place this repo at:
- `~/Sites/clawcipes`

2) Install the plugin into OpenClaw via a local path:
```bash
openclaw plugins install -l ~/Sites/clawcipes
```

3) Confirm it loaded:
```bash
openclaw plugins list
# look for id: recipes
```

4) Try a basic command:
```bash
openclaw recipes list
```

## Updating the plugin
If you pull changes (or edit code locally), restart the gateway so OpenClaw reloads plugin code:

```bash
openclaw gateway restart
```

## Uninstall / disable
If installed via local path, remove the plugin install entry and restart:

```bash
openclaw plugins uninstall recipes
openclaw gateway restart
```

(If `plugins uninstall` is not available in your build, remove the path from your OpenClaw config’s plugin load paths and restart.)

## Troubleshooting
### Plugin loads but commands are missing
- Restart: `openclaw gateway restart`
- Check: `openclaw plugins list`
- Verify `openclaw.plugin.json` exists at repo root and has `id: "recipes"`.

### `recipes install` fails
- Run `npx clawhub@latest --help` to confirm the CLI can run.
- Ensure you are logged into ClawHub if required (`npx clawhub@latest login`).
- Confirm installs go into the workspace-local skills dir (default `~/.openclaw/workspace/skills`).
