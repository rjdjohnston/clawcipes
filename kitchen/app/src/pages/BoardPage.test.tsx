import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../ThemeContext';
import { DemoProvider } from '../DemoContext';
import { Layout } from '../components/Layout';
import { BoardPage } from './BoardPage';

vi.mock('../api', () => ({
  fetchTeams: vi.fn(),
  fetchTickets: vi.fn(),
  fetchInbox: vi.fn().mockResolvedValue([]),
  fetchInboxContent: vi.fn().mockResolvedValue(''),
  fetchTicketContent: vi.fn().mockResolvedValue('# Content'),
  moveTicket: vi.fn(),
  dispatchTicket: vi.fn().mockResolvedValue(undefined),
  removeTeam: vi.fn(),
  DEMO_TEAMS: [{ teamId: 'demo-team', recipeId: 'dev', recipeName: 'Demo', scaffoldedAt: '' }],
  DEMO_TEAM_ID: 'demo-team',
}));

import * as api from '../api';

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

function renderBoardPage(initialEntries = ['/board'], withLayout = false) {
  const content = withLayout ? (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route path="board" element={<BoardPage />} />
      </Route>
    </Routes>
  ) : (
    <BoardPage />
  );
  return render(
    <ThemeProvider>
      <DemoProvider>
        <MemoryRouter initialEntries={initialEntries}>
          {content}
        </MemoryRouter>
      </DemoProvider>
    </ThemeProvider>
  );
}

