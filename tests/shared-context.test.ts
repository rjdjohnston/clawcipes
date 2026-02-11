import { describe, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureSharedContextScaffold } from '../src/lib/shared-context';

describe('shared-context scaffold (back-compat + idempotent)', () => {
  test('creates shared-context + shared/ back-compat and is createOnly by default', async () => {
    const teamDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawcipes-sharedctx-'));
    try {
      const r1 = await ensureSharedContextScaffold({ teamDir, teamId: 't', overwrite: false });
      const stat1 = await fs.stat(r1.prioritiesPath);
      expect(stat1.isFile()).toBe(true);

      const r2 = await ensureSharedContextScaffold({ teamDir, teamId: 't', overwrite: false });
      expect(r2.wrotePriorities).toBe(false);

      // back-compat alias directory should exist
      const sharedDir = path.join(teamDir, 'shared');
      const st = await fs.stat(sharedDir);
      expect(st.isDirectory()).toBe(true);

      // canonical directories exist
      await fs.stat(path.join(teamDir, 'shared-context', 'agent-outputs'));
      await fs.stat(path.join(teamDir, 'shared-context', 'feedback'));
    } finally {
      await fs.rm(teamDir, { recursive: true, force: true });
    }
  });
});
