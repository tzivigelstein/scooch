import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { LANGUAGES } from './src/core/language.js';
import { fillStaticCopy, type LanguageFiles } from './src/copy/static.ts';
import { sitePages } from './src/site/plugin.ts';

// The node_modules package a module belongs to («pdf-lib», «@scope/x»).
const packageOf = (id: string | null | undefined) => id?.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/)?.[1].replace('\\', '/');

/** The language whose texts the module is (src/copy/<language>.ts), or undefined. */
const catalogueOf = (id: string | null | undefined) => LANGUAGES.find((language) => id?.replace(/\\/g, '/').endsWith(`/src/copy/${language}.ts`));

type Output = { type: 'chunk' | 'asset'; fileName: string; facadeModuleId?: string | null; originalFileNames?: readonly string[] };

/**
 * Where a build put each language's texts (src/copy/<language>.ts, a chunk of
 * its own) and the fonts only that language uses, for index.html to preload
 * the one it shows.
 */
function languageFiles(bundle: Record<string, Output>): LanguageFiles {
  const outputs = Object.values(bundle);
  const chunks = Object.fromEntries(
    LANGUAGES.flatMap((language) => {
      const chunk = outputs.find((o) => o.type === 'chunk' && catalogueOf(o.facadeModuleId) === language);
      return chunk ? [[language, `/${chunk.fileName}`]] : [];
    })
  );
  const devanagari = outputs.filter((o) => o.type === 'asset' && o.originalFileNames?.some((name) => name.endsWith('noto-sans-devanagari-devanagari-wght-normal.woff2')));
  return { chunks, fonts: { hi: devanagari.map((o) => `/${o.fileName}`) } };
}

export default defineConfig({
  plugins: [
    react(),
    {
      // The few texts index.html carries itself (title, description, no-JavaScript
      // message, the loading screen in every language) come from src/copy, like
      // every other text; in a build, with the files of each language to preload.
      name: 'static-copy',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) => fillStaticCopy(html, ctx.bundle ? languageFiles(ctx.bundle as unknown as Record<string, Output>) : {}),
      },
    },
    // The content pages, legal pages, sitemap, robots.txt and llms.txt (docs/site.md).
    sitePages(),
  ],
  test: {
    // Some suites fuzz thousands of layouts; node:test had no per-test limit.
    testTimeout: 60_000,
    // One project per layer (see docs/testing.md), so a failure says what kind
    // of test broke. `yarn test` runs them all.
    projects: [
      // Pure functions of src/core and pure helpers: exact results, tables of cases.
      { extends: true, test: { name: 'unit', include: ['tests/core/**/*.test.{js,ts}', 'tests/site/**/*.test.{js,ts}', 'tests/scripts/**/*.test.{js,ts}'], environment: 'node', sequence: { groupOrder: 0 } } },
      // Properties checked over many generated cases (fuzz).
      { extends: true, test: { name: 'properties', include: ['tests/properties/**/*.test.{js,ts}'], environment: 'node', sequence: { groupOrder: 0 } } },
      // Actions on the real stores, history, selectors and services (PDF, projects,
      // storage). Node by default; a file that needs a DOM says `@vitest-environment jsdom`.
      { extends: true, test: { name: 'state', include: ['tests/state/**/*.test.{ts,tsx}', 'tests/services/**/*.test.{js,ts}'], environment: 'node', setupFiles: ['tests/support/setup.ts'], sequence: { groupOrder: 0 } } },
      // One component or hook, rendered with Testing Library.
      { extends: true, test: { name: 'ui', include: ['tests/components/**/*.test.tsx', 'tests/hooks/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['tests/support/setup.ts'], sequence: { groupOrder: 0 } } },
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
        // Each language's texts are «copy-<language>-[hash].js». The chunk the
        // entry shares with the lazy dialogs (React's shared part, storage) has
        // no entry module: «shared» says what it is, instead of the name of
        // whichever module the bundler picks.
        chunkFileNames: (chunk) =>
          `assets/${packageOf(chunk.facadeModuleId)?.replace('/', '-') ?? (catalogueOf(chunk.facadeModuleId) ? 'copy-[name]' : chunk.facadeModuleId || chunk.name === 'rolldown-runtime' ? '[name]' : 'shared')}-[hash].js`,
      },
    },
  },
});
