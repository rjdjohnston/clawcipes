import { describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  buildRemoveTeamPlan,
  executeRemoveTeamPlan,
  stampTeamId,
  type CronStore,
} from "../src/lib/remove-team";

async function mkTmpDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "clawrecipes-remove-team-"));
}

describe("remove-team", () => {
  test("plans agent removals + exact stamped cron jobs", async () => {
    const tmp = await mkTmpDir();
    const workspaceRoot = path.join(tmp, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    const teamId = "qa-social-team";

    const cfgObj: any = {
      agents: {
        list: [
          { id: "main" },
          { id: `${teamId}-lead` },
          { id: `${teamId}-dev` },
          { id: "unrelated-agent" },
        ],
      },
    };

    const cronStore: CronStore = {
      version: 1,
      jobs: [
        {
          id: "job-1",
          name: "Team loop",
          payload: { kind: "agentTurn", message: `hello\n[recipes] ${stampTeamId(teamId)}` },
        },
        {
          id: "job-2",
          name: `maybe ${teamId} maybe not`,
          payload: { kind: "agentTurn", message: `hello` },
        },
      ],
    };

    const plan = await buildRemoveTeamPlan({
      teamId,
      workspaceRoot,
      openclawConfigPath: "(test)",
      cronJobsPath: path.join(tmp, "cron", "jobs.json"),
      cfgObj,
      cronStore,
    });

    expect(plan.agentsToRemove).toEqual([`${teamId}-lead`, `${teamId}-dev`]);
    expect(plan.cronJobsExact.map((j) => j.id)).toEqual(["job-1"]);
    expect(plan.cronJobsAmbiguous.map((j) => j.id)).toEqual(["job-2"]);
  });

  test("execute removes workspace + config agents + exact cron jobs", async () => {
    const tmp = await mkTmpDir();
    const workspaceRoot = path.join(tmp, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    const teamId = "qa-social-team";
    const workspaceDir = path.resolve(path.join(workspaceRoot, "..", `workspace-${teamId}`));
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(path.join(workspaceDir, "README.txt"), "hi", "utf8");

    const cfgObj: any = {
      agents: {
        list: [{ id: "main" }, { id: `${teamId}-lead` }, { id: "unrelated" }],
      },
    };

    const cronStore: CronStore = {
      version: 1,
      jobs: [
        { id: "job-1", payload: { message: `[recipes] ${stampTeamId(teamId)}` } },
        { id: "job-2", payload: { message: `hello` } },
      ],
    };

    const plan = await buildRemoveTeamPlan({
      teamId,
      workspaceRoot,
      openclawConfigPath: "(test)",
      cronJobsPath: path.join(tmp, "cron", "jobs.json"),
      cfgObj,
      cronStore,
    });

    const result = await executeRemoveTeamPlan({ plan, cfgObj, cronStore });

    expect(result.ok).toBe(true);
    expect(result.removed.workspaceDir).toBe("deleted");
    expect(cfgObj.agents.list.map((a: any) => a.id)).toEqual(["main", "unrelated"]);
    expect(cronStore.jobs.map((j) => j.id)).toEqual(["job-2"]);

    await expect(fs.stat(workspaceDir)).rejects.toBeTruthy();
  });

  test("refuses protected teams", async () => {
    const tmp = await mkTmpDir();
    const workspaceRoot = path.join(tmp, "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });

    const cfgObj: any = { agents: { list: [] } };
    const cronStore: CronStore = { version: 1, jobs: [] };

    const plan = await buildRemoveTeamPlan({
      teamId: "development-team",
      workspaceRoot,
      openclawConfigPath: "(test)",
      cronJobsPath: path.join(tmp, "cron", "jobs.json"),
      cfgObj,
      cronStore,
    });

    await expect(executeRemoveTeamPlan({ plan, cfgObj, cronStore })).rejects.toThrow(/protected team/i);
  });
});
