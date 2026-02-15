import { describe, expect, test } from 'vitest';
import { OWNERS, STAGES, KANBAN_COLUMNS } from '../app/src/constants.ts';

describe('constants', () => {
  test('OWNERS has length 4 and includes dev and test', () => {
    expect(OWNERS).toHaveLength(4);
    expect(OWNERS).toContain('dev');
    expect(OWNERS).toContain('test');
  });

  test('STAGES has keys backlog, in-progress, testing, done', () => {
    const keys = STAGES.map((s) => s.key);
    expect(keys).toContain('backlog');
    expect(keys).toContain('in-progress');
    expect(keys).toContain('testing');
    expect(keys).toContain('done');
    expect(STAGES).toHaveLength(4);
  });

  test('KANBAN_COLUMNS has 4 items with colKey, label, accent', () => {
    expect(KANBAN_COLUMNS).toHaveLength(4);
    for (const col of KANBAN_COLUMNS) {
      expect(col).toHaveProperty('colKey');
      expect(col).toHaveProperty('label');
      expect(col).toHaveProperty('accent');
    }
  });
});
