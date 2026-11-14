// The site's tables (src/site/html.ts tableHtml): on a screen too narrow
// for its columns, a table shows one block per row (the stylesheet draws it);
// how they fit on real screens is in e2e/specs/site-pages.spec.ts.
import { describe, expect, test } from 'vitest';
import { STACK_WIDTHS, stackWidth, tableHtml } from '../../src/site/html.ts';
import { SITE_CSS } from '../../src/site/styles.ts';

describe('a table on a narrow screen', () => {
  test('the more columns, the wider the screen under which it shows one block per row', () => {
    expect([2, 3, 4, 5, 6, 9].map(stackWidth)).toEqual([24, 24, 24, 40, 48, 48]);
    for (const rem of STACK_WIDTHS) expect(SITE_CSS).toContain(`@media (max-width: ${rem - 0.01}rem) {\n  .stack-${rem} table`);
  });

  test('each value carries its column’s name as text; the row’s name (its header) carries none', () => {
    const html = tableHtml(
      [{ head: 'Foto' }, { head: 'En <strong>A4</strong>', num: true }],
      [['10 × 15', '2']],
      { caption: 'Con márgenes de 5 mm', rowHeads: true }
    );
    expect(html).toContain('<caption>Con márgenes de 5 mm</caption>');
    expect(html).toContain('<tr role="row"><th scope="row" role="rowheader">10 × 15</th><td role="cell" data-label="En A4" class="num"><span>2</span></td></tr>');
  });
});
