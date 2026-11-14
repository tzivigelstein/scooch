// Small helpers to write HTML as strings (the site's pages are built as text,
// with no framework).

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text for an element or an attribute value. */
export const esc = (text: string | number) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** JSON for a <script type="application/ld+json"> or a data block: «<» escaped, so no text can close the script. */
export const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

export interface TableColumn {
  /** The header cell, as HTML. */
  head: string;
  /** Right-aligned numbers. */
  num?: boolean;
}

/**
 * The widths (rem) under which tables show one block per row: a table with
 * `columns` columns fits a narrower screen the fewer columns it has.
 */
export const STACK_WIDTHS = [24, 40, 48] as const;
export const stackWidth = (columns: number) => STACK_WIDTHS[Math.min(Math.max(columns - 4, 0), STACK_WIDTHS.length - 1)];

/** Text outside the tags may break after each «/» (long addresses in a narrow column). */
const breakAfterSlashes = (html: string) => html.replace(/(^|>)([^<]+)/g, (_, tag: string, text: string) => tag + text.replace(/\//g, '/<wbr>'));

/**
 * A table: a header row, then rows of HTML cells (with `rowHeads`, the first
 * cell of each row is its header). Its box scrolls sideways if it can't fit,
 * also with the keyboard (focusable). Under stackWidth, the CSS shows each
 * row as a block: its first cell, then each value after its column's name
 * (`data-label`). The roles keep it a table for screen readers then: some
 * browsers drop a table's semantics when its display changes.
 */
export function tableHtml(columns: readonly TableColumn[], rows: readonly (readonly string[])[], { caption = '', rowHeads = false } = {}) {
  const num = (i: number) => (columns[i]?.num ? ' class="num"' : '');
  const head = columns.map((c, i) => `<th scope="col" role="columnheader"${num(i)}>${c.head}</th>`).join('');
  const cell = (html: string, i: number) => {
    const content = breakAfterSlashes(html);
    if (i === 0) return rowHeads ? `<th scope="row" role="rowheader">${content}</th>` : `<td role="cell">${content}</td>`;
    return `<td role="cell" data-label="${esc(plainText(columns[i].head))}"${num(i)}><span>${content}</span></td>`;
  };
  const body = rows.map((row) => `<tr role="row">${row.map(cell).join('')}</tr>`).join('');
  const captioned = caption ? `<caption>${esc(caption)}</caption>` : '';
  return `<div class="table-wrap stack-${stackWidth(columns.length)}" tabindex="0"><table role="table">${captioned}<thead role="rowgroup"><tr role="row">${head}</tr></thead><tbody role="rowgroup">${body}</tbody></table></div>`;
}

/** The text of some HTML: tags removed and the few entities this site writes decoded. */
export const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]!)
    // Line breaks and indentation of the source; no-break spaces stay.
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
