// Nothing the app runs names another server, so it can't talk to one: the
// privacy policy says Scooch loads nothing from other servers and sends
// nothing anywhere. A cheap first line before e2e/specs/privacy.spec.ts,
// which watches every request of a whole session in the browser:
//   - the editor's sources (src/, but the site's pages, and index.html) call
//     no API that sends or connects, start their workers from their own
//     files, and name no other address but the few below, each with its reason;
//   - the build (made here, in memory): every address in the JavaScript and
//     CSS it serves, its dependencies' and its workers' included, is one of a
//     few that are never fetched (namespaces, links in error messages and
//     licences); every stylesheet loads only its own files; and no page, the
//     editor's or the site's, loads anything from another address (links to
//     other sites are links, not requests: they aren't checked).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { beforeAll, describe, expect, test } from 'vitest';
import { PLACEHOLDER_URL } from '../../src/site/config.ts';

const ROOT = new URL('../..', import.meta.url).pathname;

/** Absolute addresses: a scheme that reaches a server, or a protocol-relative «//host.tld/». */
const ADDRESS = /\b(?:https?|wss?|ftp):\/\/[^\s"'`<>)\\,;]+|(?<=["'`(=\s])\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/:][^\s"'`<>)\\,;]*)?(?=["'`)\s]|$)/gi;

/** The absolute addresses in a text. */
const addressesIn = (text: string) => [...text.matchAll(ADDRESS)].map((m) => m[0]);

/** A path, a data: or blob: URL, a fragment: nothing that leaves the site. */
function isLocal(value: string) {
  const url = value.trim();
  if (url.startsWith('//')) return false;
  return /^(data|blob):/i.test(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url);
}

// ---------- The sources ----------

/**
 * The only absolute addresses the editor's sources may name, with why each
 * is harmless. A new one needs its line here, and, if the app would fetch
 * it, the privacy policy changed first (docs/legal/README.md, «Keep them true»).
 */
const SOURCE_ALLOWED: { file: string; address: RegExp; why: string }[] = [
  { file: 'index.html', address: /^http:\/\/www\.w3\.org\/2000\/svg$/, why: 'the SVG namespace of the icon, drawn from a data: URL; an identifier, never fetched' },
  { file: 'src/components/dialogs/donate.ts', address: /^https:\/\/…$/, why: 'a comment showing the shape of ?donar=' },
  { file: 'src/config.ts', address: /^https:\/\/www\.patreon\.com\/[\w-]+$/, why: 'DONATE_URL, empty today: the link the summary after printing may show, which opens Patreon in another tab only if the person follows it' },
  { file: 'src/services/qr.ts', address: /^http:\/\/www\.w3\.org\/2000\/svg$/, why: 'the SVG namespace of a QR code’s picture, whose logo and caption it carries as data: URLs; an identifier, never fetched' },
];

/** APIs that send or connect: the editor uses none of them. */
const SENDING = /\b(?:fetch|importScripts)\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|WebTransport|RTCPeerConnection|SharedWorker|sendBeacon|serviceWorker|registerProtocolHandler)\b|<form\b/g;

/** The editor's sources: what runs in the browser and index.html. The site's pages (src/site) are checked in their built form below. */
function editorSources() {
  const files = (readdirSync(join(ROOT, 'src'), { recursive: true }) as string[])
    .map((f) => join('src', f).replace(/\\/g, '/'))
    .filter((f) => /\.(ts|tsx|js|css|html|svg)$/.test(f) && !f.startsWith('src/site/'));
  return ['index.html', ...files].map((file) => ({ file, text: readFileSync(join(ROOT, file), 'utf8') }));
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

describe('the editor’s sources', () => {
  const sources = editorSources();

  test('cover the app and its page', () => {
    const files = sources.map((s) => s.file);
    expect(files).toEqual(expect.arrayContaining(['index.html', 'src/main.tsx', 'src/services/export.worker.ts', 'src/services/contour.worker.ts', 'src/services/assets.ts', 'src/config.ts']));
    expect(files.length).toBeGreaterThan(100);
  });

  test('name no address of another server but the allowed ones, each with its reason', () => {
    const found = sources.flatMap(({ file, text }) => [...text.matchAll(ADDRESS)].map((m) => ({ file, line: lineOf(text, m.index), address: m[0] })));
    const unexplained = found.filter(({ file, address }) => !SOURCE_ALLOWED.some((a) => a.file === file && a.address.test(address)));
    expect(unexplained.map((f) => `${f.file}:${f.line} ${f.address}`)).toEqual([]);
  });

  test('call no API that sends or connects (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, a service worker…) and post no form', () => {
    const calls = sources.flatMap(({ file, text }) => [...text.matchAll(SENDING)].map((m) => `${file}:${lineOf(text, m.index)} ${m[0]}`));
    expect(calls).toEqual([]);
  });

  test('start each worker from a file of their own, next to the module', () => {
    const workers = sources.flatMap(({ file, text }) => [...text.matchAll(/new Worker\(([^)]*\))/g)].map((m) => ({ file, args: m[1] })));
    expect(workers.length).toBeGreaterThanOrEqual(2);
    for (const { file, args } of workers) expect(args, file).toMatch(/^new URL\('\.\/[\w.-]+', import\.meta\.url\)/);
  });
});

