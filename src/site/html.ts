// Small helpers to write HTML as strings (the site's pages are built as text,
// with no framework).

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text for an element or an attribute value. */
export const esc = (text: string | number) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** JSON for a <script type="application/ld+json"> or a data block: «<» escaped, so no text can close the script. */
export const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/** Chinese characters and the full-width punctuation that goes with them. */
const CJK = /[\p{Script=Han}　-〿＀-￯]/u;

/**
 * Texts joined as words, with a space between them, except where either side
 * is Chinese: Chinese puts no space between its words, nor before or after
 * Latin letters and numbers (docs/copy/zh-Hans.md).
 */
export const joinWords = (parts: readonly string[]) =>
  parts.reduce((text, part) => (text && part ? `${text}${CJK.test(text.slice(-1)) || CJK.test(part[0]) ? '' : ' '}${part}` : text + part), '');

export interface TableColumn {
  /** The header cell, as HTML. */
  head: string;
  /** Right-aligned numbers. */
  num?: boolean;
}

/**
 * Tables with this many columns or more don't fit a phone: narrower than a
 * tablet (STACKED_CSS), they show one block per row. Fewer fit from 360 px.
 */
export const STACK_COLUMNS = 5;

/** Text outside the tags may break after each «/» (long addresses in a narrow column). */
const breakAfterSlashes = (html: string) => html.replace(/(^|>)([^<]+)/g, (_, tag: string, text: string) => tag + text.replace(/\//g, '/<wbr>'));

/**
 * A table: a header row, then rows of HTML cells (with `rowHeads`, the first
 * cell of each row is its header). Its box scrolls sideways if it can't fit,
 * also with the keyboard (focusable). With STACK_COLUMNS or more, it can show
 * each row as a block: its first cell, then each value after its column's
 * name (`data-label`); the roles keep it a table for screen readers then, as
 * some browsers drop a table's semantics when its display changes.
 */
export function tableHtml(columns: readonly TableColumn[], rows: readonly (readonly string[])[], { caption = '', rowHeads = false } = {}) {
  const stack = columns.length >= STACK_COLUMNS;
  const role = (name: string) => (stack ? ` role="${name}"` : '');
  const num = (i: number) => (columns[i]?.num ? ' class="num"' : '');
  const head = columns.map((c, i) => `<th scope="col"${role('columnheader')}${num(i)}>${c.head}</th>`).join('');
  const cell = (html: string, i: number) => {
    const content = breakAfterSlashes(html);
    if (i === 0) return rowHeads ? `<th scope="row"${role('rowheader')}>${content}</th>` : `<td${role('cell')}>${content}</td>`;
    return stack ? `<td role="cell" data-label="${esc(plainText(columns[i].head))}"${num(i)}><span>${content}</span></td>` : `<td${num(i)}>${content}</td>`;
  };
  const body = rows.map((row) => `<tr${role('row')}>${row.map(cell).join('')}</tr>`).join('');
  const captioned = caption ? `<caption>${esc(caption)}</caption>` : '';
  return `<div class="table-wrap${stack ? ' table-stack' : ''}" tabindex="0"><table${role('table')}>${captioned}<thead${role('rowgroup')}><tr${role('row')}>${head}</tr></thead><tbody${role('rowgroup')}>${body}</tbody></table></div>`;
}

/** The text of some HTML: tags removed and the few entities this site writes decoded. */
export const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity]!)
    // Line breaks and indentation of the source; no-break spaces stay.
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
