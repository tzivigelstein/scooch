# Testing

Every check lives in the lowest layer that can make it. A browser test is slow
and says little when it fails; a test that calls an action says exactly which
rule broke, in milliseconds.

## The layers

| Layer | Where | What belongs there | Examples |
|---|---|---|---|
| **unit** | `tests/core/` (Vitest, Node) | Pure functions of `src/core` and pure helpers: exact results, tables of cases, format migrations, parsing and formatting of units. | `tests/core/units.test.js` (`parseLength` table), `tests/core/papers.test.js` (`matchPreset`), `tests/core/projectdoc.test.js` (every stored version) |
| **properties** | `tests/properties/` (Vitest, Node) | Rules checked over many generated cases (seeded, so a failure reproduces). | `tests/properties/pack-invariants-open-area.test.js` (800 packing cases in two files), `tests/properties/cutmarks.test.js` |
| **state** | `tests/state/`, `tests/services/` (Vitest; jsdom when a file says `@vitest-environment jsdom`) | Actions of `src/state/actions` on the real Zustand stores with fake assets (`tests/support/state.ts`): «doing X with these settings leaves these pieces exactly here, in one undo step, with this notice». Tables of settings. History, selectors, the PDF built with pdf-lib in Node, projects with a memory storage and fake timers. | `tests/state/align-and-distribute.test.ts`, `tests/state/group-operations-matrix.test.ts`, `tests/services/pdf-page-size.test.ts` |
| **ui** | `tests/components/`, `tests/hooks/` (Vitest, jsdom, Testing Library) | One control or hook alone: keyboard inside it, ARIA, rendered copy, shortcut dispatch, timers with `vi.useFakeTimers()`. | `tests/components/LengthField.test.tsx`, `tests/components/Tabs.test.tsx`, `tests/hooks/useGlobalShortcuts.test.tsx` |
| **performance** | `tests/performance/` (Vitest, Node) | Work budgets as deterministic counters (`countWork` in `src/core/pack.js` and `cutmarks.js`), plus one generous clock guard per area. Runs after the other projects, one file at a time. | `tests/performance/pack.test.js` |
| **e2e** | `e2e/specs/` (Playwright Test against the production build) | What only a real browser shows: real pointer, touch and keyboard across regions, focus order, on-screen geometry (zoom, scroll, floating controls), CSS visibility, IndexedDB and reloads, two tabs, printing and downloads, axe on rendered states, screen ↔ PDF raster parity, timing with many pieces, the build itself. ONE wiring case per feature (the button or key reaches the action); the rules themselves are tested below. | `e2e/specs/zoom-and-pan.spec.ts`, `e2e/specs/accessibility.spec.ts` (one catalogue of states, each scanned with axe in both themes), `e2e/specs/export-parity.spec.ts` (against a committed reference), `e2e/specs/performance.spec.ts` (its own project, alone, after the rest) |

Rule of thumb: if a check can be written by calling an action or rendering a
component, without measuring a `getBoundingClientRect`, it doesn't go in e2e.

## Running

```sh
yarn test        # every Vitest project: unit, properties, state, ui, performance
yarn e2e         # every Playwright project: chromium, then performance
yarn verify      # typecheck + yarn test + build + size + yarn e2e + ledger check
yarn typecheck   # src and tests, and e2e (e2e/tsconfig.json)
yarn size        # gzip sizes of dist/ against their budgets (after yarn build)
```

While working on something, run only what it touches:

```sh
node_modules/.bin/vitest run tests/state/sheets.test.ts
node_modules/.bin/vitest run --project state
node_modules/.bin/playwright test e2e/specs/paper.spec.ts -g 'landscape'
node_modules/.bin/playwright test e2e/specs/performance.spec.ts --project=performance --no-deps
node_modules/.bin/playwright show-report e2e/out/report    # traces and screenshots of failures
```

`yarn e2e` builds the app into `e2e/out/build` and serves it with
`vite preview` on port 4319 (`E2E_PORT`); everything a run writes goes under
`e2e/out` (`E2E_OUT`). Two runs at the same time need different `E2E_PORT` and
`E2E_OUT`. It never reuses a server that is already running.

**WebKit** (Safari, the iPhone) and **Firefox** are defined but opt-in
(`E2E_WEBKIT=1`, `E2E_FIREFOX=1`), because their system libraries need root
to install. With root, on Ubuntu:

```sh
node_modules/.bin/playwright install webkit
sudo node_modules/.bin/playwright install-deps webkit   # libgtk-4-1, libgstreamer-plugins-bad1.0-0, …
E2E_WEBKIT=1 yarn e2e --project=webkit
```

CI runs the WebKit and Firefox projects too (see below). A test that can't
work in an engine skips itself there, saying why: the ones that go through
the Chrome DevTools Protocol (touch, a mouse move without its button)
outside Chromium, and printing from a hidden frame in WebKit (Safari prints
the page instead, so the app opens the PDF in a tab) and in Firefox (no PDF
viewer).

