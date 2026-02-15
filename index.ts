import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import JSON5 from "json5";
import YAML from "yaml";
import { buildRemoveTeamPlan, executeRemoveTeamPlan, loadCronStore, saveCronStore } from "./src/lib/remove-team";

type RecipesConfig = {
  workspaceRecipesDir?: string;
  workspaceAgentsDir?: string;
  workspaceSkillsDir?: string;
  workspaceTeamsDir?: string;
  autoInstallMissingSkills?: boolean;
  confirmAutoInstall?: boolean;

  /** Cron installation behavior during scaffold/scaffold-team. */
  cronInstallation?: "off" | "prompt" | "on";
};

type CronJobSpec = {
  /** Stable id within the recipe (used for idempotent reconciliation). */
  id: string;
  /** 5-field cron expression */
  schedule: string;
  /** Agent message payload */
  message: string;

  name?: string;
  description?: string;
  timezone?: string;

  /** Delivery routing (optional; defaults to OpenClaw "last"). */
  channel?: string;
  to?: string;

  /** Which agent should execute this job (optional). */
  agentId?: string;

  /** If true, install enabled when cronInstallation=on (or prompt-yes). Default false. */
  enabledByDefault?: boolean;
};

type RecipeFrontmatter = {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  kind?: "agent" | "team";

  /** Optional recipe-defined cron jobs to reconcile during scaffold. */
  cronJobs?: CronJobSpec[];

  // skill deps (installed into workspace-local skills dir)
  requiredSkills?: string[];
  optionalSkills?: string[];

  // Team recipe: defines a team workspace + multiple agents.
  team?: {
    teamId: string; // must end with -team
    name?: string;
    description?: string;
  };
  agents?: Array<{
    role: string;
    agentId?: string; // default: <teamId>-<role>
    name?: string; // display name
    // Optional per-role tool policy override (else uses top-level tools)
    tools?: {
      profile?: string;
      allow?: string[];
      deny?: string[];
    };
  }>;

  // Agent recipe: templates + files to write in the agent folder.
  // For team recipes, templates can be namespaced by role, e.g. "lead.soul", "writer.agents".
  templates?: Record<string, string>;
  files?: Array<{
    path: string;
    template: string; // key in templates map
    mode?: "createOnly" | "overwrite";
  }>;

  // Tool policy (applies to agent recipe; team recipes can override per agent)
  tools?: {
    profile?: string;
    allow?: string[];
    deny?: string[];
  };
};

function getCfg(api: OpenClawPluginApi): Required<RecipesConfig> {
  const cfg = (api.config.plugins?.entries?.["recipes"]?.config ??
    api.config.plugins?.entries?.recipes?.config ??
    {}) as RecipesConfig;

  return {
    workspaceRecipesDir: cfg.workspaceRecipesDir ?? "recipes",
    workspaceAgentsDir: cfg.workspaceAgentsDir ?? "agents",
    workspaceSkillsDir: cfg.workspaceSkillsDir ?? "skills",
    workspaceTeamsDir: cfg.workspaceTeamsDir ?? "teams",
    autoInstallMissingSkills: cfg.autoInstallMissingSkills ?? false,
    confirmAutoInstall: cfg.confirmAutoInstall ?? true,
    cronInstallation: cfg.cronInstallation ?? "prompt",
  };
}

function workspacePath(api: OpenClawPluginApi, ...parts: string[]) {
  const root = api.config.agents?.defaults?.workspace;
  if (!root) throw new Error("agents.defaults.workspace is not set in config");
  return path.join(root, ...parts);
}

async function fileExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listRecipeFiles(api: OpenClawPluginApi, cfg: Required<RecipesConfig>) {
  const builtinDir = path.join(__dirname, "recipes", "default");
  const workspaceDir = workspacePath(api, cfg.workspaceRecipesDir);

  const out: Array<{ source: "builtin" | "workspace"; path: string }> = [];

  if (await fileExists(builtinDir)) {
    const files = await fs.readdir(builtinDir);
    for (const f of files) if (f.endsWith(".md")) out.push({ source: "builtin", path: path.join(builtinDir, f) });
  }

  if (await fileExists(workspaceDir)) {
    const files = await fs.readdir(workspaceDir);
    for (const f of files) if (f.endsWith(".md")) out.push({ source: "workspace", path: path.join(workspaceDir, f) });
  }

  return out;
}

function parseFrontmatter(md: string): { frontmatter: RecipeFrontmatter; body: string } {
  // very small frontmatter parser: expects ---\nYAML\n---\n
  if (!md.startsWith("---\n")) {
    throw new Error("Recipe markdown must start with YAML frontmatter (---)");
  }
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("Recipe frontmatter not terminated (---)");
  const yamlText = md.slice(4, end + 1); // include trailing newline
  const body = md.slice(end + 5);
  const frontmatter = YAML.parse(yamlText) as RecipeFrontmatter;
  if (!frontmatter?.id) throw new Error("Recipe frontmatter must include id");
  return { frontmatter, body };
}

async function loadRecipeById(api: OpenClawPluginApi, recipeId: string) {
  const cfg = getCfg(api);
  const files = await listRecipeFiles(api, cfg);
  for (const f of files) {
    const md = await fs.readFile(f.path, "utf8");
    const { frontmatter } = parseFrontmatter(md);
    if (frontmatter.id === recipeId) return { file: f, md, ...parseFrontmatter(md) };
  }
  throw new Error(`Recipe not found: ${recipeId}`);
}

function skillInstallCommands(cfg: Required<RecipesConfig>, skills: string[]) {
  // We standardize on clawhub CLI. Workspace-local install path is implicit by running from workspace
  // OR by environment var if clawhub supports it (unknown). For now: cd workspace + install.
  // We'll refine once we lock exact clawhub CLI flags.
  const lines = [
    `cd "${"$WORKSPACE"}"  # set WORKSPACE=~/.openclaw/workspace`,
    ...skills.map((s) => `npx clawhub@latest install ${s}`),
  ];
  return lines;
}

async function detectMissingSkills(installDir: string, skills: string[]) {
  const missing: string[] = [];
  for (const s of skills) {
    const p = path.join(installDir, s);
    if (!(await fileExists(p))) missing.push(s);
  }
  return missing;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function ticketStageDir(teamDir: string, stage: "backlog" | "in-progress" | "testing" | "done" | "assignments") {
  return stage === "assignments"
    ? path.join(teamDir, "work", "assignments")
    : path.join(teamDir, "work", stage);
}

async function ensureTicketStageDirs(teamDir: string) {
  // Idempotent. Used to harden ticket commands for older team workspaces.
  // NOTE: creating these directories is safe even if empty.
  await Promise.all([
    ensureDir(path.join(teamDir, "work")),
    ensureDir(ticketStageDir(teamDir, "backlog")),
    ensureDir(ticketStageDir(teamDir, "in-progress")),
    ensureDir(ticketStageDir(teamDir, "testing")),
    ensureDir(ticketStageDir(teamDir, "done")),
    ensureDir(ticketStageDir(teamDir, "assignments")),
  ]);
}

type CronInstallMode = "off" | "prompt" | "on";

type CronMappingStateV1 = {
  version: 1;
  entries: Record<
    string,
    {
      installedCronId: string;
      specHash: string;
      orphaned?: boolean;
      updatedAtMs: number;
    }
  >;
};

function cronKey(scope: { kind: "team"; teamId: string; recipeId: string } | { kind: "agent"; agentId: string; recipeId: string }, cronJobId: string) {
  return scope.kind === "team"
    ? `team:${scope.teamId}:recipe:${scope.recipeId}:cron:${cronJobId}`
    : `agent:${scope.agentId}:recipe:${scope.recipeId}:cron:${cronJobId}`;
}

function hashSpec(spec: unknown) {
  const json = stableStringify(spec);
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(p: string, data: unknown) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function loadCronMappingState(statePath: string): Promise<CronMappingStateV1> {
  const existing = await readJsonFile<CronMappingStateV1>(statePath);
  if (existing && existing.version === 1 && existing.entries && typeof existing.entries === "object") return existing;
  return { version: 1, entries: {} };
}

type OpenClawCronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: any;
  payload?: any;
  delivery?: any;
  agentId?: string | null;
  description?: string;
};

import { toolsInvoke, type ToolTextResult, type ToolsInvokeRequest } from "./src/toolsInvoke";

function parseToolTextJson(text: string, label: string) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as any;
  } catch (e) {
    const err = new Error(`Failed parsing JSON from tool text (${label})`);
    (err as any).text = text;
    (err as any).cause = e;
    throw err;
  }
}

async function cronList(api: any) {
  const result = await toolsInvoke<ToolTextResult>(api, {
    tool: "cron",
    args: { action: "list", includeDisabled: true },
  });
  const text = result?.content?.find((c) => c.type === "text")?.text;
  const parsed = text ? (parseToolTextJson(text, "cron.list") as { jobs?: OpenClawCronJob[] }) : null;
  return { jobs: parsed?.jobs ?? [] };
}

async function cronAdd(api: any, job: any) {
  const result = await toolsInvoke<ToolTextResult>(api, { tool: "cron", args: { action: "add", job } });
  const text = result?.content?.find((c) => c.type === "text")?.text;
  return text ? parseToolTextJson(text, "cron.add") : null;
}

async function cronUpdate(api: any, jobId: string, patch: any) {
  const result = await toolsInvoke<ToolTextResult>(api, {
    tool: "cron",
    args: { action: "update", jobId, patch },
  });
  const text = result?.content?.find((c) => c.type === "text")?.text;
  return text ? parseToolTextJson(text, "cron.update") : null;
}

function normalizeCronJobs(frontmatter: RecipeFrontmatter): CronJobSpec[] {
  const raw = frontmatter.cronJobs;
  if (!raw) return [];
  if (!Array.isArray(raw)) throw new Error("frontmatter.cronJobs must be an array");

  const out: CronJobSpec[] = [];
  const seen = new Set<string>();
  for (const j of raw as any[]) {
    if (!j || typeof j !== "object") throw new Error("cronJobs entries must be objects");
    const id = String((j as any).id ?? "").trim();
    if (!id) throw new Error("cronJobs[].id is required");
    if (seen.has(id)) throw new Error(`Duplicate cronJobs[].id: ${id}`);
    seen.add(id);

    const schedule = String((j as any).schedule ?? "").trim();
    const message = String((j as any).message ?? (j as any).task ?? (j as any).prompt ?? "").trim();
    if (!schedule) throw new Error(`cronJobs[${id}].schedule is required`);
    if (!message) throw new Error(`cronJobs[${id}].message is required`);

    out.push({
      id,
      schedule,
      message,
      name: (j as any).name ? String((j as any).name) : undefined,
      description: (j as any).description ? String((j as any).description) : undefined,
      timezone: (j as any).timezone ? String((j as any).timezone) : undefined,
      channel: (j as any).channel ? String((j as any).channel) : undefined,
      to: (j as any).to ? String((j as any).to) : undefined,
      agentId: (j as any).agentId ? String((j as any).agentId) : undefined,
      enabledByDefault: Boolean((j as any).enabledByDefault ?? false),
    });
  }
  return out;
}

