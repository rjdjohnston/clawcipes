import { describe, expect, test, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../server/openclaw.js', () => ({
  checkOpenClaw: vi.fn(),
  listTeams: vi.fn(),
  getTickets: vi.fn(),
  getTicketContent: vi.fn(),
  listInbox: vi.fn(),
  getInboxItemContent: vi.fn(),
  listRecipes: vi.fn(),
  showRecipe: vi.fn(),
  recipeStatus: vi.fn(),
  scaffoldTeam: vi.fn(),
  moveTicket: vi.fn(),
  assignTicket: vi.fn(),
  takeTicket: vi.fn(),
  handoffTicket: vi.fn(),
  completeTicket: vi.fn(),
  dispatch: vi.fn(),
  listBindings: vi.fn(),
  addBinding: vi.fn(),
  removeBinding: vi.fn(),
  removeTeam: vi.fn(),
}));

import { createApp } from '../server/index.js';
import * as openclaw from '../server/openclaw.js';

const app = createApp();

describe('Kitchen API (openclaw-dependent routes)', () => {
  beforeEach(() => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);
    vi.mocked(openclaw.listTeams).mockResolvedValue([]);
    vi.mocked(openclaw.listRecipes).mockResolvedValue([
      { id: 'default', name: 'Default', kind: 'recipe', source: 'builtin' },
    ]);
    vi.mocked(openclaw.showRecipe).mockResolvedValue('# Recipe\nContent');
    vi.mocked(openclaw.scaffoldTeam).mockImplementation(() => {});
    vi.mocked(openclaw.moveTicket).mockImplementation(() => {});
    vi.mocked(openclaw.assignTicket).mockImplementation(() => {});
    vi.mocked(openclaw.dispatch).mockImplementation(() => {});
  });

  test('GET /api/health returns 200 with ok and openclaw when checkOpenClaw resolves true', async () => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);

    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true, openclaw: true });
  });

  test('GET /api/health returns 200 with openclaw false when checkOpenClaw resolves false', async () => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(false);

    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true, openclaw: false });
  });

  test('GET /api/health returns 503 when checkOpenClaw rejects', async () => {
    vi.mocked(openclaw.checkOpenClaw).mockRejectedValue(new Error('CLI not found'));

    const res = await request(app).get('/api/health').expect(503);
    expect(res.body).toEqual({ ok: false, openclaw: false });
  });

  test('GET /api/teams returns 200 with teams array', async () => {
    vi.mocked(openclaw.listTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'Dev', scaffoldedAt: '2025-01-01' },
    ]);

    const res = await request(app).get('/api/teams').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('teamId', 'my-team');
  });

  test('GET /api/teams returns 500 when listTeams throws', async () => {
    vi.mocked(openclaw.listTeams).mockRejectedValue(new Error('readdir failed'));

    const res = await request(app).get('/api/teams').expect(500);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/recipes returns 503 when checkOpenClaw fails', async () => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(false);

    const res = await request(app).get('/api/recipes').expect(503);
    expect(res.body).toEqual({ error: 'OpenClaw unavailable', openclaw: false });
  });

  test('GET /api/recipes returns 200 with recipes when OpenClaw available', async () => {
    const res = await request(app).get('/api/recipes').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('id', 'default');
  });

  test('GET /api/recipes returns 502 when listRecipes throws', async () => {
    vi.mocked(openclaw.listRecipes).mockRejectedValue(new Error('CLI failed'));

    const res = await request(app).get('/api/recipes').expect(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/CLI failed/);
  });

  test('GET /api/recipes/:id returns 200 with md when showRecipe succeeds', async () => {
    vi.mocked(openclaw.showRecipe).mockResolvedValue('# My Recipe\n\nContent here');

    const res = await request(app).get('/api/recipes/development-team').expect(200);
    expect(res.body).toHaveProperty('md');
    expect(res.body.md).toContain('My Recipe');
  });

  test('GET /api/recipes/:id returns 400 for invalid recipeId', async () => {
    vi.mocked(openclaw.showRecipe).mockRejectedValue(new Error('Invalid recipeId'));

    const res = await request(app).get('/api/recipes/invalid..id').expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Invalid/);
  });

  test('GET /api/recipes/:id returns 502 when showRecipe throws with non-Invalid message', async () => {
    vi.mocked(openclaw.showRecipe).mockRejectedValue(new Error('Recipe not found'));

    const res = await request(app).get('/api/recipes/some-recipe').expect(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('Recipe not found');
  });

  test('POST /api/recipes/:id/scaffold-team returns 200 when validation passes', async () => {
    const res = await request(app)
      .post('/api/recipes/development-team/scaffold-team')
      .send({ teamId: 'my-team' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('GET /api/recipes/status returns 200 with status array', async () => {
    vi.mocked(openclaw.recipeStatus).mockReturnValue([
      { id: 'default', requiredSkills: ['foo'], missingSkills: ['foo'], installCommands: ['npx clawhub install foo'] },
    ]);

    const res = await request(app).get('/api/recipes/status').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('id', 'default');
    expect(res.body[0]).toHaveProperty('missingSkills');
    expect(res.body[0].missingSkills).toContain('foo');
  });

  test('GET /api/recipes/status returns 502 when recipeStatus throws', async () => {
    vi.mocked(openclaw.recipeStatus).mockImplementation(() => {
      throw new Error('CLI failed');
    });

    const res = await request(app).get('/api/recipes/status').expect(502);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/recipes/:id/status returns 200 with single status', async () => {
    vi.mocked(openclaw.recipeStatus).mockReturnValue([
      { id: 'dev-team', requiredSkills: [], missingSkills: [], installCommands: [] },
    ]);

    const res = await request(app).get('/api/recipes/dev-team/status').expect(200);
    expect(res.body).toHaveProperty('id', 'dev-team');
    expect(res.body).toHaveProperty('missingSkills');
  });

  test('GET /api/recipes/:id/status returns 404 when recipe not found', async () => {
    vi.mocked(openclaw.recipeStatus).mockReturnValue([]);

    const res = await request(app).get('/api/recipes/nonexistent/status').expect(404);
    expect(res.body).toHaveProperty('error', 'Recipe not found');
  });
});

describe('Bindings API', () => {
  beforeEach(() => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);
  });

  test('GET /api/bindings returns 503 when OpenClaw unavailable', async () => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(false);

    const res = await request(app).get('/api/bindings').expect(503);
    expect(res.body).toHaveProperty('openclaw', false);
  });

  test('GET /api/bindings returns 200 with bindings array', async () => {
    vi.mocked(openclaw.listBindings).mockReturnValue([
      { agentId: 'my-agent', match: { channel: 'telegram' } },
    ]);

    const res = await request(app).get('/api/bindings').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('agentId', 'my-agent');
    expect(res.body[0].match).toHaveProperty('channel', 'telegram');
  });

  test('GET /api/bindings returns 502 when listBindings throws', async () => {
    vi.mocked(openclaw.listBindings).mockImplementation(() => {
      throw new Error('Config read failed');
    });

    const res = await request(app).get('/api/bindings').expect(502);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/bindings returns 200 when valid', async () => {
    vi.mocked(openclaw.addBinding).mockImplementation(() => {});

    const res = await request(app)
      .post('/api/bindings')
      .send({ agentId: 'my-agent', match: { channel: 'telegram' } })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(openclaw.addBinding).toHaveBeenCalledWith({ agentId: 'my-agent', match: { channel: 'telegram' } });
  });

  test('POST /api/bindings returns 400 when agentId missing', async () => {
    const res = await request(app)
      .post('/api/bindings')
      .send({ match: { channel: 'telegram' } })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/agentId|match/);
  });

  test('POST /api/bindings returns 400 when match.channel missing', async () => {
    const res = await request(app)
      .post('/api/bindings')
      .send({ agentId: 'my-agent', match: {} })
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  test('DELETE /api/bindings returns 200 when valid', async () => {
    vi.mocked(openclaw.removeBinding).mockImplementation(() => {});

    const res = await request(app)
      .delete('/api/bindings')
      .send({ match: { channel: 'telegram' } })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('DELETE /api/bindings returns 400 when match.channel missing', async () => {
    const res = await request(app)
      .delete('/api/bindings')
      .send({ agentId: 'my-agent' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Teams API (remove)', () => {
  beforeEach(() => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);
  });

  test('DELETE /api/teams/:teamId returns 200 when removeTeam succeeds', async () => {
    vi.mocked(openclaw.removeTeam).mockImplementation(() => {});

    const res = await request(app).delete('/api/teams/my-team-team').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(openclaw.removeTeam).toHaveBeenCalledWith('my-team-team');
  });

  test('DELETE /api/teams/demo-team returns 400', async () => {
    vi.mocked(openclaw.removeTeam).mockClear();
    const res = await request(app).delete('/api/teams/demo-team').expect(400);
    expect(res.body).toHaveProperty('error', 'Cannot remove demo team');
    expect(openclaw.removeTeam).not.toHaveBeenCalled();
  });

  test('DELETE /api/teams/:teamId returns 503 when OpenClaw unavailable', async () => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(false);

    const res = await request(app).delete('/api/teams/my-team-team').expect(503);
    expect(res.body).toHaveProperty('openclaw', false);
  });

  test('DELETE /api/teams/:teamId returns 400 when removeTeam throws', async () => {
    vi.mocked(openclaw.removeTeam).mockImplementation(() => {
      throw new Error('Team not found');
    });

    const res = await request(app).delete('/api/teams/my-team-team').expect(400);
    expect(res.body).toHaveProperty('error');
  });

});

describe('Non-demo team routes', () => {
  beforeEach(() => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);
    vi.mocked(openclaw.getTickets).mockResolvedValue({
      teamId: 'my-team',
      tickets: [{ id: '0001', stage: 'backlog', title: 'Ticket 1' }],
      backlog: [{ id: '0001', stage: 'backlog', title: 'Ticket 1' }],
      inProgress: [],
      testing: [],
      done: [],
    });
    vi.mocked(openclaw.listInbox).mockResolvedValue([
      { id: 'inbox-001', title: 'Inbox item', received: '2025-01-01' },
    ]);
    vi.mocked(openclaw.getTicketContent).mockResolvedValue('# Ticket content');
    vi.mocked(openclaw.getInboxItemContent).mockResolvedValue('# Inbox content');
  });

  test('GET /api/teams/my-team/tickets returns 200 with correct shape', async () => {
    const res = await request(app).get('/api/teams/my-team/tickets').expect(200);
    expect(res.body).toHaveProperty('teamId', 'my-team');
    expect(res.body).toHaveProperty('backlog');
    expect(res.body).toHaveProperty('inProgress');
    expect(res.body).toHaveProperty('testing');
    expect(res.body).toHaveProperty('done');
    expect(Array.isArray(res.body.backlog)).toBe(true);
    expect(res.body.backlog[0]).toHaveProperty('id', '0001');
  });

  test('GET /api/teams/my-team/tickets returns 502 when getTickets throws', async () => {
    vi.mocked(openclaw.getTickets).mockRejectedValue(new Error('CLI failed'));

    const res = await request(app).get('/api/teams/my-team/tickets').expect(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/CLI failed/);
  });

  test('GET /api/teams/my-team/inbox returns 200 with items', async () => {
    const res = await request(app).get('/api/teams/my-team/inbox').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('id', 'inbox-001');
    expect(res.body[0]).toHaveProperty('title', 'Inbox item');
    expect(res.body[0]).toHaveProperty('received', '2025-01-01');
  });

  test('GET /api/teams/my-team/inbox returns 502 when listInbox throws', async () => {
    vi.mocked(openclaw.listInbox).mockRejectedValue(new Error('readdir failed'));

    const res = await request(app).get('/api/teams/my-team/inbox').expect(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/readdir failed/);
  });

  test('GET /api/teams/my-team/inbox returns 400 when listInbox throws with Invalid in message', async () => {
    vi.mocked(openclaw.listInbox).mockRejectedValue(new Error('Invalid workspace'));

    const res = await request(app).get('/api/teams/my-team/inbox').expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Invalid workspace/);
  });

  test('GET /api/teams/my-team/tickets/0001/content returns 200 with content', async () => {
    const res = await request(app)
      .get('/api/teams/my-team/tickets/0001/content')
      .expect(200);
    expect(res.body).toHaveProperty('content');
    expect(res.body.content).toContain('Ticket content');
  });

  test('GET /api/teams/my-team/tickets/0001/content returns 502 when getTicketContent throws', async () => {
    vi.mocked(openclaw.getTicketContent).mockRejectedValue(new Error('File not found'));

    const res = await request(app)
      .get('/api/teams/my-team/tickets/0001/content')
      .expect(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('File not found');
  });

  test('GET /api/teams/my-team/inbox/inbox-001/content returns 200 with content', async () => {
    const res = await request(app)
      .get('/api/teams/my-team/inbox/inbox-001/content')
      .expect(200);
    expect(res.body).toHaveProperty('content');
    expect(res.body.content).toContain('Inbox content');
  });

  test('GET /api/teams/my-team/inbox/inbox-001/content returns 502 when getInboxItemContent throws', async () => {
    vi.mocked(openclaw.getInboxItemContent).mockRejectedValue(new Error('ENOENT'));

    const res = await request(app)
      .get('/api/teams/my-team/inbox/inbox-001/content')
      .expect(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('ENOENT');
  });

  test('GET /api/teams/my-team/tickets/9999-nonexistent/content returns 404 when getTicketContent returns null', async () => {
    vi.mocked(openclaw.getTicketContent).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/teams/my-team/tickets/9999-nonexistent/content')
      .expect(404);
    expect(res.body).toHaveProperty('error', 'Ticket not found');
  });

  test('GET /api/teams/my-team/inbox/inbox-999/content returns 404 when getInboxItemContent returns null', async () => {
    vi.mocked(openclaw.getInboxItemContent).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/teams/my-team/inbox/inbox-999/content')
      .expect(404);
    expect(res.body).toHaveProperty('error', 'Inbox item not found');
  });

  test('GET /api/teams/my-team/tickets/..%2Fetc/content returns 400 when getTicketContent throws Invalid ticketId', async () => {
    vi.mocked(openclaw.getTicketContent).mockRejectedValue(new Error('Invalid ticketId'));

    const res = await request(app)
      .get('/api/teams/my-team/tickets/..%2Fetc/content')
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Invalid ticketId/);
  });

  test('GET /api/teams/my-team/inbox/..%2Fetc/content returns 400 when getInboxItemContent throws Invalid itemId', async () => {
    vi.mocked(openclaw.getInboxItemContent).mockRejectedValue(new Error('Invalid itemId'));

    const res = await request(app)
      .get('/api/teams/my-team/inbox/..%2Fetc/content')
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Invalid itemId/);
  });
});

describe('scaffold-team validation', () => {
  beforeEach(() => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);
    vi.mocked(openclaw.scaffoldTeam).mockImplementation(() => {});
  });

  test('returns 400 when teamId is missing', async () => {
    const res = await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({})
      .expect(400);
    expect(res.body.error).toBe("Missing 'teamId'");
  });

  test('returns 400 when teamId is empty string', async () => {
    const res = await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({ teamId: '   ' })
      .expect(400);
    expect(res.body.error).toBe("Missing 'teamId'");
  });

  test('returns 400 when teamId is not a string', async () => {
    const res = await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({ teamId: 123 })
      .expect(400);
    expect(res.body.error).toBe("Missing 'teamId'");
  });

  test('returns 400 when teamId does not end with -team', async () => {
    const res = await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({ teamId: 'myworkspace' })
      .expect(400);
    expect(res.body.error).toBe('teamId must end with -team');
  });

  test('returns 400 when teamId has invalid format', async () => {
    const res = await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({ teamId: 'bad..id-team' })
      .expect(400);
    expect(res.body.error).toBe('Invalid teamId format');
  });

  test('returns 400 when scaffoldTeam throws', async () => {
    vi.mocked(openclaw.scaffoldTeam).mockImplementation(() => {
      throw new Error('Scaffold CLI failed');
    });

    const res = await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({ teamId: 'my-team' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Scaffold CLI failed/);
  });

  test('passes overwrite option to scaffoldTeam', async () => {
    await request(app)
      .post('/api/recipes/default/scaffold-team')
      .send({ teamId: 'my-team', overwrite: true })
      .expect(200);
    expect(openclaw.scaffoldTeam).toHaveBeenCalledWith(
      'default',
      'my-team',
      expect.objectContaining({ overwrite: true })
    );
  });
});