### Running WebKit (or Firefox) locally with Docker

Without root, or without a Mac, Playwright's Docker image has every browser
and its libraries. Its version must be the project's Playwright version. From
the repository, after `yarn install --frozen-lockfile` (the image runs the
same `node_modules`):

```sh
PW=$(node -p 'require("@playwright/test/package.json").version')
docker run --rm --init --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/work -w /work -e E2E_WEBKIT=1 -e E2E_OUT=e2e/out/webkit \
  mcr.microsoft.com/playwright:v$PW-noble \
  node_modules/.bin/playwright test --project=webkit
```

- Add a spec's path, `-g '<title>'` or `--workers=N` after `--project=webkit`
  as with any run. For Firefox: `-e E2E_FIREFOX=1 -e E2E_OUT=e2e/out/firefox`
  and `--project=firefox`.
- The container has a network of its own, so its server's port (4319) never
  clashes with one on the machine; the build, results and report go to
  `E2E_OUT` (inside the ignored `e2e/out/`), owned by you (`--user`).
- `node_modules/.bin/playwright show-report e2e/out/webkit/report` on the
  machine opens the report, with the traces of the failures.
- Playwright's WebKit is close to Safari, but not Safari. It runs on Linux
  (WebKitGTK) and draws in software, so the project runs at 1× (at 2× the
  large windows timed out). Its contexts are ephemeral, like a private
  window: IndexedDB can't store a Blob there (which is why the app stores
  bytes; the specs that seed Blobs, as earlier layouts stored them, use a
  profile on disk: `seedingTest`). It has no `navigator.storage`; Ctrl+C,
  X and V fire no clipboard event (`clipboardKey` dispatches it); wheel
  deltas and pointer positions come in whole pixels; during a drag it draws
  a frame only when the pointer moves; a lazy chunk that failed to load
  stays failed, even from a new page; and it focuses a button on click,
  which Safari on a Mac doesn't. Whatever depends on those still needs a
  real Safari.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs what `yarn verify` runs on
every push to `main` and on every pull request, in jobs side by side, after
`yarn install --frozen-lockfile` with the Node version of `.nvmrc`:

| Job | Runs |
|---|---|
| Typecheck, unit tests and ledger | `yarn typecheck`, `yarn test`, `yarn ledger` |
| Build and size budgets | `yarn build`, `yarn size` |
| Browser tests (Chromium) | `yarn e2e` (chromium, then performance) with `E2E_TIME_FACTOR=2` |
| Browser tests (WebKit, `<group>`, allowed to fail) | `E2E_WEBKIT=1 E2E_GROUP=<group> yarn e2e --project=webkit`, one job a group |
| Browser tests (Firefox, `<group>`, allowed to fail) | `E2E_FIREFOX=1 E2E_GROUP=<group> yarn e2e --project=firefox`, one job a group |

- **CI builds as `yarn build` does locally.** `VERCEL_ENV` isn't set, so the
  missing `SITE_URL` and the legal placeholders only warn; only a Vercel
  production deployment stops on them ([site.md](site.md)).
- **Clock budgets.** A shared runner is slower and noisier than the machines
  the budgets of `e2e/specs/performance.spec.ts` were set on, so CI multiplies
  each one (and the 50 ms long-task threshold) by `E2E_TIME_FACTOR`
  (`e2e/support/timing.ts`; 1 when unset, so locally they apply as written).
  If CI fails a budget that passes locally, look at the test's «measures»
  attachment, which records the factor. Raise the factor in `ci.yml` only with
  those numbers in the commit message; never change a budget in the spec for
  CI's sake. The Vitest performance project's clock guards are generous
  enough not to need it.
