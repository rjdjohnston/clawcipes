import React from 'react';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';
import { DemoProvider } from './DemoContext';
import { Layout } from './components/Layout';
import BoardPage from './pages/BoardPage';
import RecipesPage from './pages/RecipesPage';

vi.mock('./pages/BoardPage', () => ({ default: () => <div>BoardPage</div> }));
vi.mock('./pages/RecipesPage', () => ({ default: () => <div>RecipesPage</div> }));

afterEach(() => cleanup());

describe('App routes', () => {
  test('renders BoardPage at /board', () => {
    render(
      <ThemeProvider>
        <DemoProvider>
          <MemoryRouter initialEntries={['/board']}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/board" replace />} />
                <Route path="board" element={<BoardPage />} />
                <Route path="recipes" element={<RecipesPage />} />
                <Route path="*" element={<Navigate to="/board" replace />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </DemoProvider>
      </ThemeProvider>
    );
    expect(screen.getByText('BoardPage')).toBeInTheDocument();
  });

  test('renders RecipesPage at /recipes', () => {
    render(
      <ThemeProvider>
        <DemoProvider>
          <MemoryRouter initialEntries={['/recipes']}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route path="board" element={<BoardPage />} />
                <Route path="recipes" element={<RecipesPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </DemoProvider>
      </ThemeProvider>
    );
    expect(screen.getByText('RecipesPage')).toBeInTheDocument();
  });
});
