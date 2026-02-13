#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const die = (msg) => {
  console.error(`\n[scaffold-smoke] ERROR: ${msg}`);
  process.exitCode = 1;
};

const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) {
    const stderr = String(res.stderr ?? "").trim();
    const stdout = String(res.stdout ?? "").trim();
    throw new Error(
      `Command failed (exit=${res.status}): ${cmd} ${args.join(" ")}\n` +
        (stdout ? `stdout:\n${stdout}\n` : "") +
        (stderr ? `stderr:\n${stderr}\n` : "")
    );
  }
  return { stdout: String(res.stdout ?? ""), stderr: String(res.stderr ?? "") };
};

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const assertMatch = (text, re, msg) => {
  if (!re.test(text)) {
    const preview = text.slice(0, 600);
    throw new Error(`${msg}\nRegex: ${re}\nPreview:\n${preview}`);
  }
};

const fileExists = async (p) => {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  const ts = Date.now();
  const teamId = `smoke-${ts}-team`;

  // Resolve team workspace dir: sibling of agents.defaults.workspace -> workspace-<teamId>
  const wsOut = run("openclaw", ["config", "get", "agents.defaults.workspace"]).stdout.trim();
  assert(wsOut, "agents.defaults.workspace not set");
  const teamDir = path.resolve(wsOut, "..", `workspace-${teamId}`);

  console.log(`[scaffold-smoke] teamId=${teamId}`);
  console.log(`[scaffold-smoke] teamDir=${teamDir}`);

  let scaffoldOk = false;
  try {
    // Scaffold using the built-in development-team recipe.
    run("openclaw", ["recipes", "scaffold-team", "development-team", "-t", teamId, "--overwrite"]);
    scaffoldOk = true;

    const teamMdPath = path.join(teamDir, "TEAM.md");
    const ticketsMdPath = path.join(teamDir, "TICKETS.md");
    const testingDir = path.join(teamDir, "work", "testing");

    assert(await fileExists(teamMdPath), `Missing TEAM.md at ${teamMdPath}`);
    assert(await fileExists(ticketsMdPath), `Missing TICKETS.md at ${ticketsMdPath}`);
    assert(await fileExists(testingDir), `Missing work/testing/ dir at ${testingDir}`);

    const [teamMd, ticketsMd] = await Promise.all([
      fs.readFile(teamMdPath, "utf8"),
      fs.readFile(ticketsMdPath, "utf8"),
    ]);

    // Required content assertions (keep robust)
    const reTestingPath = /work\/testing\//;
    const reStagesArrow = /backlog\s*→\s*in-progress\s*→\s*testing\s*→\s*done/i;
    const reHandoff = /(assign\s+.*test|Owner:\s*test|tester\s+role)/i;

    // TEAM.md is a high-level workspace index; current scaffold output does not include workflow lane details there.
    // Keep workflow assertions on TICKETS.md (the canonical workflow doc).

    assertMatch(ticketsMd, reTestingPath, "TICKETS.md must mention work/testing/");
    assertMatch(ticketsMd, reStagesArrow, "TICKETS.md must mention stages backlog → in-progress → testing → done");
    assertMatch(ticketsMd, reHandoff, "TICKETS.md must mention QA handoff / assign to test");

    console.log("[scaffold-smoke] OK");
  } finally {
    // Best-effort cleanup to avoid littering ~/.openclaw/workspace-*
    if (scaffoldOk) {
      try {
        await fs.rm(teamDir, { recursive: true, force: true });
        console.log(`[scaffold-smoke] cleaned up ${teamDir}`);
      } catch (e) {
        console.error(`[scaffold-smoke] cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

main().catch((e) => {
  die(e instanceof Error ? e.message : String(e));
});
