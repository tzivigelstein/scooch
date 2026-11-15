import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ANY_PAGE, buildPath, compare, eagerScripts, eagerStyles, formatTable, gzipSize, kB, languageChunks, measureBuild, parseAttributes, parseTags, scriptSources } from '../../scripts/check-size.mjs';

// The pure parts of the bundle size check (`yarn size`): reading the built
// HTML, comparing sizes with budgets and the table it prints.

// What Vite writes to dist/index.html, cut down: an inline script, an icon
// whose quoted data URI holds `>`, a font preload, the entry, its preloads,
// the stylesheet and structured data.
const EDITOR = `<!doctype html>
<html><head>
  <!-- <script src="/assets/commented-out.js"></script> -->
  <script>
    document.head.insertAdjacentHTML('beforeend', '<link rel="modulepreload" href="/assets/from-inline.js">');
  </script>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0'/></svg>" />
  <link rel="preload" href="/assets/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
  <script type="module" crossorigin src="/assets/index-AbC123.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-x1.js">
  <link rel=modulepreload crossorigin href='/assets/shared-y2.js'>
  <link rel="stylesheet" crossorigin href="/assets/index-Z9.css">
  <script type="application/ld+json">{"@type":"WebApplication","url":"<script src=/x.js>"}</script>
</head><body></body></html>`;

describe('reading the built HTML', () => {
  test('attributes in double, single or no quotes, and without a value', () => {
    assert.deepEqual(Object.fromEntries(parseAttributes(` type="module" crossorigin src='/a.js' data-x=1 `)), { type: 'module', crossorigin: '', src: '/a.js', 'data-x': '1' });
  });

  test('tags in document order, skipping comments and what inline scripts say, with a `>` inside a quoted value', () => {
    const tags = parseTags(EDITOR).map(({ tag, attrs }) => `${tag} ${attrs.get('rel') ?? attrs.get('type') ?? ''} ${attrs.get('href') ?? attrs.get('src') ?? ''}`.trim());
    assert.deepEqual(tags, [
      'script',
      `link icon data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0'/></svg>`,
      'link preload /assets/inter-latin.woff2',
      'script module /assets/index-AbC123.js',
      'link modulepreload /assets/rolldown-runtime-x1.js',
      'link modulepreload /assets/shared-y2.js',
      'link stylesheet /assets/index-Z9.css',
      'script application/ld+json',
    ]);
  });

  test('the JavaScript the editor loads at start is its entry script and the modules it preloads; not the font, the stylesheet, the icon or data', () => {
    assert.deepEqual(eagerScripts(EDITOR), ['/assets/index-AbC123.js', '/assets/rolldown-runtime-x1.js', '/assets/shared-y2.js']);
  });

  test('the CSS the editor loads at start is the stylesheets it links, in order; not the font, the icon or a preload', () => {
    assert.deepEqual(eagerStyles(EDITOR), ['/assets/index-Z9.css']);
    const two = EDITOR.replace('<link rel="stylesheet"', `<link rel="stylesheet" href="/assets/shared-A1.css">\n  <link rel="preload" as="style" href="/assets/later-B2.css">\n  <link rel="stylesheet"`);
    assert.deepEqual(eagerStyles(two), ['/assets/shared-A1.css', '/assets/index-Z9.css']);
  });

  test('each language’s texts are read from the data of the head’s script, and none of them is loaded at once', () => {
    const editor = EDITOR.replace('<head>', `<head>\n  <script type="application/json" id="boot-copy">{"languages":["es","en"],"chunks":{"es":"/assets/copy-es-1.js","en":"/assets/copy-en-2.js"}}</script>`);
    assert.deepEqual(languageChunks(editor), { es: '/assets/copy-es-1.js', en: '/assets/copy-en-2.js' });
    assert.deepEqual(eagerScripts(editor), eagerScripts(EDITOR));
    assert.deepEqual(languageChunks(EDITOR), {});
  });

  test("a static page's scripts are those with a src", () => {
    const page = `<script type="application/json" id="calc-texts">{"a":1}</script><script type="module" src="/assets/calculator-Q1.js"></script>`;
    assert.deepEqual(scriptSources(page), ['/assets/calculator-Q1.js']);
  });

  test.each([
    ['/assets/index-AbC123.js', 'assets/index-AbC123.js'],
    ['assets/a.js', 'assets/a.js'],
    ['./assets/a.js?v=2#x', 'assets/a.js'],
    ['https://cdn.example.com/a.js', null],
    ['//cdn.example.com/a.js', null],
    ['data:text/javascript,1', null],
  ])('the URL %s is %s in the build folder', (url, path) => {
    assert.equal(buildPath(url), path);
  });
});

