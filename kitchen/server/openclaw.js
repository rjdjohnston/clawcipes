import { execSync, spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
/**
 * Pass through process env for openclaw CLI. Do NOT set OPENCLAW_HOME to ~/.openclaw:
 * OPENCLAW_HOME overrides $HOME (not the openclaw dir), so that would break config lookup.
 */
const CLI_ENV = { ...process.env };

/** Timeout for CLI commands (ms). Scaffold may take longer. */
const CLI_TIMEOUT = 60000;
const SCAFFOLD_TIMEOUT = 120000;

/** Suppress stderr when probing config (avoids "Config path not found" noise when unconfigured). */
const SILENT_CLI = { encoding: "utf8", timeout: CLI_TIMEOUT, stdio: ["ignore", "pipe", "pipe"] };

/**
 * Check if OpenClaw is available and configured.
 * @returns {Promise<boolean>}
 */

export async function checkOpenClaw() {
  try {
    const out = execSync("openclaw config get agents.defaults.workspace", {
      ...SILENT_CLI,
      env: CLI_ENV,
    });
    return !!out?.trim();
  } catch {
    return false;
  }
}

function getWorkspaceParent() {
  try {
    const out = execSync("openclaw config get agents.defaults.workspace", {
      ...SILENT_CLI,
      env: CLI_ENV,
    });
    const workspaceRoot = out.trim();
    if (!workspaceRoot) return null;
    return dirname(workspaceRoot);
  } catch {
    return null;
  }
}

/**
 * Remove a scaffolded team (workspace, agents, cron jobs).
 * @param {string} teamId - Team id (must end with -team)
 */
export function removeTeam(teamId) {
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (teamId === "demo-team") throw new Error("Cannot remove demo team");
  runOpenClaw(["recipes", "remove-team", "--team-id", teamId, "--yes"]);
}

/**
 * List bindings from openclaw config.
 * @returns {Array<{ agentId: string; match: object }>}
 */
export function listBindings() {
  const result = spawnSync("openclaw", ["recipes", "bindings"], {
    encoding: "utf8",
    timeout: CLI_TIMEOUT,
    env: CLI_ENV,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `openclaw exited with ${result.status}`);
  }
  const out = result.stdout || "[]";
  return JSON.parse(out);
}

/**
 * Add or update a binding.
 * @param {{ agentId: string; match: object }} params
 */
export function addBinding(params) {
  const { agentId, match } = params;
  if (!agentId || !match?.channel) throw new Error("agentId and match.channel are required");
  const args = ["recipes", "bind", "--agent-id", agentId, "--match", JSON.stringify(match)];
  runOpenClaw(args);
}

/**
 * Remove binding(s) matching criteria.
 * @param {{ agentId?: string; match: object }} params
 */
export function removeBinding(params) {
  const { agentId, match } = params;
  if (!match?.channel) throw new Error("match.channel is required");
  const args = ["recipes", "unbind", "--channel", match.channel];
  if (agentId) args.push("--agent-id", agentId);
  const hasExtra = Object.keys(match).filter((k) => k !== "channel" && match[k] != null).length > 0;
  if (hasExtra) args.push("--match", JSON.stringify(match));
  runOpenClaw(args);
}

/**
 * List available recipes via openclaw CLI.
 * @returns {Promise<Array<{ id: string; name?: string; kind?: string; source: string }>>}
 */
export async function listRecipes() {
  const stdout = execSync("openclaw recipes list", {
    encoding: "utf8",
    timeout: CLI_TIMEOUT,
    env: CLI_ENV,
  });
  return JSON.parse(stdout);
}

/**
 * Get recipe status (missing skills, install commands).
 * @param {string} [recipeId] - Optional; when omitted returns status for all recipes.
 * @returns {Array<{ id: string; requiredSkills: string[]; missingSkills: string[]; installCommands: string[] }>}
 */
export function recipeStatus(recipeId) {
  const args = ["recipes", "status"];
  if (recipeId && /^[a-zA-Z0-9_-]+$/.test(recipeId)) args.push(recipeId);
  const result = spawnSync("openclaw", args, {
    encoding: "utf8",
    timeout: CLI_TIMEOUT,
    env: CLI_ENV,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `openclaw exited with ${result.status}`);
  }
  return JSON.parse(result.stdout || "[]");
}

/**
 * Show recipe markdown by id.
 * @param {string} recipeId
 * @returns {Promise<string>}
 */
export async function showRecipe(recipeId) {
  if (!recipeId || !/^[a-zA-Z0-9_-]+$/.test(recipeId)) {
    throw new Error("Invalid recipeId");
  }
  const stdout = execSync(`openclaw recipes show ${recipeId}`, {
    encoding: "utf8",
    timeout: CLI_TIMEOUT,
    env: CLI_ENV,
  });
  return stdout;
}

/**
 * Scaffold a team from a recipe.
 * @param {string} recipeId
 * @param {string} teamId - must end with -team
 * @param {{ overwrite?: boolean }} options
 */
export function scaffoldTeam(recipeId, teamId, options = {}) {
  if (!recipeId || !/^[a-zA-Z0-9_-]+$/.test(recipeId)) {
    throw new Error("Invalid recipeId");
  }
  if (!teamId || !teamId.endsWith("-team")) {
    throw new Error("teamId must end with -team");
  }
  const args = [
    "recipes",
    "scaffold-team",
    recipeId,
    "--team-id",
    teamId,
    "--apply-config",
  ];
  if (options.overwrite) args.push("--overwrite");
  runOpenClaw(args, SCAFFOLD_TIMEOUT);
}

/**
 * List teams by scanning workspace-* dirs and reading team.json.
 * @returns {Promise<Array<{ teamId: string; recipeId: string; recipeName: string; scaffoldedAt: string }>>}
 */
export async function listTeams() {
  const parent = getWorkspaceParent();
  if (!parent) return [];

  let entries;
  try {
    entries = await readdir(parent, { withFileTypes: true });
  } catch {
    return [];
  }

  const teams = [];
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith("workspace-")) continue;
    const teamId = e.name.slice("workspace-".length);
    if (!teamId) continue;

    const metaPath = join(parent, e.name, "team.json");
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8"));
      teams.push({ teamId, ...meta });
    } catch {
      teams.push({ teamId, recipeId: "", recipeName: "", scaffoldedAt: "" });
    }
  }
  return teams;
}

