import React from 'react';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from './ThemeContext';

afterEach(() => cleanup());

const Consumer = () => {
  const { preference, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <button onClick={() => setPreference('dark')}>Set Dark</button>
    </div>
  );
};

describe('ThemeContext', () => {
  test('ThemeProvider provides default preference', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent(/light|dark|auto/);
  });

  test('setPreference updates preference', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    );
    await user.click(screen.getByText('Set Dark'));
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });

  test('useTheme throws when outside provider', () => {
    expect(() => render(<Consumer />)).toThrow(/ThemeProvider/);
  });
});
