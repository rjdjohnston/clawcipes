import React from 'react';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../ThemeContext';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => cleanup());

describe('ThemeToggle', () => {
  beforeEach(() => {
    try {
      if (typeof localStorage.clear === 'function') localStorage.clear();
      else Object.keys(localStorage).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  });

  test('renders theme toggle button', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    expect(screen.getByTitle('Theme')).toBeInTheDocument();
  });

  test('opens dropdown and shows theme options', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    await user.click(screen.getByTitle('Theme'));
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  test('selecting Dark option updates preference', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    await user.click(screen.getByTitle('Theme'));
    const darkOption = screen.getByText('Dark');
    expect(darkOption).toBeInTheDocument();
    await user.click(darkOption);
    await user.click(screen.getByTitle('Theme'));
    expect(screen.getByText('Dark').closest('[class*="active"]')).toBeInTheDocument();
  });
});