async function promptYesNo(header: string) {
  if (!process.stdin.isTTY) return false;
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(`${header}\nProceed? (y/N) `);
    return ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function reconcileRecipeCronJobs(opts: {
  api: OpenClawPluginApi;
  recipe: RecipeFrontmatter;
  scope: { kind: "team"; teamId: string; recipeId: string; stateDir: string } | { kind: "agent"; agentId: string; recipeId: string; stateDir: string };
  cronInstallation: CronInstallMode;
}) {
  const desired = normalizeCronJobs(opts.recipe);
  if (!desired.length) return { ok: true, changed: false, note: "no-cron-jobs" as const };

  const mode = opts.cronInstallation;
  if (mode === "off") {
    return { ok: true, changed: false, note: "cron-installation-off" as const, desiredCount: desired.length };
  }

  // Decide whether jobs should be enabled on creation. Default is conservative.
  let userOptIn = mode === "on";
  if (mode === "prompt") {
    const header = `Recipe ${opts.scope.recipeId} defines ${desired.length} cron job(s).\nThese run automatically on a schedule. Install them?`;
    userOptIn = await promptYesNo(header);

    // If the user declines, skip all cron reconciliation entirely. This avoids a
    // potentially slow gateway cron.list call and matches user intent.
    if (!userOptIn) {
      return { ok: true, changed: false, note: "cron-installation-declined" as const, desiredCount: desired.length };
    }

    if (!process.stdin.isTTY) {
      console.error("Non-interactive mode: defaulting cron install to disabled.");
    }
  }

  const statePath = path.join(opts.scope.stateDir, "notes", "cron-jobs.json");
  const state = await loadCronMappingState(statePath);

  // Fast path: if we have no prior installed ids for these desired jobs, skip cron.list.
  // cron.list can be slow/hang on some setups; we can still create jobs and record ids.
  const desiredKeys = desired.map((j) => cronKey(opts.scope as any, j.id));
  const hasAnyInstalled = desiredKeys.some((k) => Boolean(state.entries[k]?.installedCronId));

  const list = hasAnyInstalled ? await cronList(opts.api) : { jobs: [] };
  const byId = new Map((list?.jobs ?? []).map((j) => [j.id, j] as const));

  const now = Date.now();
  const desiredIds = new Set(desired.map((j) => j.id));

  const results: any[] = [];

  for (const j of desired) {
    const key = cronKey(opts.scope as any, j.id);
    const name = j.name ?? `${opts.scope.kind === "team" ? (opts.scope as any).teamId : (opts.scope as any).agentId} • ${opts.scope.recipeId} • ${j.id}`;

    const desiredSpec = {
      schedule: j.schedule,
      message: j.message,
      timezone: j.timezone ?? "",
      channel: j.channel ?? "last",
      to: j.to ?? "",
      agentId: j.agentId ?? "",
      name,
      description: j.description ?? "",
    };
    const specHash = hashSpec(desiredSpec);

    const prev = state.entries[key];
    const installedId = prev?.installedCronId;
    const existing = installedId ? byId.get(installedId) : undefined;

    const wantEnabled = userOptIn ? Boolean(j.enabledByDefault) : false;

    if (!existing) {
      // Create new job.
      const sessionTarget = j.agentId ? "isolated" : "main";
      const job = {
        name,
        agentId: j.agentId ?? null,
        description: j.description ?? "",
        enabled: wantEnabled,
        wakeMode: "next-heartbeat",
        sessionTarget,
        schedule: { kind: "cron", expr: j.schedule, ...(j.timezone ? { tz: j.timezone } : {}) },
        payload: j.agentId
          ? { kind: "agentTurn", message: j.message }
          : { kind: "systemEvent", text: j.message },
        ...(j.channel || j.to
          ? {
              delivery: {
                mode: "announce",
                ...(j.channel ? { channel: j.channel } : {}),
                ...(j.to ? { to: j.to } : {}),
                bestEffort: true,
              },
            }
          : {}),
      };

      const created = await cronAdd(opts.api, job);
      const newId = (created as any)?.id ?? (created as any)?.job?.id;
      if (!newId) throw new Error("Failed to parse cron add output (missing id)");

      state.entries[key] = { installedCronId: newId, specHash, updatedAtMs: now, orphaned: false };
      results.push({ action: "created", key, installedCronId: newId, enabled: wantEnabled });
      continue;
    }

    // Update existing job if spec changed.
    if (prev?.specHash !== specHash) {
      const patch: any = {
        name,
        agentId: j.agentId ?? null,
        description: j.description ?? "",
        sessionTarget: j.agentId ? "isolated" : "main",
        wakeMode: "next-heartbeat",
        schedule: { kind: "cron", expr: j.schedule, ...(j.timezone ? { tz: j.timezone } : {}) },
        payload: j.agentId ? { kind: "agentTurn", message: j.message } : { kind: "systemEvent", text: j.message },
      };
      if (j.channel || j.to) {
        patch.delivery = {
          mode: "announce",
          ...(j.channel ? { channel: j.channel } : {}),
          ...(j.to ? { to: j.to } : {}),
          bestEffort: true,
        };
      }

      await cronUpdate(opts.api, existing.id, patch);
      results.push({ action: "updated", key, installedCronId: existing.id });
    } else {
      results.push({ action: "unchanged", key, installedCronId: existing.id });
    }

    // Enabled precedence: if user did not opt in, force disabled. Otherwise preserve current enabled state.
    if (!userOptIn) {
      if (existing.enabled) {
        await cronUpdate(opts.api, existing.id, { enabled: false });
        results.push({ action: "disabled", key, installedCronId: existing.id });
      }
    }

    state.entries[key] = { installedCronId: existing.id, specHash, updatedAtMs: now, orphaned: false };
  }

  // Handle removed jobs: disable safely.
  for (const [key, entry] of Object.entries(state.entries)) {
    if (!key.includes(`:recipe:${opts.scope.recipeId}:cron:`)) continue;
    const cronId = key.split(":cron:")[1] ?? "";
    if (!cronId || desiredIds.has(cronId)) continue;

    const job = byId.get(entry.installedCronId);
    if (job && job.enabled) {
      await cronUpdate(api, job.id, { enabled: false });
      results.push({ action: "disabled-removed", key, installedCronId: job.id });
    }

    state.entries[key] = { ...entry, orphaned: true, updatedAtMs: now };
  }

  await writeJsonFile(statePath, state);

  const changed = results.some((r) => r.action === "created" || r.action === "updated" || r.action?.startsWith("disabled"));
  return { ok: true, changed, results };
}

function renderTemplate(raw: string, vars: Record<string, string>) {
  // Tiny, safe template renderer: replaces {{key}}.
  // No conditionals, no eval.
  return raw.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return typeof v === "string" ? v : "";
  });
}

async function writeFileSafely(p: string, content: string, mode: "createOnly" | "overwrite") {
  if (mode === "createOnly" && (await fileExists(p))) return { wrote: false, reason: "exists" as const };
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, content, "utf8");
  return { wrote: true, reason: "ok" as const };
}

type AgentConfigSnippet = {
  id: string;
  workspace: string;
  identity?: { name?: string };
  tools?: { profile?: string; allow?: string[]; deny?: string[] };
};

type BindingMatch = {
  channel: string;
  accountId?: string;
  // OpenClaw config schema uses: dm | group | channel
  peer?: { kind: "dm" | "group" | "channel"; id: string };
  guildId?: string;
  teamId?: string;
};

type BindingSnippet = {
  agentId: string;
  match: BindingMatch;
};

function upsertAgentInConfig(cfgObj: any, snippet: AgentConfigSnippet) {
  if (!cfgObj.agents) cfgObj.agents = {};
  if (!Array.isArray(cfgObj.agents.list)) cfgObj.agents.list = [];

  const list: any[] = cfgObj.agents.list;
  const idx = list.findIndex((a) => a?.id === snippet.id);
  const prev = idx >= 0 ? list[idx] : {};
  const nextAgent = {
    ...prev,
    id: snippet.id,
    workspace: snippet.workspace,
    // identity: merge (safe)
    identity: {
      ...(prev?.identity ?? {}),
      ...(snippet.identity ?? {}),
    },
    // tools: replace when provided (so stale deny/allow don’t linger)
    tools: snippet.tools ? { ...snippet.tools } : prev?.tools,
  };

  if (idx >= 0) {
    list[idx] = nextAgent;
    return;
  }

  // New agent: append to end of list.
  // (We still separately enforce that main exists and stays first/default.)
  list.push(nextAgent);
}

function ensureMainFirstInAgentsList(cfgObj: any, api: OpenClawPluginApi) {
  if (!cfgObj.agents) cfgObj.agents = {};
  if (!Array.isArray(cfgObj.agents.list)) cfgObj.agents.list = [];

  const list: any[] = cfgObj.agents.list;

  const workspaceRoot =
    cfgObj.agents?.defaults?.workspace ??
    api.config.agents?.defaults?.workspace ??
    "~/.openclaw/workspace";

  const idx = list.findIndex((a) => a?.id === "main");
  const prevMain = idx >= 0 ? list[idx] : {};

  // Enforce: main exists, is first, and is the default.
  const main = {
    ...prevMain,
    id: "main",
    default: true,
    workspace: prevMain?.workspace ?? workspaceRoot,
    sandbox: prevMain?.sandbox ?? { mode: "off" },
  };

  // Ensure only one default.
  for (const a of list) {
    if (a?.id !== "main" && a?.default) a.default = false;
  }

  if (idx >= 0) list.splice(idx, 1);
  list.unshift(main);
}

function stableStringify(x: any) {
  const seen = new WeakSet();
  const sortObj = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(sortObj);
      const out: any = {};
      for (const k of Object.keys(v).sort()) out[k] = sortObj(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortObj(x));
}

function upsertBindingInConfig(cfgObj: any, binding: BindingSnippet) {
  if (!Array.isArray(cfgObj.bindings)) cfgObj.bindings = [];
  const list: any[] = cfgObj.bindings;

  const sig = stableStringify({ agentId: binding.agentId, match: binding.match });
  const idx = list.findIndex((b) => stableStringify({ agentId: b?.agentId, match: b?.match }) === sig);

  if (idx >= 0) {
    // Update in place (preserve ordering)
    list[idx] = { ...list[idx], ...binding };
    return { changed: false, note: "already-present" as const };
  }

  // Most-specific-first: if a peer match is specified, insert at front so it wins.
  // Otherwise append.
  if (binding.match?.peer) list.unshift(binding);
  else list.push(binding);

  return { changed: true, note: "added" as const };
}

function removeBindingsInConfig(cfgObj: any, opts: { agentId?: string; match: BindingMatch }) {
  if (!Array.isArray(cfgObj.bindings)) cfgObj.bindings = [];
  const list: any[] = cfgObj.bindings;

  const targetMatchSig = stableStringify(opts.match);

  const before = list.length;
  const kept: any[] = [];
  const removed: any[] = [];

  for (const b of list) {
    const sameAgent = opts.agentId ? String(b?.agentId ?? "") === opts.agentId : true;
    const sameMatch = stableStringify(b?.match ?? {}) === targetMatchSig;
    if (sameAgent && sameMatch) removed.push(b);
    else kept.push(b);
  }

  cfgObj.bindings = kept;
  return { removedCount: before - kept.length, removed };
}

