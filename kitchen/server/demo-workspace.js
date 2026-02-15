import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Demo workspace root: kitchen/demo-data/workspace-demo-team */
export const DEMO_WORKSPACE = join(__dirname, "..", "demo-data", "workspace-demo-team");

const DEMO_TICKETS = [
  { stage: "backlog", number: 1, id: "0001-setup-ci", slug: "0001-setup-ci", title: "Set up CI pipeline", owner: "dev" },
  { stage: "backlog", number: 2, id: "0002-add-tests", slug: "0002-add-tests", title: "Add unit tests", owner: "dev" },
  { stage: "backlog", number: 5, id: "0005-docs", slug: "0005-docs", title: "Update README", owner: "dev" },
  { stage: "in-progress", number: 3, id: "0003-refactor-api", slug: "0003-refactor-api", title: "Refactor API module", owner: "dev" },
  { stage: "testing", number: 4, id: "0004-auth-flow", slug: "0004-auth-flow", title: "Auth flow verification", owner: "test" },
  { stage: "done", number: 0, id: "0000-project-kickoff", slug: "0000-project-kickoff", title: "Project kickoff", owner: "lead" },
];

function ticketContent(title) {
  return `# ${title}

Owner: dev
Status: queued

## Context
(Demo ticket — edit this file to see it in your editor.)

## Requirements
- TBD

## Acceptance criteria
- TBD
`;
}

/**
 * Ensure demo workspace exists with ticket files. Creates dirs and files as needed.
 * @returns {Promise<string>} Absolute path to demo workspace
 */
export async function ensureDemoWorkspace() {
  const stageDirs = ["work/backlog", "work/in-progress", "work/testing", "work/done"];
  for (const d of stageDirs) {
    const full = join(DEMO_WORKSPACE, d);
    await mkdir(full, { recursive: true });
  }

  for (const t of DEMO_TICKETS) {
    const stageDir =
      t.stage === "backlog"
        ? "work/backlog"
        : t.stage === "in-progress"
          ? "work/in-progress"
          : t.stage === "testing"
            ? "work/testing"
            : "work/done";
    const filePath = join(DEMO_WORKSPACE, stageDir, `${t.slug}.md`);
    if (!existsSync(filePath)) {
      const content = ticketContent(t.title);
      await writeFile(filePath, content, "utf8");
    }
  }

  return DEMO_WORKSPACE;
}

/**
 * Get demo tickets with absolute file paths.
 * @returns {Promise<{ teamId: string; tickets: any[]; backlog: any[]; inProgress: any[]; testing: any[]; done: any[] }>}
 */
export async function getDemoTickets() {
  await ensureDemoWorkspace();

  const backlog = [];
  const inProgress = [];
  const testing = [];
  const done = [];

  for (const t of DEMO_TICKETS) {
    const stageDir =
      t.stage === "backlog"
        ? "work/backlog"
        : t.stage === "in-progress"
          ? "work/in-progress"
          : t.stage === "testing"
            ? "work/testing"
            : "work/done";
    const file = join(DEMO_WORKSPACE, stageDir, `${t.slug}.md`);
    const ticket = { ...t, file };
    if (t.stage === "backlog") backlog.push(ticket);
    else if (t.stage === "in-progress") inProgress.push(ticket);
    else if (t.stage === "testing") testing.push(ticket);
    else done.push(ticket);
  }

  const tickets = [...backlog, ...inProgress, ...testing, ...done];
  return {
    teamId: "demo-team",
    tickets,
    backlog,
    inProgress,
    testing,
    done,
  };
}

const DEMO_INBOX = [
  { id: "inbox-001", title: "Feature request: Add dark mode", received: "2025-02-10" },
  { id: "inbox-002", title: "Bug report: Login fails on Safari", received: "2025-02-12" },
];

/**
 * List demo inbox items.
 * @returns {Promise<Array<{ id: string; file: string; title?: string; received?: string }>>}
 */
export async function getDemoInbox() {
  await ensureDemoWorkspace();
  const inboxDir = join(DEMO_WORKSPACE, "inbox");
  await mkdir(inboxDir, { recursive: true });

  const items = [];
  for (const item of DEMO_INBOX) {
    const file = join(inboxDir, `${item.id}.md`);
    if (!existsSync(file)) {
      await writeFile(
        file,
        `# ${item.title}\n\nReceived: ${item.received}\n\n---\n\n(Demo inbox item.)`,
        "utf8"
      );
    }
    items.push({ id: item.id, file, title: item.title, received: item.received });
  }
  return items;
}

/**
 * Get inbox item content for demo team.
 */
export async function getDemoInboxItemContent(itemId) {
  if (!itemId || !/^[a-zA-Z0-9_.-]+$/.test(itemId)) {
    return null;
  }
  const items = await getDemoInbox();
  const item = items.find((i) => i.id === itemId);
  if (!item?.file || !existsSync(item.file)) return null;
  return readFile(item.file, "utf8");
}

/**
 * Get ticket content for demo team.
 * @param {string} ticketId - e.g. "0001-setup-ci"
 * @returns {Promise<string>} Markdown content
 */
export async function getDemoTicketContent(ticketId) {
  if (!ticketId || !/^[a-zA-Z0-9_-]+$/.test(ticketId)) {
    throw new Error("Invalid ticketId");
  }
  await ensureDemoWorkspace();
  const t = DEMO_TICKETS.find((x) => x.id === ticketId);
  if (!t) return null;
  const stageDir =
    t.stage === "backlog"
      ? "work/backlog"
      : t.stage === "in-progress"
        ? "work/in-progress"
        : t.stage === "testing"
          ? "work/testing"
          : "work/done";
  const file = join(DEMO_WORKSPACE, stageDir, `${t.slug}.md`);
  if (!existsSync(file)) return null;
  return readFile(file, "utf8");
}
