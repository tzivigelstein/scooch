import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { ANY_PAGE, buildPath, compare, eagerAssets, formatTable, gzipSize, kB, parseAttributes, parseTags, scriptSources } from '../../scripts/check-size.mjs';

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

  test('the editor loads at start its entry script and the modules it preloads, and its stylesheet; not the font, the icon or data', () => {
    assert.deepEqual(eagerAssets(EDITOR), {
      js: ['/assets/index-AbC123.js', '/assets/rolldown-runtime-x1.js', '/assets/shared-y2.js'],
      css: ['/assets/index-Z9.css'],
    });
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

describe('comparing sizes with their budgets', () => {
  const files = (...bytes) => bytes.map((b, i) => ({ path: `f${i}`, bytes: b }));
  const budgets = {
    initialJs: { kB: 10 },
    css: { kB: 2.5 },
    pages: { [ANY_PAGE]: { kB: 5 }, 'es/big.html': { kB: 12 } },
  };

  test('a group sums its files and is over only past its budget; a page takes its own budget or the one for any page', () => {
    const { rows, problems } = compare(
      [
        { id: 'initialJs', label: 'initial', files: files(6000, 4000) },
        { id: 'css', label: 'css', files: files(2501) },
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
        { id: 'css', files: 1, bytes: 2501, budget: 2500, delta: 1, over: true },
        { id: 'page:es/a.html', files: 1, bytes: 4999, budget: 5000, delta: -1, over: false },
        { id: 'page:es/big.html', files: 1, bytes: 11000, budget: 12000, delta: -1000, over: false },
      ]
    );
  });

  test('a group without a budget and a budget for a page the build no longer has are problems', () => {
    const { rows, problems } = compare([{ id: 'totalJs', label: 'JS, every file', files: files(100) }], { pages: { 'es/gone.html': { kB: 1 } } });
    assert.equal(rows[0].budget, null);
    assert.equal(rows[0].over, false);
    assert.deepEqual(problems, ['JS, every file: no budget in scripts/size-budgets.json', 'pages › es/gone.html: the build has no such page; remove its budget']);
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
