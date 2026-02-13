import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureLaneDir } from './lanes';

async function fileExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function findTicketFile(teamDir: string, ticketArg: string) {
  const stageDir = (stage: string) => path.join(teamDir, 'work', stage);
  const searchDirs = [stageDir('backlog'), stageDir('in-progress'), stageDir('testing'), stageDir('done')];

  const ticketNum = ticketArg.match(/^\d{4}$/) ? ticketArg : (ticketArg.match(/^(\d{4})-/)?.[1] ?? null);

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
}

export async function takeTicket(opts: { teamDir: string; ticket: string; owner?: string; overwriteAssignment: boolean }) {
  const teamDir = opts.teamDir;
  const owner = (opts.owner ?? 'dev').trim() || 'dev';
  const ownerSafe = owner.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '') || 'dev';

  const srcPath = await findTicketFile(teamDir, opts.ticket);
  if (!srcPath) throw new Error(`Ticket not found: ${opts.ticket}`);
  if (srcPath.includes(`${path.sep}work${path.sep}done${path.sep}`)) throw new Error('Cannot take a done ticket (already completed)');

  const inProgressDir = (await ensureLaneDir({ teamDir, lane: 'in-progress', command: 'openclaw recipes take' })).path;

  const filename = path.basename(srcPath);
  const destPath = path.join(inProgressDir, filename);

  const m = filename.match(/^(\d{4})-(.+)\.md$/);
  const ticketNumStr = m?.[1] ?? (opts.ticket.match(/^\d{4}$/) ? opts.ticket : '0000');
  const slug = m?.[2] ?? 'ticket';

  const assignmentsDir = path.join(teamDir, 'work', 'assignments');
  await ensureDir(assignmentsDir);
  const assignmentPath = path.join(assignmentsDir, `${ticketNumStr}-assigned-${ownerSafe}.md`);
  const assignmentRel = path.relative(teamDir, assignmentPath);

  const patch = (md: string) => {
    let out = md;
    if (out.match(/^Owner:\s.*$/m)) out = out.replace(/^Owner:\s.*$/m, `Owner: ${ownerSafe}`);
    else out = out.replace(/^(# .+\n)/, `$1\nOwner: ${ownerSafe}\n`);

    if (out.match(/^Status:\s.*$/m)) out = out.replace(/^Status:\s.*$/m, 'Status: in-progress');
    else out = out.replace(/^(# .+\n)/, `$1\nStatus: in-progress\n`);

    if (out.match(/^Assignment:\s.*$/m)) out = out.replace(/^Assignment:\s.*$/m, `Assignment: ${assignmentRel}`);
    else out = out.replace(/^Owner:.*$/m, (line) => `${line}\nAssignment: ${assignmentRel}`);

    return out;
  };

  const alreadyInProgress = srcPath === destPath;

  const md = await fs.readFile(srcPath, 'utf8');
  const nextMd = patch(md);
  await fs.writeFile(srcPath, nextMd, 'utf8');

  if (!alreadyInProgress) {
    await fs.rename(srcPath, destPath);
  }

  const assignmentMd = `# Assignment — ${ticketNumStr}-${slug}\n\nAssigned: ${ownerSafe}\n\n## Ticket\n${path.relative(teamDir, destPath)}\n\n## Notes\n- Created by: openclaw recipes take\n`;

  const assignmentExists = await fileExists(assignmentPath);
  if (assignmentExists && !opts.overwriteAssignment) {
    // createOnly
  } else {
    await fs.writeFile(assignmentPath, assignmentMd, 'utf8');
  }

  return { srcPath, destPath, moved: !alreadyInProgress, assignmentPath };
}

export async function handoffTicket(opts: { teamDir: string; ticket: string; tester?: string; overwriteAssignment: boolean }) {
  const teamDir = opts.teamDir;
  const tester = (opts.tester ?? 'test').trim() || 'test';
  const testerSafe = tester.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)/g, '') || 'test';

  const srcPath = await findTicketFile(teamDir, opts.ticket);
  if (!srcPath) throw new Error(`Ticket not found: ${opts.ticket}`);
  if (srcPath.includes(`${path.sep}work${path.sep}done${path.sep}`)) throw new Error('Cannot handoff a done ticket (already completed)');

  const testingDir = (await ensureLaneDir({ teamDir, lane: 'testing', command: 'openclaw recipes handoff' })).path;

  const filename = path.basename(srcPath);
  const destPath = path.join(testingDir, filename);

  const m = filename.match(/^(\d{4})-(.+)\.md$/);
  const ticketNumStr = m?.[1] ?? (opts.ticket.match(/^\d{4}$/) ? opts.ticket : '0000');
  const slug = m?.[2] ?? 'ticket';

  const assignmentsDir = path.join(teamDir, 'work', 'assignments');
  await ensureDir(assignmentsDir);
  const assignmentPath = path.join(assignmentsDir, `${ticketNumStr}-assigned-${testerSafe}.md`);
  const assignmentRel = path.relative(teamDir, assignmentPath);

  const patch = (md: string) => {
    let out = md;
    if (out.match(/^Owner:\s.*$/m)) out = out.replace(/^Owner:\s.*$/m, `Owner: ${testerSafe}`);
    else out = out.replace(/^(# .+\n)/, `$1\nOwner: ${testerSafe}\n`);

    if (out.match(/^Status:\s.*$/m)) out = out.replace(/^Status:\s.*$/m, 'Status: testing');
    else out = out.replace(/^(# .+\n)/, `$1\nStatus: testing\n`);

    if (out.match(/^Assignment:\s.*$/m)) out = out.replace(/^Assignment:\s.*$/m, `Assignment: ${assignmentRel}`);
    else out = out.replace(/^Owner:.*$/m, (line) => `${line}\nAssignment: ${assignmentRel}`);

    return out;
  };

  const alreadyInTesting = srcPath === destPath;

  const md = await fs.readFile(srcPath, 'utf8');
  const nextMd = patch(md);
  await fs.writeFile(srcPath, nextMd, 'utf8');

  if (!alreadyInTesting) {
    await fs.rename(srcPath, destPath);
  }

  const assignmentMd = `# Assignment — ${ticketNumStr}-${slug}\n\nAssigned: ${testerSafe}\n\n## Ticket\n${path.relative(teamDir, destPath)}\n\n## Notes\n- Created by: openclaw recipes handoff\n`;

  const assignmentExists = await fileExists(assignmentPath);
  if (assignmentExists && !opts.overwriteAssignment) {
    // createOnly: leave as-is
  } else {
    await fs.writeFile(assignmentPath, assignmentMd, 'utf8');
  }

  return { srcPath, destPath, moved: !alreadyInTesting, assignmentPath };
}
