// @vitest-environment jsdom
// Inter on the site's pages (src/site/fonts.ts): each page declares and
// preloads exactly the subsets of the editor's Inter stylesheet that its
// text needs, from the files the editor uses; the fallback faces that keep
// the text from moving are there, with overrides worked out from Inter's own
// metrics; each language keeps its own fonts behind Inter. The built pages
// and the editor's built stylesheet are compared in
// e2e/specs/site-pages.spec.ts, which also checks what a browser draws.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { builtFontUrls, devFonts, faceFile, facesFor, FALLBACK_FACES, INTER_STACK, readInterFonts, type BuiltAsset } from '../../src/site/fonts.ts';
import { renderPage, type Chrome } from '../../src/site/layout.ts';
import { pageFile, readLegal, sitePages, siteFiles } from '../../src/site/site.ts';
import { SITE_CSS, STACKED_CSS } from '../../src/site/styles.ts';
import type { SitePage } from '../../src/site/types.ts';

const ROOT = process.cwd();
const inter = readInterFonts(ROOT);
const fonts = devFonts(ROOT);
const legal = readLegal(ROOT);
const pages = sitePages(legal);
const scripts = { calculator: '/assets/calculator-test.js' };
const files = siteFiles({ url: 'https://example.com' }, legal, { scripts, fonts });
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const LATIN = './files/inter-latin-wght-normal.woff2';

/** fontsource's own table of each subset's characters (unicode.json), read apart from the stylesheet the pages copy. */
const SUBSETS: Record<string, string> = JSON.parse(readFileSync(join(inter.css, '../unicode.json'), 'utf8'));
const inSubset = (subset: string, cp: number) =>
  SUBSETS[subset].split(',').some((range) => {
    const [first, last = first] = range.replace('U+', '').split('-');
    return cp >= parseInt(first, 16) && cp <= parseInt(last, 16);
  });

/** What a parsed page draws in its font: its text, the column names drawn from data-label, the calculator's texts, what its CSS adds. */
function drawn(d: Document) {
  const json = [...d.querySelectorAll('body script[type="application/json"]')].flatMap((s) => JSON.stringify(JSON.parse(s.textContent!)));
  const labels = [...d.querySelectorAll('[data-label]')].map((el) => el.getAttribute('data-label')!);
  const added = [...d.querySelector('style')!.textContent!.matchAll(/content: "([^"]*)"/g)].map((m) => m[1]);
  return [d.body.textContent!, ...json, ...labels, ...added].join(' ');
}

const subsetsOf = (text: string) => {
  const used = new Set(Array.from(text, (c) => c.codePointAt(0)!));
  return Object.keys(SUBSETS).filter((subset) => [...used].some((cp) => inSubset(subset, cp)));
};
const subsetOfUrl = (url: string) => /inter-(.+)-wght-normal/.exec(url)![1];

describe('the subsets a page loads', () => {
  test('the faces are those of the stylesheet the editor imports, each with its file in the package', () => {
    expect(readFileSync(join(ROOT, 'src/styles/index.css'), 'utf8')).toContain('@import "@fontsource-variable/inter";');
    expect(inter.css.replace(/\\/g, '/')).toMatch(/node_modules\/@fontsource-variable\/inter\/index\.css$/);
    expect(inter.faces.map((f) => f.subset).sort()).toEqual(Object.keys(SUBSETS).sort());
    for (const face of inter.faces) {
      expect(face.rule, face.subset).toMatch(/^@font-face \{ font-family: 'Inter Variable'; font-style: normal; font-display: swap; font-weight: 100 900; src: url\(\.\/files\/inter-[\w-]+-wght-normal\.woff2\) format\('woff2-variations'\); unicode-range: [U+\dA-F,-]+; \}$/);
      expect(readFileSync(faceFile(inter, face)).subarray(0, 4).toString(), face.subset).toBe('wOF2');
    }
  });

  test('the Latin file is the one the editor preloads and its stylesheet uses (what `yarn dev` serves; the build gives both one hashed address)', () => {
    const editor = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const preload = /<link rel="preload" href="([^"]+)" as="font"/.exec(editor)![1];
    expect(fonts.urls[LATIN]).toBe(preload);
    expect(fonts.urls[LATIN]).toBe(`/${relative(ROOT, faceFile(inter, inter.faces.find((f) => f.src === LATIN)!)).replace(/\\/g, '/')}`);
  });

  test.each(pages.map((p) => [p.path, p]))('%s: preloads and declares exactly the subsets its text needs, and nothing else', (_, page) => {
    const d = parse(files.get(pageFile(page))!);
    const needed = subsetsOf(drawn(d));
    const preloaded = [...d.querySelectorAll('link[rel="preload"][as="font"]')].map((link) => {
      expect(link.getAttribute('type')).toBe('font/woff2');
      expect(link.hasAttribute('crossorigin')).toBe(true);
      return link.getAttribute('href')!;
    });
    const declared = [...d.querySelector('style')!.textContent!.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    expect(preloaded.map(subsetOfUrl)).toEqual(needed);
    expect(declared).toEqual(preloaded);
    // Every page's text is Latin today, whatever the language: French's «œ» and capitals with accents are in it too.
    expect(needed).toEqual(['latin']);
  });

  test('a character of another subset brings that subset, wherever the page draws it: its text, a table’s column names, the calculator’s texts', () => {
    const chrome = { skip: 'Saltar', open: 'Abrir', crumbs: 'Ruta', guides: 'Guías', legal: 'Legal', languages: 'Idioma', about: 'Acerca', faq: 'Preguntas', imageAlt: '', legalLinks: [] } satisfies Chrome;
    const base: SitePage = { id: 'x', lang: 'es', path: '/es/x', title: 'X', description: 'X', h1: 'Hoja', crumb: 'X', kind: 'guide', indexable: true, body: '<p>Hola</p>' };
    const loaded = (page: SitePage) => [...parse(renderPage(page, { url: 'https://example.com', pages: [page], scripts, fonts }, chrome)).querySelectorAll('link[rel="preload"]')].map((l) => subsetOfUrl(l.getAttribute('href')!));
    expect(loaded(base)).toEqual(['latin']);
    expect(loaded({ ...base, body: '<p>Łódź</p>' })).toEqual(['latin-ext', 'latin']);
    expect(loaded({ ...base, body: '<td data-label="Łódź"><span>3</span></td>' })).toEqual(['latin-ext', 'latin']);
    expect(loaded({ ...base, body: '<script type="application/json" id="calc-texts">{"count":"Жук"}</script>' })).toEqual(['cyrillic', 'latin']);
    expect(loaded({ ...base, body: '<p>&#x141;</p>' })).toEqual(['latin-ext', 'latin']);
    // Chinese and Devanagari are in no subset of Inter: their own fonts draw them.
    expect(loaded({ ...base, body: '<p>照片 फ़ोटो</p>' })).toEqual(['latin']);
    // In the stylesheet's order.
    expect(facesFor(inter.faces, 'Tiếng Việt').map((f) => f.subset)).toEqual(['vietnamese', 'latin']);
  });
});

