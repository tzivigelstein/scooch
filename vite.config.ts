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
