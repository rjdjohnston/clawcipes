import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';

vi.mock('../api', () => ({
  fetchHealth: vi.fn(),
  migrateTeam: vi.fn(),
}));

import * as api from '../api';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(api.fetchHealth).mockReset();
    vi.mocked(api.migrateTeam).mockReset();
  });

function renderSettingsPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

async function waitForMigrationForm() {
  return screen.findByPlaceholderText('e.g. my-team-team', {}, { timeout: 5000 });
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: true });
    vi.mocked(api.migrateTeam).mockResolvedValue({ ok: true });
  });

  test('renders Legacy team migration section', async () => {
    renderSettingsPage();
    await waitForMigrationForm();
    expect(screen.getAllByText('Legacy team migration')[0]).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. my-team-team')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects[0]).toHaveValue('move');
    expect(screen.getByLabelText('Dry run (preview only, no changes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Overwrite existing destination')).toBeInTheDocument();
  });

  test('Migrate button disabled when teamId empty', async () => {
    renderSettingsPage();
    await waitForMigrationForm();
    const migrateBtns = screen.getAllByRole('button', { name: /Preview migration/i });
    expect(migrateBtns[0]).toBeDisabled();
  });

  test('Migrate button disabled when teamId does not end with -team', { timeout: 10000 }, async () => {
    renderSettingsPage();
    await waitForMigrationForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. my-team-team'), { target: { value: 'invalid' } });
    const migrateBtns = screen.getAllByRole('button', { name: /Preview migration/i });
    expect(migrateBtns[0]).toBeDisabled();
  });

  test('Migrate button enabled with valid teamId', { timeout: 10000 }, async () => {
    const user = userEvent.setup();
    renderSettingsPage();
    await waitForMigrationForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. my-team-team'), { target: { value: 'my-team-team' } });
    const migrateBtns = screen.getAllByRole('button', { name: /Preview migration/i });
    expect(migrateBtns[0]).not.toBeDisabled();
  });

  test('Preview migration calls migrateTeam with dryRun', { timeout: 10000 }, async () => {
    vi.mocked(api.migrateTeam).mockResolvedValue({ ok: true, dryRun: true, plan: {} });
    const user = userEvent.setup();
    renderSettingsPage();
    await waitForMigrationForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. my-team-team'), { target: { value: 'my-team-team' } });
    await user.click(screen.getAllByRole('button', { name: /Preview migration/i })[0]);
    await waitFor(() => {
      expect(api.migrateTeam).toHaveBeenCalledWith('my-team-team', {
        dryRun: true,
        mode: 'move',
        overwrite: false,
      });
    });
    expect(await screen.findByText(/"ok": true/)).toBeInTheDocument();
  });

  test('Migrate with copy mode', { timeout: 10000 }, async () => {
    vi.mocked(api.migrateTeam).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSettingsPage();
    await waitForMigrationForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. my-team-team'), { target: { value: 'my-team-team' } });
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'copy');
    await user.click(screen.getByLabelText('Dry run (preview only, no changes)'));
    await user.click(screen.getAllByRole('button', { name: 'Migrate' })[0]);
    await waitFor(() => {
      expect(api.migrateTeam).toHaveBeenCalledWith('my-team-team', {
        dryRun: false,
        mode: 'copy',
        overwrite: false,
      });
    });
  });

  test('Migrate with overwrite', { timeout: 10000 }, async () => {
    vi.mocked(api.migrateTeam).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderSettingsPage();
    await waitForMigrationForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. my-team-team'), { target: { value: 'my-team-team' } });
    await user.click(screen.getByLabelText('Overwrite existing destination'));
    await user.click(screen.getByLabelText('Dry run (preview only, no changes)')); // uncheck dry run
    const migrateBtns = screen.getAllByRole('button', { name: 'Migrate' });
    await user.click(migrateBtns[0]);
    await waitFor(() => {
      expect(api.migrateTeam).toHaveBeenCalledWith('my-team-team', {
        dryRun: false,
        mode: 'move',
        overwrite: true,
      });
    });
  });

  test('Migrate shows error on API failure', { timeout: 10000 }, async () => {
    vi.mocked(api.migrateTeam).mockRejectedValue(new Error('Legacy team not found'));
    const user = userEvent.setup();
    renderSettingsPage();
    await waitForMigrationForm();
    fireEvent.change(screen.getByPlaceholderText('e.g. my-team-team'), { target: { value: 'my-team-team' } });
    await user.click(screen.getAllByRole('button', { name: /Preview migration/i })[0]);
    expect(await screen.findByText(/Legacy team not found/)).toBeInTheDocument();
  });

  test('shows checking initially', () => {
    vi.mocked(api.fetchHealth).mockImplementation(() => new Promise(() => {}));
    renderSettingsPage();
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });

  test('shows Connect OpenClaw when openclaw false', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: false });
    renderSettingsPage();
    expect(await screen.findByText(/Connect OpenClaw for settings/i)).toBeInTheDocument();
  });
});