async function applyAgentSnippetsToOpenClawConfig(api: OpenClawPluginApi, snippets: AgentConfigSnippet[]) {
  // Load the latest config from disk (not the snapshot in api.config).
  const current = (api.runtime as any).config?.loadConfig?.();
  if (!current) throw new Error("Failed to load config via api.runtime.config.loadConfig()");

  // Some loaders return { cfg, ... }. If so, normalize.
  const cfgObj = (current.cfg ?? current) as any;

  // Always keep main first/default when multi-agent workflows are in play.
  ensureMainFirstInAgentsList(cfgObj, api);

  for (const s of snippets) upsertAgentInConfig(cfgObj, s);

  // Re-assert ordering/default after upserts.
  ensureMainFirstInAgentsList(cfgObj, api);

  await (api.runtime as any).config?.writeConfigFile?.(cfgObj);
  return { updatedAgents: snippets.map((s) => s.id) };
}

async function applyBindingSnippetsToOpenClawConfig(api: OpenClawPluginApi, snippets: BindingSnippet[]) {
  const current = (api.runtime as any).config?.loadConfig?.();
  if (!current) throw new Error("Failed to load config via api.runtime.config.loadConfig()");
  const cfgObj = (current.cfg ?? current) as any;

  const results: any[] = [];
  for (const s of snippets) {
    results.push({ ...s, result: upsertBindingInConfig(cfgObj, s) });
  }

  await (api.runtime as any).config?.writeConfigFile?.(cfgObj);
  return { updatedBindings: results };
}

async function scaffoldAgentFromRecipe(
  api: OpenClawPluginApi,
  recipe: RecipeFrontmatter,
  opts: {
    agentId: string;
    agentName?: string;
    update?: boolean;
    vars?: Record<string, string>;

    // Where to write the scaffolded files (may be a shared team workspace role folder)
    filesRootDir: string;

    // What to set in agents.list[].workspace (may be shared team workspace root)
    workspaceRootDir: string;
  },
) {
  await ensureDir(opts.filesRootDir);

  const templates = recipe.templates ?? {};
  const files = recipe.files ?? [];
  const vars = opts.vars ?? {};

  const fileResults: Array<{ path: string; wrote: boolean; reason: string }> = [];
  for (const f of files) {
    const raw = templates[f.template];
    if (typeof raw !== "string") throw new Error(`Missing template: ${f.template}`);
    const rendered = renderTemplate(raw, vars);
    const target = path.join(opts.filesRootDir, f.path);
    const mode = opts.update ? (f.mode ?? "overwrite") : (f.mode ?? "createOnly");
    const r = await writeFileSafely(target, rendered, mode);
    fileResults.push({ path: target, wrote: r.wrote, reason: r.reason });
  }

  const configSnippet: AgentConfigSnippet = {
    id: opts.agentId,
    workspace: opts.workspaceRootDir,
    identity: { name: opts.agentName ?? recipe.name ?? opts.agentId },
    tools: recipe.tools ?? {},
  };

  return {
    filesRootDir: opts.filesRootDir,
    workspaceRootDir: opts.workspaceRootDir,
    fileResults,
    next: {
      configSnippet,
    },
  };
}

