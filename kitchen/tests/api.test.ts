import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  fetchTeams,
  fetchTickets,
  fetchTicketContent,
  fetchInbox,
  fetchInboxContent,
  fetchHealth,
  fetchRecipes,
  fetchRecipe,
  scaffoldRecipeTeam,
  moveTicket,
  assignTicket,
  takeTicket,
  handoffTicket,
  completeTicket,
  dispatchTicket,
  DEMO_TEAMS,
  DEMO_TEAM_ID,
} from '../app/src/api.ts';

describe('api parseApiError behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('fetchTeams throws Error with parsed JSON error message on 4xx', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Custom error message' })),
      } as Response)
    );

    await expect(fetchTeams()).rejects.toThrow('Custom error message');
  });

  test('fetchTeams throws Error with raw text when response is not JSON', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve('raw error text'),
      } as Response)
    );

    await expect(fetchTeams()).rejects.toThrow('raw error text');
  });

  test('fetchTickets propagates API error on 400', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Invalid teamId format' })),
      } as Response)
    );

    await expect(fetchTickets('bad..id')).rejects.toThrow('Invalid teamId format');
  });

  test('fetchTicketContent propagates error on 404', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Ticket not found' })),
      } as Response)
    );

    await expect(fetchTicketContent('demo-team', '9999-nonexistent')).rejects.toThrow(
      'Ticket not found'
    );
  });

  test('fetchInbox propagates API error on 4xx', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Team not found' })),
      } as Response)
    );

    await expect(fetchInbox('my-team')).rejects.toThrow('Team not found');
  });

  test('fetchHealth propagates API error on 503', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Service unavailable' })),
      } as Response)
    );

    await expect(fetchHealth()).rejects.toThrow('Service unavailable');
  });

  test('fetchRecipes propagates API error on 502', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'OpenClaw unavailable' })),
      } as Response)
    );

    await expect(fetchRecipes()).rejects.toThrow('OpenClaw unavailable');
  });

  test('fetchRecipe propagates API error on 404', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Recipe not found' })),
      } as Response)
    );

    await expect(fetchRecipe('missing-recipe')).rejects.toThrow('Recipe not found');
  });

  test('fetchInboxContent propagates API error on 404', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({ error: 'Inbox item not found' })),
      } as Response)
    );

    await expect(fetchInboxContent('my-team', 'inbox-999')).rejects.toThrow(
      'Inbox item not found'
    );
  });

  test('scaffoldRecipeTeam propagates API error on 400', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () =>
          Promise.resolve(JSON.stringify({ error: 'Invalid teamId format' })),
      } as Response)
    );

    await expect(
      scaffoldRecipeTeam('default', 'bad..id')
    ).rejects.toThrow('Invalid teamId format');
  });

  test('moveTicket propagates API error on 400', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () =>
          Promise.resolve(
            JSON.stringify({ error: 'Actions disabled in demo mode' })
          ),
      } as Response)
    );

    await expect(
      moveTicket('demo-team', '0001', 'in-progress')
    ).rejects.toThrow('Actions disabled in demo mode');
  });

  test('assignTicket propagates API error on 400', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () =>
          Promise.resolve(JSON.stringify({ error: 'Owner not in team' })),
      } as Response)
    );

    await expect(
      assignTicket('my-team', '0001', 'unknown')
    ).rejects.toThrow('Owner not in team');
  });

  test('dispatchTicket propagates API error on 400', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        text: () =>
          Promise.resolve(JSON.stringify({ error: 'Team not found' })),
      } as Response)
    );

    await expect(
      dispatchTicket('missing-team', 'Add feature')
    ).rejects.toThrow('Team not found');
  });
});

describe('api success paths', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('fetchTeams returns teams on success', async () => {
    const teams = [{ teamId: 'my-team', recipeId: 'dev', recipeName: 'Dev', scaffoldedAt: '2025-01-01' }];
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(teams),
      } as Response)
    );

    const result = await fetchTeams();
    expect(result).toEqual(teams);
  });

  test('fetchTickets returns tickets shape on success', async () => {
    const data = {
      teamId: 'my-team',
      tickets: [],
      backlog: [],
      inProgress: [],
      testing: [],
      done: [],
    };
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(data),
      } as Response)
    );

    const result = await fetchTickets('my-team');
    expect(result).toEqual(data);
  });

  test('fetchInboxContent returns content string on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: '# Inbox item content' }),
      } as Response)
    );

    const result = await fetchInboxContent('my-team', 'inbox-001');
    expect(result).toBe('# Inbox item content');
  });

  test('fetchTicketContent returns content string on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: '# Ticket markdown' }),
      } as Response)
    );

    const result = await fetchTicketContent('my-team', '0001');
    expect(result).toBe('# Ticket markdown');
  });

  test('moveTicket succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(moveTicket('my-team', '0001', 'in-progress')).resolves.toBeUndefined();
  });

  test('assignTicket succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(assignTicket('my-team', '0001', 'dev')).resolves.toBeUndefined();
  });

  test('takeTicket succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(takeTicket('my-team', '0001', 'dev')).resolves.toBeUndefined();
  });

  test('handoffTicket succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(handoffTicket('my-team', '0001', 'qa')).resolves.toBeUndefined();
  });

  test('completeTicket succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(completeTicket('my-team', '0001')).resolves.toBeUndefined();
  });

  test('dispatchTicket succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(dispatchTicket('my-team', 'Add feature')).resolves.toBeUndefined();
  });

  test('scaffoldRecipeTeam succeeds when res.ok', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    );

    await expect(scaffoldRecipeTeam('default', 'my-team')).resolves.toBeUndefined();
  });

  test('fetchHealth returns ok and openclaw on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, openclaw: true }),
      } as Response)
    );

    const result = await fetchHealth();
    expect(result).toEqual({ ok: true, openclaw: true });
  });

  test('fetchRecipes returns recipes on success', async () => {
    const recipes = [{ id: 'default', name: 'Default', source: 'builtin' }];
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(recipes),
      } as Response)
    );

    const result = await fetchRecipes();
    expect(result).toEqual(recipes);
  });

  test('fetchRecipe returns md on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ md: '# Recipe\nContent' }),
      } as Response)
    );

    const result = await fetchRecipe('default');
    expect(result).toEqual({ md: '# Recipe\nContent' });
  });

  test('DEMO_TEAMS has expected shape', () => {
    expect(DEMO_TEAM_ID).toBe('demo-team');
    expect(DEMO_TEAMS).toHaveLength(1);
    expect(DEMO_TEAMS[0]).toHaveProperty('teamId', 'demo-team');
    expect(DEMO_TEAMS[0]).toHaveProperty('recipeId');
    expect(DEMO_TEAMS[0]).toHaveProperty('recipeName');
    expect(DEMO_TEAMS[0]).toHaveProperty('scaffoldedAt');
  });
});
