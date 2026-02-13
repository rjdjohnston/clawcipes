import fs from "node:fs/promises";
import path from "node:path";

export type CronJob = {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: any;
  payload?: { kind?: string; message?: string };
  delivery?: any;
  agentId?: string;
};

export type CronStore = {
  version: number;
  jobs: CronJob[];
};

export type RemoveTeamPlan = {
  teamId: string;
  workspaceDir: string;
  openclawConfigPath: string;
  cronJobsPath: string;
  agentsToRemove: string[];
  cronJobsExact: Array<{ id: string; name?: string }>;
  cronJobsAmbiguous: Array<{ id: string; name?: string; reason: string }>;
  notes: string[];
};

export type RemoveTeamResult = {
  ok: true;
  plan: RemoveTeamPlan;
  removed: {
    workspaceDir: "deleted" | "missing";
    agentsRemoved: number;
    cronJobsRemoved: number;
  };
};

export function stampTeamId(teamId: string) {
  return `recipes.teamId=${teamId}`;
}

export function isProtectedTeamId(teamId: string) {
  const t = teamId.trim().toLowerCase();
  return t === "development-team" || t === "main";
}

export async function fileExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadCronStore(cronJobsPath: string): Promise<CronStore> {
  const raw = await fs.readFile(cronJobsPath, "utf8");
  const data = JSON.parse(raw) as CronStore;
  if (!data || typeof data !== "object" || !Array.isArray((data as any).jobs)) {
    throw new Error(`Invalid cron store: ${cronJobsPath}`);
  }
  return data;
}

export async function saveCronStore(cronJobsPath: string, store: CronStore) {
  await fs.writeFile(cronJobsPath, JSON.stringify(store, null, 2) + "\n", "utf8");
}

export async function loadOpenClawConfig(openclawConfigPath: string): Promise<any> {
  const raw = await fs.readFile(openclawConfigPath, "utf8");
  // NOTE: openclaw.json is JSON5 in some deployments; but we avoid adding dependency here.
  // The main plugin already depends on json5; callers may parse using that. For remove-team, keep strict JSON.
  return JSON.parse(raw);
}

export async function saveOpenClawConfig(openclawConfigPath: string, cfg: any) {
  await fs.writeFile(openclawConfigPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

export function findAgentsToRemove(cfgObj: any, teamId: string) {
  const list = cfgObj?.agents?.list;
  if (!Array.isArray(list)) return [] as string[];
  const prefix = `${teamId}-`;
  return list
    .map((a: any) => String(a?.id ?? ""))
    .filter((id: string) => id && id.startsWith(prefix));
}

export function planCronJobRemovals(jobs: CronJob[], teamId: string) {
  const stamp = stampTeamId(teamId);
  const exact: Array<{ id: string; name?: string }> = [];
  const ambiguous: Array<{ id: string; name?: string; reason: string }> = [];

  for (const j of jobs) {
    const msg = String(j?.payload?.message ?? "");
    const name = String(j?.name ?? "");

    // Exact: message contains the stamp.
    if (msg.includes(stamp)) {
      exact.push({ id: j.id, name: j.name });
      continue;
    }

    // Ambiguous: name mentions teamId (helpful for manual review).
    if (name.includes(teamId) || msg.includes(teamId)) {
      ambiguous.push({ id: j.id, name: j.name, reason: "mentions-teamId" });
    }
  }

  return { exact, ambiguous };
}

export async function buildRemoveTeamPlan(opts: {
  teamId: string;
  workspaceRoot: string; // e.g. ~/.openclaw/workspace
  openclawConfigPath: string; // e.g. ~/.openclaw/openclaw.json
  cronJobsPath: string; // e.g. ~/.openclaw/cron/jobs.json
  cfgObj: any;
  cronStore?: CronStore | null;
}) {
  const teamId = opts.teamId.trim();
  const workspaceDir = path.resolve(path.join(opts.workspaceRoot, "..", `workspace-${teamId}`));

  const notes: string[] = [];
  if (isProtectedTeamId(teamId)) notes.push(`protected-team:${teamId}`);

  const agentsToRemove = findAgentsToRemove(opts.cfgObj, teamId);

  const jobs = (opts.cronStore?.jobs ?? []) as CronJob[];
  const cron = planCronJobRemovals(jobs, teamId);

  const plan: RemoveTeamPlan = {
    teamId,
    workspaceDir,
    openclawConfigPath: opts.openclawConfigPath,
    cronJobsPath: opts.cronJobsPath,
    agentsToRemove,
    cronJobsExact: cron.exact,
    cronJobsAmbiguous: cron.ambiguous,
    notes,
  };

  return plan;
}

export async function executeRemoveTeamPlan(opts: {
  plan: RemoveTeamPlan;
  includeAmbiguous?: boolean;
  cfgObj: any;
  cronStore: CronStore;
}) {
  const { plan } = opts;
  const teamId = plan.teamId;

  if (isProtectedTeamId(teamId)) {
    throw new Error(`Refusing to remove protected team: ${teamId}`);
  }

  // 1) Delete workspace dir
  const workspaceExists = await fileExists(plan.workspaceDir);
  if (workspaceExists) {
    await fs.rm(plan.workspaceDir, { recursive: true, force: true });
  }

  // 2) Remove agents from config
  const list = opts.cfgObj?.agents?.list;
  const before = Array.isArray(list) ? list.length : 0;
  if (Array.isArray(list)) {
    const remove = new Set(plan.agentsToRemove);
    opts.cfgObj.agents.list = list.filter((a: any) => !remove.has(String(a?.id ?? "")));
  }
  const after = Array.isArray(opts.cfgObj?.agents?.list) ? opts.cfgObj.agents.list.length : 0;

  // 3) Remove cron jobs from store
  const exactIds = new Set(plan.cronJobsExact.map((j) => j.id));
  const ambiguousIds = new Set(plan.cronJobsAmbiguous.map((j) => j.id));

  const removeIds = new Set<string>([...exactIds]);
  if (opts.includeAmbiguous) {
    for (const id of ambiguousIds) removeIds.add(id);
  }

  const beforeJobs = opts.cronStore.jobs.length;
  opts.cronStore.jobs = opts.cronStore.jobs.filter((j) => !removeIds.has(j.id));
  const afterJobs = opts.cronStore.jobs.length;

  const result: RemoveTeamResult = {
    ok: true,
    plan,
    removed: {
      workspaceDir: workspaceExists ? "deleted" : "missing",
      agentsRemoved: Math.max(0, before - after),
      cronJobsRemoved: Math.max(0, beforeJobs - afterJobs),
    },
  };

  return result;
}
