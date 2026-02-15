import { describe, expect, test } from 'vitest';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getDemoTickets,
  getDemoInbox,
  getDemoTicketContent,
  getDemoInboxItemContent,
  DEMO_WORKSPACE,
} from '../server/demo-workspace.js';

describe('demo-workspace', () => {
  test('getDemoTickets returns teamId demo-team and correct shape', async () => {
    const data = await getDemoTickets();
    expect(data.teamId).toBe('demo-team');
    expect(data).toHaveProperty('tickets');
    expect(data).toHaveProperty('backlog');
    expect(data).toHaveProperty('inProgress');
    expect(data).toHaveProperty('testing');
    expect(data).toHaveProperty('done');
    expect(Array.isArray(data.backlog)).toBe(true);
    expect(Array.isArray(data.inProgress)).toBe(true);
    expect(Array.isArray(data.testing)).toBe(true);
    expect(Array.isArray(data.done)).toBe(true);
    const backlogIds = data.backlog.map((t: { id: string }) => t.id);
    expect(backlogIds).toContain('0001-setup-ci');
    expect(backlogIds).toContain('0002-add-tests');
  });

  test('getDemoTickets places each ticket in correct stage array', async () => {
    const data = await getDemoTickets();
    const inProgressIds = data.inProgress.map((t: { id: string }) => t.id);
    expect(inProgressIds).toContain('0003-refactor-api');
    const testingIds = data.testing.map((t: { id: string }) => t.id);
    expect(testingIds).toContain('0004-auth-flow');
    const doneIds = data.done.map((t: { id: string }) => t.id);
    expect(doneIds).toContain('0000-project-kickoff');
  });

  test('getDemoInbox returns items with id, title, received', async () => {
    const items = await getDemoInbox();
    expect(items.length).toBeGreaterThan(0);
    const first = items[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('received');
  });

  test('getDemoTicketContent returns markdown for valid ticketId', async () => {
    const content = await getDemoTicketContent('0001-setup-ci');
    expect(content).toBeTruthy();
    expect(typeof content).toBe('string');
    expect(content).toMatch(/Set up CI pipeline|Owner|Status/i);
  });

  test('getDemoTicketContent throws for invalid ticketId', async () => {
    await expect(getDemoTicketContent('')).rejects.toThrow(/Invalid ticketId/);
    await expect(getDemoTicketContent('../../../etc')).rejects.toThrow(/Invalid ticketId/);
  });

  test('getDemoTicketContent returns null for unknown ticketId', async () => {
    const content = await getDemoTicketContent('9999-fake');
    expect(content).toBeNull();
  });

  test('getDemoInboxItemContent returns content for valid itemId', async () => {
    const content = await getDemoInboxItemContent('inbox-001');
    expect(content).toBeTruthy();
    expect(typeof content).toBe('string');
  });

  test('getDemoInboxItemContent returns null for invalid itemId format', async () => {
    const content = await getDemoInboxItemContent('../../../etc');
    expect(content).toBeNull();
  });

  test('getDemoInboxItemContent returns null for unknown itemId', async () => {
    const content = await getDemoInboxItemContent('inbox-999');
    expect(content).toBeNull();
  });

  test('ensureDemoWorkspace creates missing ticket files when getDemoTickets is called', async () => {
    const ticketPath = join(DEMO_WORKSPACE, 'work/backlog', '0005-docs.md');
    try {
      await unlink(ticketPath);
    } catch {
      /* file may not exist yet */
    }
    const data = await getDemoTickets();
    expect(data.teamId).toBe('demo-team');
    const docTicket = data.backlog.find((t: { id: string }) => t.id === '0005-docs');
    expect(docTicket).toBeDefined();
    const content = await getDemoTicketContent('0005-docs');
    expect(content).toBeTruthy();
    expect(content).toMatch(/Update README|Owner|Status/i);
  });
});