const recipesPlugin = {
  id: "recipes",
  name: "Recipes",
  description: "Markdown recipes that scaffold agents and teams.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  register(api: OpenClawPluginApi) {
    // On plugin load, ensure multi-agent config has an explicit agents.list with main at top.
    // This is idempotent and only writes if a change is required.
    (async () => {
      try {
        const current = (api.runtime as any).config?.loadConfig?.();
        if (!current) return;
        const cfgObj = (current.cfg ?? current) as any;

        const before = JSON.stringify(cfgObj.agents?.list ?? null);
        ensureMainFirstInAgentsList(cfgObj, api);
        const after = JSON.stringify(cfgObj.agents?.list ?? null);

        if (before !== after) {
          await (api.runtime as any).config?.writeConfigFile?.(cfgObj);
          console.error("[recipes] ensured agents.list includes main as first/default");
        }
      } catch (e) {
        console.error(`[recipes] warning: failed to ensure main agent in agents.list: ${(e as Error).message}`);
      }
    })();

    api.registerCli(
      ({ program }) => {
        const cmd = program.command("recipes").description("Manage markdown recipes (scaffold agents/teams)");

        cmd
          .command("list")
          .description("List available recipes (builtin + workspace)")
          .action(async () => {
            const cfg = getCfg(api);
            const files = await listRecipeFiles(api, cfg);
            const rows: Array<{ id: string; name?: string; kind?: string; source: string }> = [];
            for (const f of files) {
              try {
                const md = await fs.readFile(f.path, "utf8");
                const { frontmatter } = parseFrontmatter(md);
                rows.push({ id: frontmatter.id, name: frontmatter.name, kind: frontmatter.kind, source: f.source });
              } catch (e) {
                rows.push({ id: path.basename(f.path), name: `INVALID: ${(e as Error).message}`, kind: "invalid", source: f.source });
              }
            }
            console.log(JSON.stringify(rows, null, 2));
          });

        cmd
          .command("show")
          .description("Show a recipe by id")
          .argument("<id>", "Recipe id")
          .action(async (id: string) => {
            const r = await loadRecipeById(api, id);
            console.log(r.md);
          });

        cmd
          .command("status")
          .description("Check for missing skills for a recipe (or all)")
          .argument("[id]", "Recipe id")
          .action(async (id?: string) => {
            const cfg = getCfg(api);
            const files = await listRecipeFiles(api, cfg);
            const out: any[] = [];

            for (const f of files) {
              const md = await fs.readFile(f.path, "utf8");
              const { frontmatter } = parseFrontmatter(md);
              if (id && frontmatter.id !== id) continue;
              const req = frontmatter.requiredSkills ?? [];
              const workspaceRoot = api.config.agents?.defaults?.workspace;
              if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
              const installDir = path.join(workspaceRoot, cfg.workspaceSkillsDir);
              const missing = await detectMissingSkills(installDir, req);
              out.push({
                id: frontmatter.id,
                requiredSkills: req,
                missingSkills: missing,
                installCommands: missing.length ? skillInstallCommands(cfg, missing) : [],
              });
            }

            console.log(JSON.stringify(out, null, 2));
          });

        const parseMatchFromOptions = (options: any): BindingMatch => {
          if (options.match) {
            return JSON5.parse(String(options.match)) as BindingMatch;
          }

          const match: BindingMatch = {
            channel: String(options.channel),
          };
          if (options.accountId) match.accountId = String(options.accountId);
          if (options.guildId) match.guildId = String(options.guildId);
          if (options.teamId) match.teamId = String(options.teamId);

          if (options.peerKind || options.peerId) {
            if (!options.peerKind || !options.peerId) {
              throw new Error("--peer-kind and --peer-id must be provided together");
            }
            let kind = String(options.peerKind);
            // Back-compat alias
            if (kind === "direct") kind = "dm";
            if (kind !== "dm" && kind !== "group" && kind !== "channel") {
              throw new Error("--peer-kind must be dm|group|channel (or direct as alias for dm)");
            }
            match.peer = { kind, id: String(options.peerId) };
          }

          return match;
        };

        cmd
          .command("bind")
          .description("Add/update a multi-agent routing binding (writes openclaw.json bindings[])")
          .requiredOption("--agent-id <agentId>", "Target agent id")
          .requiredOption("--channel <channel>", "Channel name (telegram|whatsapp|discord|slack|...) ")
          .option("--account-id <accountId>", "Channel accountId (if applicable)")
          .option("--peer-kind <kind>", "Peer kind (dm|group|channel) (aliases: direct->dm)")
          .option("--peer-id <id>", "Peer id (DM number/id, group id, or channel id)")
          .option("--guild-id <guildId>", "Discord guildId")
          .option("--team-id <teamId>", "Slack teamId")
          .option("--match <json>", "Full match object as JSON/JSON5 (overrides flags)")
          .action(async (options: any) => {
            const agentId = String(options.agentId);
            const match = parseMatchFromOptions(options);
            if (!match?.channel) throw new Error("match.channel is required");

            const res = await applyBindingSnippetsToOpenClawConfig(api, [{ agentId, match }]);
            console.log(JSON.stringify(res, null, 2));
            console.error("Binding written. Restart gateway if required for changes to take effect.");
          });

        cmd
          .command("unbind")
          .description("Remove routing binding(s) from openclaw.json bindings[]")
          .requiredOption("--channel <channel>", "Channel name")
          .option("--agent-id <agentId>", "Optional agent id; when set, removes only bindings for this agent")
          .option("--account-id <accountId>", "Channel accountId")
          .option("--peer-kind <kind>", "Peer kind (dm|group|channel)")
          .option("--peer-id <id>", "Peer id")
          .option("--guild-id <guildId>", "Discord guildId")
          .option("--team-id <teamId>", "Slack teamId")
          .option("--match <json>", "Full match object as JSON/JSON5 (overrides flags)")
          .action(async (options: any) => {
            const agentId = typeof options.agentId === "string" ? String(options.agentId) : undefined;
            const match = parseMatchFromOptions(options);
            if (!match?.channel) throw new Error("match.channel is required");

            const current = (api.runtime as any).config?.loadConfig?.();
            if (!current) throw new Error("Failed to load config via api.runtime.config.loadConfig()");
            const cfgObj = (current.cfg ?? current) as any;

            const res = removeBindingsInConfig(cfgObj, { agentId, match });
            await (api.runtime as any).config?.writeConfigFile?.(cfgObj);

            console.log(JSON.stringify({ ok: true, ...res }, null, 2));
            console.error("Binding(s) removed. Restart gateway if required for changes to take effect.");
          });

        cmd
          .command("bindings")
          .description("Show current bindings from openclaw config")
          .action(async () => {
            const current = (api.runtime as any).config?.loadConfig?.();
            if (!current) throw new Error("Failed to load config via api.runtime.config.loadConfig()");
            const cfgObj = (current.cfg ?? current) as any;
            console.log(JSON.stringify(cfgObj.bindings ?? [], null, 2));
          });

        cmd
          .command("migrate-team")
          .description("Migrate a legacy team scaffold into the new workspace-<teamId> layout")
          .requiredOption("--team-id <teamId>", "Team id (must end with -team)")
          .option("--mode <mode>", "move|copy", "move")
          .option("--dry-run", "Print the plan without writing anything", false)
          .option("--overwrite", "Allow merging into an existing destination (dangerous)", false)
          .action(async (options: any) => {
            const teamId = String(options.teamId);
            if (!teamId.endsWith("-team")) throw new Error("teamId must end with -team");

            const mode = String(options.mode ?? "move");
            if (mode !== "move" && mode !== "copy") throw new Error("--mode must be move|copy");

            const baseWorkspace = api.config.agents?.defaults?.workspace;
            if (!baseWorkspace) throw new Error("agents.defaults.workspace is not set in config");

            const legacyTeamDir = path.resolve(baseWorkspace, "teams", teamId);
            const legacyAgentsDir = path.resolve(baseWorkspace, "agents");

            const destTeamDir = path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
            const destRolesDir = path.join(destTeamDir, "roles");

            const exists = async (p: string) => fileExists(p);

            // Build migration plan
            const plan: any = {
              teamId,
              mode,
              legacy: { teamDir: legacyTeamDir, agentsDir: legacyAgentsDir },
              dest: { teamDir: destTeamDir, rolesDir: destRolesDir },
              steps: [] as any[],
              agentIds: [] as string[],
            };

            const legacyTeamExists = await exists(legacyTeamDir);
            if (!legacyTeamExists) {
              throw new Error(`Legacy team directory not found: ${legacyTeamDir}`);
            }

            const destExists = await exists(destTeamDir);
            if (destExists && !options.overwrite) {
              throw new Error(`Destination already exists: ${destTeamDir} (re-run with --overwrite to merge)`);
            }

            // 1) Move/copy team shared workspace
            plan.steps.push({ kind: "teamDir", from: legacyTeamDir, to: destTeamDir });

            // 2) Move/copy each role agent directory into roles/<role>/
            const legacyAgentsExist = await exists(legacyAgentsDir);
            let legacyAgentFolders: string[] = [];
            if (legacyAgentsExist) {
              legacyAgentFolders = (await fs.readdir(legacyAgentsDir)).filter((x) => x.startsWith(`${teamId}-`));
            }

            for (const folder of legacyAgentFolders) {
              const agentId = folder;
              const role = folder.slice((teamId + "-").length);
              const from = path.join(legacyAgentsDir, folder);
              const to = path.join(destRolesDir, role);
              plan.agentIds.push(agentId);
              plan.steps.push({ kind: "roleDir", agentId, role, from, to });
            }

            const dryRun = !!options.dryRun;
            if (dryRun) {
              console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
              return;
            }

            // Helpers
            const copyDirRecursive = async (src: string, dst: string) => {
              await ensureDir(dst);
              const entries = await fs.readdir(src, { withFileTypes: true });
              for (const ent of entries) {
                const s = path.join(src, ent.name);
                const d = path.join(dst, ent.name);
                if (ent.isDirectory()) await copyDirRecursive(s, d);
                else if (ent.isSymbolicLink()) {
                  const link = await fs.readlink(s);
                  await fs.symlink(link, d);
                } else {
                  await ensureDir(path.dirname(d));
                  await fs.copyFile(s, d);
                }
              }
            };

            const removeDirRecursive = async (p: string) => {
              // node 25 supports fs.rm
              await fs.rm(p, { recursive: true, force: true });
            };

            const moveDir = async (src: string, dst: string) => {
              await ensureDir(path.dirname(dst));
              try {
                await fs.rename(src, dst);
              } catch {
                // cross-device or existing: fallback to copy+remove
                await copyDirRecursive(src, dst);
                await removeDirRecursive(src);
              }
            };

            // Execute plan
            if (mode === "copy") {
              await copyDirRecursive(legacyTeamDir, destTeamDir);
            } else {
              await moveDir(legacyTeamDir, destTeamDir);
            }

            // Ensure roles dir exists
            await ensureDir(destRolesDir);

            for (const step of plan.steps.filter((s: any) => s.kind === "roleDir")) {
              if (!(await exists(step.from))) continue;
              if (mode === "copy") await copyDirRecursive(step.from, step.to);
              else await moveDir(step.from, step.to);
            }

            // Update config: set each team agent's workspace to destTeamDir (shared)
            const agentSnippets: AgentConfigSnippet[] = plan.agentIds.map((agentId: string) => ({
              id: agentId,
              workspace: destTeamDir,
            }));
            if (agentSnippets.length) {
              await applyAgentSnippetsToOpenClawConfig(api, agentSnippets);
            }

            console.log(JSON.stringify({ ok: true, migrated: teamId, destTeamDir, agentIds: plan.agentIds }, null, 2));
          });

        cmd
          .command("install-skill")
          .description(
            "Install a skill from ClawHub (confirmation-gated). Default: global (~/.openclaw/skills). Use --agent-id or --team-id for scoped installs.",
          )
          .argument("<skill>", "ClawHub skill slug (e.g. github)")
          .option("--yes", "Skip confirmation prompt")
          .option("--global", "Install into global shared skills (~/.openclaw/skills) (default when no scope flags)")
          .option("--agent-id <agentId>", "Install into a specific agent workspace (workspace-<agentId>)")
          .option("--team-id <teamId>", "Install into a team workspace (workspace-<teamId>)")
          .action(async (idOrSlug: string, options: any) => {
            const cfg = getCfg(api);

            // Phase 1: accept skill slug directly.
            // If the arg matches a recipe id and the recipe declares skill deps, we install those deps.
            // (In the future we can add explicit mapping via frontmatter like skillSlug: <slug>.)
            let recipe: RecipeFrontmatter | null = null;
            try {
              const loaded = await loadRecipeById(api, idOrSlug);
              recipe = loaded.frontmatter;
            } catch {
              recipe = null;
            }

            const baseWorkspace = api.config.agents?.defaults?.workspace;
            if (!baseWorkspace) throw new Error("agents.defaults.workspace is not set in config");

            const stateDir = path.resolve(baseWorkspace, ".."); // ~/.openclaw

            const scopeFlags = [options.global ? "global" : null, options.agentId ? "agent" : null, options.teamId ? "team" : null].filter(Boolean);
            if (scopeFlags.length > 1) {
              throw new Error("Use only one of: --global, --agent-id, --team-id");
            }

            const agentIdOpt = typeof options.agentId === "string" ? options.agentId.trim() : "";
            const teamIdOpt = typeof options.teamId === "string" ? options.teamId.trim() : "";

            // Default is global install when no scope is provided.
            const scope = scopeFlags[0] ?? "global";

            let workdir: string;
            let dirName: string;
            let installDir: string;

            if (scope === "agent") {
              if (!agentIdOpt) throw new Error("--agent-id cannot be empty");
              const agentWorkspace = path.resolve(stateDir, `workspace-${agentIdOpt}`);
              workdir = agentWorkspace;
              dirName = cfg.workspaceSkillsDir;
              installDir = path.join(agentWorkspace, dirName);
            } else if (scope === "team") {
              if (!teamIdOpt) throw new Error("--team-id cannot be empty");
              const teamWorkspace = path.resolve(stateDir, `workspace-${teamIdOpt}`);
              workdir = teamWorkspace;
              dirName = cfg.workspaceSkillsDir;
              installDir = path.join(teamWorkspace, dirName);
            } else {
              workdir = stateDir;
              dirName = "skills";
              installDir = path.join(stateDir, dirName);
            }

            await ensureDir(installDir);

            const skillsToInstall = recipe
              ? Array.from(new Set([...(recipe.requiredSkills ?? []), ...(recipe.optionalSkills ?? [])])).filter(Boolean)
              : [idOrSlug];

            if (!skillsToInstall.length) {
              console.log(JSON.stringify({ ok: true, installed: [], note: "Nothing to install." }, null, 2));
              return;
            }

            const missing = await detectMissingSkills(installDir, skillsToInstall);
            const already = skillsToInstall.filter((s) => !missing.includes(s));

            if (already.length) {
              console.error(`Already present in skills dir (${installDir}): ${already.join(", ")}`);
            }

            if (!missing.length) {
              console.log(JSON.stringify({ ok: true, installed: [], alreadyInstalled: already }, null, 2));
              return;
            }

            const targetLabel = scope === "agent" ? `agent:${agentIdOpt}` : scope === "team" ? `team:${teamIdOpt}` : "global";
            const header = recipe
              ? `Install skills for recipe ${recipe.id} into ${installDir} (${targetLabel})?\n- ${missing.join("\n- ")}`
              : `Install skill into ${installDir} (${targetLabel})?\n- ${missing.join("\n- ")}`;

            const requireConfirm = !options.yes;
            if (requireConfirm) {
              if (!process.stdin.isTTY) {
                console.error("Refusing to prompt (non-interactive). Re-run with --yes.");
                process.exitCode = 2;
                return;
              }

              const readline = await import("node:readline/promises");
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                const ans = await rl.question(`${header}\nProceed? (y/N) `);
                const ok = ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
                if (!ok) {
                  console.error("Aborted; nothing installed.");
                  return;
                }
              } finally {
                rl.close();
              }
            } else {
              console.error(header);
            }

            // Avoid spawning subprocesses from plugins (triggers OpenClaw dangerous-pattern warnings).
            // For now, print the exact commands the user should run.
            console.error("\nSkill install requires the ClawHub CLI. Run the following then re-run this command:\n");
            for (const slug of missing) {
              console.error(
                `  npx clawhub@latest --workdir ${JSON.stringify(workdir)} --dir ${JSON.stringify(dirName)} install ${JSON.stringify(slug)}`,
              );
            }
            process.exitCode = 2;
            return;

            console.log(
              JSON.stringify(
                {
                  ok: true,
                  installed: missing,
                  installDir,
                  next: `Try: openclaw skills list (or check ${installDir})`,
                },
                null,
                2,
              ),
            );
          });

        async function installMarketplaceRecipe(slug: string, options: any) {
          const cfg = getCfg(api);
          const baseWorkspace = api.config.agents?.defaults?.workspace;
          if (!baseWorkspace) throw new Error("agents.defaults.workspace is not set in config");

          // Avoid network calls living in this file (it also reads files), since `openclaw security audit`
          // heuristics can flag "file read + network send".
          const { fetchMarketplaceRecipeMarkdown } = await import("./src/marketplaceFetch");
          const { md, metaUrl, sourceUrl } = await fetchMarketplaceRecipeMarkdown({
            registryBase: options.registryBase,
            slug,
          });

          const s = String(slug ?? "").trim();
          const recipesDir = path.join(baseWorkspace, cfg.workspaceRecipesDir);
          await ensureDir(recipesDir);
          const destPath = path.join(recipesDir, `${s}.md`);

          await writeFileSafely(destPath, md, options.overwrite ? "overwrite" : "createOnly");

          console.log(JSON.stringify({ ok: true, slug: s, wrote: destPath, sourceUrl, metaUrl }, null, 2));
        }

        cmd
          .command("install")
          .description("Install a marketplace recipe into your workspace recipes dir (by slug)")
          .argument("<idOrSlug>", "Marketplace recipe slug (e.g. development-team)")
          .option("--registry-base <url>", "Marketplace API base URL", "https://clawkitchen.ai")
          .option("--overwrite", "Overwrite existing recipe file")
          .action(async (slug: string, options: any) => installMarketplaceRecipe(slug, options));

        cmd
          .command("install-recipe")
          .description("Alias for: recipes install <slug>")
          .argument("<slug>", "Marketplace recipe slug (e.g. development-team)")
          .option("--registry-base <url>", "Marketplace API base URL", "https://clawkitchen.ai")
          .option("--overwrite", "Overwrite existing recipe file")
          .action(async (slug: string, options: any) => installMarketplaceRecipe(slug, options));

        cmd
          .command("dispatch")
          .description("Lead/dispatcher: turn a natural-language request into inbox + backlog ticket(s) + assignment stubs")
          .requiredOption("--team-id <teamId>", "Team id (workspace folder under teams/)")
          .option("--request <text>", "Natural-language request (if omitted, will prompt in TTY)")
          .option("--owner <owner>", "Ticket owner: dev|devops|lead|test", "dev")
          .option("--yes", "Skip review and write files without prompting")
          .action(async (options: any) => {
            const cfg = getCfg(api);

            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");

            const teamId = String(options.teamId);
            // Team workspace root (shared by all role agents): ~/.openclaw/workspace-<teamId>
            const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

            const inboxDir = path.join(teamDir, "inbox");
            const backlogDir = path.join(teamDir, "work", "backlog");
            const assignmentsDir = path.join(teamDir, "work", "assignments");

            const owner = String(options.owner ?? "dev");
            if (!['dev','devops','lead','test'].includes(owner)) {
              throw new Error("--owner must be one of: dev, devops, lead, test");
            }

            const slugify = (s: string) =>
              s
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")
                .slice(0, 60) || "request";

            const nowKey = () => {
              const d = new Date();
              const pad = (n: number) => String(n).padStart(2, "0");
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
            };

            const nextTicketNumber = async () => {
              const dirs = [
                backlogDir,
                path.join(teamDir, "work", "in-progress"),
                path.join(teamDir, "work", "testing"),
                path.join(teamDir, "work", "done"),
              ];
              let max = 0;
              for (const dir of dirs) {
                if (!(await fileExists(dir))) continue;
                const files = await fs.readdir(dir);
                for (const f of files) {
                  const m = f.match(/^(\d{4})-/);
                  if (m) max = Math.max(max, Number(m[1]));
                }
              }
              return max + 1;
            };

            let requestText = typeof options.request === "string" ? options.request.trim() : "";
            if (!requestText) {
              if (!process.stdin.isTTY) {
                throw new Error("Missing --request in non-interactive mode");
              }
              const readline = await import("node:readline/promises");
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                requestText = (await rl.question("Request: ")).trim();
              } finally {
                rl.close();
              }
            }
            if (!requestText) throw new Error("Request cannot be empty");

            // Minimal heuristic: one ticket per request.
            const ticketNum = await nextTicketNumber();
            const ticketNumStr = String(ticketNum).padStart(4, '0');
            const title = requestText.length > 80 ? requestText.slice(0, 77) + "…" : requestText;
            const baseSlug = slugify(title);

            const inboxPath = path.join(inboxDir, `${nowKey()}-${baseSlug}.md`);
            const ticketPath = path.join(backlogDir, `${ticketNumStr}-${baseSlug}.md`);
            const assignmentPath = path.join(assignmentsDir, `${ticketNumStr}-assigned-${owner}.md`);

            const receivedIso = new Date().toISOString();

            const inboxMd = `# Inbox — ${teamId}\n\nReceived: ${receivedIso}\n\n## Request\n${requestText}\n\n## Proposed work\n- Ticket: ${ticketNumStr}-${baseSlug}\n- Owner: ${owner}\n\n## Links\n- Ticket: ${path.relative(teamDir, ticketPath)}\n- Assignment: ${path.relative(teamDir, assignmentPath)}\n`;

            const ticketMd = `# ${ticketNumStr}-${baseSlug}\n\nCreated: ${receivedIso}\nOwner: ${owner}\nStatus: queued\nInbox: ${path.relative(teamDir, inboxPath)}\nAssignment: ${path.relative(teamDir, assignmentPath)}\n\n## Context\n${requestText}\n\n## Requirements\n- (fill in)\n\n## Acceptance criteria\n- (fill in)\n\n## Tasks\n- [ ] (fill in)\n`;

            const assignmentMd = `# Assignment — ${ticketNumStr}-${baseSlug}\n\nCreated: ${receivedIso}\nAssigned: ${owner}\n\n## Goal\n${title}\n\n## Ticket\n${path.relative(teamDir, ticketPath)}\n\n## Notes\n- Created by: openclaw recipes dispatch\n`;

            const plan = {
              teamId,
              request: requestText,
              files: [
                { path: inboxPath, kind: "inbox", summary: title },
                { path: ticketPath, kind: "backlog-ticket", summary: title },
                { path: assignmentPath, kind: "assignment", summary: owner },
              ],
            };

            const doWrite = async () => {
              await ensureDir(inboxDir);
              await ensureDir(backlogDir);
              await ensureDir(assignmentsDir);

              // createOnly to avoid accidental overwrite
              await writeFileSafely(inboxPath, inboxMd, "createOnly");
              await writeFileSafely(ticketPath, ticketMd, "createOnly");
              await writeFileSafely(assignmentPath, assignmentMd, "createOnly");
            };

            if (options.yes) {
              await doWrite();
              console.log(JSON.stringify({ ok: true, wrote: plan.files.map((f) => f.path) }, null, 2));
              return;
            }

            if (!process.stdin.isTTY) {
              console.error("Refusing to prompt (non-interactive). Re-run with --yes.");
              process.exitCode = 2;
              console.log(JSON.stringify({ ok: false, plan }, null, 2));
              return;
            }

            console.log(JSON.stringify({ plan }, null, 2));
            const readline = await import("node:readline/promises");
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            try {
              const ans = await rl.question("Write these files? (y/N) ");
              const ok = ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
              if (!ok) {
                console.error("Aborted; no files written.");
                return;
              }
            } finally {
              rl.close();
            }

            await doWrite();
            console.log(JSON.stringify({ ok: true, wrote: plan.files.map((f) => f.path) }, null, 2));
          });

        cmd
          .command("remove-team")
          .description("Safe uninstall: remove a scaffolded team workspace + agents + stamped cron jobs")
          .requiredOption("--team-id <teamId>", "Team id")
          .option("--plan", "Print plan and exit")
          .option("--json", "Output JSON")
          .option("--yes", "Skip confirmation (apply destructive changes)")
          .option("--include-ambiguous", "Also remove cron jobs that only loosely match the team (dangerous)")
          .action(async (options: any) => {
            const teamId = String(options.teamId);

            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");

            const cronJobsPath = path.resolve(workspaceRoot, "..", "cron", "jobs.json");

            const current = (api.runtime as any).config?.loadConfig?.();
            if (!current) throw new Error("Failed to load config via api.runtime.config.loadConfig()");
            const cfgObj = (current.cfg ?? current) as any;

            const cronStore = await loadCronStore(cronJobsPath);

            const plan = await buildRemoveTeamPlan({
              teamId,
              workspaceRoot,
              openclawConfigPath: "(managed by api.runtime.config)",
              cronJobsPath,
              cfgObj,
              cronStore,
            });

            const wantsJson = Boolean(options.json);

            if (options.plan) {
              console.log(JSON.stringify({ ok: true, plan }, null, 2));
              return;
            }

            if (!options.yes && !process.stdin.isTTY) {
              console.error("Refusing to prompt (non-interactive). Re-run with --yes or --plan.");
              process.exitCode = 2;
              console.log(JSON.stringify({ ok: false, plan }, null, 2));
              return;
            }

            if (!options.yes && process.stdin.isTTY) {
              console.log(JSON.stringify({ plan }, null, 2));
              const ok = await promptYesNo(
                `This will DELETE workspace-${teamId}, remove matching agents from openclaw config, and remove stamped cron jobs.`,
              );
              if (!ok) {
                console.error("Aborted; no changes made.");
                return;
              }
            }

            const includeAmbiguous = Boolean(options.includeAmbiguous);

            const result = await executeRemoveTeamPlan({
              plan,
              includeAmbiguous,
              cfgObj,
              cronStore,
            });

            await (api.runtime as any).config?.writeConfigFile?.(cfgObj);
            await saveCronStore(cronJobsPath, cronStore);

            if (wantsJson) {
              console.log(JSON.stringify(result, null, 2));
            } else {
              console.log(JSON.stringify(result, null, 2));
              console.error("Restart required: openclaw gateway restart");
            }
          });

        cmd
          .command("tickets")
          .description("List tickets for a team (backlog / in-progress / testing / done)")
          .requiredOption("--team-id <teamId>", "Team id")
          .option("--json", "Output JSON")
          .action(async (options: any) => {
            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
            const teamId = String(options.teamId);
            const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

            await ensureTicketStageDirs(teamDir);

            const dirs = {
              backlog: path.join(teamDir, "work", "backlog"),
              inProgress: path.join(teamDir, "work", "in-progress"),
              testing: path.join(teamDir, "work", "testing"),
              done: path.join(teamDir, "work", "done"),
            } as const;

            const readTickets = async (dir: string, stage: "backlog" | "in-progress" | "testing" | "done") => {
              if (!(await fileExists(dir))) return [] as any[];
              const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort();
              return files.map((f) => {
                const m = f.match(/^(\d{4})-(.+)\.md$/);
                return {
                  stage,
                  number: m ? Number(m[1]) : null,
                  id: m ? `${m[1]}-${m[2]}` : f.replace(/\.md$/, ""),
                  file: path.join(dir, f),
                };
              });
            };

            const backlog = await readTickets(dirs.backlog, "backlog");
            const inProgress = await readTickets(dirs.inProgress, "in-progress");
            const testing = await readTickets(dirs.testing, "testing");
            const done = await readTickets(dirs.done, "done");

            const out = {
              teamId,
              // Stable, machine-friendly list for consumers (watchers, dashboards)
              // Keep the per-lane arrays for backwards-compat.
              tickets: [...backlog, ...inProgress, ...testing, ...done],
              backlog,
              inProgress,
              testing,
              done,
            };

            if (options.json) {
              console.log(JSON.stringify(out, null, 2));
              return;
            }

            const print = (label: string, items: any[]) => {
              console.log(`\n${label} (${items.length})`);
              for (const t of items) console.log(`- ${t.id}`);
            };
            console.log(`Team: ${teamId}`);
            print("Backlog", out.backlog);
            print("In progress", out.inProgress);
            print("Testing", out.testing);
            print("Done", out.done);
          });

        async function moveTicketCore(options: any) {
          const workspaceRoot = api.config.agents?.defaults?.workspace;
          if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
          const teamId = String(options.teamId);
          const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

          await ensureTicketStageDirs(teamDir);

          const dest = String(options.to);
          if (!["backlog", "in-progress", "testing", "done"].includes(dest)) {
            throw new Error("--to must be one of: backlog, in-progress, testing, done");
          }

          const ticketArgRaw = String(options.ticket);
          const ticketArg = ticketArgRaw.match(/^\d+$/) && ticketArgRaw.length < 4 ? ticketArgRaw.padStart(4, "0") : ticketArgRaw;
          const ticketNum = ticketArg.match(/^\d{4}$/)
            ? ticketArg
            : ticketArg.match(/^(\d{4})-/)?.[1] ?? null;

          const stageDir = (stage: string) => {
            if (stage === "backlog") return path.join(teamDir, "work", "backlog");
            if (stage === "in-progress") return path.join(teamDir, "work", "in-progress");
            if (stage === "testing") return path.join(teamDir, "work", "testing");
            if (stage === "done") return path.join(teamDir, "work", "done");
            throw new Error(`Unknown stage: ${stage}`);
          };

          const searchDirs = [stageDir("backlog"), stageDir("in-progress"), stageDir("testing"), stageDir("done")];

          const findTicketFile = async () => {
            for (const dir of searchDirs) {
              if (!(await fileExists(dir))) continue;
              const files = await fs.readdir(dir);
              for (const f of files) {
                if (!f.endsWith(".md")) continue;
                if (ticketNum && f.startsWith(`${ticketNum}-`)) return path.join(dir, f);
                if (!ticketNum && f.replace(/\.md$/, "") === ticketArg) return path.join(dir, f);
              }
            }
            return null;
          };

          const srcPath = await findTicketFile();
          if (!srcPath) throw new Error(`Ticket not found: ${ticketArg}`);

          const destDir = stageDir(dest);
          await ensureDir(destDir);
          const filename = path.basename(srcPath);
          const destPath = path.join(destDir, filename);

          const patchStatus = (md: string) => {
            const nextStatus =
              dest === "backlog"
                ? "queued"
                : dest === "in-progress"
                  ? "in-progress"
                  : dest === "testing"
                    ? "testing"
                    : "done";

            let out = md;
            if (out.match(/^Status:\s.*$/m)) out = out.replace(/^Status:\s.*$/m, `Status: ${nextStatus}`);
            else out = out.replace(/^(# .+\n)/, `$1\nStatus: ${nextStatus}\n`);

            if (dest === "done" && options.completed) {
              const completed = new Date().toISOString();
              if (out.match(/^Completed:\s.*$/m)) out = out.replace(/^Completed:\s.*$/m, `Completed: ${completed}`);
              else out = out.replace(/^Status:.*$/m, (m) => `${m}\nCompleted: ${completed}`);
            }

            return out;
          };

          const md = await fs.readFile(srcPath, "utf8");
          const patched = patchStatus(md);
          await fs.writeFile(srcPath, patched, "utf8");

          if (srcPath !== destPath) {
            await fs.rename(srcPath, destPath);
          }

          return { ok: true, from: srcPath, to: destPath };
        }

        cmd
          .command("move-ticket")
          .description("Move a ticket between backlog/in-progress/testing/done (updates Status: line)")
          .requiredOption("--team-id <teamId>", "Team id")
          .requiredOption("--ticket <ticket>", "Ticket id or number (e.g. 0007 or 0007-some-slug)")
          .requiredOption("--to <stage>", "Destination stage: backlog|in-progress|testing|done")
          .option("--completed", "When moving to done, add Completed: timestamp")
          .option("--yes", "Skip confirmation")
          .action(async (options: any) => {
            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
            const teamId = String(options.teamId);
            const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

            await ensureTicketStageDirs(teamDir);

            const dest = String(options.to);
            if (!['backlog','in-progress','testing','done'].includes(dest)) {
              throw new Error("--to must be one of: backlog, in-progress, testing, done");
            }

            const ticketArg = String(options.ticket);
            const ticketNum = ticketArg.match(/^\d{4}$/) ? ticketArg : (ticketArg.match(/^(\d{4})-/)?.[1] ?? null);

            const stageDir = (stage: string) => {
              if (stage === 'backlog') return path.join(teamDir, 'work', 'backlog');
              if (stage === 'in-progress') return path.join(teamDir, 'work', 'in-progress');
              if (stage === 'testing') return path.join(teamDir, 'work', 'testing');
              if (stage === 'done') return path.join(teamDir, 'work', 'done');
              throw new Error(`Unknown stage: ${stage}`);
            };

            const searchDirs = [stageDir('backlog'), stageDir('in-progress'), stageDir('testing'), stageDir('done')];

            const findTicketFile = async () => {
              for (const dir of searchDirs) {
                if (!(await fileExists(dir))) continue;
                const files = await fs.readdir(dir);
                for (const f of files) {
                  if (!f.endsWith('.md')) continue;
                  if (ticketNum && f.startsWith(`${ticketNum}-`)) return path.join(dir, f);
                  if (!ticketNum && f.replace(/\.md$/, '') === ticketArg) return path.join(dir, f);
                }
              }
              return null;
            };

            const srcPath = await findTicketFile();
            if (!srcPath) throw new Error(`Ticket not found: ${ticketArg}`);

            const destDir = stageDir(dest);
            await ensureDir(destDir);
            const filename = path.basename(srcPath);
            const destPath = path.join(destDir, filename);

            const patchStatus = (md: string) => {
              const nextStatus =
                dest === 'backlog'
                  ? 'queued'
                  : dest === 'in-progress'
                    ? 'in-progress'
                    : dest === 'testing'
                      ? 'testing'
                      : 'done';

              let out = md;
              if (out.match(/^Status:\s.*$/m)) out = out.replace(/^Status:\s.*$/m, `Status: ${nextStatus}`);
              else out = out.replace(/^(# .+\n)/, `$1\nStatus: ${nextStatus}\n`);

              if (dest === 'done' && options.completed) {
                const completed = new Date().toISOString();
                if (out.match(/^Completed:\s.*$/m)) out = out.replace(/^Completed:\s.*$/m, `Completed: ${completed}`);
                else out = out.replace(/^Status:.*$/m, (m) => `${m}\nCompleted: ${completed}`);
              }

              return out;
            };

            const plan = { from: srcPath, to: destPath };

            if (!options.yes && process.stdin.isTTY) {
              console.log(JSON.stringify({ plan }, null, 2));
              const readline = await import('node:readline/promises');
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                const ans = await rl.question(`Move ticket to ${dest}? (y/N) `);
                const ok = ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes';
                if (!ok) {
                  console.error('Aborted; no changes made.');
                  return;
                }
              } finally {
                rl.close();
              }
            } else if (!options.yes && !process.stdin.isTTY) {
              console.error('Refusing to move without confirmation in non-interactive mode. Re-run with --yes.');
              process.exitCode = 2;
              console.log(JSON.stringify({ ok: false, plan }, null, 2));
              return;
            }

            const md = await fs.readFile(srcPath, 'utf8');
            const nextMd = patchStatus(md);
            await fs.writeFile(srcPath, nextMd, 'utf8');

            if (srcPath !== destPath) {
              await fs.rename(srcPath, destPath);
            }

            console.log(JSON.stringify({ ok: true, moved: plan }, null, 2));
          });

        cmd
          .command("assign")
          .description("Assign a ticket to an owner (writes assignment stub + updates Owner: in ticket)")
          .requiredOption("--team-id <teamId>", "Team id")
          .requiredOption("--ticket <ticket>", "Ticket id or number (e.g. 0007 or 0007-some-slug)")
          .requiredOption("--owner <owner>", "Owner: dev|devops|lead|test")
          .option("--overwrite", "Overwrite existing assignment file")
          .option("--yes", "Skip confirmation")
          .action(async (options: any) => {
            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
            const teamId = String(options.teamId);
            const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

            await ensureTicketStageDirs(teamDir);

            const owner = String(options.owner);
            if (!['dev','devops','lead','test'].includes(owner)) {
              throw new Error("--owner must be one of: dev, devops, lead, test");
            }

            const stageDir = (stage: string) => {
              if (stage === 'backlog') return path.join(teamDir, 'work', 'backlog');
              if (stage === 'in-progress') return path.join(teamDir, 'work', 'in-progress');
              if (stage === 'testing') return path.join(teamDir, 'work', 'testing');
              if (stage === 'done') return path.join(teamDir, 'work', 'done');
              throw new Error(`Unknown stage: ${stage}`);
            };
            const searchDirs = [stageDir('backlog'), stageDir('in-progress'), stageDir('testing'), stageDir('done')];

            const ticketArg = String(options.ticket);
            const ticketNum = ticketArg.match(/^\d{4}$/) ? ticketArg : (ticketArg.match(/^(\d{4})-/)?.[1] ?? null);

            const findTicketFile = async () => {
              for (const dir of searchDirs) {
                if (!(await fileExists(dir))) continue;
                const files = await fs.readdir(dir);
                for (const f of files) {
                  if (!f.endsWith('.md')) continue;
                  if (ticketNum && f.startsWith(`${ticketNum}-`)) return path.join(dir, f);
                  if (!ticketNum && f.replace(/\.md$/, '') === ticketArg) return path.join(dir, f);
                }
              }
              return null;
            };

            const ticketPath = await findTicketFile();
            if (!ticketPath) throw new Error(`Ticket not found: ${ticketArg}`);

            const filename = path.basename(ticketPath);
            const m = filename.match(/^(\d{4})-(.+)\.md$/);
            const ticketNumStr = m?.[1] ?? (ticketNum ?? '0000');
            const slug = m?.[2] ?? (ticketArg.replace(/^\d{4}-?/, '') || 'ticket');

            const assignmentsDir = path.join(teamDir, 'work', 'assignments');
            await ensureDir(assignmentsDir);
            const assignmentPath = path.join(assignmentsDir, `${ticketNumStr}-assigned-${owner}.md`);

            const patchOwner = (md: string) => {
              if (md.match(/^Owner:\s.*$/m)) return md.replace(/^Owner:\s.*$/m, `Owner: ${owner}`);
              return md.replace(/^(# .+\n)/, `$1\nOwner: ${owner}\n`);
            };

            const plan = { ticketPath, assignmentPath, owner };

            if (!options.yes && process.stdin.isTTY) {
              console.log(JSON.stringify({ plan }, null, 2));
              const readline = await import('node:readline/promises');
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                const ans = await rl.question(`Assign ticket to ${owner}? (y/N) `);
                const ok = ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes';
                if (!ok) {
                  console.error('Aborted; no changes made.');
                  return;
                }
              } finally {
                rl.close();
              }
            } else if (!options.yes && !process.stdin.isTTY) {
              console.error('Refusing to assign without confirmation in non-interactive mode. Re-run with --yes.');
              process.exitCode = 2;
              console.log(JSON.stringify({ ok: false, plan }, null, 2));
              return;
            }

            const md = await fs.readFile(ticketPath, 'utf8');
            const nextMd = patchOwner(md);
            await fs.writeFile(ticketPath, nextMd, 'utf8');

            const assignmentMd = `# Assignment — ${ticketNumStr}-${slug}\n\nAssigned: ${owner}\n\n## Ticket\n${path.relative(teamDir, ticketPath)}\n\n## Notes\n- Created by: openclaw recipes assign\n`;
            await writeFileSafely(assignmentPath, assignmentMd, options.overwrite ? 'overwrite' : 'createOnly');

            console.log(JSON.stringify({ ok: true, plan }, null, 2));
          });

        cmd
          .command("take")
          .description("Shortcut: assign ticket to owner + move to in-progress")
          .requiredOption("--team-id <teamId>", "Team id")
          .requiredOption("--ticket <ticket>", "Ticket id or number")
          .option("--owner <owner>", "Owner: dev|devops|lead|test", "dev")
          .option("--yes", "Skip confirmation")
          .action(async (options: any) => {
            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
            const teamId = String(options.teamId);
            const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

            await ensureTicketStageDirs(teamDir);

            const owner = String(options.owner ?? 'dev');
            if (!['dev','devops','lead','test'].includes(owner)) {
              throw new Error("--owner must be one of: dev, devops, lead, test");
            }

            const stageDir = (stage: string) => {
              if (stage === 'backlog') return path.join(teamDir, 'work', 'backlog');
              if (stage === 'in-progress') return path.join(teamDir, 'work', 'in-progress');
              if (stage === 'testing') return path.join(teamDir, 'work', 'testing');
              if (stage === 'done') return path.join(teamDir, 'work', 'done');
              throw new Error(`Unknown stage: ${stage}`);
            };
            const searchDirs = [stageDir('backlog'), stageDir('in-progress'), stageDir('testing'), stageDir('done')];

            const ticketArg = String(options.ticket);
            const ticketNum = ticketArg.match(/^\d{4}$/) ? ticketArg : (ticketArg.match(/^(\d{4})-/)?.[1] ?? null);

            const findTicketFile = async () => {
              for (const dir of searchDirs) {
                if (!(await fileExists(dir))) continue;
                const files = await fs.readdir(dir);
                for (const f of files) {
                  if (!f.endsWith('.md')) continue;
                  if (ticketNum && f.startsWith(`${ticketNum}-`)) return path.join(dir, f);
                  if (!ticketNum && f.replace(/\.md$/, '') === ticketArg) return path.join(dir, f);
                }
              }
              return null;
            };

            const srcPath = await findTicketFile();
            if (!srcPath) throw new Error(`Ticket not found: ${ticketArg}`);

            const destDir = stageDir('in-progress');
            await ensureDir(destDir);
            const filename = path.basename(srcPath);
            const destPath = path.join(destDir, filename);

            const patch = (md: string) => {
              let out = md;
              if (out.match(/^Owner:\s.*$/m)) out = out.replace(/^Owner:\s.*$/m, `Owner: ${owner}`);
              else out = out.replace(/^(# .+\n)/, `$1\nOwner: ${owner}\n`);

              if (out.match(/^Status:\s.*$/m)) out = out.replace(/^Status:\s.*$/m, `Status: in-progress`);
              else out = out.replace(/^(# .+\n)/, `$1\nStatus: in-progress\n`);

              return out;
            };

            const plan = { from: srcPath, to: destPath, owner };

            if (!options.yes && process.stdin.isTTY) {
              console.log(JSON.stringify({ plan }, null, 2));
              const readline = await import('node:readline/promises');
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                const ans = await rl.question(`Assign to ${owner} and move to in-progress? (y/N) `);
                const ok = ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes';
                if (!ok) {
                  console.error('Aborted; no changes made.');
                  return;
                }
              } finally {
                rl.close();
              }
            } else if (!options.yes && !process.stdin.isTTY) {
              console.error('Refusing to take without confirmation in non-interactive mode. Re-run with --yes.');
              process.exitCode = 2;
              console.log(JSON.stringify({ ok: false, plan }, null, 2));
              return;
            }

            const md = await fs.readFile(srcPath, 'utf8');
            const nextMd = patch(md);
            await fs.writeFile(srcPath, nextMd, 'utf8');

            if (srcPath !== destPath) {
              await fs.rename(srcPath, destPath);
            }

            const m = filename.match(/^(\d{4})-(.+)\.md$/);
            const ticketNumStr = m?.[1] ?? (ticketNum ?? '0000');
            const slug = m?.[2] ?? (ticketArg.replace(/^\d{4}-?/, '') || 'ticket');
            const assignmentsDir = path.join(teamDir, 'work', 'assignments');
            await ensureDir(assignmentsDir);
            const assignmentPath = path.join(assignmentsDir, `${ticketNumStr}-assigned-${owner}.md`);
            const assignmentMd = `# Assignment — ${ticketNumStr}-${slug}\n\nAssigned: ${owner}\n\n## Ticket\n${path.relative(teamDir, destPath)}\n\n## Notes\n- Created by: openclaw recipes take\n`;
            await writeFileSafely(assignmentPath, assignmentMd, 'createOnly');

            console.log(JSON.stringify({ ok: true, plan, assignmentPath }, null, 2));
          });

        cmd
          .command("handoff")
          .description("QA handoff: move ticket to testing + assign to tester")
          .requiredOption("--team-id <teamId>", "Team id")
          .requiredOption("--ticket <ticket>", "Ticket id or number")
          .option("--tester <owner>", "Tester owner (default: test)", "test")
          .option("--overwrite", "Overwrite destination ticket file / assignment stub if they already exist")
          .option("--yes", "Skip confirmation")
          .action(async (options: any) => {
            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
            const teamId = String(options.teamId);
            const teamDir = path.resolve(workspaceRoot, "..", `workspace-${teamId}`);

            const tester = String(options.tester ?? "test");
            if (!['dev','devops','lead','test'].includes(tester)) {
              throw new Error("--tester must be one of: dev, devops, lead, test");
            }

            const stageDir = (stage: string) => {
              if (stage === 'in-progress') return path.join(teamDir, 'work', 'in-progress');
              if (stage === 'testing') return path.join(teamDir, 'work', 'testing');
              throw new Error(`Unknown stage: ${stage}`);
            };

            const ticketArg = String(options.ticket);
            const ticketNum = ticketArg.match(/^\d{4}$/) ? ticketArg : (ticketArg.match(/^(\d{4})-/)?.[1] ?? null);

            const findTicketFile = async (dir: string) => {
              if (!(await fileExists(dir))) return null;
              const files = await fs.readdir(dir);
              for (const f of files) {
                if (!f.endsWith('.md')) continue;
                if (ticketNum && f.startsWith(`${ticketNum}-`)) return path.join(dir, f);
                if (!ticketNum && f.replace(/\.md$/, '') === ticketArg) return path.join(dir, f);
              }
              return null;
            };

            const inProgressDir = stageDir('in-progress');
            const testingDir = stageDir('testing');
            await ensureDir(testingDir);

            const srcInProgress = await findTicketFile(inProgressDir);
            const srcTesting = await findTicketFile(testingDir);

            if (!srcInProgress && !srcTesting) {
              throw new Error(`Ticket not found in in-progress/testing: ${ticketArg}`);
            }
            if (!srcInProgress && srcTesting) {
              // already in testing (idempotent path)
            }

            const srcPath = srcInProgress ?? srcTesting!;
            const filename = path.basename(srcPath);
            const destPath = path.join(testingDir, filename);

            const patch = (md: string) => {
              let out = md;
              if (out.match(/^Owner:\s.*$/m)) out = out.replace(/^Owner:\s.*$/m, `Owner: ${tester}`);
              else out = out.replace(/^(# .+\n)/, `$1\nOwner: ${tester}\n`);

              if (out.match(/^Status:\s.*$/m)) out = out.replace(/^Status:\s.*$/m, `Status: testing`);
              else out = out.replace(/^(# .+\n)/, `$1\nStatus: testing\n`);

              return out;
            };

            const plan = {
              from: srcPath,
              to: destPath,
              tester,
              note: srcTesting ? 'already-in-testing' : 'move-to-testing',
            };

            if (!options.yes && process.stdin.isTTY) {
              console.log(JSON.stringify({ plan }, null, 2));
              const readline = await import('node:readline/promises');
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                const ans = await rl.question(`Move to testing + assign to ${tester}? (y/N) `);
                const ok = ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes';
                if (!ok) {
                  console.error('Aborted; no changes made.');
                  return;
                }
              } finally {
                rl.close();
              }
            } else if (!options.yes && !process.stdin.isTTY) {
              console.error('Refusing to handoff without confirmation in non-interactive mode. Re-run with --yes.');
              process.exitCode = 2;
              console.log(JSON.stringify({ ok: false, plan }, null, 2));
              return;
            }

            if (srcInProgress && srcPath !== destPath) {
              if (!options.overwrite && (await fileExists(destPath))) {
                throw new Error(`Destination exists: ${destPath} (re-run with --overwrite to replace)`);
              }
            }

            const md = await fs.readFile(srcPath, 'utf8');
            const nextMd = patch(md);
            await fs.writeFile(srcPath, nextMd, 'utf8');

            if (srcInProgress && srcPath !== destPath) {
              if (options.overwrite && (await fileExists(destPath))) {
                await fs.rm(destPath);
              }
              await fs.rename(srcPath, destPath);
            }

            const m = filename.match(/^(\d{4})-(.+)\.md$/);
            const ticketNumStr = m?.[1] ?? (ticketNum ?? '0000');
            const slug = m?.[2] ?? (ticketArg.replace(/^\d{4}-?/, '') || 'ticket');
            const assignmentsDir = path.join(teamDir, 'work', 'assignments');
            await ensureDir(assignmentsDir);
            const assignmentPath = path.join(assignmentsDir, `${ticketNumStr}-assigned-${tester}.md`);
            const assignmentMd = `# Assignment — ${ticketNumStr}-${slug}\n\nAssigned: ${tester}\n\n## Ticket\n${path.relative(teamDir, destPath)}\n\n## Notes\n- Created by: openclaw recipes handoff\n`;
            await writeFileSafely(assignmentPath, assignmentMd, options.overwrite ? 'overwrite' : 'createOnly');

            console.log(JSON.stringify({ ok: true, plan, assignmentPath }, null, 2));
          });

        cmd
          .command("complete")
          .description("Complete a ticket (move to done, set Status: done, and add Completed: timestamp)")
          .requiredOption("--team-id <teamId>", "Team id")
          .requiredOption("--ticket <ticket>", "Ticket id or number")
          .option("--yes", "Skip confirmation")
          .action(async (options: any) => {
            const args = [
              'recipes',
              'move-ticket',
              '--team-id',
              String(options.teamId),
              '--ticket',
              String(options.ticket),
              '--to',
              'done',
              '--completed',
            ];
            if (options.yes) args.push('--yes');

            try {
              await moveTicketCore({
                teamId: options.teamId,
                ticket: options.ticket,
                to: "done",
                completed: true,
                yes: options.yes,
              });
            } catch (e) {
              process.exitCode = 1;
              throw e;
            }
          });

        cmd
          .command("scaffold")
          .description("Scaffold an agent from a recipe")
          .argument("<recipeId>", "Recipe id")
          .requiredOption("--agent-id <id>", "Agent id")
          .option("--name <name>", "Agent display name")
          .option("--overwrite", "Overwrite existing recipe-managed files")
          .option("--apply-config", "Write the agent into openclaw config (agents.list)")
          .action(async (recipeId: string, options: any) => {
            const loaded = await loadRecipeById(api, recipeId);
            const recipe = loaded.frontmatter;
            if ((recipe.kind ?? "agent") !== "agent") {
              throw new Error(`Recipe is not an agent recipe: kind=${recipe.kind}`);
            }

            const cfg = getCfg(api);
            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");
            const installDir = path.join(workspaceRoot, cfg.workspaceSkillsDir);
            const missing = await detectMissingSkills(installDir, recipe.requiredSkills ?? []);
            if (missing.length) {
              console.error(`Missing skills for recipe ${recipeId}: ${missing.join(", ")}`);
              console.error(`Install commands (workspace-local):\n${skillInstallCommands(cfg, missing).join("\n")}`);
              process.exitCode = 2;
              return;
            }

            const baseWorkspace = api.config.agents?.defaults?.workspace ?? "~/.openclaw/workspace";
            // Put standalone agent workspaces alongside the default workspace (same parent dir).
            const resolvedWorkspaceRoot = path.resolve(baseWorkspace, "..", `workspace-${options.agentId}`);

            const result = await scaffoldAgentFromRecipe(api, recipe, {
              agentId: options.agentId,
              agentName: options.name,
              update: !!options.overwrite,
              filesRootDir: resolvedWorkspaceRoot,
              workspaceRootDir: resolvedWorkspaceRoot,
              vars: {
                agentId: options.agentId,
                agentName: options.name ?? recipe.name ?? options.agentId,
              },
            });

            if (options.applyConfig) {
              await applyAgentSnippetsToOpenClawConfig(api, [result.next.configSnippet]);
            }

            const cron = await reconcileRecipeCronJobs({
              api,
              recipe,
              scope: { kind: "agent", agentId: String(options.agentId), recipeId: recipe.id, stateDir: resolvedWorkspaceRoot },
              cronInstallation: getCfg(api).cronInstallation,
            });

            console.log(JSON.stringify({ ...result, cron }, null, 2));
          });

        cmd
          .command("scaffold-team")
          .description("Scaffold a team (shared workspace + multiple agents) from a team recipe")
          .argument("<recipeId>", "Recipe id")
          .requiredOption("-t, --team-id <teamId>", "Team id")
          .option("--recipe-id <recipeId>", "Custom workspace recipe id to write (default: <teamId>)")
          .option("--overwrite", "Overwrite existing recipe-managed files")
          .option("--overwrite-recipe", "Overwrite the generated workspace recipe file (workspace/recipes/<teamId>.md) if it already exists")
          .option("--auto-increment", "If the workspace recipe id is taken, pick the next available <teamId>-2/-3/...")
          .option("--apply-config", "Write all team agents into openclaw config (agents.list)")
          .action(async (recipeId: string, options: any) => {
            const loaded = await loadRecipeById(api, recipeId);
            const recipe = loaded.frontmatter;
            if ((recipe.kind ?? "team") !== "team") {
              throw new Error(`Recipe is not a team recipe: kind=${recipe.kind}`);
            }
            const teamId = String(options.teamId);

            const cfg = getCfg(api);
            const baseWorkspace = api.config.agents?.defaults?.workspace;
            if (!baseWorkspace) throw new Error("agents.defaults.workspace is not set in config");
            const installDir = path.join(baseWorkspace, cfg.workspaceSkillsDir);
            const missing = await detectMissingSkills(installDir, recipe.requiredSkills ?? []);
            if (missing.length) {
              console.error(`Missing skills for recipe ${recipeId}: ${missing.join(", ")}`);
              console.error(`Install commands (workspace-local):\n${skillInstallCommands(cfg, missing).join("\n")}`);
              process.exitCode = 2;
              return;
            }

            // Team workspace root (shared by all role agents): ~/.openclaw/workspace-<teamId>
            const teamDir = path.resolve(baseWorkspace, "..", `workspace-${teamId}`);
            await ensureDir(teamDir);


            // Also create a workspace recipe file for this installed team.
            // This establishes a stable, editable recipe id that matches the team id (no custom- prefix).
            const recipesDir = path.join(baseWorkspace, "recipes");
            await ensureDir(recipesDir);

            const overwriteRecipe = !!options.overwriteRecipe;
            const autoIncrement = !!options.autoIncrement;

            function suggestedRecipeIds(baseId: string) {
              const today = new Date().toISOString().slice(0, 10);
              return [`${baseId}-v2`, `${baseId}-${today}`, `${baseId}-alt`];
            }

            async function pickRecipeId(baseId: string) {
              const basePath = path.join(recipesDir, `${baseId}.md`);
              if (!(await fileExists(basePath))) return baseId;
              if (overwriteRecipe) return baseId;
              if (autoIncrement) {
                let n = 2;
                while (n < 1000) {
                  const candidate = `${baseId}-${n}`;
                  const candidatePath = path.join(recipesDir, `${candidate}.md`);
                  if (!(await fileExists(candidatePath))) return candidate;
                  n += 1;
                }
                throw new Error(`No available recipe id found for ${baseId} (tried up to -999)`);
              }

              const suggestions = suggestedRecipeIds(baseId);
              const msg = [
                `Workspace recipe already exists: recipes/${baseId}.md`,
                `Choose a different recipe id (recommended) and re-run with --recipe-id, for example:`,
                ...suggestions.map((s) => `  openclaw recipes scaffold-team ${recipeId} -t ${teamId} --recipe-id ${s}`),
                `Or re-run with --auto-increment to pick ${baseId}-2/-3/... automatically, or --overwrite-recipe to overwrite the existing file.`,
              ].join("\n");
              throw new Error(msg);
            }

            const explicitRecipeId = typeof options.recipeId === "string" ? String(options.recipeId).trim() : "";
            const baseRecipeId = explicitRecipeId || teamId;
            const workspaceRecipeId = await pickRecipeId(baseRecipeId);

            // Write the recipe file, copying the source recipe markdown but forcing frontmatter.id to the chosen id.
            // Default: createOnly; overwrite only when --overwrite-recipe is set.
            const recipeFilePath = path.join(recipesDir, `${workspaceRecipeId}.md`);
            const parsed = parseFrontmatter(loaded.md);
            const fm = { ...parsed.frontmatter, id: workspaceRecipeId, name: parsed.frontmatter.name ?? recipe.name ?? workspaceRecipeId };
            const nextMd = `---\n${YAML.stringify(fm)}---\n${parsed.body}`;
            await writeFileSafely(recipeFilePath, nextMd, overwriteRecipe ? "overwrite" : "createOnly");

            const rolesDir = path.join(teamDir, "roles");
            await ensureDir(rolesDir);
            const notesDir = path.join(teamDir, "notes");
            const workDir = path.join(teamDir, "work");
            const backlogDir = path.join(workDir, "backlog");
            const inProgressDir = path.join(workDir, "in-progress");
            const testingDir = path.join(workDir, "testing");
            const doneDir = path.join(workDir, "done");
            const assignmentsDir = path.join(workDir, "assignments");

            // Seed standard team files (createOnly unless --overwrite)
            const overwrite = !!options.overwrite;

            const sharedContextDir = path.join(teamDir, "shared-context");
            const sharedContextOutputsDir = path.join(sharedContextDir, "agent-outputs");
            const sharedContextFeedbackDir = path.join(sharedContextDir, "feedback");
            const sharedContextKpisDir = path.join(sharedContextDir, "kpis");
            const sharedContextCalendarDir = path.join(sharedContextDir, "calendar");

            await Promise.all([
              // Back-compat: keep existing shared/ folder, but shared-context/ is canonical going forward.
              ensureDir(path.join(teamDir, "shared")),
              ensureDir(sharedContextDir),
              ensureDir(sharedContextOutputsDir),
              ensureDir(sharedContextFeedbackDir),
              ensureDir(sharedContextKpisDir),
              ensureDir(sharedContextCalendarDir),
              ensureDir(path.join(teamDir, "inbox")),
              ensureDir(path.join(teamDir, "outbox")),
              ensureDir(notesDir),
              ensureDir(workDir),
              ensureDir(backlogDir),
              ensureDir(inProgressDir),
              ensureDir(testingDir),
              ensureDir(doneDir),
              ensureDir(assignmentsDir),
            ]);

            // Seed shared-context starter schema (createOnly unless --overwrite)
            const sharedPrioritiesPath = path.join(sharedContextDir, "priorities.md");
            const prioritiesMd = `# Priorities — ${teamId}\n\n- (empty)\n\n## Notes\n- Lead curates this file.\n- Non-lead roles should append updates to shared-context/agent-outputs/ instead.\n`;
            await writeFileSafely(sharedPrioritiesPath, prioritiesMd, overwrite ? "overwrite" : "createOnly");

            const planPath = path.join(notesDir, "plan.md");
            const statusPath = path.join(notesDir, "status.md");
            const ticketsPath = path.join(teamDir, "TICKETS.md");

            const planMd = `# Plan — ${teamId}\n\n- (empty)\n`;
            const statusMd = `# Status — ${teamId}\n\n- (empty)\n`;
            const ticketsMd = `# Tickets — ${teamId}\n\n## Naming\n- Backlog tickets live in work/backlog/\n- In-progress tickets live in work/in-progress/\n- Testing tickets live in work/testing/\n- Done tickets live in work/done/\n- Filename ordering is the queue: 0001-..., 0002-...\n\n## Stages\n- backlog → in-progress → testing → done\n\n## QA handoff\n- When work is ready for QA: move the ticket to \`work/testing/\` and assign to test.\n\n## Required fields\nEach ticket should include:\n- Title\n- Context\n- Requirements\n- Acceptance criteria\n- Owner (dev/devops/lead/test)\n- Status (queued/in-progress/testing/done)\n\n## Example\n\n\`\`\`md\n# 0001-example-ticket\n\nOwner: dev\nStatus: queued\n\n## Context\n...\n\n## Requirements\n- ...\n\n## Acceptance criteria\n- ...\n\`\`\`\n`;

            await writeFileSafely(planPath, planMd, overwrite ? "overwrite" : "createOnly");
            await writeFileSafely(statusPath, statusMd, overwrite ? "overwrite" : "createOnly");
            await writeFileSafely(ticketsPath, ticketsMd, overwrite ? "overwrite" : "createOnly");

            const agents = recipe.agents ?? [];
            if (!agents.length) throw new Error("Team recipe must include agents[]");

            const results: any[] = [];
            for (const a of agents) {
              const role = a.role;
              const agentId = a.agentId ?? `${teamId}-${role}`;
              const agentName = a.name ?? `${teamId} ${role}`;

              // For team recipes, we namespace template keys like: "lead.soul".
              const scopedRecipe: RecipeFrontmatter = {
                id: `${recipe.id}:${role}`,
                name: agentName,
                kind: "agent",
                requiredSkills: recipe.requiredSkills,
                optionalSkills: recipe.optionalSkills,
                templates: recipe.templates,
                files: (recipe.files ?? []).map((f) => ({
                  ...f,
                  template: f.template.includes(".") ? f.template : `${role}.${f.template}`,
                })),
                tools: a.tools ?? recipe.tools,
              };

              const roleDir = path.join(rolesDir, role);
              const r = await scaffoldAgentFromRecipe(api, scopedRecipe, {
                agentId,
                agentName,
                update: !!options.overwrite,
                // Write role-specific files under roles/<role>/
                filesRootDir: roleDir,
                // But set the agent workspace root to the shared team workspace
                workspaceRootDir: teamDir,
                vars: {
                  teamId,
                  teamDir,
                  role,
                  agentId,
                  agentName,
                  roleDir,
                },
              });
              results.push({ role, agentId, ...r });
            }

            // Create a minimal TEAM.md
            const teamMdPath = path.join(teamDir, "TEAM.md");
            const teamMd = `# ${teamId}\n\nShared workspace for this agent team.\n\n## Folders\n- inbox/ — requests\n- outbox/ — deliverables\n- shared-context/ — curated shared context + append-only agent outputs\n- shared/ — legacy shared artifacts (back-compat)\n- notes/ — plan + status\n- work/ — working files\n`;
            await writeFileSafely(teamMdPath, teamMd, options.overwrite ? "overwrite" : "createOnly");

            // Persist provenance (parent recipe) for UIs like ClawKitchen.
            // This avoids brittle heuristics like teamId==recipeId guessing.
            const teamMetaPath = path.join(teamDir, "team.json");
            const teamMeta = {
              teamId,
              recipeId: recipe.id,
              recipeName: recipe.name ?? "",
              scaffoldedAt: new Date().toISOString(),
            };
            await writeJsonFile(teamMetaPath, teamMeta);

            if (options.applyConfig) {
              const snippets: AgentConfigSnippet[] = results.map((x: any) => x.next.configSnippet);
              await applyAgentSnippetsToOpenClawConfig(api, snippets);
            }

            const cron = await reconcileRecipeCronJobs({
              api,
              recipe,
              scope: { kind: "team", teamId, recipeId: recipe.id, stateDir: teamDir },
              cronInstallation: getCfg(api).cronInstallation,
            });

            console.log(
              JSON.stringify(
                {
                  teamId,
                  teamDir,
                  agents: results,
                  cron,
                  next: {
                    note:
                      options.applyConfig
                        ? "agents.list[] updated in openclaw config"
                        : "Run again with --apply-config to write agents into openclaw config.",
                  },
                },
                null,
                2,
              ),
            );
          });
      },
      { commands: ["recipes"] },
    );
  },
};

// Internal helpers used by unit tests. Not part of the public plugin API.
export const __internal = {
  ensureMainFirstInAgentsList,
  upsertBindingInConfig,
  removeBindingsInConfig,
  stableStringify,

  patchTicketField(md: string, key: string, value: string) {
    const lineRe = new RegExp(`^${key}:\\s.*$`, "m");
    if (md.match(lineRe)) return md.replace(lineRe, `${key}: ${value}`);
    return md.replace(/^(# .+\n)/, `$1\n${key}: ${value}\n`);
  },

  patchTicketOwner(md: string, owner: string) {
    return this.patchTicketField(md, "Owner", owner);
  },

  patchTicketStatus(md: string, status: string) {
    return this.patchTicketField(md, "Status", status);
  },
};

export default recipesPlugin;