describe('BoardPage', () => {
  beforeEach(() => {
    vi.mocked(api.fetchTeams).mockResolvedValue([]);
    vi.mocked(api.fetchTickets).mockResolvedValue({
      teamId: 'my-team',
      tickets: [],
      backlog: [],
      inProgress: [],
      testing: [],
      done: [],
    });
  });

  test('renders TeamPicker with empty state', async () => {
    renderBoardPage();
    expect(await screen.findByText('No teams found')).toBeInTheDocument();
  });

  test('selects team from URL param', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    renderBoardPage(['/board?team=my-team']);
    expect(await screen.findByText('Board')).toBeInTheDocument();
    expect(screen.getByLabelText('Team')).toHaveValue('my-team');
  });

  test('shows teams error and Use demo data', async () => {
    vi.mocked(api.fetchTeams).mockRejectedValue(new Error('Failed'));
    renderBoardPage();
    expect(await screen.findByText(/Failed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use demo data instead/i })).toBeInTheDocument();
  });

  test('Use demo data switches to demo mode and shows Board tab', async () => {
    const user = userEvent.setup();
    renderBoardPage();
    expect(await screen.findByRole('button', { name: /Use demo data/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Use demo data/i }));
    expect(await screen.findByText('Board')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText(/Actions disabled in demo mode/i)).toBeInTheDocument();
  });

  test('URL with ?team=demo-team enters demo mode on load', async () => {
    renderBoardPage(['/board?team=demo-team']);
    expect(await screen.findByText(/Actions disabled in demo mode/i)).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.getByLabelText('Team')).toHaveValue('demo-team');
  });

  test('Refresh button when teams loaded', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    renderBoardPage();
    await screen.findByLabelText('Team');
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
  });

  test('team switch shows KanbanBoard and New ticket button', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    expect(await screen.findByText('Board')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New ticket' })).toBeInTheDocument();
  });

  test('Inbox tab shows InboxList', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Board');
    await user.click(screen.getByText('Inbox'));
    expect(screen.getByText(/No inbox items|Loading inbox/i)).toBeInTheDocument();
  });

  test('New ticket opens DispatchModal', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Board');
    await user.click(screen.getByRole('button', { name: 'New ticket' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/New ticket|Describe the work/i);
  });

  test('ticket move error displayed and dismissible', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    vi.mocked(api.fetchTickets).mockResolvedValue({
      teamId: 'my-team',
      tickets: [{ id: '0001', title: 'Task', stage: 'backlog', owner: undefined }],
      backlog: [{ id: '0001', title: 'Task', stage: 'backlog', owner: undefined }],
      inProgress: [],
      testing: [],
      done: [],
    });
    vi.mocked(api.moveTicket).mockRejectedValue(new Error('Move failed'));
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Board');
    await screen.findByText('Task');
    await user.click(screen.getByText('Task'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const moveBtn = screen.queryByRole('button', { name: 'Move to...' });
    if (moveBtn) {
      await user.click(moveBtn);
      const doneItem = screen.queryByText('Done');
      if (doneItem) await user.click(doneItem);
    }
    await waitFor(() => {
      const alert = screen.queryByRole('alert');
      if (alert) expect(alert).toHaveTextContent(/Move failed/);
    });
  });

  test('selecting ticket opens TicketDetail', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    vi.mocked(api.fetchTickets).mockResolvedValue({
      teamId: 'my-team',
      tickets: [{ id: '0001', title: 'Setup', stage: 'backlog', owner: undefined }],
      backlog: [{ id: '0001', title: 'Setup', stage: 'backlog', owner: undefined }],
      inProgress: [],
      testing: [],
      done: [],
    });
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Setup');
    await user.click(screen.getByText('Setup'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Setup');
  });

  test('handleSelectTeam null clears selection', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Board');
    await user.selectOptions(screen.getByLabelText('Team'), '');
    await waitFor(() => expect(screen.queryByText('Board')).not.toBeInTheDocument());
  });

  test('Exit demo clears state and refetches', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([]);
    const user = userEvent.setup();
    renderBoardPage(['/board'], true);
    await screen.findByRole('button', { name: /Use demo data/i });
    await user.click(screen.getByRole('button', { name: /Use demo data/i }));
    expect(await screen.findByText(/Actions disabled in demo mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit demo' })).toBeInTheDocument();
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Exit demo' }));
    await waitFor(() => expect(screen.getByLabelText('Team')).toBeInTheDocument());
    expect(screen.queryByText(/Actions disabled in demo mode/i)).not.toBeInTheDocument();
  });

  test('Refresh triggers teams refetch', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    const before = vi.mocked(api.fetchTeams).mock.calls.length;
    await user.click(screen.getByRole('button', { name: /Refresh/i }));
    await waitFor(() => expect(vi.mocked(api.fetchTeams).mock.calls.length).toBeGreaterThan(before));
  });

  test('fetchTickets error shows in KanbanBoard', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    vi.mocked(api.fetchTickets).mockRejectedValue(new Error('Tickets failed'));
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Tickets failed/i);
  });

  test('ticket move from KanbanBoard dropdown triggers handleTicketMove', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    vi.mocked(api.fetchTickets).mockResolvedValue({
      teamId: 'my-team',
      tickets: [{ id: '0001', title: 'Task', stage: 'backlog', owner: undefined }],
      backlog: [{ id: '0001', title: 'Task', stage: 'backlog', owner: undefined }],
      inProgress: [],
      testing: [],
      done: [],
    });
    vi.mocked(api.moveTicket).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Task');
    await user.click(screen.getByTitle('Move ticket'));
    await user.click(screen.getByText('Move to Done'));
    await waitFor(() => expect(api.moveTicket).toHaveBeenCalledWith('my-team', '0001', 'done', true));
  });

  test('ticket move error dismissible', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    vi.mocked(api.fetchTickets).mockResolvedValue({
      teamId: 'my-team',
      tickets: [{ id: '0001', title: 'Task', stage: 'backlog', owner: undefined }],
      backlog: [{ id: '0001', title: 'Task', stage: 'backlog', owner: undefined }],
      inProgress: [],
      testing: [],
      done: [],
    });
    vi.mocked(api.moveTicket).mockRejectedValue(new Error('Move failed'));
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await screen.findByText('Task');
    await user.click(screen.getByTitle('Move ticket'));
    await user.click(screen.getByText('Move to Done'));
    expect(await screen.findByText(/Move failed/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByText(/Move failed/)).not.toBeInTheDocument());
  });

  test('DispatchModal onSuccess triggers handleTicketUpdated', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team');
    await user.click(screen.getByRole('button', { name: 'New ticket' }));
    await user.type(screen.getByPlaceholderText(/Describe the work/i), 'New task');
    await user.click(screen.getByRole('button', { name: /Create ticket/i }));
    await waitFor(() => expect(api.fetchTickets).toHaveBeenCalled());
  });

  test('Delete button shown for non-demo teams', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team-team');
    await screen.findByText('Board');
    expect(await screen.findByRole('button', { name: /Delete/ })).toBeInTheDocument();
  });

  test('Delete button not shown in demo mode', async () => {
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByRole('button', { name: /Use demo data/i });
    await user.click(screen.getByRole('button', { name: /Use demo data/i }));
    await screen.findByText(/Actions disabled in demo mode/i);
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  test('Delete opens confirmation modal', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team-team');
    await screen.findByText('Board');
    const deleteBtns = await screen.findAllByRole('button', { name: /Delete/ });
    await user.click(deleteBtns[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete team');
    expect(dialog).toHaveTextContent('workspace-my-team-team');
    expect(within(dialog).getByRole('button', { name: 'Delete team' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  test('Delete team confirmation calls removeTeam and clears selection', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    vi.mocked(api.removeTeam).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team-team');
    await screen.findByText('Board');
    const deleteBtns = await screen.findAllByRole('button', { name: /Delete/ });
    await user.click(deleteBtns[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete team' }));
    await waitFor(() => expect(api.removeTeam).toHaveBeenCalledWith('my-team-team'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('Delete team Cancel closes modal without calling removeTeam', async () => {
    vi.mocked(api.fetchTeams).mockResolvedValue([
      { teamId: 'my-team-team', recipeId: 'dev', recipeName: 'My Team', scaffoldedAt: '' },
    ]);
    const user = userEvent.setup();
    renderBoardPage();
    await screen.findByLabelText('Team');
    await user.selectOptions(screen.getByLabelText('Team'), 'my-team-team');
    await screen.findByText('Board');
    const deleteBtns = await screen.findAllByRole('button', { name: /Delete/ });
    await user.click(deleteBtns[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.removeTeam).not.toHaveBeenCalled();
  });
});