/**
 * Extract title from first # heading in markdown content.
 */
function extractTitle(content) {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : undefined;
}

/**
 * Extract Owner from frontmatter-style line.
 */
function extractOwner(content) {
  const m = content.match(/^Owner:\s*(\w+)\s*$/m);
  return m ? m[1].trim() : undefined;
}

/**
 * Enrich tickets with title from first markdown heading.
 * @param {{ backlog: any[]; inProgress: any[]; testing: any[]; done: any[] }} data
 * @returns {Promise<{ backlog: any[]; inProgress: any[]; testing: any[]; done: any[] }>}
 */
async function enrichTicketsWithTitles(data) {
  const enrich = async (list) => {
    return Promise.all(
      list.map(async (t) => {
        if (!t.file) return { ...t };
        try {
          const content = await readFile(t.file, "utf8");
          const title = extractTitle(content);
          const owner = extractOwner(content);
          return { ...t, title, owner };
        } catch {
          return { ...t };
        }
      })
    );
  };
  const backlog = await enrich(data.backlog);
  const inProgress = await enrich(data.inProgress);
  const testing = await enrich(data.testing);
  const done = await enrich(data.done);
  return {
    teamId: data.teamId,
    tickets: [...backlog, ...inProgress, ...testing, ...done],
    backlog,
    inProgress,
    testing,
    done,
  };
}

/**
 * Get tickets for a team via openclaw CLI, enriched with titles from markdown.
 * @param {string} teamId
 * @returns {Promise<{ teamId: string; tickets: any[]; backlog: any[]; inProgress: any[]; testing: any[]; done: any[] }>}
 */
export async function getTickets(teamId) {
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    throw new Error("Invalid teamId");
  }
  const stdout = execSync(
    `openclaw recipes tickets --team-id ${teamId} --json`,
    { encoding: "utf8", timeout: CLI_TIMEOUT, env: CLI_ENV }
  );
  const raw = JSON.parse(stdout);
  return enrichTicketsWithTitles(raw);
}

function runOpenClaw(args, timeout = CLI_TIMEOUT) {
  const env = CLI_ENV;
  const result = spawnSync("openclaw", args, { encoding: "utf8", timeout, env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `openclaw exited with ${result.status}`);
  }
  return result.stdout;
}

const VALID_STAGES = ["backlog", "in-progress", "testing", "done"];
const VALID_OWNERS = ["dev", "devops", "lead", "test"];

/**
 * Move a ticket between stages.
 */
export function moveTicket(teamId, ticketId, stage, options = {}) {
  if (teamId === "demo-team") throw new Error("Cannot move tickets in demo mode");
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) throw new Error("Invalid ticketId");
  if (!VALID_STAGES.includes(stage)) throw new Error("Invalid stage");
  const args = ["recipes", "move-ticket", "--team-id", teamId, "--ticket", ticketId, "--to", stage, "--yes"];
  if (stage === "done" && options.completed) args.push("--completed");
  runOpenClaw(args);
}

