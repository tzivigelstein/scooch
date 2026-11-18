// The shapes this browser keeps in localStorage that are more than one value:
// reading them (tolerant: what is missing or can't be read takes its default)
// and what gets written. Pure module (no DOM, no storage).
//
// RULE: like project documents, a shape that was ever written is frozen. A
// change is a new `v` with its reading of the previous ones here, and a fixture
// in tests/fixtures/storage/ that tests/core/storedprefs.test.js reads.

import { LANGUAGES } from './language.js';
import { MILESTONES } from './savings.js';
import { isRecord } from './util.js';
import { ZOOM_MAX, ZOOM_MIN } from './zoom.js';

const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

// ---------- View preferences (scooch:view-preferences) ----------
//
// Version 1: {v: 1, zoomMode: 'fit' | 'width' | 'manual', zoomPct, alignTo:
// 'selection' | 'sheet', distribute: 'gap' | 'even'}. zoomPct is the zoom in
// percent, used only when zoomMode is 'manual'.

export const VIEW_DEFAULTS = Object.freeze({ zoomMode: 'fit', zoomPct: 100, alignTo: 'selection', distribute: 'gap' });

export function parseViewPrefs(raw) {
  const saved = isRecord(raw) ? raw : {};
  const pct = Number(saved.zoomPct);
  return {
    zoomMode: oneOf(saved.zoomMode, ['fit', 'width', 'manual'], VIEW_DEFAULTS.zoomMode),
    zoomPct: Number.isFinite(pct) && pct > 0 ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pct)) : VIEW_DEFAULTS.zoomPct,
    alignTo: oneOf(saved.alignTo, ['selection', 'sheet'], VIEW_DEFAULTS.alignTo),
    distribute: oneOf(saved.distribute, ['gap', 'even'], VIEW_DEFAULTS.distribute),
  };
}

export const serializeViewPrefs = ({ zoomMode, zoomPct, alignTo, distribute }) => ({ v: 1, zoomMode, zoomPct: Math.round(zoomPct * 100) / 100, alignTo, distribute });

// ---------- Printing (scooch:print-preferences) ----------
//
// Version 1: {v: 1, tip: boolean, summary: boolean}: whether the advice
// shows before printing or downloading, and the summary after (both on by default).

export function parsePrintPrefs(raw) {
  const saved = isRecord(raw) ? raw : {};
  return { tip: saved.tip !== false, summary: saved.summary !== false };
}

export const serializePrintPrefs = ({ tip, summary }) => ({ v: 1, tip, summary });

// ---------- Theme (scooch:theme-preference) ----------
//
// Version 1: {v: 1, theme: 'auto' | 'light' | 'dark'}; 'auto' follows the
// system's. The script in index.html reads it too, before the first paint.

export const THEMES = Object.freeze(['auto', 'light', 'dark']);

export function parseThemePref(raw) {
  const saved = isRecord(raw) ? raw : {};
  return { theme: oneOf(saved.theme, THEMES, 'auto') };
}

export const serializeThemePref = ({ theme }) => ({ v: 1, theme });

/** The theme the page shows: the chosen one, or the system's on 'auto'. */
export const resolveTheme = (theme, systemDark) => (theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme);

// ---------- Language (scooch:language-preference) ----------
//
// Version 1: {v: 1, language: 'auto' | 'es' | 'en' | 'zh-Hans' | 'hi' | 'fr'};
// 'auto' follows the browser's languages (core/language.js). The script in
// index.html reads it too, before the first paint.

export const LANGUAGE_CHOICES = Object.freeze(['auto', ...LANGUAGES]);

export function parseLanguagePref(raw) {
  const saved = isRecord(raw) ? raw : {};
  return { language: oneOf(saved.language, LANGUAGE_CHOICES, 'auto') };
}

export const serializeLanguagePref = ({ language }) => ({ v: 1, language });

// ---------- Panel sections (scooch:panel-sections) ----------
//
// Version 1 (no `v`): {sheet?, arrange?, cuts?, grid?: boolean}, false when
// that section is collapsed (missing: open).
// Version 2: {v: 2, sheet?, arrange?, cuts?, grid?, cutOptions?: boolean}:
// cutOptions is the open «Más opciones» of the cut lines (missing: closed).

export const SECTION_NAMES = Object.freeze(['sheet', 'arrange', 'cuts', 'grid']);

