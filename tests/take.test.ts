import { describe, expect, test, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { takeTicket } from '../src/lib/ticket-workflow';

async function mkTeamDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawcipes-test-'));
  await fs.mkdir(path.join(dir, 'work', 'backlog'), { recursive: true });
  // Intentionally omit work/in-progress and work/assignments to simulate older workspaces.
  await fs.mkdir(path.join(dir, 'work', 'done'), { recursive: true });
  return dir;
}

describe('ticket workflow: take', () => {
  test('moves ticket to in-progress, patches headers, writes assignment (creates missing lanes)', async () => {
    const teamDir = await mkTeamDir();
    try {
      const ticketPath = path.join(teamDir, 'work', 'backlog', '0007-sample.md');
      await fs.writeFile(ticketPath, `# 0007-sample\n\n## Context\nTest\n`, 'utf8');

      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await takeTicket({ teamDir, ticket: '0007', owner: 'devops', overwriteAssignment: false });
      // should have printed migration for in-progress at least
      expect(errSpy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/migration: created work\/in-progress\//);
      errSpy.mockRestore();

      expect(res.destPath).toContain(path.join('work', 'in-progress'));

      const nextTicket = await fs.readFile(res.destPath, 'utf8');
      expect(nextTicket).toMatch(/^Owner:\s*devops$/m);
      expect(nextTicket).toMatch(/^Status:\s*in-progress$/m);
      expect(nextTicket).toMatch(/^Assignment:\s*work\/assignments\/0007-assigned-devops\.md$/m);

      const assignmentPath = path.join(teamDir, 'work', 'assignments', '0007-assigned-devops.md');
      const assignment = await fs.readFile(assignmentPath, 'utf8');
      expect(assignment).toMatch(/Created by: openclaw recipes take/);
      expect(assignment).toMatch(/work\/in-progress\/0007-sample\.md/);
    } finally {
      await fs.rm(teamDir, { recursive: true, force: true });
    }
  });
});
