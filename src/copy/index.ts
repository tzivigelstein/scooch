// Interface texts. Everything that is shown or announced comes from here:
//
//   t('nested.key', { n: 3, name: 'foto.jpg' })
//
// - `{param}` is replaced by params[param]; numbers are formatted with the
//   locale of the language (decimal comma in Spanish, point in English; at
//   most one decimal).
// - `{app}` is always the app name (APP_NAME, in config.ts) and `{mod}` the
//   main modifier key (Ctrl, or ⌘ on a Mac).
// - A value can be a plural object picked with the language's
//   Intl.PluralRules from params.n: { one, other } in Spanish, English,
//   French and Hindi (French and Hindi say «one» for 0 too), { other } alone
//   in Chinese. An optional `zero` is used for n = 0 in any language
//   (Spanish has no zero category of its own: «ya no entran más» instead of
//   «solo entran 0»).
//
// One catalogue per language: es.ts is the source of the keys and their
// parameters, and en.ts, zh-Hans.ts, hi.ts and fr.ts have exactly the same
// (tests/core/copy-catalogues.test.ts). Only the active one is loaded
// (copy/load.ts, applied by services/language.ts) and installed with
// setTexts; until then t() has nothing to say and throws.
//
// index.html has `{{key}}` placeholders for the few texts it carries itself
// (copy/static.ts, from vite.config.ts); the rest is rendered by React.

import { APP_NAME } from '../config.ts';
import { isApplePlatform } from '../core/platform.js';
import type es from './es.ts';

type Messages = typeof es;
/** A text with a form for each plural category of its language (`other` always). */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type SpanishPlural = { zero?: string; one: string; other: string };
type Leaf = string | SpanishPlural;
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every key of the texts: `t('bar.undo')`, `t('pieces.count', { n })`. */
export type CopyKey = Paths<Messages>;
export type CopyParams = Record<string, string | number>;

/** The texts of one language: exactly Spanish's keys, with the plural forms of that language. */
export type Catalogue<T = Messages> = { [K in keyof T]: T[K] extends string ? string : T[K] extends SpanishPlural ? Plural : Catalogue<T[K]> };

interface Texts {
  messages: Catalogue;
  plurals: Intl.PluralRules;
  numbers: Intl.NumberFormat;
  lists: Intl.ListFormat;
  choices: Intl.ListFormat;
}

const compile = (messages: Catalogue): Texts => ({
  messages,
  plurals: new Intl.PluralRules(messages.meta.lang),
  // Latin digits in every language, like the measures (core/units.js).
  numbers: new Intl.NumberFormat(messages.meta.numberLocale, { maximumFractionDigits: 1, numberingSystem: 'latn' }),
  lists: new Intl.ListFormat(messages.meta.lang, { style: 'long', type: 'conjunction' }),
  choices: new Intl.ListFormat(messages.meta.lang, { style: 'long', type: 'disjunction' }),
});

let active: Texts | null = null;

/** Makes `messages` the interface's texts (once copy/load.ts has them). */
export function setTexts(messages: Catalogue) {
  active = compile(messages);
}

function current(): Texts {
  if (!active) throw new Error('No texts installed yet (setTexts)');
  return active;
}

/** The language of the texts installed («es», «zh-Hans»…), or null before any. */
export const textsLanguage = () => active?.messages.meta.lang ?? null;

/** Locale of the numbers of the language (decimal comma in Spanish and French). */
export const numberLocale = () => current().messages.meta.numberLocale;

const isMac = () => typeof navigator !== 'undefined' && isApplePlatform(navigator);

type TextTree = string | { [key: string]: TextTree };

const lookup = (source: unknown, key: string): TextTree | undefined =>
  key.split('.').reduce<TextTree | undefined>((node, part) => (node && typeof node === 'object' ? node[part] : undefined), source as TextTree);

const formatIn = (texts: Texts, value: number) => texts.numbers.format(Math.round(value * 10) / 10 || 0);

