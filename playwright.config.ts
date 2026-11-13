import { defineConfig, devices } from '@playwright/test';

// Browser tests (`yarn e2e`): the production build served by `vite preview`.
// See docs/testing.md for what belongs here and what belongs in Vitest.

const CI = !!process.env.CI;
// A port of its own (the dev server uses 5173), so a run never talks to another
// server: if the port is taken, the run stops instead of reusing it.
const PORT = Number(process.env.E2E_PORT ?? 4319);
// Everything a run writes (its build, results and report) goes under one
// folder, so `dist/` stays whatever `yarn build` left; two runs at once need
// different E2E_OUT and E2E_PORT.
const OUT = process.env.E2E_OUT ?? 'e2e/out';
const BUILD_DIR = `${OUT}/build`;
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
  outputDir: `${OUT}/results`,
  // Committed references (e2e/specs/<spec>-snapshots/) are the same for every
  // browser and platform.
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: CI,
  // A flaky test gets fixed, never retried.
  retries: 0,
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: `${OUT}/report` }], ['junit', { outputFile: `${OUT}/junit.xml` }]]
    : [['list'], ['html', { open: 'never', outputFolder: `${OUT}/report` }]],
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
    command: `${VITE} build --outDir ${BUILD_DIR} --emptyOutDir --logLevel warn && ${VITE} preview --outDir ${BUILD_DIR} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
