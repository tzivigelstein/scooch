// The skeleton of the editor that index.html shows until the app mounts
// copies values of the app's stylesheet into its critical CSS, so that nothing
// moves when the app takes its place. Each copy is compared here with its
// source (src/styles, read in the order src/styles/index.css imports them),
// and the breakpoints with src/config.ts. The boxes themselves, in a browser,
// are in e2e/specs/boot-and-build.spec.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEFT_DRAWER_QUERY, NARROW_QUERY } from '../../src/config.ts';
import { sizeOf } from '../../src/core/papers.js';
import { emptyDoc } from '../../src/core/projectstore.js';

const ROOT = join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

type Rules = Map<string, Map<string, string>>;
interface Sheet {
  rules: Rules;
  media: Map<string, Rules>;
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Adds the rules of `css` (no at-rules) to `into`: one entry per selector of a list, later declarations winning. */
function addRules(into: Rules, css: string) {
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = body
      .split(';')
      .map((d) => d.match(/^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/))
      .filter((m) => m !== null)
      .map((m): [string, string] => [m[1], squash(m[2])]);
    for (const selector of selectors.split(',').map(squash)) into.set(selector, new Map([...(into.get(selector) ?? []), ...declarations]));
  }
}

/** The rules of stylesheets, in order: at the top level and inside each @media (other at-rules are left out). */
function parse(...sources: string[]): Sheet {
  const sheet: Sheet = { rules: new Map(), media: new Map() };
  for (const source of sources) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
    let at = 0;
    while (at < css.length) {
      const open = css.indexOf('{', at);
      if (open < 0) break;
      let close = open;
      for (let depth = 0; close < css.length; close++) {
        if (css[close] === '{') depth++;
        else if (css[close] === '}' && --depth === 0) break;
      }
      const prelude = squash(css.slice(at, open));
      const body = css.slice(open + 1, close);
      if (prelude.startsWith('@media ')) {
        const query = prelude.slice('@media '.length);
        if (!sheet.media.has(query)) sheet.media.set(query, new Map());
        addRules(sheet.media.get(query)!, body);
      } else if (!prelude.startsWith('@')) addRules(sheet.rules, `${prelude}{${body}}`);
      at = close + 1;
    }
  }
  return sheet;
}

const STYLES = [...read('src/styles/index.css').matchAll(/@import "\.\/([\w-]+\.css)";/g)].map((m) => read(`src/styles/${m[1]}`));
const APP = parse(...STYLES);
const CRITICAL = parse(read('index.html').match(/<style>([\s\S]*?)<\/style>/)![1]);

const LAYOUTS = { desktop: [], medium: [LEFT_DRAWER_QUERY], narrow: [LEFT_DRAWER_QUERY, NARROW_QUERY] } as const;
type Layout = keyof typeof LAYOUTS;

/** A declaration as it applies in a layout: the top level's, then each wider-to-narrower breakpoint's. */
function valueIn(sheet: Sheet, layout: Layout, selector: string, property: string) {
  let value: string | undefined;
  for (const rules of [sheet.rules, ...LAYOUTS[layout].map((q) => sheet.media.get(q))]) value = rules?.get(selector)?.get(property) ?? value;
  if (value === undefined) throw new Error(`${selector} { ${property} } is not set (${layout})`);
  return value;
}
const app = (layout: Layout, selector: string, property: string) => valueIn(APP, layout, selector, property);
const skeleton = (layout: Layout, selector: string, property: string) => valueIn(CRITICAL, layout, selector, property);

/** A token's value (var(--x) → what tokens.css gives --x in the light theme). */
const resolve = (value: string) => value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => app('desktop', ':root', name));

/** The terms of a sum, `calc(a + b - c)` → ['a', 'b', '-c']; a lone value is one term. */
const terms = (value: string) =>
  value
    .replace(/^calc\((.*)\)$/, '$1')
    .split(/\s+(?=[+-]\s)/)
    .map((t) => t.replace(/^\+\s+/, '').replace(/^-\s+/, '-'));

/** The top-level values of a shorthand, `calc(a + b) c` → ['calc(a + b)', 'c']. */
const parts = (value: string) => value.match(/[\w-]+\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s()]+/g)!;

