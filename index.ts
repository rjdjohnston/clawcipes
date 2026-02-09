import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import path from "node:path";
import fs from "node:fs/promises";
import JSON5 from "json5";
import YAML from "yaml";

type RecipesConfig = {
  workspaceRecipesDir?: string;
  workspaceAgentsDir?: string;
  workspaceSkillsDir?: string;
  workspaceTeamsDir?: string;
  autoInstallMissingSkills?: boolean;
  confirmAutoInstall?: boolean;
};

type RecipeFrontmatter = {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  kind?: "agent" | "team";

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

async function detectMissingSkills(api: OpenClawPluginApi, cfg: Required<RecipesConfig>, skills: string[]) {
  const missing: string[] = [];
  for (const s of skills) {
    const p = workspacePath(api, cfg.workspaceSkillsDir, s);
    if (!(await fileExists(p))) missing.push(s);
  }
  return missing;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
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

async function scaffoldAgentFromRecipe(api: OpenClawPluginApi, recipe: RecipeFrontmatter, opts: {
  agentId: string;
  agentName?: string;
  update?: boolean;
  vars?: Record<string, string>;
}) {
  const cfg = getCfg(api);

  const agentDir = workspacePath(api, cfg.workspaceAgentsDir, opts.agentId);
  await ensureDir(agentDir);

  const templates = recipe.templates ?? {};
  const files = recipe.files ?? [];
  const vars = opts.vars ?? {};

  const fileResults: Array<{ path: string; wrote: boolean; reason: string }> = [];
  for (const f of files) {
    const raw = templates[f.template];
    if (typeof raw !== "string") throw new Error(`Missing template: ${f.template}`);
    const rendered = renderTemplate(raw, vars);
    const target = path.join(agentDir, f.path);
    const mode = opts.update ? (f.mode ?? "overwrite") : (f.mode ?? "createOnly");
    const r = await writeFileSafely(target, rendered, mode);
    fileResults.push({ path: target, wrote: r.wrote, reason: r.reason });
  }

  const configSnippet: AgentConfigSnippet = {
    id: opts.agentId,
    workspace: agentDir,
    identity: { name: opts.agentName ?? recipe.name ?? opts.agentId },
    tools: recipe.tools ?? {},
  };

  return {
    agentDir,
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
              const missing = await detectMissingSkills(api, cfg, req);
              out.push({
                id: frontmatter.id,
                requiredSkills: req,
                missingSkills: missing,
                installCommands: missing.length ? skillInstallCommands(cfg, missing) : [],
              });
            }

            console.log(JSON.stringify(out, null, 2));
          });

        cmd
          .command("install")
          .description("Install a ClawHub skill into this OpenClaw workspace (confirmation-gated)")
          .argument("<idOrSlug>", "Recipe id OR ClawHub skill slug")
          .option("--yes", "Skip confirmation prompt")
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

            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");

            const installDir = path.join(workspaceRoot, cfg.workspaceSkillsDir);

            const skillsToInstall = recipe
              ? Array.from(new Set([...(recipe.requiredSkills ?? []), ...(recipe.optionalSkills ?? [])])).filter(Boolean)
              : [idOrSlug];

            if (!skillsToInstall.length) {
              console.log(JSON.stringify({ ok: true, installed: [], note: "Nothing to install." }, null, 2));
              return;
            }

            const missing = await detectMissingSkills(api, cfg, skillsToInstall);
            const already = skillsToInstall.filter((s) => !missing.includes(s));

            if (already.length) {
              console.error(`Already present in workspace skills dir (${installDir}): ${already.join(", ")}`);
            }

            if (!missing.length) {
              console.log(JSON.stringify({ ok: true, installed: [], alreadyInstalled: already }, null, 2));
              return;
            }

            const header = recipe
              ? `Install skills for recipe ${recipe.id} into ${installDir}?\n- ${missing.join("\n- ")}`
              : `Install skill into ${installDir}?\n- ${missing.join("\n- ")}`;

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

            // Use clawhub CLI. Force workspace-local install path.
            const { spawnSync } = await import("node:child_process");
            for (const slug of missing) {
              const res = spawnSync(
                "npx",
                ["clawhub@latest", "--workdir", workspaceRoot, "--dir", cfg.workspaceSkillsDir, "install", slug],
                { stdio: "inherit" },
              );
              if (res.status !== 0) {
                process.exitCode = res.status ?? 1;
                console.error(`Failed installing ${slug} (exit=${process.exitCode}).`);
                return;
              }
            }

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

        cmd
          .command("dispatch")
          .description("Lead/dispatcher: turn a natural-language request into inbox + backlog ticket(s) + assignment stubs")
          .requiredOption("--team-id <teamId>", "Team id (workspace folder under teams/)")
          .option("--request <text>", "Natural-language request (if omitted, will prompt in TTY)")
          .option("--owner <owner>", "Ticket owner: dev|devops|lead", "dev")
          .option("--yes", "Skip review and write files without prompting")
          .action(async (options: any) => {
            const cfg = getCfg(api);

            const workspaceRoot = api.config.agents?.defaults?.workspace;
            if (!workspaceRoot) throw new Error("agents.defaults.workspace is not set in config");

            const teamId = String(options.teamId);
            const teamDir = workspacePath(api, cfg.workspaceTeamsDir, teamId);

            const inboxDir = path.join(teamDir, "inbox");
            const backlogDir = path.join(teamDir, "work", "backlog");
            const assignmentsDir = path.join(teamDir, "work", "assignments");

            const owner = String(options.owner ?? "dev");
            if (!['dev','devops','lead'].includes(owner)) {
              throw new Error("--owner must be one of: dev, devops, lead");
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

            const inboxMd = `# Inbox — ${teamId}\n\nReceived: ${new Date().toISOString()}\n\n## Request\n${requestText}\n\n## Proposed work\n- Ticket: ${ticketNumStr}-${baseSlug}\n- Owner: ${owner}\n`;

            const ticketMd = `# ${ticketNumStr}-${baseSlug}\n\nOwner: ${owner}\nStatus: queued\n\n## Context\n${requestText}\n\n## Requirements\n- (fill in)\n\n## Acceptance criteria\n- (fill in)\n`;

            const assignmentMd = `# Assignment — ${ticketNumStr}-${baseSlug}\n\nAssigned: ${owner}\n\n## Goal\n${title}\n\n## Ticket\n${path.relative(teamDir, ticketPath)}\n\n## Notes\n- Created by: openclaw recipes dispatch\n`;

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
            const missing = await detectMissingSkills(api, cfg, recipe.requiredSkills ?? []);
            if (missing.length) {
              console.error(`Missing skills for recipe ${recipeId}: ${missing.join(", ")}`);
              console.error(`Install commands (workspace-local):\n${skillInstallCommands(cfg, missing).join("\n")}`);
              process.exitCode = 2;
              return;
            }

            const result = await scaffoldAgentFromRecipe(api, recipe, {
              agentId: options.agentId,
              agentName: options.name,
              update: !!options.overwrite,
              vars: {
                agentId: options.agentId,
                agentName: options.name ?? recipe.name ?? options.agentId,
              },
            });

            if (options.applyConfig) {
              await applyAgentSnippetsToOpenClawConfig(api, [result.next.configSnippet]);
            }

            console.log(JSON.stringify(result, null, 2));
          });

        cmd
          .command("scaffold-team")
          .description("Scaffold a team (shared workspace + multiple agents) from a team recipe")
          .argument("<recipeId>", "Recipe id")
          .requiredOption("-t, --team-id <teamId>", "Team id (must end with -team)")
          .option("--overwrite", "Overwrite existing recipe-managed files")
          .option("--apply-config", "Write all team agents into openclaw config (agents.list)")
          .action(async (recipeId: string, options: any) => {
            const loaded = await loadRecipeById(api, recipeId);
            const recipe = loaded.frontmatter;
            if ((recipe.kind ?? "team") !== "team") {
              throw new Error(`Recipe is not a team recipe: kind=${recipe.kind}`);
            }
            const teamId = String(options.teamId);
            if (!teamId.endsWith("-team")) {
              throw new Error("teamId must end with -team");
            }

            const cfg = getCfg(api);
            const missing = await detectMissingSkills(api, cfg, recipe.requiredSkills ?? []);
            if (missing.length) {
              console.error(`Missing skills for recipe ${recipeId}: ${missing.join(", ")}`);
              console.error(`Install commands (workspace-local):\n${skillInstallCommands(cfg, missing).join("\n")}`);
              process.exitCode = 2;
              return;
            }

            const teamDir = workspacePath(api, cfg.workspaceTeamsDir, teamId);
            await ensureDir(teamDir);
            const notesDir = path.join(teamDir, "notes");
            const workDir = path.join(teamDir, "work");
            const backlogDir = path.join(workDir, "backlog");
            const inProgressDir = path.join(workDir, "in-progress");
            const doneDir = path.join(workDir, "done");
            const assignmentsDir = path.join(workDir, "assignments");

            await Promise.all([
              ensureDir(path.join(teamDir, "shared")),
              ensureDir(path.join(teamDir, "inbox")),
              ensureDir(path.join(teamDir, "outbox")),
              ensureDir(notesDir),
              ensureDir(workDir),
              ensureDir(backlogDir),
              ensureDir(inProgressDir),
              ensureDir(doneDir),
              ensureDir(assignmentsDir),
            ]);

            // Seed standard team files (createOnly unless --overwrite)
            const overwrite = !!options.overwrite;
            const planPath = path.join(notesDir, "plan.md");
            const statusPath = path.join(notesDir, "status.md");
            const ticketsPath = path.join(teamDir, "TICKETS.md");

            const planMd = `# Plan — ${teamId}\n\n- (empty)\n`;
            const statusMd = `# Status — ${teamId}\n\n- (empty)\n`;
            const ticketsMd = `# Tickets — ${teamId}\n\n## Naming\n- Backlog tickets live in work/backlog/\n- Filename ordering is the queue: 0001-..., 0002-...\n\n## Required fields\nEach ticket should include:\n- Title\n- Context\n- Requirements\n- Acceptance criteria\n- Owner (dev/devops/lead)\n- Status (queued/in_progress/blocked/done)\n\n## Example\n\n\`\`\`md\n# 0001-example-ticket\n\nOwner: dev\nStatus: queued\n\n## Context\n...\n\n## Requirements\n- ...\n\n## Acceptance criteria\n- ...\n\`\`\`\n`;

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

              const r = await scaffoldAgentFromRecipe(api, scopedRecipe, {
                agentId,
                agentName,
                update: !!options.overwrite,
                vars: {
                  teamId,
                  teamDir,
                  role,
                  agentId,
                  agentName,
                },
              });
              results.push({ role, agentId, ...r });
            }

            // Create a minimal TEAM.md
            const teamMdPath = path.join(teamDir, "TEAM.md");
            const teamMd = `# ${teamId}\n\nShared workspace for this agent team.\n\n## Folders\n- inbox/ — requests\n- outbox/ — deliverables\n- shared/ — shared artifacts\n- notes/ — notes\n- work/ — working files\n`;
            await writeFileSafely(teamMdPath, teamMd, options.overwrite ? "overwrite" : "createOnly");

            if (options.applyConfig) {
              const snippets: AgentConfigSnippet[] = results.map((x: any) => x.next.configSnippet);
              await applyAgentSnippetsToOpenClawConfig(api, snippets);
            }

            console.log(
              JSON.stringify(
                {
                  teamId,
                  teamDir,
                  agents: results,
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

export default recipesPlugin;
