import { describe, expect, test } from 'vitest';
import { normalizeCronJobs, parseFrontmatter } from '../src/lib/recipe-frontmatter';

describe('recipe frontmatter parsing/validation', () => {
  test('parseFrontmatter requires starting --- and id', () => {
    expect(() => parseFrontmatter('nope')).toThrow(/must start with YAML frontmatter/);

    const md = `---\nname: x\n---\nbody`;
    expect(() => parseFrontmatter(md)).toThrow(/must include id/);
  });

  test('normalizeCronJobs validates required fields and duplicate ids', () => {
    expect(normalizeCronJobs({})).toEqual([]);

    expect(() => normalizeCronJobs({ cronJobs: {} as any })).toThrow(/must be an array/);

    expect(() =>
      normalizeCronJobs({
        cronJobs: [{ id: 'a', schedule: '* * * * *', message: 'hi' }, { id: 'a', schedule: '* * * * *', message: 'hi' }],
      }),
    ).toThrow(/Duplicate cronJobs\[\]\.id/);

    expect(() => normalizeCronJobs({ cronJobs: [{ id: 'x', schedule: '', message: 'm' }] })).toThrow(/schedule is required/);
    expect(() => normalizeCronJobs({ cronJobs: [{ id: 'x', schedule: '* * * * *', message: '' }] })).toThrow(/message is required/);

    const out = normalizeCronJobs({ cronJobs: [{ id: 'job', schedule: '* * * * *', message: 'ping' }] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('job');
  });
});