// ---------- The build ----------

/**
 * The only absolute addresses the built JavaScript and CSS may hold, with
 * why each is never fetched. A dependency update that brings a new one
 * shows here: read what it does with it before adding it.
 */
const BUILD_ALLOWED: { address: RegExp; why: string }[] = [
  { address: /^http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1998\/Math\/MathML|XML\/1998\/namespace|1999\/xhtml|1999\/XSL\/Transform|2000\/09\/xmldsig#)$/, why: 'XML namespaces (React for SVG and MathML; pdf.js for XFA forms and XMP metadata): identifiers, never fetched' },
  { address: /^http:\/\/ns\.adobe\.com\/(?:xdp|xdp\/pdf|xfdf|xmpmeta)\/$/, why: 'XML namespaces pdf.js reads XFA forms and XMP metadata with' },
  { address: /^http:\/\/www\.xfa\.org\/schema\/[\w/.-]+$/, why: 'XFA namespaces pdf.js reads forms with' },
  { address: /^https:\/\/react\.dev\/errors\/$/, why: 'React’s production errors name the page that explains them: text, never fetched' },
  { address: /^https:\/\/github\.com\/Hopding\/pdf-lib$/, why: 'pdf-lib names its repository in its error messages' },
  { address: /^http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0$/, why: 'pdf.js’s licence header' },
  { address: /^http:\/\/\$\{e\}$/, why: 'pdf.js turns a «www.…» link target in a PDF into an address (createValidAbsoluteUrl); the app draws the pages and never follows their links' },
  { address: /^https:\/\/www\.patreon\.com\/[\w-]+$/, why: 'DONATE_URL, if it is set (see SOURCE_ALLOWED)' },
];

/**
 * In a page, the attributes that make the browser fetch: every one must stay
 * on the site. A link (<a href>, <link rel="canonical"> or "alternate") is not
 * a request.
 */
const FETCHING_RELS = /(?:^|\s)(?:stylesheet|icon|apple-touch-icon|mask-icon|preload|modulepreload|prefetch|prerender|preconnect|dns-prefetch|manifest)(?:\s|$)/i;
const TAG = /<([a-z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*\/?>/gi;
const ATTRIBUTE = /([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+))?/g;

/** What a page fetches from outside the site: `<tag attribute>` and the address. */
function fetchedElsewhere(html: string) {
  const found: string[] = [];
  for (const [, rawTag, rawAttributes] of html.matchAll(TAG)) {
    const tag = rawTag.toLowerCase();
    const attributes = new Map([...rawAttributes.matchAll(ATTRIBUTE)].map(([, name, value = '']) => [name.toLowerCase(), value.replace(/^["']|["']$/g, '')]));
    const urls: [string, string][] = [];
    if (tag === 'link') {
      if (FETCHING_RELS.test(attributes.get('rel') ?? '')) urls.push(['href', attributes.get('href') ?? '']);
    } else if (tag !== 'a' && tag !== 'area') {
      for (const name of ['src', 'poster', 'data', 'action', 'formaction', 'background']) if (attributes.has(name)) urls.push([name, attributes.get(name)!]);
      if (['image', 'use', 'feimage'].includes(tag)) for (const name of ['href', 'xlink:href']) if (attributes.has(name)) urls.push([name, attributes.get(name)!]);
    }
    for (const name of ['srcset', 'imagesrcset']) for (const part of (attributes.get(name) ?? '').split(',')) if (part.trim()) urls.push([name, part.trim().split(/\s+/)[0]]);
    for (const part of (attributes.get('ping') ?? '').split(/\s+/)) if (part) urls.push(['ping', part]);
    for (const [name, value] of urls) if (!isLocal(value)) found.push(`<${tag} ${name}> ${value}`);
  }
  return [...found, ...cssElsewhere(html)];
}

/** What a stylesheet (or a page's inline styles) loads from outside the site. */
function cssElsewhere(css: string) {
  const targets = [...css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)].map((m) => m[2]);
  const imports = [...css.matchAll(/@import\s+(["'])(.*?)\1/g)].map((m) => m[2]);
  return [...targets, ...imports].filter((url) => !isLocal(url)).map((url) => `url(${url})`);
}

/** The executable scripts written in a page (not JSON data, not structured data). */
const inlineScripts = (html: string) => [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(([, attributes = '']) => !/\bsrc=/.test(attributes) && !/type="application\/(?:ld\+)?json"/.test(attributes)).map((m) => m[2]);

interface Built {
  fileName: string;
  text: string;
}

describe('the build', () => {
  let files: Built[] = [];
  const of = (re: RegExp) => files.filter((f) => re.test(f.fileName));

  beforeAll(async () => {
    // As `yarn build` does: Vitest sets NODE_ENV to 'test', which would build React's development code.
    const environment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const result = await build({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), mode: 'production', logLevel: 'silent', build: { write: false, reportCompressedSize: false } }).finally(() => (process.env.NODE_ENV = environment));
    const outputs = (Array.isArray(result) ? result : [result]) as unknown as { output: { type: string; fileName: string; code?: string; source?: string | Uint8Array }[] }[];
    files = outputs
      .flatMap((o) => o.output)
      .filter((o) => /\.(js|mjs|css|html)$/.test(o.fileName))
      .map((o) => ({ fileName: o.fileName, text: o.code ?? (typeof o.source === 'string' ? o.source : new TextDecoder().decode(o.source)) }));
  }, 60_000);

  test('holds the editor, its workers, its dependencies and the site’s pages', () => {
    const names = files.map((f) => f.fileName.replace(/-[\w-]{8}(?=\.\w+$)/, ''));
    expect(names).toEqual(expect.arrayContaining(['index.html', 'assets/index.js', 'assets/export.worker.js', 'assets/contour.worker.js', 'assets/pdf.worker.min.mjs', 'assets/pdfjs-dist.js', 'assets/pdf-lib.js', 'assets/calculator.js', 'es/privacidad.html', '404.html']));
  });

  test('its JavaScript and CSS name no address but the allowed ones, each with its reason', () => {
    const found = of(/\.(js|mjs|css)$/).flatMap(({ fileName, text }) => addressesIn(text).map((address) => ({ fileName, address })));
    const unexplained = found.filter(({ address }) => !BUILD_ALLOWED.some((a) => a.address.test(address)));
    expect([...new Set(unexplained.map((f) => `${f.fileName}: ${f.address}`))]).toEqual([]);
    expect(found.length, 'the check reads the addresses there are').toBeGreaterThan(10);
  });

  test('its stylesheets load only the site’s own files', () => {
    expect(of(/\.css$/).flatMap(({ fileName, text }) => cssElsewhere(text).map((u) => `${fileName}: ${u}`))).toEqual([]);
  });

  test('the editor’s page loads only the site’s files, and names no other address but the site’s own, the icon’s namespace and schema.org', () => {
    const [{ text }] = of(/^index\.html$/);
    expect(fetchedElsewhere(text)).toEqual([]);
    expect(inlineScripts(text).flatMap(addressesIn)).toEqual([]);
    // The canonical URL and the share tags point to the site itself; schema.org is the vocabulary of the structured data, read by search engines.
    const other = addressesIn(text).filter((a) => !a.startsWith(`${PLACEHOLDER_URL}/`) && a !== 'http://www.w3.org/2000/svg' && a !== 'https://schema.org');
    expect(other).toEqual([]);
  });

  test('no page of the site loads anything from another address', () => {
    const pages = of(/\.html$/);
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.flatMap(({ fileName, text }) => [...fetchedElsewhere(text), ...inlineScripts(text).flatMap(addressesIn)].map((f) => `${fileName}: ${f}`))).toEqual([]);
  });
});

describe('the checks themselves', () => {
  test('find an address in code, protocol-relative ones too, but not a path or an escaped pattern', () => {
    expect(addressesIn(`fetch("https://cdn.example.com/x.js");import("//cdn.example.com/y.js");const re=/^https?:\\/\\//;fetch("/assets/z.js")`)).toEqual(['https://cdn.example.com/x.js', '//cdn.example.com/y.js']);
    expect(addressesIn('new WebSocket(`wss://live.example.com/socket`)')).toEqual(['wss://live.example.com/socket']);
  });

  test('find what a page or a stylesheet would fetch elsewhere, and not a link', () => {
    const page = `
      <script type="module" src="https://cdn.example.com/app.js"></script>
      <link rel="stylesheet" href="//fonts.example.com/css">
      <link rel="preconnect" href="https://fonts.example.com">
      <img src="/assets/a.png" srcset="/assets/a.png 1x, https://img.example.com/a@2x.png 2x">
      <a href="https://elsewhere.example.com" ping="https://track.example.com/p">a link</a>
      <link rel="canonical" href="https://scooch.example/">
      <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>">
      <style>body { background: url("https://img.example.com/b.png") } @import "https://fonts.example.com/c.css";</style>`;
    expect(fetchedElsewhere(page)).toEqual([
      '<script src> https://cdn.example.com/app.js',
      '<link href> //fonts.example.com/css',
      '<link href> https://fonts.example.com',
      '<img srcset> https://img.example.com/a@2x.png',
      '<a ping> https://track.example.com/p',
      'url(https://img.example.com/b.png)',
      'url(https://fonts.example.com/c.css)',
    ]);
  });

  test('read the scripts a page runs, not its data', () => {
    expect(inlineScripts('<script>go("https://x.example.com")</script><script type="application/ld+json">{"@context":"https://schema.org"}</script><script src="/a.js"></script>')).toEqual(['go("https://x.example.com")']);
  });
});