describe('POST body validation (non-demo team)', () => {
  beforeEach(() => {
    vi.mocked(openclaw.checkOpenClaw).mockResolvedValue(true);
    vi.mocked(openclaw.moveTicket).mockImplementation(() => {});
    vi.mocked(openclaw.assignTicket).mockImplementation(() => {});
    vi.mocked(openclaw.takeTicket).mockImplementation(() => {});
    vi.mocked(openclaw.handoffTicket).mockImplementation(() => {});
    vi.mocked(openclaw.completeTicket).mockImplementation(() => {});
    vi.mocked(openclaw.dispatch).mockImplementation(() => {});
  });

  test('POST move returns 400 when to is missing', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/move')
      .send({})
      .expect(400);
    expect(res.body.error).toBe("Missing 'to' (stage)");
  });

  test('POST assign returns 400 when owner is missing', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/assign')
      .send({})
      .expect(400);
    expect(res.body.error).toBe("Missing 'owner'");
  });

  test('POST take returns 400 when owner is missing', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/take')
      .send({})
      .expect(400);
    expect(res.body.error).toBe("Missing 'owner'");
  });

  test('POST dispatch returns 400 when request is missing', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/dispatch')
      .send({})
      .expect(400);
    expect(res.body.error).toMatch(/Missing or invalid 'request'/);
  });

  test('POST dispatch returns 400 when request is empty string', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/dispatch')
      .send({ request: '   ' })
      .expect(400);
    expect(res.body.error).toMatch(/Missing or invalid 'request'/);
  });

  test('POST move with valid body returns 200 and ok true', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/move')
      .send({ to: 'in-progress' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST move passes completed option to moveTicket', async () => {
    await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/move')
      .send({ to: 'done', completed: true })
      .expect(200);
    expect(openclaw.moveTicket).toHaveBeenCalledWith(
      'my-team',
      '0001-setup-ci',
      'done',
      expect.objectContaining({ completed: true })
    );
  });

  test('POST move returns 400 when moveTicket throws', async () => {
    vi.mocked(openclaw.moveTicket).mockImplementation(() => {
      throw new Error('Ticket not in valid state');
    });

    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/move')
      .send({ to: 'in-progress' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Ticket not in valid state/);
  });

  test('POST assign returns 400 when assignTicket throws', async () => {
    vi.mocked(openclaw.assignTicket).mockImplementation(() => {
      throw new Error('Owner not in team');
    });

    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/assign')
      .send({ owner: 'dev' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Owner not in team/);
  });

  test('POST dispatch returns 400 when dispatch throws', async () => {
    vi.mocked(openclaw.dispatch).mockImplementation(() => {
      throw new Error('Dispatch failed');
    });

    const res = await request(app)
      .post('/api/teams/my-team/dispatch')
      .send({ request: 'Add feature X' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Dispatch failed/);
  });

  test('POST handoff returns 200 when handoffTicket succeeds', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/handoff')
      .send({ tester: 'qa' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST handoff returns 400 when handoffTicket throws', async () => {
    vi.mocked(openclaw.handoffTicket).mockImplementation(() => {
      throw new Error('Handoff not allowed');
    });

    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/handoff')
      .send({})
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Handoff not allowed/);
  });

  test('POST complete returns 200 when completeTicket succeeds', async () => {
    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/complete')
      .expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST complete returns 400 when completeTicket throws', async () => {
    vi.mocked(openclaw.completeTicket).mockImplementation(() => {
      throw new Error('Ticket not ready');
    });

    const res = await request(app)
      .post('/api/teams/my-team/tickets/0001-setup-ci/complete')
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Ticket not ready/);
  });

  test('POST with invalid teamId returns 400 before openclaw', async () => {
    vi.mocked(openclaw.moveTicket).mockClear();

    const res = await request(app)
      .post('/api/teams/bad..id/tickets/0001-setup-ci/move')
      .send({ to: 'in-progress' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('Invalid teamId format');
    expect(openclaw.moveTicket).not.toHaveBeenCalled();
  });
});
