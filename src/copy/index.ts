// Interface texts. Everything that is shown or announced comes from here:
//
//   t('nested.key', { n: 3, name: 'foto.jpg' })
//
// - `{param}` is replaced by params[param]; numbers are formatted with the
//   locale of the language (decimal comma, at most one decimal).
// - `{app}` is always the app name (APP_NAME, in config.ts) and `{mod}` the
//   main modifier key (Ctrl, or ⌘ on a Mac).
// - A value can be a plural object ({ one, other, … }) picked with
//   Intl.PluralRules from params.n; an optional `zero` is used for n = 0
//   (Spanish has no zero category of its own: «ya no entran más» instead of
//   «solo entran 0»).
//
// Another language: a sibling file with the same keys (en.ts) chosen in
// `messages`; missing keys fall back to Spanish.
//
// index.html has `{{key}}` placeholders for the few texts it carries itself
// (fillStaticCopy, from vite.config.ts); the rest is rendered by React.

import { APP_NAME } from '../config.ts';
import { isApplePlatform } from '../core/platform.js';
import es from './es.ts';

type Messages = typeof es;
type Plural = { zero?: string; one: string; other: string };
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

const isMac = () => typeof navigator !== 'undefined' && isApplePlatform(navigator);

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
    value = (count === 0 ? value.zero : undefined) ?? value[pluralRules.select(count)] ?? value.other;
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

const choiceFormat = new Intl.ListFormat(messages.meta.lang, { style: 'long', type: 'disjunction' });

/** Alternatives («R o Shift+R») as parts, in the language's order: each item and the words between them. */
export const choiceParts = (items: readonly string[]) => choiceFormat.formatToParts(items);

/** The text with the language's final period (meta.period), unless it already ends like a sentence. */
export const asSentence = (text: string) => (/[.!?…:。]$/.test(text.trim()) ? text.trim() : `${text.trim()}${messages.meta.period}`);

/** Messages joined as sentences, each with its final period (what the live regions say). */
export const joinSentences = (parts: readonly string[]) => parts.filter(Boolean).map(asSentence).join(messages.meta.sentenceGap);

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
  const name = find(`keys.${part}`);
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

// ---------- Static HTML ----------

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Fills the `{{key}}` placeholders of index.html with their texts (from
 * vite.config.ts), so the title, the description and the no-JavaScript
 * message come in the page itself.
 */
export const fillStaticCopy = (html: string) => html.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => escapeHtml(t(key as CopyKey)));