/**
 * Assign a ticket to an owner.
 */
export function assignTicket(teamId, ticketId, owner) {
  if (teamId === "demo-team") throw new Error("Cannot assign tickets in demo mode");
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) throw new Error("Invalid ticketId");
  if (!VALID_OWNERS.includes(owner)) throw new Error("Invalid owner");
  runOpenClaw(["recipes", "assign", "--team-id", teamId, "--ticket", ticketId, "--owner", owner, "--yes"]);
}

/**
 * Take a ticket (assign + move to in-progress).
 */
export function takeTicket(teamId, ticketId, owner) {
  if (teamId === "demo-team") throw new Error("Cannot take tickets in demo mode");
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) throw new Error("Invalid ticketId");
  if (!VALID_OWNERS.includes(owner)) throw new Error("Invalid owner");
  runOpenClaw(["recipes", "take", "--team-id", teamId, "--ticket", ticketId, "--owner", owner, "--yes"]);
}

/**
 * Handoff ticket to QA (move to testing + assign to tester).
 */
export function handoffTicket(teamId, ticketId, tester = "test") {
  if (teamId === "demo-team") throw new Error("Cannot handoff tickets in demo mode");
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) throw new Error("Invalid ticketId");
  if (!VALID_OWNERS.includes(tester)) throw new Error("Invalid tester");
  runOpenClaw(["recipes", "handoff", "--team-id", teamId, "--ticket", ticketId, "--tester", tester, "--yes"]);
}

/**
 * Complete a ticket (move to done + add Completed timestamp).
 */
export function completeTicket(teamId, ticketId) {
  if (teamId === "demo-team") throw new Error("Cannot complete tickets in demo mode");
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) throw new Error("Invalid ticketId");
  runOpenClaw(["recipes", "complete", "--team-id", teamId, "--ticket", ticketId]);
}

/**
 * Dispatch: create inbox + backlog ticket + assignment from request.
 */
export function dispatch(teamId, request, owner = "dev") {
  if (teamId === "demo-team") throw new Error("Cannot dispatch in demo mode");
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) throw new Error("Invalid teamId");
  if (!request || typeof request !== "string" || !request.trim()) throw new Error("Request text is required");
  if (!VALID_OWNERS.includes(owner)) throw new Error("Invalid owner");
  runOpenClaw(["recipes", "dispatch", "--team-id", teamId, "--request", request.trim(), "--owner", owner, "--yes"]);
}

/**
 * List inbox items (markdown files in workspace-<teamId>/inbox/).
 * @param {string} teamId
 * @returns {Promise<Array<{ id: string; file: string; title?: string; received?: string }>>}
 */
export async function listInbox(teamId) {
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    throw new Error("Invalid teamId");
  }
  const parent = getWorkspaceParent();
  if (!parent) return [];

  const inboxDir = join(parent, `workspace-${teamId}`, "inbox");
  let entries;
  try {
    entries = await readdir(inboxDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const items = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".md")) continue;
    const id = e.name.replace(/\.md$/, "");
    const file = join(inboxDir, e.name);
    let title;
    let received;
    try {
      const content = await readFile(file, "utf8");
      title = extractTitle(content);
      const receivedMatch = content.match(/^Received:\s*(.+)$/m);
      if (receivedMatch) received = receivedMatch[1].trim();
    } catch {
      /* leave title/received undefined */
    }
    items.push({ id, file, title, received });
  }
  return items;
}

/**
 * Get inbox item content by id.
 * @param {string} teamId
 * @param {string} itemId
 * @returns {Promise<string | null>}
 */
export async function getInboxItemContent(teamId, itemId) {
  if (!itemId || !/^[a-zA-Z0-9_.-]+$/.test(itemId)) {
    throw new Error("Invalid itemId");
  }
  const items = await listInbox(teamId);
  const item = items.find((i) => i.id === itemId);
  if (!item?.file) return null;
  try {
    return await readFile(item.file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Get ticket content by id for a real team.
 * @param {string} teamId
 * @param {string} ticketId - e.g. "0001-setup-ci"
 * @returns {Promise<string | null>} Markdown content or null if not found
 */
export async function getTicketContent(teamId, ticketId) {
  if (!teamId || !/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    throw new Error("Invalid teamId");
  }
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    throw new Error("Invalid ticketId");
  }
  const data = await getTickets(teamId);
  const all = [...data.backlog, ...data.inProgress, ...data.testing, ...data.done];
  const ticket = all.find((t) => t.id === ticketId);
  if (!ticket?.file) return null;
  return readFile(ticket.file, "utf8");
}
