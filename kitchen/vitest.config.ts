import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: join(root, 'node_modules/react'),
      'react-dom': join(root, 'node_modules/react-dom'),
      'react/jsx-runtime': join(root, 'node_modules/react/jsx-runtime'),
      'react-bootstrap': join(root, 'node_modules/react-bootstrap'),
      'react-router-dom': join(root, 'node_modules/react-router-dom'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'app/src/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts'],
  },
  coverage: {
    provider: 'v8',
    include: ['server/**', 'app/src/**'],
    exclude: ['**/*.test.*', 'app/dist/**'],
  },
});
