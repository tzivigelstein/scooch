// The site's tables (src/site/html.ts tableHtml): one with too many columns
// for a phone can show one block per row, and only the pages with one carry
// the CSS for it. How they fit on real screens is in
// e2e/specs/site-pages.spec.ts.
import { describe, expect, test } from 'vitest';
import { STACK_COLUMNS, tableHtml } from '../../src/site/html.ts';
import { readLegal, sitePages, siteFiles, pageFile } from '../../src/site/site.ts';
import { STACKED_CSS } from '../../src/site/styles.ts';

const columns = (n: number) => Array.from({ length: n }, (_, i) => ({ head: `C${i}`, num: i > 0 }));

describe('a table too wide for a phone', () => {
  test('from STACK_COLUMNS columns on it is marked to stack; with fewer it stays a plain table', () => {
    expect(STACK_COLUMNS).toBe(5);
    expect(tableHtml(columns(4), [['a', '1', '2', '3']])).not.toMatch(/table-stack|role=|data-label/);
    expect(tableHtml(columns(5), [['a', '1', '2', '3', '4']])).toMatch(/^<div class="table-wrap table-stack" tabindex="0"><table role="table">/);
  });

  test('each value carries its column’s name as text; the row’s name (its header) carries none', () => {
    const html = tableHtml(
      [{ head: 'Margen' }, { head: 'En <strong>A4</strong>', num: true }, { head: 'B', num: true }, { head: 'C', num: true }, { head: 'D', num: true }],
      [['0 mm', '3', '3', '3', '3']],
      { caption: 'Fotos 10 × 15 por hoja', rowHeads: true }
    );
    expect(html).toContain('<caption>Fotos 10 × 15 por hoja</caption>');
    expect(html).toContain('<tr role="row"><th scope="row" role="rowheader">0 mm</th><td role="cell" data-label="En A4" class="num"><span>3</span></td>');
  });

  test('only the pages with such a table carry the CSS that stacks it', () => {
    const legal = readLegal(process.cwd());
    const files = siteFiles({ url: 'https://example.com' }, legal, { calculator: '/assets/calculator-test.js' });
    const carrying = sitePages(legal)
      .filter((page) => files.get(pageFile(page))!.includes(STACKED_CSS.trim()))
      .map((page) => page.path);
    expect(carrying).toEqual(['/es/fotos-10x15-en-hoja-a4', '/es/licencias-de-terceros', '/en/print-4x6-photos-on-a4', '/en/third-party-licenses', '/fr/imprimer-photos-10x15-sur-a4', '/fr/licences-tierces']);
  });
});
