// A small Markdown renderer for the documents the site publishes as they are
// written (docs/legal, LICENSE, THIRD_PARTY_NOTICES.md): headings with
// GitHub's ids, paragraphs, lists, block quotes, tables and fenced code;
// inline code, links, autolinks, bold and «_italics_». Anything else is text:
// HTML in the source shows as text, except comments, which are dropped.

import { esc, plainText, tableHtml } from './html.ts';

/** Where a link goes, and the language of the page there when it isn't this page's. */
export type MarkdownLink = string | { href: string; hreflang?: string };

export interface MarkdownOptions {
  /** Where a link goes (a relative link to another document becomes its page). */
  link?: (href: string) => MarkdownLink;
  /** Levels added to every heading (1: «#» becomes <h2>). */
  shift?: number;
}

export const stripComments = (md: string) => md.replace(/<!--[\s\S]*?-->/g, '');

/** Placeholders like «<TITULAR>» or «<COPYRIGHT HOLDER>» (comments aside), once each, in order. */
export const findPlaceholders = (md: string) => [...new Set(stripComments(md).match(/<[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ /]*[A-ZÁÉÍÓÚÑ]>/g) ?? [])];

/** GitHub's id for a heading's text: lowercase, letters and digits, spaces as hyphens. */
export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

const emphasis = (html: string) =>
  html
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(«])_([^_]+)_(?=$|[\s).,;:!?»])/g, '$1<em>$2</em>');

function anchor(target: MarkdownLink, html: string) {
  const { href, hreflang } = typeof target === 'string' ? { href: target, hreflang: undefined } : target;
  return `<a href="${esc(href)}"${hreflang ? ` hreflang="${esc(hreflang)}"` : ''}>${html}</a>`;
}

function inline(text: string, link: (href: string) => MarkdownLink) {
  // Code spans, links and autolinks wait aside as numbered marks, so escaping
  // and emphasis don't touch their contents.
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${esc(code)}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => hold(anchor(link(href), emphasis(esc(label)))));
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, href: string) => hold(anchor(link(href), esc(href))));
  s = emphasis(esc(s));
  // A link's label may hold code: put marks back until none is left.
  while (s.includes('\u0000')) s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]);
  return s;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const BULLET = /^([-*]|\d+\.)\s+(.*)$/;

export function renderMarkdown(md: string, { link = (href) => href, shift = 0 }: MarkdownOptions = {}): string {
  const lines = stripComments(md).replace(/\r\n?/g, '\n').split('\n');
  const used = new Map<string, number>();
  const out: string[] = [];
  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '), link)}</p>`);
    paragraph.length = 0;
  };
  // Repeated headings get «-1», «-2»… like on GitHub.
  const uniqueId = (id: string) => {
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    return n ? `${id}-${n}` : id;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      // Focusable: long lines scroll sideways, also with the keyboard.
      out.push(`<pre tabindex="0"><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(6, heading[1].length + shift);
      const html = inline(heading[2], link);
      out.push(`<h${level} id="${esc(uniqueId(headingId(plainText(html))))}">${html}</h${level}>`);
      i++;
      continue;
    }
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      const body: string[] = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) body.push(lines[i].replace(/^> ?/, ''));
      out.push(`<blockquote>${renderMarkdown(body.join('\n'), { link, shift })}</blockquote>`);
      continue;
    }
    if (line.startsWith('|') && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(cells(lines[i]));
      out.push(
        tableHtml(
          head.map((cell) => ({ head: inline(cell, link) })),
          rows.map((row) => row.map((cell) => inline(cell, link)))
        )
      );
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      const ordered = /^\d/.test(bullet[1]);
      const items: string[][] = [];
      while (i < lines.length) {
        const item = BULLET.exec(lines[i]);
        if (item && /^\d/.test(item[1]) === ordered) items.push([item[2]]);
        else if (items.length && /^\s{2,}\S/.test(lines[i])) items[items.length - 1].push(lines[i].trim());
        else break;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item.join(' '), link)}</li>`).join('')}</${tag}>`);
      continue;
    }
    paragraph.push(line.trim());
    i++;
  }
  flush();
  return out.join('\n');
}
