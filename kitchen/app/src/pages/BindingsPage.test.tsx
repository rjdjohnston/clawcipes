import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BindingsPage } from './BindingsPage';

vi.mock('../api', () => ({
  fetchHealth: vi.fn(),
  fetchBindings: vi.fn(),
  addBindingAPI: vi.fn(),
  removeBindingAPI: vi.fn(),
}));

import * as api from '../api';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

function renderBindingsPage() {
  return render(
    <MemoryRouter>
      <BindingsPage />
    </MemoryRouter>
  );
}

describe('BindingsPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: true });
    vi.mocked(api.fetchBindings).mockResolvedValue([]);
  });

  test('shows checking initially', () => {
    vi.mocked(api.fetchHealth).mockImplementation(() => new Promise(() => {}));
    renderBindingsPage();
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });

  test('shows Connect OpenClaw when openclaw false', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: false });
    renderBindingsPage();
    expect(await screen.findByText(/Connect OpenClaw to manage bindings/i)).toBeInTheDocument();
  });

  test('shows loading bindings', async () => {
    vi.mocked(api.fetchBindings).mockImplementation(() => new Promise(() => {}));
    renderBindingsPage();
    await screen.findByText(/Checking/i);
    expect(await screen.findByText(/Loading bindings/i)).toBeInTheDocument();
  });

  test('shows No bindings configured when empty', async () => {
    renderBindingsPage();
    expect(await screen.findByText('No bindings configured.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add binding' })).toBeInTheDocument();
  });

  test('renders bindings list', async () => {
    vi.mocked(api.fetchBindings).mockResolvedValue([
      { agentId: 'my-agent', match: { channel: 'telegram' } },
      { agentId: 'other-agent', match: { channel: 'discord', accountId: 'acc-1' } },
    ]);
    renderBindingsPage();
    expect(await screen.findByText(/my-agent/)).toBeInTheDocument();
    expect(screen.getByText(/telegram/)).toBeInTheDocument();
    expect(screen.getByText(/other-agent/)).toBeInTheDocument();
    expect(screen.getByText(/acc-1/)).toBeInTheDocument();
    const removeBtns = screen.getAllByRole('button', { name: 'Remove' });
    expect(removeBtns).toHaveLength(2);
  });

  test('Add binding opens modal', async () => {
    const user = userEvent.setup();
    renderBindingsPage();
    await screen.findByText('No bindings configured.');
    await user.click(screen.getAllByRole('button', { name: 'Add binding' })[0]);
    expect(screen.getByRole('dialog')).toHaveTextContent('Add binding');
    expect(screen.getByPlaceholderText('e.g. my-team-dev')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. telegram')).toBeInTheDocument();
  });

  test('Add binding submits and closes modal', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addBindingAPI).mockResolvedValue(undefined);
    vi.mocked(api.fetchBindings)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ agentId: 'new-agent', match: { channel: 'telegram' } }]);
    renderBindingsPage();
    await screen.findByRole('button', { name: 'Add binding' });
    await user.click(screen.getAllByRole('button', { name: 'Add binding' })[0]);
    await user.type(screen.getByPlaceholderText('e.g. my-team-dev'), 'new-agent');
    await user.type(screen.getByPlaceholderText('e.g. telegram'), 'telegram');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      expect(api.addBindingAPI).toHaveBeenCalledWith('new-agent', { channel: 'telegram' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  test('Add binding Cancel closes modal', async () => {
    const user = userEvent.setup();
    renderBindingsPage();
    await screen.findByRole('button', { name: 'Add binding' });
    await user.click(screen.getAllByRole('button', { name: 'Add binding' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Add binding disabled when fields empty', async () => {
    const user = userEvent.setup();
    renderBindingsPage();
    await screen.findByRole('button', { name: 'Add binding' });
    await user.click(screen.getAllByRole('button', { name: 'Add binding' })[0]);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('e.g. my-team-dev'), 'x');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('e.g. telegram'), 'y');
    expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled();
  });

  test('Add binding shows error on API failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addBindingAPI).mockRejectedValue(new Error('Config write failed'));
    renderBindingsPage();
    await screen.findByRole('button', { name: 'Add binding' });
    await user.click(screen.getAllByRole('button', { name: 'Add binding' })[0]);
    await user.type(screen.getByPlaceholderText('e.g. my-team-dev'), 'agent');
    await user.type(screen.getByPlaceholderText('e.g. telegram'), 'chan');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/Config write failed/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('Remove binding calls API and reloads', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchBindings).mockResolvedValue([
      { agentId: 'my-agent', match: { channel: 'telegram' } },
    ]);
    vi.mocked(api.removeBindingAPI).mockResolvedValue(undefined);
    renderBindingsPage();
    await screen.findByText(/my-agent/);
    const removeBtns = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removeBtns[0]);
    await waitFor(() => {
      expect(api.removeBindingAPI).toHaveBeenCalledWith(
        { channel: 'telegram' },
        'my-agent'
      );
    });
  });
});
