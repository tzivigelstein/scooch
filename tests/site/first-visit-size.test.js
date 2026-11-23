import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSize, measureBuild, preloadedFonts, servedSize } from '../../scripts/check-size.mjs';

// What `yarn size` (scripts/check-size.mjs) counts for a static page's first
// visit: its HTML, the fonts it preloads and its scripts, so the budget sees
// the font the page loads instead of leaving it out. The rest of the check is
// tested in tests/scripts/check-size.test.js.

const page = (body, head = '') => `<!doctype html><html><head>${head}<style>body{margin:0}</style></head><body>${body}</body></html>`;
const PRELOAD = '<link rel="preload" href="/assets/inter-latin-wght-normal-X1.woff2" as="font" type="font/woff2" crossorigin>';

describe('a static page’s first visit', () => {
  test('the fonts a page preloads are its preload links for a font; not a module, a stylesheet or the icon', () => {
    const html = page('', `${PRELOAD}<link rel="preload" as="style" href="/a.css"><link rel="modulepreload" href="/b.js"><link rel="icon" href="data:image/svg+xml,<svg/>"><link rel=preload href=/c.woff2 as=FONT crossorigin>`);
    assert.deepEqual(preloadedFonts(html), ['/assets/inter-latin-wght-normal-X1.woff2', '/c.woff2']);
  });

  test('a font counts as it is (woff2 is compressed already); anything else gzipped', () => {
    const bytes = Buffer.from('a'.repeat(5000));
    assert.equal(servedSize('assets/x.woff2', bytes), 5000);
    assert.equal(servedSize('es/x.html', bytes), gzipSize(bytes));
  });

  test('is its HTML, its fonts and its scripts; the budget is the largest page’s, which the row names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'first-visit-'));
    try {
      mkdirSync(join(dir, 'assets'));
      mkdirSync(join(dir, 'es'));
      writeFileSync(join(dir, 'index.html'), page('editor'));
      const font = Buffer.alloc(3000, 7);
      writeFileSync(join(dir, 'assets/inter-latin-wght-normal-X1.woff2'), font);
      writeFileSync(join(dir, 'assets/calculator-Q1.js'), 'export const x = 1;'.repeat(40));
      const guide = page('<p>guía</p>', PRELOAD);
      const calculator = page('<p>calculadora</p><script type="module" src="/assets/calculator-Q1.js"></script>', PRELOAD);
      writeFileSync(join(dir, 'es/guia.html'), guide);
      writeFileSync(join(dir, 'es/calculadora.html'), calculator);
      const visit = measureBuild(dir).find((m) => m.id === 'pageFirstVisit');
      assert.equal(visit.label, 'static pages: first visit, the largest (es/calculadora.html)');
      assert.deepEqual(
        visit.files.map((f) => f.path),
        ['es/calculadora.html', 'assets/inter-latin-wght-normal-X1.woff2', 'assets/calculator-Q1.js']
      );
      assert.equal(visit.files[1].bytes, font.length);
      assert.equal(visit.files[0].bytes, gzipSize(Buffer.from(calculator)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a build without static pages has no first visit to measure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'first-visit-'));
    try {
      writeFileSync(join(dir, 'index.html'), page('editor'));
      assert.equal(measureBuild(dir).some((m) => m.id === 'pageFirstVisit'), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
