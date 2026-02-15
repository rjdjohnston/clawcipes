import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RecipesPage } from './RecipesPage';

vi.mock('../api', () => ({
  fetchHealth: vi.fn(),
  fetchRecipes: vi.fn(),
  fetchRecipe: vi.fn(),
  fetchRecipeStatus: vi.fn(),
  scaffoldRecipeTeam: vi.fn(),
}));

import * as api from '../api';

afterEach(() => cleanup());

function renderRecipesPage() {
  return render(
    <MemoryRouter>
      <RecipesPage />
    </MemoryRouter>
  );
}

describe('RecipesPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: true });
    vi.mocked(api.fetchRecipes).mockResolvedValue([
      { id: 'default', name: 'Default', source: 'builtin' },
    ]);
    vi.mocked(api.fetchRecipeStatus).mockResolvedValue([
      { id: 'default', requiredSkills: [], missingSkills: [], installCommands: [] },
    ]);
  });

  test('shows checking initially', () => {
    vi.mocked(api.fetchHealth).mockImplementation(() => new Promise(() => {}));
    renderRecipesPage();
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });

  test('shows connection error when health fetch fails with non-openclaw error', async () => {
    vi.mocked(api.fetchHealth).mockRejectedValue(new Error('Network unreachable'));
    renderRecipesPage();
    expect(await screen.findByText(/Unable to connect to Kitchen server/i)).toBeInTheDocument();
    expect(screen.getByText(/Network unreachable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  test('shows Connect OpenClaw message when openclaw false', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: false });
    renderRecipesPage();
    expect(await screen.findByText(/Connect OpenClaw to browse recipes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  test('Check again retries health', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchHealth)
      .mockResolvedValueOnce({ ok: true, openclaw: false })
      .mockResolvedValueOnce({ ok: true, openclaw: true });
    renderRecipesPage();
    await screen.findByText(/Connect OpenClaw/i);
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Default')).toBeInTheDocument();
  });

  test('shows loading recipes', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({ ok: true, openclaw: true });
    vi.mocked(api.fetchRecipes).mockImplementation(() => new Promise(() => {}));
    renderRecipesPage();
    await screen.findByText(/Checking/i);
    expect(await screen.findByText(/Loading recipes/i)).toBeInTheDocument();
  });

  test('shows error when fetchRecipes fails', async () => {
    vi.mocked(api.fetchRecipes).mockRejectedValue(new Error('Server error'));
    renderRecipesPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });

  test('renders recipes when OpenClaw available', async () => {
    renderRecipesPage();
    await screen.findByRole('heading', { name: 'Recipes' });
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Team recipes')).toBeInTheDocument();
  });

  test('shows No recipes found when empty', async () => {
    vi.mocked(api.fetchRecipes).mockResolvedValue([]);
    renderRecipesPage();
    expect(await screen.findByText('No recipes found.')).toBeInTheDocument();
  });

  test('shows missing skills badge when recipe has missing skills', async () => {
    vi.mocked(api.fetchRecipeStatus).mockResolvedValue([
      { id: 'default', requiredSkills: ['skill-a', 'skill-b'], missingSkills: ['skill-a'], installCommands: ['npx clawhub install skill-a'] },
    ]);
    renderRecipesPage();
    await screen.findByText('Default');
    expect(screen.getByText('1 missing')).toBeInTheDocument();
    expect(screen.getByTitle('Missing skills: skill-a')).toBeInTheDocument();
  });

  test('shows missing skills and install commands in recipe detail modal', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchRecipeStatus).mockResolvedValue([
      { id: 'default', requiredSkills: ['skill-a'], missingSkills: ['skill-a'], installCommands: ['cd "$WORKSPACE"', 'npx clawhub install skill-a'] },
    ]);
    vi.mocked(api.fetchRecipe).mockResolvedValue({ md: '# Default\nContent' });
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByText('Default'));
    await screen.findByText(/Missing skills/i);
    expect(screen.getByText('skill-a')).toBeInTheDocument();
    expect(screen.getByText(/npx clawhub install skill-a/)).toBeInTheDocument();
  });

  test('renders agent recipes section', async () => {
    vi.mocked(api.fetchRecipes).mockResolvedValue([
      { id: 'agent-1', name: 'Agent Recipe', source: 'builtin', kind: 'agent' },
    ]);
    renderRecipesPage();
    expect(await screen.findByText('Agent recipes')).toBeInTheDocument();
    expect(screen.getByText('Agent Recipe')).toBeInTheDocument();
  });

  test('click agent recipe opens detail modal', async () => {
    vi.mocked(api.fetchRecipes).mockResolvedValue([
      { id: 'agent-1', name: 'Agent Recipe', source: 'builtin', kind: 'agent' },
    ]);
    vi.mocked(api.fetchRecipe).mockResolvedValue({ md: '# Agent content' });
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Agent Recipe');
    await user.click(screen.getByText('Agent Recipe'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Agent Recipe');
    expect(await screen.findByText(/Agent content/)).toBeInTheDocument();
  });

  test('renders other recipes section', async () => {
    vi.mocked(api.fetchRecipes).mockResolvedValue([
      { id: 'other-1', name: 'Other Recipe', source: 'builtin', kind: 'custom' },
    ]);
    renderRecipesPage();
    expect(await screen.findByText('Other recipes')).toBeInTheDocument();
    expect(screen.getByText('Other Recipe')).toBeInTheDocument();
  });

  test('click other recipe opens detail modal', async () => {
    vi.mocked(api.fetchRecipes).mockResolvedValue([
      { id: 'other-1', name: 'Other Recipe', source: 'builtin', kind: 'custom' },
    ]);
    vi.mocked(api.fetchRecipe).mockResolvedValue({ md: '# Other content' });
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Other Recipe');
    await user.click(screen.getByText('Other Recipe'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Other Recipe');
    expect(await screen.findByText(/Other content/)).toBeInTheDocument();
  });

  test('click recipe loads markdown', async () => {
    vi.mocked(api.fetchRecipe).mockResolvedValue({ md: '# Recipe content\n\nHello world.' });
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByText('Default'));
    expect(await screen.findByText('Recipe content')).toBeInTheDocument();
    expect(screen.getByText('Hello world.')).toBeInTheDocument();
  });

  test('shows recipe error with Retry', async () => {
    vi.mocked(api.fetchRecipe)
      .mockRejectedValueOnce(new Error('Recipe load failed'))
      .mockResolvedValueOnce({ md: 'Fixed' });
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByText('Default'));
    expect(await screen.findByText(/Recipe load failed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Fixed')).toBeInTheDocument();
  });

  test('scaffold from recipe detail modal', async () => {
    vi.mocked(api.fetchRecipe).mockResolvedValue({ md: '# Content' });
    vi.mocked(api.scaffoldRecipeTeam).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByText('Default'));
    await screen.findByText('Content');
    const scaffoldBtns = screen.getAllByRole('button', { name: 'Scaffold team' });
    await user.click(scaffoldBtns[scaffoldBtns.length - 1]);
    expect(screen.getByPlaceholderText('e.g. my-team-team')).toBeInTheDocument();
  });

  test('scaffold form submits with valid teamId and navigates', async () => {
    vi.mocked(api.scaffoldRecipeTeam).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/recipes']}>
        <RecipesPage />
      </MemoryRouter>
    );
    await screen.findByText('Default');
    await user.click(screen.getByRole('button', { name: 'Scaffold team' }));
    await screen.findByRole('dialog');
    const teamIdInput = screen.getByPlaceholderText('e.g. my-team-team');
    await user.type(teamIdInput, 'my-team');
    await user.click(screen.getByRole('button', { name: 'Scaffold' }));
    await waitFor(() => {
      expect(api.scaffoldRecipeTeam).toHaveBeenCalledWith('default', 'my-team', false);
    });
  });

  test('scaffold with overwrite checkbox', async () => {
    vi.mocked(api.scaffoldRecipeTeam).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByRole('button', { name: 'Scaffold team' }));
    await screen.findByRole('dialog');
    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    await user.type(screen.getByPlaceholderText('e.g. my-team-team'), 'my-team');
    await user.click(screen.getByRole('button', { name: 'Scaffold' }));
    await waitFor(() => {
      expect(api.scaffoldRecipeTeam).toHaveBeenCalledWith('default', 'my-team', true);
    });
  });

  test('scaffold Cancel closes modal', async () => {
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByRole('button', { name: 'Scaffold team' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('scaffold shows validation error when teamId does not end with -team', async () => {
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByRole('button', { name: 'Scaffold team' }));
    await screen.findByRole('dialog');
    await user.type(screen.getByPlaceholderText('e.g. my-team-team'), 'invalid-id');
    const scaffoldBtn = screen.getByRole('button', { name: 'Scaffold' });
    expect(scaffoldBtn).toBeDisabled();
  });

  test('scaffold shows error when API throws', async () => {
    vi.mocked(api.scaffoldRecipeTeam).mockRejectedValue(new Error('Team exists'));
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByRole('button', { name: 'Scaffold team' }));
    await screen.findByRole('dialog');
    await user.type(screen.getByPlaceholderText('e.g. my-team-team'), 'my-team');
    await user.click(screen.getByRole('button', { name: 'Scaffold' }));
    expect(await screen.findByText(/Team exists/)).toBeInTheDocument();
  });

  test('scaffold shows loading state', async () => {
    let resolveScaffold: () => void;
    vi.mocked(api.scaffoldRecipeTeam).mockImplementation(
      () => new Promise((r) => { resolveScaffold = r as () => void; })
    );
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByRole('button', { name: 'Scaffold team' }));
    await user.type(screen.getByPlaceholderText('e.g. my-team-team'), 'my-team');
    await user.click(screen.getByRole('button', { name: 'Scaffold' }));
    expect(screen.getByRole('button', { name: 'Scaffolding…' })).toBeInTheDocument();
    resolveScaffold!();
  });

  test('closing recipe modal clears selection', async () => {
    vi.mocked(api.fetchRecipe).mockResolvedValue({ md: 'Content' });
    const user = userEvent.setup();
    renderRecipesPage();
    await screen.findByText('Default');
    await user.click(screen.getByText('Default'));
    await screen.findByRole('dialog');
    await user.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
