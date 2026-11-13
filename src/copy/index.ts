// Interface texts. Everything that is shown or announced comes from here:
//
//   t('nested.key', { n: 3, name: 'foto.jpg' })
//
// - `{param}` is replaced by params[param]; numbers are formatted with the
//   locale of the language (decimal comma, at most one decimal).
// - `{app}` is always the app name (APP_NAME, in config.ts) and `{mod}` the
//   main modifier key (Ctrl, or ⌘ on a Mac).
// - A value can be a plural object ({ one, other, … }) picked with
//   Intl.PluralRules from params.n.
//
// Another language: a sibling file with the same keys (en.ts) chosen in
// `messages`; missing keys fall back to Spanish.
//
// The static HTML uses data-i18n attributes (see ATTRIBUTES): Vite fills them
// when serving and building (fillHtml, in vite.config.ts) so the page arrives
// with its texts; applyCopy does the same in the browser (for {mod}).

import { APP_NAME } from '../config.ts';
import es from './es.ts';

type Messages = typeof es;
type Plural = { one: string; other: string };
type Leaf = string | Plural;
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every key of the texts: `t('bar.undo')`, `t('pieces.count', { n })`. */
export type CopyKey = Paths<Messages>;
export type CopyParams = Record<string, string | number>;

const fallback: Messages = es;
const messages: Messages = es;

/** Locale of the numbers (decimal comma in Spanish). */
export const numberLocale = messages.meta.numberLocale;

const pluralRules = new Intl.PluralRules(messages.meta.lang);
const numberFormat = new Intl.NumberFormat(messages.meta.numberLocale, { maximumFractionDigits: 1 });

/** A number for display: «41,6». */
export const formatNumber = (value: number) => numberFormat.format(Math.round(value * 10) / 10 || 0);

const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '');

type TextTree = string | { [key: string]: TextTree };

const lookup = (source: TextTree, key: string): TextTree | undefined =>
  key.split('.').reduce<TextTree | undefined>((node, part) => (node && typeof node === 'object' ? node[part] : undefined), source);
const find = (key: string) => lookup(messages, key) ?? lookup(fallback, key);

/** Does the key exist? (e.g. paper names only some languages translate) */
export const hasText = (key: string) => find(key) !== undefined;

/** The text of `key`, with its parameters and the right plural. */
export function t(key: CopyKey, params: CopyParams = {}): string {
  let value = find(key);
  if (value && typeof value === 'object') {
    const count = typeof params.n === 'number' ? params.n : Number(params.n ?? 0);
    value = value[pluralRules.select(count)] ?? value.other;
  }
  if (typeof value !== 'string') throw new Error(`Missing text «${key}»`);
  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (name === 'app') return APP_NAME;
    if (name === 'mod') return String(find(isMac() ? 'keys.ModMac' : 'keys.Mod'));
    if (!(name in params)) return match;
    const param = params[name];
    return typeof param === 'number' ? formatNumber(param) : String(param);
  });
}

const listFormat = new Intl.ListFormat(messages.meta.lang, { style: 'long', type: 'conjunction' });

/** A list for a sentence: «1, 2 y 3», «foto.jpg y plano.pdf». */
export const formatList = (items: readonly (string | number)[]) => listFormat.format(items.map(String));

/** The text with a final period (to join loose messages when announcing them). */
export const asSentence = (text: string) => (/[.!?…:]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/**
 * A text with a link inside: the string marks the linked part with
 * <link>…</link> («Los atajos… en <link>Preferencias</link>»), so the sentence
 * stays whole in one translatable text. Returns [before, link, after]; without
 * a link, [text, null, ''].
 */
export function splitLink(key: CopyKey, params?: CopyParams): [string, string | null, string] {
  const text = t(key, params);
  const match = /^([\s\S]*?)<link>([\s\S]*?)<\/link>([\s\S]*)$/.exec(text);
  return match ? [match[1], match[2], match[3]] : [text, null, ''];
}

/** The same as a DocumentFragment, with the element `makeLink(text)` builds (nothing is parsed as HTML). */
export function linkedText(key: CopyKey, params: CopyParams | undefined, makeLink: (text: string) => Node) {
  const [before, link, after] = splitLink(key, params);
  const fragment = document.createDocumentFragment();
  if (link === null) fragment.append(before);
  else fragment.append(before, makeLink(link), after);
  return fragment;
}

/** Visible name of a key or combination («Mod+Shift+Z» → «Ctrl+Shift+Z»). */
export const keyLabel = (combo: string) =>
  combo
    .split('+')
    .map((part) => {
      const name = find(`keys.${part === 'Mod' && isMac() ? 'ModMac' : part}`);
      return typeof name === 'string' ? name : part;
    })
    .join('+');

// ---------- HTML ----------

/** Attribute with the key → where the text goes (null: the element's content). */
const ATTRIBUTES: Record<string, string | null> = {
  'data-i18n': null,
  'data-i18n-label': 'aria-label',
  'data-i18n-tip': 'data-tip',
  'data-i18n-note': 'data-tip-note',
  'data-i18n-content': 'content',
};

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const parseParams = (json: string | undefined): CopyParams => (json ? JSON.parse(json) : {});

/**
 * Fills the texts of the static HTML (in Node, from vite.config.ts). Elements
 * with data-i18n have to come empty: `<span data-i18n="x"></span>`.
 */
export function fillHtml(html: string): string {
  return html.replace(/<([a-z][\w-]*)(\s(?:[^>]*?\s)?data-i18n[^>]*?)(\s*\/?)>(<\/\1>)?/gi, (tag, name: string, attrs: string, slash: string, close?: string) => {
    const read = (attr: string) => attrs.match(new RegExp(`\\s${attr}="([^"]*)"`))?.[1];
    const params = parseParams(attrs.match(/\sdata-i18n-params='([^']*)'/)?.[1]);
    let extra = '';
    let text: string | null = null;
    for (const [source, target] of Object.entries(ATTRIBUTES)) {
      const key = read(source) as CopyKey | undefined;
      if (!key) continue;
      if (target === null) text = escapeHtml(t(key, params));
      else extra += ` ${target}="${escapeHtml(t(key, params))}"`;
    }
    if (text !== null && close === undefined) throw new Error(`data-i18n on an element that is not empty: ${tag}`);
    return `<${name}${attrs}${extra}${slash}>${text ?? ''}${close ?? ''}`;
  });
}

/** The same as fillHtml, on the DOM (on start or if the language changes). */
export function applyCopy(root: ParentNode = document) {
  const selector = Object.keys(ATTRIBUTES)
    .map((attr) => `[${attr}]`)
    .join(',');
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const params = parseParams(el.dataset.i18nParams);
    for (const [source, target] of Object.entries(ATTRIBUTES)) {
      const key = el.getAttribute(source) as CopyKey | null;
      if (!key) continue;
      if (target === null) el.textContent = t(key, params);
      else el.setAttribute(target, t(key, params));
    }
  }
}