describe('the skeleton in index.html', () => {
  test('its colors and shadows are the tokens of each theme, for every token it copies', () => {
    const light = CRITICAL.rules.get('.boot')!;
    const dark = CRITICAL.rules.get(':where([data-theme="dark"]) .boot')!;
    const tokens = APP.rules.get(':root')!;
    const darkTokens = APP.rules.get(':root[data-theme="dark"]')!;
    const copied = [...light.keys()].filter((name) => name.startsWith('--') && name !== '--ph');
    expect(copied.length).toBeGreaterThan(5);
    for (const name of copied) expect(light.get(name), name).toBe(tokens.get(name));
    for (const name of [...dark.keys()].filter((n) => n !== '--ph')) expect(dark.get(name), `${name} (dark)`).toBe(darkTokens.get(name));
    // A token that changes with the theme changes in the skeleton too.
    expect([...dark.keys()].sort()).toEqual([...copied.filter((name) => darkTokens.has(name)), '--ph'].sort());
  });

  test('its breakpoints are the app’s: the pieces panel’s rail and the narrow layout', () => {
    expect([...CRITICAL.media.keys()].filter((q) => !q.includes('prefers-'))).toEqual([LEFT_DRAWER_QUERY, NARROW_QUERY]);
    expect(APP.media.has(LEFT_DRAWER_QUERY) && APP.media.has(NARROW_QUERY)).toBe(true);
  });

  test('its columns and top bar are the workspace’s and the top bar’s, in every layout', () => {
    const [rows, columns] = skeleton('desktop', '.boot', 'grid').split(' / ');
    expect(rows).toBe(`"bar bar bar" ${app('desktop', '.topbar', 'height')} "left canvas right" minmax(0, 1fr)`);
    expect(columns).toBe(app('desktop', '.workspace', 'grid-template-columns'));
    expect(skeleton('medium', '.boot', 'grid-template-columns')).toBe(app('medium', '.workspace', 'grid-template-columns'));
    expect(skeleton('narrow', '.boot', 'grid').split(' / ')[1]).toBe(app('narrow', '.workspace', 'grid-template-columns'));
    for (const layout of Object.keys(LAYOUTS) as Layout[])
      for (const property of ['gap', 'padding']) expect(skeleton(layout, '.boot-bar', property), `${property} (${layout})`).toBe(app(layout, '.topbar', property));
    expect(skeleton('narrow', '.boot-bar', 'grid')).toBe(`${app('narrow', '.topbar', 'grid-template-rows')} / ${app('narrow', '.topbar', 'grid-template-columns')}`);
    for (const property of ['font-size', 'font-weight', 'letter-spacing']) expect(skeleton('desktop', '.boot-name', property), property).toBe(app('desktop', '.brand-name', property));
  });

  test('the room it fits the sheet in is the stage’s scrolled area’s, less the sheet’s title and «Agregar hoja», in every layout', () => {
    // The room a piece dragged out of the sheets makes for a new one is none at rest.
    const atRest = (value: string) => value.replace(/^calc\((.+) \+ var\(--new-sheet-room\)\)$/, '$1');
    for (const layout of Object.keys(LAYOUTS) as Layout[]) {
      const [top, x, bottom] = parts(skeleton(layout, '.boot-stage', 'padding'));
      expect(skeleton(layout, '.boot-about', 'padding'), `the description is centered like the sheet (${layout})`).toBe(skeleton(layout, '.boot-stage', 'padding'));
      const [stageTop, stageX, stageBottom] = parts(app(layout, '.stage-area', 'padding')).map(atRest);
      expect(terms(top), `top (${layout})`).toEqual([stageTop, app(layout, '.page-head', 'height')]);
      expect(x, `sides (${layout})`).toBe(stageX);
      expect(terms(bottom), `bottom (${layout})`).toEqual([stageBottom, app(layout, '.sheets', 'gap'), app(layout, '.sheets-foot', 'margin-top'), app(layout, '.add-sheet', 'height')]);
    }
    expect(skeleton('desktop', '.boot-stage', 'scrollbar-gutter')).toBe(app('desktop', '.stage', 'scrollbar-gutter'));
  });

  test('its sheet has the proportions of a new project’s paper', () => {
    const { w, h } = sizeOf(emptyDoc().paper, emptyDoc().landscape)!;
    expect(skeleton('desktop', '.boot-sheet', 'width')).toBe(`min(100cqw, 100cqh * ${w} / ${h})`);
    expect(skeleton('desktop', '.boot-sheet', 'height')).toBe(`min(100cqh, 100cqw * ${h} / ${w})`);
    expect(skeleton('desktop', '.boot-sheet', 'box-shadow')).toBe('var(--sheet-shadow)');
    expect(app('desktop', '.sheet', 'box-shadow')).toBe('var(--sheet-shadow)');
  });

  test('its panels’ pieces copy the drop zone, the tabs, the fields and the dock', () => {
    expect(skeleton('desktop', '.boot-pane > .boot-drop', 'margin')).toBe(app('desktop', '.addzone', 'margin'));
    expect(skeleton('desktop', '.boot-pane > .boot-drop', 'border')).toBe(app('desktop', '.addzone', 'border'));
    expect(skeleton('desktop', '.boot-pane > .boot-drop', 'border-radius')).toBe(resolve(app('desktop', '.addzone', 'border-radius')));
    expect(skeleton('desktop', '.boot-tabs', 'padding')).toBe(app('desktop', '.props-tabs', 'padding'));
    expect(skeleton('desktop', '.boot-tabs', 'grid').split(' / ')[0]).toBe(app('desktop', '.tab', 'height'));
    expect(skeleton('desktop', '.boot-pane > .boot-field', 'height')).toBe(resolve('var(--control-h)'));
    expect(skeleton('narrow', '.boot-dock', 'height')).toBe(app('narrow', '.dock-btn', 'height'));
    // The skeleton's stage stands in for the scrollbars the app measures (--stage-bar-*).
    const withoutBars = (value: string) => value.replace(/ \+ var\(--stage-bar-\w+, 0px\)/, '').replace(/^calc\(([^+-]*)\)$/, '$1');
    expect(skeleton('narrow', '.boot-dock', 'left')).toBe(app('narrow', '.dock', 'left'));
    expect(skeleton('narrow', '.boot-dock', 'bottom')).toBe(withoutBars(app('narrow', '.dock', 'bottom')));
    expect(skeleton('narrow', '.boot-dock + .boot-dock', 'right')).toBe(withoutBars(app('narrow', '.dock', 'right')));
  });
});
