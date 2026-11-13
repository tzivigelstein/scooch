import { defineConfig, devices } from '@playwright/test';

// Browser tests (`yarn e2e`): the production build served by `vite preview`.
// See docs/testing.md for what belongs here and what belongs in Vitest.

const CI = !!process.env.CI;
// A port of its own (the dev server uses 5173), so a run never talks to another
// server: if the port is taken, the run stops instead of reusing it.
const PORT = Number(process.env.E2E_PORT ?? 4319);
// The build goes to its own folder, so `dist/` stays whatever `yarn build` left.
const OUT_DIR = process.env.E2E_BUILD_DIR ?? 'e2e/out/build';
const VITE = 'node ./node_modules/vite/bin/vite.js';

// WebKit (Safari, the iPhone) needs system libraries that only install with root
// (`npx playwright install-deps webkit`); see docs/testing.md. Opt in with E2E_WEBKIT=1.
const WEBKIT = process.env.E2E_WEBKIT === '1';

/** What every page starts with: the desktop layout, light theme, no animations. */
const page = {
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light' as const,
  reducedMotion: 'reduce' as const,
  acceptDownloads: true,
};

// Specs that measure time run alone, after everything else, so other workers
// don't eat into their numbers.
const TIMING = /performance\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e/specs',
  outputDir: 'e2e/out/results',
  fullyParallel: true,
  forbidOnly: CI,
  // A flaky test gets fixed, never retried.
  retries: 0,
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/out/report' }], ['junit', { outputFile: 'e2e/out/junit.xml' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'e2e/out/report' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...page,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: TIMING,
      use: { ...devices['Desktop Chrome'], ...page },
    },
    {
      name: 'performance',
      testMatch: TIMING,
      dependencies: ['chromium'],
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'], ...page },
    },
    ...(WEBKIT
      ? [
          {
            name: 'webkit',
            testIgnore: TIMING,
            use: { ...devices['Desktop Safari'], ...page },
          },
        ]
      : []),
  ],
  webServer: {
    command: `${VITE} build --outDir ${OUT_DIR} --emptyOutDir --logLevel warn && ${VITE} preview --outDir ${OUT_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
