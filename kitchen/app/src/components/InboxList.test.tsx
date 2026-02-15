import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InboxList } from './InboxList';

vi.mock('../api', () => ({
  fetchInbox: vi.fn(),
  fetchInboxContent: vi.fn(),
}));

import * as api from '../api';

afterEach(() => cleanup());

describe('InboxList', () => {
  beforeEach(() => {
    vi.mocked(api.fetchInbox).mockResolvedValue([]);
    vi.mocked(api.fetchInboxContent).mockResolvedValue('');
  });

  test('shows loading initially', () => {
    vi.mocked(api.fetchInbox).mockImplementation(() => new Promise(() => {}));
    render(<InboxList teamId="my-team" />);
    expect(screen.getByText(/Loading inbox/i)).toBeInTheDocument();
  });

  test('shows error with Retry when fetchInbox fails', async () => {
    vi.mocked(api.fetchInbox).mockRejectedValue(new Error('Network error'));
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  test('Retry triggers refetch on error', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchInbox)
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValueOnce([{ id: 'item-1', title: 'Item 1' }]);
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByText(/Fail/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
  });

  test('shows empty state when no items', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([]);
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByText(/No inbox items yet/)).toBeInTheDocument();
  });

  test('renders list and opens modal on item click', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([
      { id: 'item-1', title: 'First item' },
      { id: 'item-2', title: 'Second item', received: '2024-01-15' },
    ]);
    vi.mocked(api.fetchInboxContent).mockResolvedValue('# Content\n\nHello world.');
    const user = userEvent.setup();
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByText('First item')).toBeInTheDocument();
    expect(screen.getByText('Second item')).toBeInTheDocument();
    expect(screen.getByText('2024-01-15')).toBeInTheDocument();

    await user.click(screen.getAllByText('First item')[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Hello world.')).toBeInTheDocument();
  });

  test('item without title uses id', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([{ id: 'raw-id' }]);
    render(<InboxList teamId="my-team" />);
    await waitFor(() => expect(screen.getByText('raw-id')).toBeInTheDocument());
  });

  test('shows content loading and fetches content when item selected', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([{ id: 'x', title: 'Item' }]);
    let resolveContent: (value: string) => void;
    vi.mocked(api.fetchInboxContent).mockImplementation(
      () => new Promise((r) => { resolveContent = r; })
    );
    const user = userEvent.setup();
    render(<InboxList teamId="my-team" />);
    await waitFor(() => expect(screen.getByText('Item')).toBeInTheDocument());
    await user.click(screen.getByText('Item'));
    await waitFor(() => expect(screen.getByText(/Loading/i)).toBeInTheDocument());
    resolveContent!('Done');
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
  });

  test('shows content error with Retry', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([{ id: 'x', title: 'Item' }]);
    vi.mocked(api.fetchInboxContent)
      .mockRejectedValueOnce(new Error('Content failed'))
      .mockResolvedValueOnce('Fixed');
    const user = userEvent.setup();
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByText('Item')).toBeInTheDocument();
    await user.click(screen.getByText('Item'));
    expect(await screen.findByText(/Content failed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Fixed')).toBeInTheDocument();
  });

  test('modal header shows received date when item has it', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([
      { id: 'x', title: 'Item with date', received: '2024-01-15' },
    ]);
    vi.mocked(api.fetchInboxContent).mockResolvedValue('content');
    const user = userEvent.setup();
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByText('Item with date')).toBeInTheDocument();
    await user.click(screen.getByText('Item with date'));
    const modal = await screen.findByRole('dialog');
    expect(modal).toHaveTextContent('2024-01-15');
  });

  test('closing modal clears selection', async () => {
    vi.mocked(api.fetchInbox).mockResolvedValue([{ id: 'x', title: 'Item' }]);
    vi.mocked(api.fetchInboxContent).mockResolvedValue('content');
    const user = userEvent.setup();
    render(<InboxList teamId="my-team" />);
    expect(await screen.findByText('Item')).toBeInTheDocument();
    await user.click(screen.getByText('Item'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