function translate(texts: Texts, key: string, params: CopyParams): string {
  let value = lookup(texts.messages, key);
  if (value && typeof value === 'object') {
    const count = typeof params.n === 'number' ? params.n : Number(params.n ?? 0);
    value = (count === 0 ? value.zero : undefined) ?? value[texts.plurals.select(count)] ?? value.other;
  }
  if (typeof value !== 'string') throw new Error(`Missing text «${key}»`);
  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (name === 'app') return APP_NAME;
    if (name === 'mod') return String(lookup(texts.messages, isMac() ? 'keys.ModMac' : 'keys.Mod'));
    if (!(name in params)) return match;
    const param = params[name];
    return typeof param === 'number' ? formatIn(texts, param) : String(param);
  });
}

/** A number for display: «41,6» (Spanish), «41.6» (English). */
export const formatNumber = (value: number) => formatIn(current(), value);

/** The text of `key`, with its parameters and the right plural. */
export const t = (key: CopyKey, params: CopyParams = {}) => translate(current(), key, params);

/** A list for a sentence: «1, 2 y 3», «foto.jpg y plano.pdf». */
export const formatList = (items: readonly (string | number)[]) => current().lists.format(items.map(String));

/** Alternatives («R o Shift+R») as parts, in the language's order: each item and the words between them. */
export const choiceParts = (items: readonly string[]) => current().choices.formatToParts(items);

/**
 * The texts of one language whatever the interface's: the site's pages are
 * Spanish (src/site/copy.ts), and index.html carries texts of every language.
 */
export function textsFor(messages: Catalogue) {
  const texts = compile(messages);
  return {
    t: (key: CopyKey, params: CopyParams = {}) => translate(texts, key, params),
    formatNumber: (value: number) => formatIn(texts, value),
    formatList: (items: readonly (string | number)[]) => texts.lists.format(items.map(String)),
  };
}

/** The text with the language's final period (meta.period), unless it already ends like a sentence. */
export const asSentence = (text: string) => (/[.!?…:。！？：।]$/.test(text.trim()) ? text.trim() : `${text.trim()}${current().messages.meta.period}`);

/** Messages joined as sentences, each with its final period (what the live regions say). */
export const joinSentences = (parts: readonly string[]) => parts.filter(Boolean).map(asSentence).join(current().messages.meta.sentenceGap);

/**
 * Messages shown as one text (docs/copy.md): a single one stays as it is,
 * without a final period; two or more become sentences, each with its period.
 */
export const sentences = (parts: readonly string[]) => {
  const list = parts.filter(Boolean);
  return list.length < 2 ? (list[0] ?? '') : joinSentences(list);
};

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

const keyName = (part: string) => {
  const name = lookup(current().messages, `keys.${part}`);
  return typeof name === 'string' ? name : part;
};

// Apple's order of the modifiers (Control, Option, Shift, Command).
const APPLE_MODIFIERS = ['Control', 'Alt', 'Shift', 'Mod'];

/**
 * A key or combination as it shows and as screen readers should say it. On
 * Apple devices the modifiers are symbols in Apple's order, written together
 * before the key («Mod+Shift+Z» → «⇧⌘Z», said «Shift+Comando+Z»; with a «+»
 * before a key with a name: «⇧+Av Pág»); elsewhere both are «Ctrl+Shift+Z».
 */
export function keyText(combo: string): { shown: string; spoken: string } {
  const parts = combo.split('+');
  if (!isMac()) {
    const shown = parts.map(keyName).join('+');
    return { shown, spoken: shown };
  }
  const modifiers = APPLE_MODIFIERS.filter((name) => parts.includes(name));
  const rest = parts.filter((part) => !APPLE_MODIFIERS.includes(part)).map(keyName).join('+');
  const symbols = modifiers.map((name) => keyName(`${name}Mac`)).join('');
  const spoken = [...modifiers.map((name) => keyName(`spoken.${name}Mac`)), rest].filter(Boolean).join('+');
  // Together with a key of one character («⇧⌘Z»); a «+» before a word («⇧+Espacio»).
  return { shown: [symbols, rest].filter(Boolean).join(rest.length > 1 ? '+' : ''), spoken };
}

/** Visible name of a key or combination («Mod+Shift+Z» → «Ctrl+Shift+Z», or «⇧⌘Z» on Apple devices). */
export const keyLabel = (combo: string) => keyText(combo).shown;
