# Contributing to Scooch

Thanks for your interest. Scooch is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE): anyone can use, study and
change it for noncommercial purposes. Read the
[contribution terms](#contribution-terms) before you send code.

For anything bigger than a small fix, open an issue first so we can agree on
the approach before you put time into it.

## Setup

You need Node.js 24 (`.nvmrc` pins the major: `nvm use`) and Yarn 1 (classic).

```sh
yarn install
yarn playwright install chromium   # once, for the browser suites
```

| Command | What it does |
| --- | --- |
| `yarn dev` | Development server with hot reload |
| `yarn test` | Every Vitest project: unit, properties, state, ui and performance |
| `yarn e2e` | Builds the app into `e2e/out/build`, serves it on port 4319 and runs the browser tests (Playwright) |
| `yarn verify` | `typecheck`, `test`, `build`, `size`, `e2e` and the ledger check, in that order |
| `yarn typecheck` | TypeScript (src, tests and e2e), no emit |
| `yarn build` | Production build in `dist/` |
| `yarn size` | Gzip sizes of `dist/` against their budgets (`scripts/size-budgets.json`) |
| `yarn preview` | Serves `dist/` to try the build |

[docs/testing.md](docs/testing.md) explains which layer a test belongs to,
how to run only the tests a change touches (`node_modules/.bin/vitest run
<file>`, `node_modules/.bin/playwright test <spec>`) and how to add one. Two
`yarn e2e` runs at the same time need different `E2E_PORT` and `E2E_OUT`.

Before opening a pull request, run `yarn verify`. CI runs the same checks on
every pull request and every push to `main`; [docs/testing.md](docs/testing.md#continuous-integration)
says what each job does and how to reproduce a failure locally.

## Project structure

```
src/
  config.ts       app name, limits and storage keys
  copy/           every interface text, one file per language (es.ts is the source), and t()
  core/           pure logic: plain JavaScript with .d.ts types, no DOM
  state/          Zustand stores; actions/ holds everything that changes the document
  components/     React components, by area
  hooks/          keyboard shortcuts, pointer gestures, focus rescue
  services/       files, PDF export, printing, projects and storage
  styles/         stylesheets by area
tests/            Vitest tests by layer (see docs/testing.md)
  fixtures/documents/   one stored project document per format version
e2e/              browser tests (Playwright): specs/, support/, fixtures/ and the ledger
scripts/          the bundle size check (yarn size) and its budgets
docs/copy.md      copy guide for the interface texts (in Spanish)
docs/testing.md   test layers, running them and adding one
```

The [README](README.md) explains how the parts fit together.

## Conventions

### Language and naming

- Code, identifiers, comments and commit messages are in English. Some older
  modules still have comments in Spanish; don't add new ones.
- Use the domain's own terms, the same ones every time. The interface is in
  Spanish and the code in English:

  | Interface (es) | Code |
  | --- | --- |
  | pieza | piece (an `item` in the stored document) |
  | hoja | sheet |
  | área útil | printable area |
  | separación | gap |
  | margen | margin |
  | acomodar | pack |
  | recorte | crop |
  | líneas de corte / margen de corte | cut lines (`cuts`) / cut margin |
  | contorno / silueta (modos de las líneas de corte) | `'outline'` / `'contour'` |
  | grilla / imán | grid / snap |
  | proyecto | project |

  [docs/copy.md](docs/copy.md) has the full glossary of the interface.
- Write a comment only when it adds information the code can't say: why
  something is done, a constraint, a unit, a browser quirk. Don't restate what
  the code does.

### Where things go

- **Pure logic** (layout, alignment, crop, cut marks, units, zoom levels, the
  project format) lives in `src/core/`: no DOM, no texts, plain JavaScript with
  a `.d.ts` next to it. Every change there comes with unit tests in
  `tests/core/`.
- **Document changes** go through the actions in `src/state/actions/`, which
  record one undo step per operation. Components subscribe only to the slices
  of state they show.
- **Lengths** are in millimetres in the document. Every conversion between
  screen pixels and millimetres goes through
  `src/components/canvas/viewport.ts`.
- **Interface texts** live only in `src/copy/`, one file per language with
  the keys of `es.ts`, and are used through `t('area.key', params)`. That
  includes `aria-label`s, tooltips and what is announced to screen readers.
  A new key goes into every language. Never write the app's name: use
  `{app}`. Follow [docs/copy.md](docs/copy.md) for tone, punctuation, numbers
  and terms.

### Stored formats are frozen

People use the app, and it is deployed from `main`, while it is being worked
on. Projects saved in someone's browser must keep opening.

- The shape of a project document version that has ever been written to
  storage never changes. Any format change, even a new optional field and even
  during development, needs all three of:
  1. a new `DOC_VERSION` in `src/core/projectdoc.js`;
  2. the migration from the previous version, in the same file;
  3. a fixture of the new version in `tests/fixtures/documents/`.

  `tests/core/documents.test.js` opens every fixture and fails when a shape
  changes without a new version.
- The same goes for what is kept in IndexedDB and localStorage: everything
  lives under `STORAGE_NAMESPACE` (`src/config.ts`), and renaming a key or
  changing what it holds needs a migration (see
  `src/services/storage/migrate.ts`).
- Reading is tolerant: an optional setting that is missing or can't be read
  takes its default and out-of-range numbers are clamped (`repair`). Only a
  document that can't be interpreted is shown as damaged.

### Accessibility

Every change keeps this bar:

- Everything can be done with the keyboard alone, in a sensible order.
- Focus is always visible and never lost: when the focused element goes
  away, focus moves somewhere useful.
- Accessible names start with the visible text (WCAG 2.5.3), and results of
  actions are announced through the live regions in
  `src/components/feedback/`.
- axe reports no violations, in light and dark mode. `e2e/specs/accessibility.spec.ts`
  scans one catalogue of states in both themes; add the new state to it when
  you add one.

### Commits

- [Conventional Commits](https://www.conventionalcommits.org/):
  `type(scope): subject`, or `type: subject` when no scope fits.
- Types in use: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `build`,
  `ci` and `chore`.
- Scopes in use: `a11y`, `canvas`, `copy`, `core`, `crop`, `cutmarks`,
  `deps`, `e2e`, `export`, `fonts`, `group`, `icons`, `layout`, `pack`,
  `papers`, `piece-list`, `piecebar`, `prefs`, `projects`, `props`,
  `selection`, `sheets`, `shortcuts`, `state`, `storage`, `styles`, `ui` and
  `units`. Reuse one of these when it fits.
- The subject is imperative, lowercase and without a final period, says what
  changes for the person using the app when it can, and stays at 72
  characters or fewer. For example:
  `fix(canvas): keep floating controls off the stage's scrollbars`.
- Use the body to explain why, when it isn't obvious.
- A commit that raises a size budget says why in its message: what grew, by
  how much and why it is worth it ([docs/testing.md](docs/testing.md#size-budgets)).
- One logical change per commit.
- No trailers: no `Co-authored-by`, `Signed-off-by` or similar lines.

### Pull requests

- Keep each pull request to one topic, and fill in the template.
- Include screenshots or a short recording for visible changes, in light and
  dark mode if colors are involved.
- Don't commit `dist/` or `e2e/out/`.

## Reporting bugs

Open an issue with the bug report form. Say which browser and operating system
you use, the steps to reproduce it, what you expected and what happened, and
whether the files were images or PDFs.

Don't attach private documents or photos (IDs, passports, personal pictures).
If the bug needs a file, try to reproduce it with a file you made up for the
purpose and attach that one.

To report a security problem, don't open a public issue: follow
[SECURITY.md](SECURITY.md).

## Code of conduct

Everyone taking part in the project follows the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Contribution terms

By sending a contribution (a pull request, a patch or code in an issue), you
agree that:

1. You wrote it, or you otherwise have the right to contribute it under these
   terms.
2. Your contribution is licensed to the project under the same license as the
   project, the [PolyForm Noncommercial License 1.0.0](LICENSE).
3. You also give the maintainer a permanent, worldwide, non-exclusive,
   royalty-free and irrevocable permission to use, change, distribute and
   relicense your contribution under any other terms, including terms that
   allow commercial use. This lets the maintainer keep deciding how the
   project is licensed.
4. You keep the copyright of your contribution.

If you don't agree with these terms, please don't send code. Describing the
idea in an issue is always welcome.
