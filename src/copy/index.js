// Textos de la interfaz. Todo lo que se ve o se anuncia sale de aquí:
//
//   t('clave.anidada', { n: 3, name: 'foto.jpg' })
//
// - `{param}` se reemplaza por params[param]; los números se formatean con la
//   configuración regional del idioma (coma decimal, a 0,1 como mucho).
// - `{app}` es siempre el nombre de la app (APP_NAME, en config.js) y `{mod}` la
//   tecla modificadora principal (Ctrl, o ⌘ en Mac).
// - Un valor puede ser un objeto de plurales ({ one, other, … }): se elige con
//   Intl.PluralRules según params.n.
//
// Para sumar otro idioma: un archivo hermano con las mismas claves (en.js) y
// elegirlo en `messages`. Las claves que falten se toman del español.
//
// El HTML estático usa atributos data-i18n (ver ATTRIBUTES): Vite los completa
// al servir y al compilar (fillHtml, en vite.config.js), así la página llega con
// los textos puestos; applyCopy repite lo mismo en el navegador (p. ej. para {mod}).

import { APP_NAME } from '../config.js';
import es from './es.js';

const fallback = es;
const messages = es;

/** Configuración regional de los números (coma decimal en español). */
export const numberLocale = messages.meta.numberLocale;

const pluralRules = new Intl.PluralRules(messages.meta.lang);
const numberFormat = new Intl.NumberFormat(messages.meta.numberLocale, { maximumFractionDigits: 1 });

/** Número para mostrar: «41,6». */
export const formatNumber = (value) => numberFormat.format(Math.round(value * 10) / 10 || 0);

const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');

const lookup = (source, key) => key.split('.').reduce((node, part) => node?.[part], source);
const find = (key) => lookup(messages, key) ?? lookup(fallback, key);

/** ¿Existe la clave? (p. ej. nombres de papel que solo algunos idiomas traducen). */
export const hasText = (key) => find(key) !== undefined;

/** Texto de la clave, con parámetros interpolados y el plural que corresponda. */
export function t(key, params = {}) {
  let value = find(key);
  if (value && typeof value === 'object') value = value[pluralRules.select(params.n ?? 0)] ?? value.other;
  if (typeof value !== 'string') throw new Error(`Falta el texto «${key}»`);
  return value.replace(/\{(\w+)\}/g, (match, name) => {
    if (name === 'app') return APP_NAME;
    if (name === 'mod') return find(isMac() ? 'keys.ModMac' : 'keys.Mod');
    if (!(name in params)) return match;
    const param = params[name];
    return typeof param === 'number' ? formatNumber(param) : String(param);
  });
}

const listFormat = new Intl.ListFormat(messages.meta.lang, { style: 'long', type: 'conjunction' });

/** Lista para una frase: «1, 2 y 3», «foto.jpg y plano.pdf». */
export const formatList = (items) => listFormat.format(items.map(String));

/** El texto con punto final (para unir mensajes sueltos al anunciarlos). */
export const asSentence = (text) => (/[.!?…:]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** Nombre visible de una tecla o combinación («Mod+Shift+Z» → «Ctrl+Shift+Z»). */
export const keyLabel = (combo) =>
  combo
    .split('+')
    .map((part) => find(`keys.${part === 'Mod' && isMac() ? 'ModMac' : part}`) ?? part)
    .join('+');

// ---------- HTML ----------

/** Atributo con la clave → dónde va el texto (null: el contenido de la etiqueta). */
const ATTRIBUTES = {
  'data-i18n': null,
  'data-i18n-label': 'aria-label',
  'data-i18n-tip': 'data-tip',
  'data-i18n-note': 'data-tip-note',
  'data-i18n-content': 'content',
};

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const parseParams = (json) => (json ? JSON.parse(json) : {});

/**
 * Completa los textos del HTML estático (en Node, desde vite.config.js). Los
 * etiquetas con data-i18n tienen que venir vacías: `<span data-i18n="x"></span>`.
 */
export function fillHtml(html) {
  return html.replace(/<([a-z][\w-]*)(\s(?:[^>]*?\s)?data-i18n[^>]*?)(\s*\/?)>(<\/\1>)?/gi, (tag, name, attrs, slash, close) => {
    const read = (attr) => attrs.match(new RegExp(`\\s${attr}="([^"]*)"`))?.[1];
    const params = parseParams(attrs.match(/\sdata-i18n-params='([^']*)'/)?.[1]);
    let extra = '';
    let text = null;
    for (const [source, target] of Object.entries(ATTRIBUTES)) {
      const key = read(source);
      if (!key) continue;
      if (target === null) text = escapeHtml(t(key, params));
      else extra += ` ${target}="${escapeHtml(t(key, params))}"`;
    }
    if (text !== null && close === undefined) throw new Error(`data-i18n en una etiqueta que no está vacía: ${tag}`);
    return `<${name}${attrs}${extra}${slash}>${text ?? ''}${close ?? ''}`;
  });
}

/** Lo mismo que fillHtml, sobre el DOM (al iniciar o si cambia el idioma). */
export function applyCopy(root = document) {
  const selector = Object.keys(ATTRIBUTES)
    .map((attr) => `[${attr}]`)
    .join(',');
  for (const el of root.querySelectorAll(selector)) {
    const params = parseParams(el.dataset.i18nParams);
    for (const [source, target] of Object.entries(ATTRIBUTES)) {
      const key = el.getAttribute(source);
      if (!key) continue;
      if (target === null) el.textContent = t(key, params);
      else el.setAttribute(target, t(key, params));
    }
  }
}
