import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';

vi.mock('node:fs', () => ({
  existsSync: () => false,
}));

vi.mock('../server/openclaw.js', () => ({
  checkOpenClaw: vi.fn().mockResolvedValue(true),
  listTeams: vi.fn().mockResolvedValue([]),
  getTickets: vi.fn().mockResolvedValue({}),
  getTicketContent: vi.fn().mockResolvedValue(null),
  listInbox: vi.fn().mockResolvedValue([]),
  getInboxItemContent: vi.fn().mockResolvedValue(null),
  listRecipes: vi.fn().mockResolvedValue([]),
  showRecipe: vi.fn().mockResolvedValue(''),
  scaffoldTeam: vi.fn(),
  moveTicket: vi.fn(),
  assignTicket: vi.fn(),
  takeTicket: vi.fn(),
  handoffTicket: vi.fn(),
  completeTicket: vi.fn(),
  dispatch: vi.fn(),
}));

const { createApp } = await import('../server/index.js');
const app = createApp();

describe('Static / SPA fallback when dist missing', () => {
  test('GET / returns 503 when app dist does not exist', async () => {
    const res = await request(app).get('/').expect(503);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('not built');
    expect(res.text).toContain('npm run build');
  });
});
