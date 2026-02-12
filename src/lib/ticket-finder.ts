import path from 'node:path';
import fs from 'node:fs/promises';

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export type TicketLane = 'backlog' | 'in-progress' | 'testing' | 'done';

export function laneDir(teamDir: string, lane: TicketLane) {
  return path.join(teamDir, 'work', lane);
}

export function allLaneDirs(teamDir: string) {
  return [
    laneDir(teamDir, 'backlog'),
    laneDir(teamDir, 'in-progress'),
    laneDir(teamDir, 'testing'),
    laneDir(teamDir, 'done'),
  ];
}

export function parseTicketArg(ticketArg: string) {
  const ticketNum = ticketArg.match(/^\d{4}$/)
    ? ticketArg
    : (ticketArg.match(/^(\d{4})-/)?.[1] ?? null);
  return { ticketArg, ticketNum };
}

export async function findTicketFile(opts: {
  teamDir: string;
  ticket: string;
  lanes?: TicketLane[];
}) {
  const lanes = opts.lanes ?? ['backlog', 'in-progress', 'testing', 'done'];
  const { ticketArg, ticketNum } = parseTicketArg(String(opts.ticket));

  for (const lane of lanes) {
    const dir = laneDir(opts.teamDir, lane);
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

export function parseOwnerFromMd(md: string): string | null {
  const m = md.match(/^Owner:\s*(.+)\s*$/m);
  return m?.[1]?.trim() ?? null;
}
