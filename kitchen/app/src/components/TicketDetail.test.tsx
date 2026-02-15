import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TicketDetail } from './TicketDetail';

vi.mock('../api', () => ({
  fetchTicketContent: vi.fn(),
  moveTicket: vi.fn(),
  assignTicket: vi.fn(),
  takeTicket: vi.fn(),
  handoffTicket: vi.fn(),
  completeTicket: vi.fn(),
}));

import * as api from '../api';

afterEach(() => cleanup());

const ticket = (overrides: Partial<{ id: string; title: string; stage: string; owner: string }> = {}) => ({
  id: '0001',
  title: 'Setup CI',
  stage: 'backlog' as const,
  owner: undefined as string | undefined,
  ...overrides,
});

describe('TicketDetail', () => {
  beforeEach(() => {
    vi.mocked(api.fetchTicketContent).mockResolvedValue('# Ticket\n\nBody');
    vi.mocked(api.moveTicket).mockResolvedValue(undefined);
    vi.mocked(api.assignTicket).mockResolvedValue(undefined);
    vi.mocked(api.takeTicket).mockResolvedValue(undefined);
    vi.mocked(api.handoffTicket).mockResolvedValue(undefined);
    vi.mocked(api.completeTicket).mockResolvedValue(undefined);
  });

  test('shows loading initially', () => {
    vi.mocked(api.fetchTicketContent).mockImplementation(() => new Promise(() => {}));
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  test('shows error with Retry when fetchTicketContent fails', async () => {
    vi.mocked(api.fetchTicketContent).mockRejectedValue(new Error('Not found'));
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('Retry triggers content refetch', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchTicketContent)
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce('Success');
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByText(/Fail/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Success')).toBeInTheDocument();
  });

  test('displays ticket content and title', async () => {
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Setup CI' })).toBeInTheDocument();
    expect(screen.getByText('0001')).toBeInTheDocument();
    expect(await screen.findByText(/Body/)).toBeInTheDocument();
  });

  test('displays owner badge when present', async () => {
    render(<TicketDetail ticket={ticket({ owner: 'dev' })} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByText('dev')).toBeInTheDocument();
  });

  test('hides action buttons in demo mode', async () => {
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} demoMode={true} />);
    expect(await screen.findByText('Body')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to...' })).not.toBeInTheDocument();
  });

  test('hides action buttons for demo-team', async () => {
    render(<TicketDetail ticket={ticket()} teamId="demo-team" onClose={() => {}} />);
    expect(await screen.findByText('Body')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take' })).not.toBeInTheDocument();
  });

  test('Take dropdown and takeTicket for backlog ticket', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUpdated = vi.fn();
    render(
      <TicketDetail
        ticket={ticket({ stage: 'backlog' })}
        teamId="my-team"
        onClose={onClose}
        onUpdated={onUpdated}
      />
    );
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take' }));
    await user.click(screen.getByText('Take as dev'));
    await waitFor(() => {
      expect(api.takeTicket).toHaveBeenCalledWith('my-team', '0001', 'dev');
      expect(onClose).toHaveBeenCalled();
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  test('Handoff to QA for in-progress ticket', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TicketDetail
        ticket={ticket({ stage: 'in-progress' })}
        teamId="my-team"
        onClose={onClose}
      />
    );
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Handoff to QA' }));
    await waitFor(() => {
      expect(api.handoffTicket).toHaveBeenCalledWith('my-team', '0001');
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('Complete for testing ticket', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TicketDetail
        ticket={ticket({ stage: 'testing' })}
        teamId="my-team"
        onClose={onClose}
      />
    );
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete' }));
    await waitFor(() => {
      expect(api.completeTicket).toHaveBeenCalledWith('my-team', '0001');
      expect(onClose).toHaveBeenCalled();
    });
  });

  test('Assign dropdown calls assignTicket', async () => {
    const user = userEvent.setup();
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    await user.click(screen.getByText('Assign to lead'));
    await waitFor(() => {
      expect(api.assignTicket).toHaveBeenCalledWith('my-team', '0001', 'lead');
    });
  });

  test('Move to dropdown calls moveTicket', async () => {
    const user = userEvent.setup();
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move to...' }));
    await user.click(screen.getByText('Done'));
    await waitFor(() => {
      expect(api.moveTicket).toHaveBeenCalledWith('my-team', '0001', 'done', true);
    });
  });

  test('Move to In Progress passes completed false', async () => {
    const user = userEvent.setup();
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={() => {}} />);
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move to...' }));
    await user.click(screen.getByText('In Progress'));
    await waitFor(() => {
      expect(api.moveTicket).toHaveBeenCalledWith('my-team', '0001', 'in-progress', false);
    });
  });

  test('shows action error when API throws', async () => {
    vi.mocked(api.completeTicket).mockRejectedValue(new Error('Ticket not ready'));
    const user = userEvent.setup();
    render(
      <TicketDetail
        ticket={ticket({ stage: 'testing' })}
        teamId="my-team"
        onClose={() => {}}
      />
    );
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Complete' }));
    expect(await screen.findByText(/Ticket not ready/)).toBeInTheDocument();
  });

  test('calls onClose when modal close clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TicketDetail ticket={ticket()} teamId="my-team" onClose={onClose} />);
    expect(await screen.findByText('Body')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