describe('the files a page references', () => {
  const bundle = (names: readonly string[]): Record<string, BuiltAsset> =>
    Object.fromEntries([
      ...names.map((name) => [`assets/${name}-AbC123.woff2`, { type: 'asset' as const, fileName: `assets/${name}-AbC123.woff2`, originalFileNames: [`node_modules/@fontsource-variable/inter/files/${name}.woff2`] }]),
      ['assets/index-Q.css', { type: 'asset' as const, fileName: 'assets/index-Q.css', originalFileNames: ['src/styles/index.css'] }],
      ['assets/index-Q.js', { type: 'chunk' as const, fileName: 'assets/index-Q.js' }],
    ]);

  test('in a build, the pages use the asset Vite made of each file for the editor’s stylesheet: the same address', () => {
    const urls = builtFontUrls(ROOT, inter, bundle(['inter-latin-wght-normal', 'inter-latin-ext-wght-normal']));
    expect(urls).toEqual({ [LATIN]: '/assets/inter-latin-wght-normal-AbC123.woff2', './files/inter-latin-ext-wght-normal.woff2': '/assets/inter-latin-ext-wght-normal-AbC123.woff2' });
    const built = siteFiles({ url: 'https://example.com' }, legal, { scripts, fonts: { faces: inter.faces, urls } });
    const html = built.get('es/fotos-10x15-en-hoja-a4.html')!;
    expect(html).toContain('<link rel="preload" href="/assets/inter-latin-wght-normal-AbC123.woff2" as="font" type="font/woff2" crossorigin>');
    expect(html).toContain("src: url(/assets/inter-latin-wght-normal-AbC123.woff2) format('woff2-variations');");
  });

  test('a page that needs a file the build didn’t emit stops the build; a file no page needs may be missing', () => {
    const urls = builtFontUrls(ROOT, inter, bundle(['inter-cyrillic-wght-normal']));
    expect(() => siteFiles({ url: 'https://example.com' }, legal, { scripts, fonts: { faces: inter.faces, urls } })).toThrow(/needs Inter's latin subset \(\.\/files\/inter-latin-wght-normal\.woff2\), which the build didn't emit/);
    expect(() => siteFiles({ url: 'https://example.com' }, legal, { scripts, fonts: { faces: inter.faces, urls: builtFontUrls(ROOT, inter, bundle(['inter-latin-wght-normal'])) } })).not.toThrow();
  });

  test.each(pages.map((p) => [p.path, p]))('%s: references no font file but the ones served, and no other font than local() ones', (_, page) => {
    const html = files.get(pageFile(page))!;
    const served = new Set(Object.values(fonts.urls));
    const style = parse(html).querySelector('style')!.textContent!;
    const referenced = [...html.matchAll(/(?:href=|url\()"?([^")\s]+\.woff2)/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const url of referenced) expect(served).toContain(url);
    expect([...style.matchAll(/src: ([^;]+);/g)].map((m) => m[1]).filter((src) => !src.startsWith('url(/node_modules/'))).toEqual(FALLBACK_FACES.match(/src: [^;]+;/g)!.map((src) => src.slice(5, -1)));
  });
});

