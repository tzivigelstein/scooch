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
yarn verify      # typecheck + yarn test + build + yarn e2e + ledger check
yarn typecheck   # src and tests, and e2e (e2e/tsconfig.json)
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

**WebKit** (Safari, the iPhone) is defined but opt-in, because its system
libraries need root to install. On Ubuntu 22.04:

```sh
node_modules/.bin/playwright install webkit
sudo node_modules/.bin/playwright install-deps webkit   # libgtk-4-1, libgstreamer-plugins-bad1.0-0, …
E2E_WEBKIT=1 yarn e2e
```

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
throwaway copy of the repository, and the new tests had to fail. The 338
mutations used are in `e2e/mutations.md`, with the few that survived and why.
Do the same when you move a check down a layer: a test that doesn't fail when
the code is wrong doesn't test it.
