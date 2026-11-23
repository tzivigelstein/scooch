// Inter on the content pages, as the editor has it: the very files of the
// stylesheet src/styles/index.css imports (@fontsource-variable/inter), at
// the addresses the build gave them for the editor, so going from a guide to
// the editor, or back, downloads no font twice. Each page declares and
// preloads only the subsets whose characters its text uses (every page today:
// Latin), and falls back meanwhile on a system font resized to take Inter's
// room (FALLBACK_FACES), so nothing moves when Inter arrives.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';

/** A face of the stylesheet: one subset of Inter, in one file. */
export interface InterFace {
  /** fontsource's name for it, from its file: «latin», «latin-ext», «cyrillic»… */
  subset: string;
  /** Its file as the stylesheet names it: «./files/inter-latin-wght-normal.woff2». */
  src: string;
  /** Its @font-face rule as the stylesheet writes it, on one line. */
  rule: string;
  /** The characters it covers (unicode-range), as [first, last] code points. */
  ranges: readonly (readonly [number, number])[];
}

/** The stylesheet the editor imports and its faces, in its order. */
export interface InterFonts {
  /** The stylesheet's path on disk. */
  css: string;
  faces: readonly InterFace[];
}

/** Each face's file (`src`) → its address on the site. */
export type FontUrls = Readonly<Record<string, string>>;

/** What a page needs to declare Inter: every face of the stylesheet, and where each file is served. */
export interface SiteFonts {
  faces: readonly InterFace[];
  urls: FontUrls;
}

/** The package src/styles/index.css imports for Inter. */
const INTER_PACKAGE = '@fontsource-variable/inter';

const codePoints = (range: string) => {
  const [first, last = first] = range.trim().replace(/^U\+/i, '').split('-');
  return [parseInt(first.replace(/\?/g, '0'), 16), parseInt(last.replace(/\?/g, 'F'), 16)] as const;
};

/** The @font-face rules of a fontsource stylesheet. */
export function parseFaces(css: string): InterFace[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const src = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(body)?.[1];
    if (!src) throw new Error(`An @font-face of ${INTER_PACKAGE} has no url(): ${body.trim()}`);
    const range = /unicode-range:\s*([^;]+)/.exec(body)?.[1];
    const declarations = body
      .split(';')
      .map((d) => d.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    return {
      subset: src.replace(/^.*\/inter-|-wght-normal\.woff2$/g, ''),
      src,
      rule: `@font-face { ${declarations.join('; ')}; }`,
      ranges: range ? range.split(',').map(codePoints) : [[0, 0x10ffff]],
    };
  });
}

/** The stylesheet the editor imports for Inter, read from the dependencies of the project at `root`. */
export function readInterFonts(root: string): InterFonts {
  const css = createRequire(join(root, 'package.json')).resolve(INTER_PACKAGE);
  return { css, faces: parseFaces(readFileSync(css, 'utf8')) };
}

/** A face's file on disk. */
export const faceFile = (inter: InterFonts, face: InterFace) => resolve(dirname(inter.css), face.src);

/** Where `yarn dev` serves each file: from node_modules under the root, as it serves the editor's stylesheet. */
export const devFontUrls = (root: string, inter: InterFonts): FontUrls =>
  Object.fromEntries(inter.faces.map((face) => [face.src, `/${relative(root, faceFile(inter, face)).split(sep).join('/')}`]));

/** Inter's faces with the addresses `yarn dev` serves them at (also what the tests render the pages with). */
export function devFonts(root: string): SiteFonts {
  const inter = readInterFonts(root);
  return { faces: inter.faces, urls: devFontUrls(root, inter) };
}

/** An asset of a build as Vite gives it to plugins (generateBundle). */
export interface BuiltAsset {
  type: 'asset' | 'chunk';
  fileName: string;
  /** The files it was made from, relative to the root. */
  originalFileNames?: readonly string[];
}

/**
 * Where a build put each file the editor's stylesheet uses: the asset Vite
 * made of it for that stylesheet (assets/inter-latin-wght-normal-[hash].woff2),
 * so the pages share it, address and cache included. A file the build didn't
 * emit has no address, and a page that needs it stops the build (fontsFor).
 */
export function builtFontUrls(root: string, inter: InterFonts, bundle: Readonly<Record<string, BuiltAsset>>): FontUrls {
  const assets = Object.values(bundle).filter((o) => o.type === 'asset');
  return Object.fromEntries(
    inter.faces.flatMap((face) => {
      const file = faceFile(inter, face);
      const asset = assets.find((a) => a.originalFileNames?.some((name) => resolve(root, name) === file));
      return asset ? [[face.src, `/${asset.fileName}`]] : [];
    })
  );
}

/** The faces whose characters include one of `text`'s, in the stylesheet's order: what a browser downloads to draw it. */
export function facesFor(faces: readonly InterFace[], text: string): InterFace[] {
  const used = [...new Set(Array.from(text, (c) => c.codePointAt(0)!))];
  return faces.filter((face) => used.some((cp) => face.ranges.some(([first, last]) => cp >= first && cp <= last)));
}