- **WebKit and Firefox run one job for each group of specs.**
  `e2e/groups.ts` says what each spec is about: `accessibility`, `sheet`
  (working on the sheet) or `app` (projects, files, printing, panels,
  preferences and the site's pages). `E2E_GROUP=<group>` runs one group, in
  any browser; without it every spec runs. A job's name then says which part
  of the app broke, and no job comes near its time limit (the whole suite on
  WebKit takes over half an hour on a runner). A new spec has to be added to
  a group: no run starts while a spec is in none.
- **WebKit and Firefox are allowed to fail for now** (`continue-on-error`):
  their jobs can end red without failing the run, and stop after 30 minutes
  (`--global-timeout`) so they always write their report. Read the report
  (or reproduce it with Docker, above), fix what is a real bug, and remove a
  job's `continue-on-error` once it passes reliably.
- A newer push to the same pull request or branch cancels the run in progress.

**Reproducing a failure.** Each step of a job is a command you can run the
same way locally, after `yarn install --frozen-lockfile`. `CI` is set on the
runner: Playwright then refuses `test.only` and also writes a JUnit file, so
`CI=1 yarn e2e` is the closest local run. A failed browser job uploads an
artifact (`playwright-chromium`, `playwright-webkit-<group>` or
`playwright-firefox-<group>`, on the run's summary page) with the HTML report and the traces of the failed
tests:

```sh
node_modules/.bin/playwright show-report <unzipped artifact>/report
node_modules/.bin/playwright show-trace <unzipped artifact>/results/<test>/trace.zip
E2E_TIME_FACTOR=2 node_modules/.bin/playwright test e2e/specs/performance.spec.ts --project=performance --no-deps   # with CI's factor
```

## Size budgets

`yarn size` (after `yarn build`; part of `yarn verify` and CI) measures the
gzip size (level 9) of what the build serves and fails when one is over its
budget in `scripts/size-budgets.json`, with a table of every size, its budget
and the difference. It checks the editor's `index.html` itself (its inline CSS
and script and the skeleton), the JavaScript it loads at start (read from the
built HTML), each language's texts (a chunk of its own: only the one shown
loads at start), every JavaScript file, the CSS it loads at start (the
stylesheets the built HTML links, which block the first paint), every CSS file
(with what the lazy parts bring), each
static page (its HTML with the inline CSS) and the static pages' scripts (the
calculator). Each budget says what it covers and the size measured when it
was set; it is that size plus about 5 %, rounded up.

When a size grows on purpose, set the budget to the new size plus about 5 %
(and `measured` to the new size) in the same commit, and **say in the commit
message why it is worth it** (what grew, by how much). Lowering a budget after
making something smaller is welcome. A new static page falls under the budget
for any page (`pages["*"]`); a page much larger than the rest gets its own
entry.

## Adding a test

1. Find the rule: which function or action decides it? Test it there, with a
   table if there are several cases (`test.each` or a loop over cases).
2. If the rule is a component's (ARIA, keys inside it, copy), render that
   component with Testing Library.
3. Only if it needs the browser, write or extend a spec named after the feature
   (`e2e/specs/<feature>.spec.ts`), importing `test` and `expect` from
   `e2e/support/test.ts`. The `app` fixture opens the app ready to use at
   1440 × 900 in the light theme with reduced motion; its helpers add files,
   select, drag, read geometry in mm, the notice and the live regions, and
   download the PDF. A test that only takes `page` doesn't open the app.
4. Wait for states, never for time: web-first assertions (`toHaveText`,
   `toBeFocused`, `toHaveCount`), `expect.poll`, waiting for «Guardado» or for
   two animation frames. There is no `waitForTimeout` in the specs. Anything
   whose time depends on the wall clock (the projects list order, the
   last-moment journal) sets the page clock: this machine's clock can step
   back under load.
5. Any console error, page error or failed request fails the test; a test that
   expects one says so with `test.use({ allowErrors: [/…/] })`.
6. A known product bug gets a test that shows it, marked `test.fail` (e2e) or
   `test.fails` (Vitest) with a comment, so the suite stays green and the bug
   stays visible.

Titles say what the test checks, in English; files and folders are named after
what they test, never with ordering letters, codes or dates.

## No quick mode, no retries

`yarn test` and `yarn e2e` always run everything. There is no tag or flag to
skip the slow tests by default: a skipped test is a test nobody runs. Speed
comes from putting checks in the right layer, from running in parallel, and
from waiting for states instead of sleeping.

`retries` is 0. A test that fails once and passes on retry has a race in it
(or in the app): fix the test, or show the app's bug with a `test.fail` test.

## The ledger and the mutation rule

The browser suites used to be custom scripts (`e2e/suites/*.cjs`). When they
were replaced, every check they ran was recorded in `e2e/ledger.csv` with
where it went:

- `kept:e2e:<test>` — still a browser test;
- `moved:<layer>:<test>` — now a test of that layer;
- `duplicate-of:<test>` — a test that already asserted the same;
- `fixed:<test> :: <what now>` — it could not fail before; now it asserts something;
- `deleted:<reason>` — gone, and why.

`<test>` is `file › describe › title` as `playwright test --list` and
`vitest list` print it (Vitest reads titles statically, so a `test.each` row
points to its describe). `yarn ledger` (part of `yarn verify`) fails when a row
has no destination or names a test that doesn't exist. Careful:
`vitest list --json <file>` writes the JSON over `<file>`; use `--json=<path>`.

Before a group of browser checks was replaced by lower-layer tests, the product
code they guarded was broken on purpose with a one-line mutation, in a
throwaway copy of the repository, and the new tests had to fail. The 339
mutations used are in `e2e/mutations.md`, with the few that survived and why.
Do the same when you move a check down a layer: a test that doesn't fail when
the code is wrong doesn't test it.
