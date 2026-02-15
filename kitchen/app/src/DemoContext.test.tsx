import React from 'react';
import { describe, expect, test, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoProvider, useDemo } from './DemoContext';

afterEach(() => cleanup());

const Consumer = () => {
  const { demoMode, setDemoMode } = useDemo();
  return (
    <div>
      <span data-testid="demo">{String(demoMode)}</span>
      <button onClick={() => setDemoMode(!demoMode)}>Toggle</button>
    </div>
  );
};

describe('DemoContext', () => {
  test('DemoProvider provides demoMode', () => {
    render(
      <DemoProvider>
        <Consumer />
      </DemoProvider>
    );
    expect(screen.getByTestId('demo')).toHaveTextContent('false');
  });

  test('setDemoMode updates demoMode', async () => {
    const user = userEvent.setup();
    render(
      <DemoProvider>
        <Consumer />
      </DemoProvider>
    );
    await user.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('demo')).toHaveTextContent('true');
  });

  test('useDemo throws when outside provider', () => {
    expect(() => render(<Consumer />)).toThrow(/DemoProvider/);
  });
});
