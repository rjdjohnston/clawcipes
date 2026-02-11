import fs from 'node:fs/promises';
import path from 'node:path';

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function writeCreateOnlyOrOverwrite(filePath: string, content: string, mode: 'createOnly' | 'overwrite') {
  if (mode === 'createOnly' && (await exists(filePath))) return { wrote: false as const };
  await fs.writeFile(filePath, content, 'utf8');
  return { wrote: true as const };
}

export async function ensureSharedContextScaffold(opts: { teamDir: string; teamId: string; overwrite: boolean }) {
  const { teamDir, teamId, overwrite } = opts;
  const sharedContextDir = path.join(teamDir, 'shared-context');
  const outputsDir = path.join(sharedContextDir, 'agent-outputs');
  const feedbackDir = path.join(sharedContextDir, 'feedback');
  const kpisDir = path.join(sharedContextDir, 'kpis');
  const calendarDir = path.join(sharedContextDir, 'calendar');

  await Promise.all([
    // Back-compat alias: keep shared/ folder.
    ensureDir(path.join(teamDir, 'shared')),
    ensureDir(sharedContextDir),
    ensureDir(outputsDir),
    ensureDir(feedbackDir),
    ensureDir(kpisDir),
    ensureDir(calendarDir),
  ]);

  const prioritiesPath = path.join(sharedContextDir, 'priorities.md');
  const prioritiesMd = `# Priorities — ${teamId}\n\n- (empty)\n\n## Notes\n- Lead curates this file.\n- Non-lead roles should append updates to shared-context/agent-outputs/ instead.\n`;

  const mode = overwrite ? 'overwrite' : 'createOnly';
  const wrote = await writeCreateOnlyOrOverwrite(prioritiesPath, prioritiesMd, mode);

  return {
    sharedContextDir,
    prioritiesPath,
    wrotePriorities: wrote.wrote,
  };
}
