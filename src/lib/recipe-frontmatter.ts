import YAML from 'yaml';

export type CronJobSpec = {
  id: string;
  schedule: string;
  message: string;
  name?: string;
  description?: string;
  timezone?: string;
  channel?: string;
  to?: string;
  agentId?: string;
  enabledByDefault?: boolean;
};

export type RecipeFrontmatter = {
  id: string;
  kind?: string;
  name?: string;
  cronJobs?: CronJobSpec[];
  [k: string]: any;
};

export function parseFrontmatter(md: string): { frontmatter: RecipeFrontmatter; body: string } {
  if (!md.startsWith('---\n')) throw new Error('Recipe markdown must start with YAML frontmatter (---)');
  const end = md.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Recipe frontmatter not terminated (---)');
  const yamlText = md.slice(4, end);
  const body = md.slice(end + 5);
  const frontmatter = YAML.parse(yamlText) as RecipeFrontmatter;
  if (!frontmatter?.id) throw new Error('Recipe frontmatter must include id');
  return { frontmatter, body };
}

export function normalizeCronJobs(frontmatter: { cronJobs?: any }): CronJobSpec[] {
  const raw = (frontmatter as any).cronJobs;
  if (!raw) return [];
  if (!Array.isArray(raw)) throw new Error('frontmatter.cronJobs must be an array');

  const seen = new Set<string>();
  const out: CronJobSpec[] = [];

  for (const j of raw) {
    if (!j || typeof j !== 'object') throw new Error('cronJobs entries must be objects');
    const id = String((j as any).id ?? '').trim();
    if (!id) throw new Error('cronJobs[].id is required');
    if (seen.has(id)) throw new Error(`Duplicate cronJobs[].id: ${id}`);
    seen.add(id);

    const schedule = String((j as any).schedule ?? '').trim();
    const message = String((j as any).message ?? '').trim();
    if (!schedule) throw new Error(`cronJobs[${id}].schedule is required`);
    if (!message) throw new Error(`cronJobs[${id}].message is required`);

    out.push({ ...j, id, schedule, message } as CronJobSpec);
  }

  return out;
}