/** The tables of a woff2 file, uncompressed (the WOFF2 format: a directory, then one brotli stream). */
function woff2Tables(bytes: Buffer) {
  const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (;;) {
      const byte = bytes[at++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < bytes.readUInt16BE(12); i++) {
    const flags = bytes[at++];
    const tag = (flags & 0x3f) === 0x3f ? bytes.subarray(at, (at += 4)).toString('latin1') : KNOWN[flags & 0x3f];
    const version = flags >> 6;
    const original = base128();
    // glyf and loca are transformed unless their version is 3; any other table only when it isn't 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : original });
  }
  const data = brotliDecompressSync(bytes.subarray(at, at + bytes.readUInt32BE(20)));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  for (const { tag, length } of entries) {
    tables.set(tag, data.subarray(offset, offset + length));
    offset += length;
  }
  return tables;
}

describe('the fallback faces', () => {
  const descriptor = (face: string, name: string) => Number(new RegExp(`${name}: ([\\d.]+)%`).exec(face)![1]);
  const faces = FALLBACK_FACES.split('\n');

  test("Inter's vertical metrics, read from its Latin file, are the ones the overrides were worked out from", () => {
    const tables = woff2Tables(readFileSync(faceFile(inter, inter.faces.find((f) => f.src === LATIN)!)));
    const head = tables.get('head')!;
    const hhea = tables.get('hhea')!;
    const os2 = tables.get('OS/2')!;
    expect(head.readUInt16BE(18)).toBe(2048);
    expect([hhea.readInt16BE(4), hhea.readInt16BE(6), hhea.readInt16BE(8)]).toEqual([1984, -494, 0]);
    // The typographic metrics agree and are the ones to use (USE_TYPO_METRICS), so every browser reads the same.
    expect([os2.readInt16BE(68), os2.readInt16BE(70), os2.readInt16BE(72)]).toEqual([1984, -494, 0]);
    expect(os2.readUInt16BE(62) & (1 << 7)).not.toBe(0);
  });

  test.each(faces.map((face) => [/font-family: "([^"]+)"/.exec(face)![1] + (face.includes('font-weight: 700') ? ' bold' : ''), face]))(
    '%s: local fonts only, and each override is Inter’s metric over size-adjust',
    (_, face) => {
      const size = descriptor(face, 'size-adjust') / 100;
      expect(face).toMatch(/src: local\("[^"]+"\)(, local\("[^"]+"\))*;/);
      expect(face).not.toMatch(/url\(/);
      expect(descriptor(face, 'ascent-override')).toBeCloseTo((1984 / 2048 / size) * 100, 2);
      expect(descriptor(face, 'descent-override')).toBeCloseTo((494 / 2048 / size) * 100, 2);
      expect(descriptor(face, 'line-gap-override')).toBe(0);
    }
  );

  test('each language’s stack starts with Inter and its fallbacks, then the language’s own fonts as in the editor; code keeps the system’s monospace', () => {
    const tokens = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
    const editorChinese = /:root:lang\(zh-Hans\) \{\s*--font: "Inter Variable", ([^;]+);/.exec(tokens)![1];
    expect(SITE_CSS).toContain(`:root:lang(zh-Hans) { --font: ${INTER_STACK}, ${editorChinese}; }`);
    expect(SITE_CSS).toContain(`:root:lang(hi) { --font: ${INTER_STACK}, "Nirmala UI", "Kohinoor Devanagari", "Noto Sans Devanagari", system-ui, sans-serif; }`);
    expect(SITE_CSS).toContain(`--font: ${INTER_STACK}, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;`);
    expect(SITE_CSS).toContain('--mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;');
    expect(SITE_CSS).toMatch(/code \{[^}]*font-family: var\(--mono\)/);
    expect(INTER_STACK).toBe('"Inter Variable", "Inter Fallback Arial", "Inter Fallback Roboto"');
  });

  test('the weights the pages set are all in Inter’s variable range; tables keep tabular numbers, and the text is smoothed as the editor smooths it', () => {
    const weights = [...`${SITE_CSS}${STACKED_CSS}`.matchAll(/font-weight: (\d+)/g)].map((m) => Number(m[1]));
    expect([...new Set(weights)].sort()).toEqual([500, 600, 700, 800]);
    for (const w of weights) expect(w >= 100 && w <= 900).toBe(true);
    expect(SITE_CSS).toContain('.num { text-align: right; font-variant-numeric: tabular-nums; }');
    expect(readFileSync(join(ROOT, 'src/styles/base.css'), 'utf8')).toContain('-webkit-font-smoothing: antialiased;');
    expect(SITE_CSS).toMatch(/body \{[^}]*-webkit-font-smoothing: antialiased;/);
  });

  test.each(pages.map((p) => [p.path, p]))('%s: carries the fallback faces', (_, page) => {
    expect(files.get(pageFile(page))).toContain(FALLBACK_FACES);
  });
});