describe('measuring a build', () => {
  test('the CSS loaded at start is what the editor links; every CSS file counts in the total, a lazy part’s too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'check-size-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), EDITOR);
      for (const name of ['index-AbC123.js', 'rolldown-runtime-x1.js', 'shared-y2.js']) writeFileSync(join(dir, 'assets', name), 'export {};');
      writeFileSync(join(dir, 'assets/index-Z9.css'), '.a{color:red}'.repeat(50));
      writeFileSync(join(dir, 'assets/PrefsDialog-P1.css'), '.b{color:blue}'.repeat(20));
      const groups = Object.fromEntries(measureBuild(dir).map((g) => [g.id, g.files.map((f) => f.path)]));
      assert.deepEqual(groups.initialCss, ['assets/index-Z9.css']);
      assert.deepEqual(groups.totalCss, ['assets/PrefsDialog-P1.css', 'assets/index-Z9.css']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('comparing sizes with their budgets', () => {
  const files = (...bytes) => bytes.map((b, i) => ({ path: `f${i}`, bytes: b }));
  const budgets = {
    initialJs: { kB: 10 },
    totalCss: { kB: 2.5 },
    pages: { [ANY_PAGE]: { kB: 5 }, 'es/big.html': { kB: 12 } },
  };

  test('a group sums its files and is over only past its budget; a page takes its own budget or the one for any page', () => {
    const { rows, problems } = compare(
      [
        { id: 'initialJs', label: 'initial', files: files(6000, 4000) },
        { id: 'totalCss', label: 'css', files: files(2501) },
        { id: 'page:es/a.html', label: 'es/a.html', files: files(4999) },
        { id: 'page:es/big.html', label: 'es/big.html', files: files(11000) },
      ],
      budgets
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      rows.map(({ id, files, bytes, budget, delta, over }) => ({ id, files, bytes, budget, delta, over })),
      [
        { id: 'initialJs', files: 2, bytes: 10000, budget: 10000, delta: 0, over: false },
        { id: 'totalCss', files: 1, bytes: 2501, budget: 2500, delta: 1, over: true },
        { id: 'page:es/a.html', files: 1, bytes: 4999, budget: 5000, delta: -1, over: false },
        { id: 'page:es/big.html', files: 1, bytes: 11000, budget: 12000, delta: -1000, over: false },
      ]
    );
  });

  test('each language takes its own budget or the one for any language', () => {
    const { rows, problems } = compare(
      [
        { id: 'language:es', label: 'es', files: files(900) },
        { id: 'language:hi', label: 'hi', files: files(1500) },
      ],
      { languages: { [ANY_PAGE]: { kB: 1 }, hi: { kB: 1.4 } } }
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      rows.map(({ id, budget, over }) => ({ id, budget, over })),
      [
        { id: 'language:es', budget: 1000, over: false },
        { id: 'language:hi', budget: 1400, over: true },
      ]
    );
    assert.deepEqual(compare([], { languages: { xx: { kB: 1 } } }).problems, ['languages › xx: the build has no such language; remove its budget']);
  });

  test('a group without a budget (or without a positive kB) and a budget for a page the build no longer has are problems', () => {
    const { rows, problems } = compare(
      [
        { id: 'totalJs', label: 'JS, every file', files: files(100) },
        { id: 'totalCss', label: 'CSS, every file', files: files(100) },
      ],
      { totalCss: { KB: 3 }, pages: { 'es/gone.html': { kB: 1 } } }
    );
    assert.deepEqual(
      rows.map(({ budget, over }) => ({ budget, over })),
      [
        { budget: null, over: false },
        { budget: null, over: false },
      ]
    );
    assert.deepEqual(problems, [
      'JS, every file: no budget (a positive «kB») in scripts/size-budgets.json',
      'CSS, every file: no budget (a positive «kB») in scripts/size-budgets.json',
      'pages › es/gone.html: the build has no such page; remove its budget',
    ]);
  });
});

describe('the table', () => {
  test('one line per group with actual, budget and delta in kB and %, marking what is over or has no budget', () => {
    const table = formatTable([
      { label: 'editor: JS loaded at start', files: 9, bytes: 179_597, budget: 189_000, delta: -9_403, over: false },
      { label: 'CSS, every file', files: 1, bytes: 14_210, budget: 13_500, delta: 710, over: true },
      { label: 'es/new.html', files: 1, bytes: 5_000, budget: null, delta: null, over: false },
    ]);
    assert.equal(
      table,
      [
        'gzip -9, kB                 files  actual  budget          delta',
        '──────────────────────────  ─────  ──────  ──────  ─────────────  ─────────',
        'editor: JS loaded at start      9   179.6   189.0  -9.4 (-5.0 %)  ok',
        'CSS, every file                 1    14.2    13.5  +0.7 (+5.3 %)  OVER',
        'es/new.html                     1     5.0       —              —  NO BUDGET',
      ].join('\n')
    );
  });

  test('kB are thousands of bytes with one decimal', () => {
    assert.deepEqual([0, 49, 50, 1000, 179_597].map(kB), ['0.0', '0.0', '0.1', '1.0', '179.6']);
  });
});

test('gzipSize compresses at the highest level: no larger than level 1, and far below the size of repetitive code', () => {
  const bytes = Buffer.from(Array.from({ length: 400 }, (_, i) => `const a${i} = ${i * 7};\n`).join(''));
  const size = gzipSize(bytes);
  assert.ok(size <= gzipSync(bytes, { level: 1 }).length, `${size} bytes at level 9`);
  assert.ok(size < bytes.length / 3, `${size} of ${bytes.length} bytes`);
});
