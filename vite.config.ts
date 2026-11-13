import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fillStaticCopy } from './src/copy/index.ts';

// The node_modules package a module belongs to («pdf-lib», «@scope/x»).
const packageOf = (id: string | null | undefined) => id?.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1].replace('\\', '/');

export default defineConfig({
  plugins: [
    react(),
    {
      // The few texts index.html carries itself (title, description, no-JavaScript
      // message) come from src/copy, like every other text.
      name: 'static-copy',
      transformIndexHtml: (html: string) => fillStaticCopy(html),
    },
  ],
  test: {
    // Some suites fuzz thousands of layouts; node:test had no per-test limit.
    testTimeout: 60_000,
    // One project per layer (see docs/testing.md), so a failure says what kind
    // of test broke. `yarn test` runs them all.
    projects: [
      // Pure functions of src/core and pure helpers: exact results, tables of cases.
      { extends: true, test: { name: 'unit', include: ['tests/core/**/*.test.{js,ts}'], environment: 'node', sequence: { groupOrder: 0 } } },
      // Properties checked over many generated cases (fuzz).
      { extends: true, test: { name: 'properties', include: ['tests/properties/**/*.test.{js,ts}'], environment: 'node', sequence: { groupOrder: 0 } } },
      // Actions on the real stores, history, selectors and services (PDF, projects,
      // storage). Node by default; a file that needs a DOM says `@vitest-environment jsdom`.
      { extends: true, test: { name: 'state', include: ['tests/state/**/*.test.{ts,tsx}', 'tests/services/**/*.test.{js,ts}'], environment: 'node', sequence: { groupOrder: 0 } } },
      // One component or hook, rendered with Testing Library.
      { extends: true, test: { name: 'ui', include: ['tests/components/**/*.test.tsx', 'tests/hooks/**/*.test.tsx'], environment: 'jsdom', sequence: { groupOrder: 0 } } },
      // Work and time budgets: after the others, one file at a time, so their
      // clock guards don't share the machine with the rest of the run.
      { extends: true, test: { name: 'performance', include: ['tests/performance/**/*.test.{js,ts}'], environment: 'node', fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        // Lazy chunks of dependencies (pdf.js, pdf-lib) are named after their package;
        // otherwise pdf-lib would come out as «es-[hash].js» after its source folder.
        // The chunk the entry shares with the lazy dialogs (texts, React's shared
        // part, storage) has no entry module: «shared» says what it is, instead of
        // the name of whichever module the bundler picks.
        chunkFileNames: (chunk) =>
          `assets/${packageOf(chunk.facadeModuleId)?.replace('/', '-') ?? (chunk.facadeModuleId || chunk.name === 'rolldown-runtime' ? '[name]' : 'shared')}-[hash].js`,
      },
    },
  },
});
