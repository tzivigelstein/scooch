#!/usr/bin/env node
// Bundle size budgets (`yarn size`, after `yarn build`): the gzip sizes of what
// the production build serves, against scripts/size-budgets.json. Prints a
// table of every size against its budget and fails when one is over.
// docs/testing.md says how to update a budget.
//
//   node scripts/check-size.mjs [build folder, dist by default]
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGETS = join(ROOT, 'scripts/size-budgets.json');

/** The key in `pages` (and `languages`) whose budget applies to every page (language) without an entry of its own. */
export const ANY_PAGE = '*';

/** Groups measured one by one, by the prefix of their id, and the budgets they take. */
const KEYED = Object.freeze({ 'page:': 'pages', 'language:': 'languages' });

/** Bytes after gzip at its highest level, as a server that compresses ahead of time sends them. */
export const gzipSize = (bytes) => gzipSync(bytes, { level: 9 }).length;

// An attribute: a name, optionally `=` and a value in double, single or no quotes.
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
// The inside of a tag, where a quoted value may hold a `>` (an inline SVG icon does).
const INSIDE = String.raw`((?:[^>"']|"[^"]*"|'[^']*')*)`;

/** A tag's attributes by lowercase name (an attribute without a value maps to ''). */
export function parseAttributes(text) {
  const attrs = new Map();
  for (const m of text.matchAll(ATTRIBUTE)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

/** The <script> and <link> tags of a page in document order, leaving out comments and what inline scripts say. */
export function parseTags(html) {
  const bare = html.replace(/<!--[\s\S]*?-->/g, '').replace(new RegExp(String.raw`<script\b${INSIDE}>[\s\S]*?</script\s*>`, 'gi'), '<script$1>');
  return [...bare.matchAll(new RegExp(String.raw`<(script|link)\b${INSIDE}>`, 'gi'))].map((m) => ({ tag: m[1].toLowerCase(), attrs: parseAttributes(m[2]) }));
}

const rels = (attrs) => (attrs.get('rel') ?? '').toLowerCase().split(/\s+/);

/** The scripts a page loads from a file (`src`), in order. */
export const scriptSources = (html) => parseTags(html).flatMap(({ tag, attrs }) => (tag === 'script' && attrs.get('src') ? [attrs.get('src')] : []));

/** The JavaScript the editor's index.html loads at once: its scripts and the modules it preloads, in order. */
export const eagerScripts = (html) =>
  parseTags(html).flatMap(({ tag, attrs }) => {
    if (tag === 'script' && attrs.get('src')) return [attrs.get('src')];
    if (tag === 'link' && attrs.get('href') && rels(attrs).includes('modulepreload')) return [attrs.get('href')];
    return [];
  });

/**
 * The file of each language's texts, from the data the editor's index.html
 * carries for its head script (`#boot-copy`, see src/copy/static.ts): only
 * the language shown loads, so none of them is among the eager scripts.
 */
export function languageChunks(html) {
  const json = /<script\b[^>]*\bid=["']?boot-copy["']?[^>]*>([\s\S]*?)<\/script\s*>/i.exec(html)?.[1];
  return json ? (JSON.parse(json).chunks ?? {}) : {};
}

/** A URL of the site as a path inside the build folder, or null when it points elsewhere. */
export function buildPath(url) {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(url)) return null;
  return url.replace(/[?#].*$/, '').replace(/^\.?\//, '');
}

/**
 * Each measured group against its budget. `measures`: { id, label, files: [{ path, bytes }] },
 * where a page's id is `page:<path>` and a language's `language:<tag>`. Returns
 * the table's rows and the problems that aren't a size (a group without a
 * budget, a page or language budget for none in the build).
 */
export function compare(measures, budgets) {
  const problems = [];
  const keyed = (id) => Object.entries(KEYED).find(([prefix]) => id.startsWith(prefix));
  const rows = measures.map(({ id, label, files }) => {
    const [prefix, group] = keyed(id) ?? [];
    const own = budgets[group] ?? {};
    const entry = prefix ? (own[id.slice(prefix.length)] ?? own[ANY_PAGE]) : budgets[id];
    const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    if (!(entry?.kB > 0)) {
      problems.push(`${label}: no budget (a positive «kB») in scripts/size-budgets.json`);
      return { id, label, files: files.length, bytes, budget: null, delta: null, over: false };
    }
    const budget = Math.round(entry.kB * 1000);
    return { id, label, files: files.length, bytes, budget, delta: bytes - budget, over: bytes > budget };
  });
  for (const [prefix, group] of Object.entries(KEYED)) {
    const measured = new Set(measures.filter((m) => m.id.startsWith(prefix)).map((m) => m.id.slice(prefix.length)));
    for (const name of Object.keys(budgets[group] ?? {})) {
      if (name !== ANY_PAGE && !measured.has(name)) problems.push(`${group} › ${name}: the build has no such ${prefix.slice(0, -1)}; remove its budget`);
    }
  }
  return { rows, problems };
}

/** Bytes as kB (1000 bytes) with one decimal. */
export const kB = (bytes) => (bytes / 1000).toFixed(1);

const signed = (n, text) => (n > 0 ? `+${text}` : text);

/** The rows as a plain-text table: what, files, actual, budget, delta (actual − budget, kB and %). */
export function formatTable(rows) {
  const head = ['gzip -9, kB', 'files', 'actual', 'budget', 'delta', ''];
  const body = rows.map((r) => [
    r.label,
    String(r.files),
    kB(r.bytes),
    r.budget === null ? '—' : kB(r.budget),
    r.budget === null ? '—' : `${signed(r.delta, kB(r.delta))} (${signed(r.delta, ((r.delta / r.budget) * 100).toFixed(1))} %)`,
    r.budget === null ? 'NO BUDGET' : r.over ? 'OVER' : 'ok',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((cells) => cells[i].length)));
  // The first column reads left to right; the numbers line up on the right.
  const line = (cells) => cells.map((c, i) => (i === 0 || i === cells.length - 1 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd();
  return [line(head), widths.map((w) => '─'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

// ---------- Reading the build ----------

const filesUnder = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort();

/** The groups the budgets cover, measured in the build folder `dir`. */
export function measureBuild(dir) {
  const sizes = new Map();
  const file = (path) => {
    if (!sizes.has(path)) {
      const full = join(dir, path);
      if (!existsSync(full)) throw new Error(`${path} is referenced by the build but isn't in ${dir}`);
      sizes.set(path, { path, bytes: gzipSize(readFileSync(full)) });
    }
    return sizes.get(path);
  };
  const local = (urls) => [...new Set(urls.map(buildPath).filter((p) => p !== null))].map(file);
  const all = filesUnder(dir);
  const pages = all.filter((p) => p.endsWith('.html') && p !== 'index.html');
  const editor = readFileSync(join(dir, 'index.html'), 'utf8');
  return [
    { id: 'initialJs', label: 'editor: JS loaded at start', files: local(eagerScripts(editor)) },
    ...Object.entries(languageChunks(editor)).map(([language, url]) => ({ id: `language:${language}`, label: `editor: texts, ${language} (one loads at start)`, files: local([url]) })),
    { id: 'totalJs', label: 'JS, every file', files: all.filter((p) => /\.m?js$/.test(p)).map(file) },
    { id: 'css', label: 'CSS, every file', files: all.filter((p) => p.endsWith('.css')).map(file) },
    { id: 'pageScripts', label: 'static pages: their scripts', files: local(pages.flatMap((p) => scriptSources(readFileSync(join(dir, p), 'utf8')))) },
    ...pages.map((p) => ({ id: `page:${p}`, label: p, files: [file(p)] })),
  ];
}

function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist');
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(`No build in ${process.argv[2] ?? 'dist'}: run \`yarn build\` first.`);
    process.exit(1);
  }
  const { rows, problems } = compare(measureBuild(dir), JSON.parse(readFileSync(BUDGETS, 'utf8')));
  console.log(formatTable(rows));
  const over = rows.filter((r) => r.over);
  for (const p of problems) console.error(`\n${p}`);
  if (over.length) {
    console.error(`\n${over.length === 1 ? '1 size is' : `${over.length} sizes are`} over budget: ${over.map((r) => r.label).join(', ')}.`);
    console.error('Make it smaller, or raise its budget in scripts/size-budgets.json and say why in the commit message (docs/testing.md).');
  }
  if (over.length || problems.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