export function parseSections(raw) {
  const saved = isRecord(raw) ? raw : {};
  const sections = {};
  for (const name of SECTION_NAMES) if (typeof saved[name] === 'boolean') sections[name] = saved[name];
  return { sections, cutOptions: saved.v === 2 && saved.cutOptions === true };
}

export const serializeSections = ({ sections, cutOptions }) => {
  const out = { v: 2 };
  for (const name of SECTION_NAMES) if (typeof sections[name] === 'boolean') out[name] = sections[name];
  if (cutOptions) out.cutOptions = true;
  return out;
};

// ---------- Sheets saved (scooch:savings) ----------
//
// Version 1: {v: 1, sheets, turn}: the sheets saved so far on this device
// and whose turn the next equivalent is.
// Version 2: {v: 2, sheets, turn, counted}: also the keys of the last PDFs
// that added to the total (core/savings.js pdfKey, the newest last, at most
// COUNTED_MAX), so the same PDF doesn't count twice. Version 1 read as none.
// Version 3: {v: 3, sheets, turn, counted, pending, milestone}: also the last
// print, whose sheets aren't in the total until it settles ({key, sheets}, or
// null), and a milestone the total reached that no summary has shown yet (or
// null). Versions 1 and 2 read as neither.

export const COUNTED_MAX = 50;

const isKey = (key) => typeof key === 'string' && key !== '';

export function parseSavings(raw) {
  const saved = isRecord(raw) ? raw : {};
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const counted = (saved.v === 2 || saved.v === 3) && Array.isArray(saved.counted) ? saved.counted.filter(isKey).slice(-COUNTED_MAX) : [];
  const v3 = saved.v === 3;
  const pending = v3 && isRecord(saved.pending) && isKey(saved.pending.key) && count(saved.pending.sheets) > 0 ? { key: saved.pending.key, sheets: saved.pending.sheets } : null;
  const milestone = v3 && MILESTONES.includes(saved.milestone) ? saved.milestone : null;
  return { sheets: count(saved.sheets), turn: count(saved.turn), counted, pending, milestone };
}

export const serializeSavings = ({ sheets, turn, counted, pending, milestone }) => ({ v: 3, sheets, turn, counted: counted.slice(-COUNTED_MAX), pending, milestone });

// ---------- Command palette (scooch:palette-recents) ----------
//
// Version 1: {v: 1, ids: string[]}: the commands last run from the palette,
// the newest first, at most RECENT_MAX (ids of state/commands.ts; one the app
// no longer has is left out when the palette shows them).

export const RECENT_MAX = 5;

export function parseRecents(raw) {
  const saved = isRecord(raw) ? raw : {};
  const ids = Array.isArray(saved.ids) ? saved.ids.filter(isKey) : [];
  return { ids: [...new Set(ids)].slice(0, RECENT_MAX) };
}

export const serializeRecents = ({ ids }) => ({ v: 1, ids: ids.slice(0, RECENT_MAX) });

/** The recent ids with `id` first (once), at most RECENT_MAX. */
export const withRecent = (ids, id) => [id, ...ids.filter((other) => other !== id)].slice(0, RECENT_MAX);

// ---------- Usage tips (scooch:usage-tips) ----------
//
// Version 1: {v: 1, on: boolean, dismissed: string[], known: string[],
// counts: {[tip id]: number}}: whether tips show (on by default), the topics
// with «No volver a mostrar», the topics whose fast way was already used, and
// the counts kept across sessions (core/tips.js). Each list or map has at most
// TIPS_MAX entries.

export const TIPS_MAX = 50;

export function parseTipPrefs(raw) {
  const saved = isRecord(raw) ? raw : {};
  const topics = (list) => (Array.isArray(list) ? [...new Set(list.filter(isKey))].slice(0, TIPS_MAX) : []);
  const counts = isRecord(saved.counts)
    ? Object.fromEntries(
        Object.entries(saved.counts)
          .filter(([key, n]) => key !== '' && Number.isInteger(n) && n > 0)
          .slice(0, TIPS_MAX)
      )
    : {};
  return { on: saved.on !== false, dismissed: topics(saved.dismissed), known: topics(saved.known), counts };
}

export const serializeTipPrefs = ({ on, dismissed, known, counts }) => ({
  v: 1,
  on,
  dismissed: dismissed.slice(0, TIPS_MAX),
  known: known.slice(0, TIPS_MAX),
  counts: Object.fromEntries(Object.entries(counts).slice(0, TIPS_MAX)),
});
