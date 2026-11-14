# Scooch

A web app to arrange images and PDF pages on sheets of paper at real size and
download or print an exact PDF. Everything happens in the browser: files are
never uploaded anywhere.

The interface is in Spanish. React 19 and TypeScript, with Zustand for state
and [Vite](https://vite.dev) for development and the build. pdf.js (reading
PDFs) and pdf-lib (writing them) load only when first needed.

## Development

Requires Node.js 24 (`.nvmrc` pins the major: `nvm use`) and Yarn 1.

```sh
yarn install      # dependencies
yarn dev          # development server with hot reload
yarn build        # production build in dist/
yarn preview      # serves dist/ to try the build
yarn typecheck    # TypeScript (src, tests and e2e), no emit
yarn test         # every Vitest project: unit, properties, state, ui, performance
yarn e2e          # browser tests (Playwright), see below
yarn verify       # typecheck + test + build + e2e + the ledger check
```

### Tests

[docs/testing.md](docs/testing.md) explains the layers (what goes in Vitest
and what only a real browser can check), how to run part of them and how to
add a test. `yarn e2e` builds the app into `e2e/out/build`, serves it with
`vite preview` on 127.0.0.1:4319 (`E2E_PORT`) and runs every spec in
`e2e/specs/`; everything a run writes goes under `e2e/out/` (`E2E_OUT`),
which is ignored. While working on something, run only what it touches:

```sh
node_modules/.bin/vitest run tests/state/sheets.test.ts
node_modules/.bin/playwright test e2e/specs/paper.spec.ts -g 'landscape'
```

The browser tests include axe checks of every state in light and dark mode,
keyboard-only flows, the exported PDF's contents, the projects' storage and
performance budgets for dragging, scrolling and zooming with 150 pieces.
There is no quick mode and no retries.

## Projects and privacy

Each piece of work is a project saved only in this browser (IndexedDB): the
document, its original files and the already rasterized previews. Nothing is
uploaded. If the browser doesn't allow IndexedDB (some private windows), the
app works the same but doesn't save, and says so.

Everything the app stores lives under one namespace, `STORAGE_NAMESPACE` in
`src/config.ts` (`scooch`): the `scooch` database, the `scooch-projects`
channel and the `scooch:*` localStorage keys (preferences, the last open
project, the last-moment journal). The namespace is separate from the app's
name (`APP_NAME`) so a rename can't lose anyone's projects. Data saved before
the app was renamed (database `pliego`, unprefixed keys) moves over once, on
the first start (`src/services/storage/migrate.ts`): the copy is written
before the old data is removed, so an interruption loses nothing.

With the app open in several tabs, each project is saved by one tab only: the
one that opens it asks the others through a `BroadcastChannel`, and the one
that had it saves what is pending, stops saving and says so («Editar aquí»
takes it back, reloading it). Changes are never overwritten silently.

## Large screens

The interface keeps its size at every width: everything is in rem, and the
root font size (`html` in `src/styles/base.css`) is the browser's 100 %, so
it follows the browser's zoom and the chosen font size, never the screen.
Only the side panels get wider on wide screens, up to a cap (in
`src/styles/tokens.css`: `--left-w: clamp(14.25rem, 15vw, 20rem)` and
`--right-w: clamp(18rem, 19vw, 24rem)`). The sheets have their own zoom (see
below).

## Zoom

The sheets' zoom is a view measure: 100 % draws 1 mm as 96 / 25.4 CSS px and
never changes the printed size. It starts fitted to the sheet and follows the
window until the person zooms (Ctrl/⌘ + wheel or pinch, Ctrl/⌘ + / −, the
control in the canvas corner; Shift+1 and Shift+2 fit again), from 10 % to
800 %. It is view state: not in the document or the undo history. Every
conversion between screen pixels and millimetres goes through
`src/components/canvas/viewport.ts`; the pure part (levels, steps, the wheel)
is `src/core/zoom.js`.

## Deploying to Vercel

Import the repository in Vercel: it detects Vite and needs no configuration
(it installs with `yarn install`, builds with `vite build` and publishes
`dist/`). `vercel.json` only adds long cache headers for the hashed files in
`dist/assets/`.

## How it's built

- **State** lives in small Zustand stores in `src/state/`: the document
  (sheets, pieces, paper and selection), the undo history, the view, the
  preferences and the open project's status. Assets (binaries) and live
  gesture values stay outside React. Components subscribe to the slices they
  show; everything that changes the document goes through the actions in
  `src/state/actions/`, which record one undo step per operation.
- **Pure logic** (packing, alignment, groups, crop, cut marks, units, the
  project format) is in `src/core/`, plain JavaScript with `.d.ts` types and
  no DOM, tested in `tests/core/`.
- **Texts** all come from `src/copy/es.ts` through `t()`; `docs/copy.md` is
  the copy guide. `index.html` only carries the few texts needed before the
  app starts, filled in at build time.
- **Dialogs** keep their `<dialog>` shells in the page; the contents of the
  rarely used ones load on first use or when the app is idle.

## Contributing

- **Stored formats are frozen.** The shape of a project document version that
  has ever been written to storage never changes: any format change, even a
  new optional field and even during development, gets a new `DOC_VERSION`
  with its migration in `src/core/projectdoc.js` and a fixture in
  `tests/fixtures/documents/` (the app is used, and deployed from `main`,
  while it is being worked on). `tests/core/documents.test.js` opens every
  fixture and fails when a shape changes without a new version. The same goes
  for what is kept in IndexedDB and localStorage.
- Reading is tolerant: an optional setting that is missing or can't be read
  takes its default and out-of-range numbers are clamped (`repair`); only a
  document that can't be interpreted is shown as damaged.

## Structure

```
index.html              the single page (Vite's entry): critical styles and the loading screen
src/
  main.tsx, App.tsx     start and layout
  config.ts             app name, limits and storage keys
  copy/                 every interface text (es.ts) and t(key, params)
  core/                 pure modules (no DOM), with tests in tests/core/
  state/                Zustand stores, selectors and the undo history
    actions/            everything that changes the document, by area
  components/
    topbar/             app bar and the open project's name and status
    pieces-panel/       pieces list, grouped by sheet
    canvas/             sheets, pieces, selection frame, piece toolbar
    properties-panel/   piece, sheet, arrange and grid sections
    dialogs/            shortcuts, preferences, projects, the advice before printing, confirm
    feedback/           notice pill, tooltip and live regions
    ui/                 shared controls (buttons, fields, switches, dialog)
  hooks/                keyboard shortcuts, pointer gestures, focus rescue
  services/             files, PDF export, printing, projects and storage
  styles/               stylesheet by area (index.css sets the order)
tests/                  Vitest tests by layer (core, properties, state, services, components, hooks, performance)
e2e/                    browser tests (Playwright): specs/, their support/ helpers, fixtures and the ledger
docs/testing.md         test layers, how to run them and how to add a test
docs/copy.md            copy guide: rules, glossary and examples
vite.config.ts          React, the static texts of index.html and chunk names
```
