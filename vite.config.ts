import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fillHtml } from './src/copy/index.ts';

// The node_modules package a module belongs to («pdf-lib», «@scope/x»).
const packageOf = (id: string | null | undefined) => id?.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1].replace('\\', '/');

export default defineConfig({
  plugins: [
    react(),
    {
      // Fills the data-i18n attributes of index.html with the texts in src/copy, in dev
      // and in the build, so the page arrives with its texts (no flash).
      name: 'pliego-copy',
      transformIndexHtml: (html: string) => fillHtml(html),
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
        chunkFileNames: (chunk) => `assets/${packageOf(chunk.facadeModuleId)?.replace('/', '-') ?? '[name]'}-[hash].js`,
      },
    },
  },
});
