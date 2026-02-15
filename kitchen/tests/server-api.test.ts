import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/index.js';

const app = createApp();

describe('Kitchen API (demo routes)', () => {
  test('GET /api/teams/demo-team/tickets returns 200 and tickets shape', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/tickets')
      .expect(200);
    expect(res.body).toHaveProperty('teamId', 'demo-team');
    expect(res.body).toHaveProperty('backlog');
    expect(res.body).toHaveProperty('inProgress');
    expect(res.body).toHaveProperty('testing');
    expect(res.body).toHaveProperty('done');
    expect(Array.isArray(res.body.backlog)).toBe(true);
  });

  test('GET /api/teams/demo-team/inbox returns 200 and items', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/inbox')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('title');
      expect(res.body[0]).toHaveProperty('received');
    }
  });

  test('GET /api/teams/demo-team/tickets/0001-setup-ci/content returns 200 and content', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/tickets/0001-setup-ci/content')
      .expect(200);
    expect(res.body).toHaveProperty('content');
    expect(typeof res.body.content).toBe('string');
  });

  test('GET /api/teams/demo-team/inbox/inbox-001/content returns 200', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/inbox/inbox-001/content')
      .expect(200);
    expect(res.body).toHaveProperty('content');
  });

  test('GET /api/teams/../evil/tickets returns 400 for invalid teamId', async () => {
    const res = await request(app)
      .get('/api/teams/..%2F..%2Fevil/tickets')
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/teams/bad..id/tickets returns 400 for invalid teamId format', async () => {
    const res = await request(app)
      .get('/api/teams/bad..id/tickets')
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /api/teams/demo-team/tickets/9999-nonexistent/content returns 404', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/tickets/9999-nonexistent/content')
      .expect(404);
    expect(res.body).toHaveProperty('error', 'Ticket not found');
  });

  test('GET /api/teams/demo-team/inbox/inbox-999/content returns 404', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/inbox/inbox-999/content')
      .expect(404);
    expect(res.body).toHaveProperty('error', 'Inbox item not found');
  });

  test('POST /api/teams/demo-team/tickets/0001-setup-ci/move returns 400 in demo mode', async () => {
    const res = await request(app)
      .post('/api/teams/demo-team/tickets/0001-setup-ci/move')
      .send({ to: 'in-progress' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.toLowerCase()).toMatch(/demo mode|disabled/);
  });

  test('GET /api/teams/demo-team/tickets/..%2F..%2Fetc/content returns 400 for invalid ticketId', async () => {
    const res = await request(app)
      .get('/api/teams/demo-team/tickets/..%2F..%2Fetc/content')
      .expect(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/Invalid/);
  });
});