/** The faces `text` needs, each with its address; throws if one has none (the build didn't emit its file). */
export function fontsFor(fonts: SiteFonts, text: string, where: string) {
  return facesFor(fonts.faces, text).map((face) => {
    const url = fonts.urls[face.src];
    if (!url) throw new Error(`${where} needs Inter's ${face.subset} subset (${face.src}), which the build didn't emit`);
    return { ...face, url, rule: face.rule.replace(face.src, url) };
  });
}

const DECODE: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' };

/**
 * What a page's body may draw in its font: its text, the attribute values it
 * shows (a stacked table's column names, drawn from data-label; field values),
 * the calculator's texts (JSON in a script, drawn once it is used) and what
 * `css` adds with `content` («›» between the breadcrumbs).
 */
export function drawnText(body: string, css: string) {
  const shown = [...body.matchAll(/\s(?:data-label|value|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  const added = [...css.matchAll(/content:\s*"([^"]*)"/g)].map((m) => m[1]);
  return [body.replace(/<[^>]*>/g, ' '), ...shown, ...added]
    .join(' ')
    .replace(/&(?:#x([\da-f]+)|#(\d+)|(\w+));/gi, (entity, hex: string, dec: string, name: string) =>
      hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : (DECODE[name] ?? entity)
    );
}

/**
 * Inter's metric-compatible fallbacks: what draws the text until Inter
 * arrives (font-display: swap), resized so that each line takes the room it
 * will take in Inter and nothing rewraps or moves when it does.
 *
 * One family per kind of system, each with its regular and bold (the bold
 * face draws weights from 600 up, the weights the site sets: 600, 700, 800):
 *
 * - «Inter Fallback Arial»: Arial, on Windows, macOS, iOS, and its
 *   metric-compatible clones elsewhere, which have the very same advance
 *   widths: Liberation Sans (most Linux desktops), Arimo (ChromeOS), Nimbus
 *   Sans (Ghostscript's fonts, on many Linux systems).
 * - «Inter Fallback Roboto»: Roboto, Android's font, where there is no Arial.
 *
 * San Francisco and Segoe UI, the system-ui of Apple and Windows, aren't
 * used: Safari doesn't let local() reach San Francisco, and those systems
 * have Arial. A system with none of these fonts draws the stack behind them
 * (system-ui…), unadjusted, as before.
 *
 * How the numbers were obtained (scripts outside the repository: fontTools
 * 4.53, and Chromium 1223 through Playwright). Inter is the latin subset of
 * @fontsource-variable/inter 5.3.0 (Inter 4.001, 2048 units per em; hhea and
 * OS/2 typo agree, with USE_TYPO_METRICS: ascender 1984, descender −494, line
 * gap 0; tests/site/fonts.test.ts reads them from the file and checks the
 * overrides below). size-adjust started as Inter's average advance width over
 * the fallback's, at the weight the face stands for (Inter instanced at wght
 * 400 and 700), each character weighted by how often it appears in the
 * visible text of the Spanish, English and French pages (each page counting
 * the same; space 18 %, «e» 9 %, «o» 6 %…): Arial 7.07 and Arial Bold from
 * Windows 11, 106.36 % and 102.06 % (Nimbus Sans: the same); Roboto 2.001
 * (Android up to 11) and Roboto Bold, 107.29 % and 108.38 % (the variable
 * Roboto 3.015 of Android 12 on, at wght 400 and 700: 107.20 % and
 * 108.43 %). Then every paragraph, list item and cell (400), heading (700)
 * and button, label and table head (600) of those 36 pages was set on one
 * line, kerned, in Inter and in each face: Inter came out 0.23 % wider than
 * Arial and 0.26 % narrower than Arial Bold, hence 106.6 % and 101.8 %;
 * Roboto's were already within 0.05 % (107.2 %, 108.4 %). At 600, drawn by
 * the bold face, Inter is 0.7 % narrower than Arial Bold, 0.4 % than Roboto
 * Bold. Each override is Inter's metric over size-adjust (the browser scales
 * it by size-adjust, as next/font and Capsize compute it), so a line's ascent
 * and descent are Inter's: the baseline doesn't move either.
 */
export const FALLBACK_FACES = [
  `@font-face { font-family: "Inter Fallback Arial"; src: local("Arial"), local("Liberation Sans"), local("Arimo-Regular"), local("NimbusSans-Regular"); size-adjust: 106.6%; ascent-override: 90.88%; descent-override: 22.63%; line-gap-override: 0%; }`,
  `@font-face { font-family: "Inter Fallback Arial"; font-weight: 700; src: local("Arial Bold"), local("Liberation Sans Bold"), local("Arimo-Bold"), local("NimbusSans-Bold"); size-adjust: 101.8%; ascent-override: 95.16%; descent-override: 23.69%; line-gap-override: 0%; }`,
  `@font-face { font-family: "Inter Fallback Roboto"; src: local("Roboto"), local("Roboto-Regular"); size-adjust: 107.2%; ascent-override: 90.37%; descent-override: 22.5%; line-gap-override: 0%; }`,
  `@font-face { font-family: "Inter Fallback Roboto"; font-weight: 700; src: local("Roboto Bold"), local("Roboto-Bold"); size-adjust: 108.4%; ascent-override: 89.37%; descent-override: 22.25%; line-gap-override: 0%; }`,
].join('\n');

/** Inter, then its fallbacks: the start of every language's font stack. */
export const INTER_STACK = '"Inter Variable", "Inter Fallback Arial", "Inter Fallback Roboto"';
