import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DispatchModal } from './DispatchModal';

vi.mock('../api', () => ({
  dispatchTicket: vi.fn(),
}));

import { dispatchTicket } from '../api';

afterEach(() => cleanup());

describe('DispatchModal', () => {
  beforeEach(() => {
    vi.mocked(dispatchTicket).mockResolvedValue(undefined);
  });

  test('renders when show is true', () => {
    render(
      <DispatchModal
        teamId="my-team"
        show={true}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('New ticket')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe the work/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create ticket/ })).toBeInTheDocument();
  });

  test('does not render when show is false', () => {
    render(
      <DispatchModal
        teamId="my-team"
        show={false}
        onClose={() => {}}
      />
    );
    expect(screen.queryByText('New ticket')).not.toBeInTheDocument();
  });

  test('calls onClose when Cancel clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DispatchModal
        teamId="my-team"
        show={true}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls dispatchTicket and onSuccess when form submitted', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <DispatchModal
        teamId="my-team"
        show={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    await user.type(screen.getByPlaceholderText(/Describe the work/), 'Add feature X');
    await user.click(screen.getByRole('button', { name: /Create ticket/ }));
    expect(dispatchTicket).toHaveBeenCalledWith('my-team', 'Add feature X', 'dev');
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('shows error when dispatchTicket throws', async () => {
    vi.mocked(dispatchTicket).mockRejectedValue(new Error('Team not found'));
    const user = userEvent.setup();
    render(
      <DispatchModal
        teamId="my-team"
        show={true}
        onClose={() => {}}
      />
    );
    await user.type(screen.getByPlaceholderText(/Describe the work/), 'Add feature');
    await user.click(screen.getByRole('button', { name: /Create ticket/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Team not found');
  });
});
