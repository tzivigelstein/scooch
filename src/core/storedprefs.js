// The shapes this browser keeps in localStorage that are more than one value:
// reading them (tolerant: what is missing or can't be read takes its default)
// and what gets written. Pure module (no DOM, no storage).
//
// RULE: like project documents, a shape that was ever written is frozen. A
// change is a new `v` with its reading of the previous ones here, and a fixture
// in tests/fixtures/storage/ that tests/core/storedprefs.test.js reads.

import { ZOOM_MAX, ZOOM_MIN } from './zoom.js';

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
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

export const COUNTED_MAX = 50;

export function parseSavings(raw) {
  const saved = isRecord(raw) ? raw : {};
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const counted = saved.v === 2 && Array.isArray(saved.counted) ? saved.counted.filter((key) => typeof key === 'string' && key).slice(-COUNTED_MAX) : [];
  return { sheets: count(saved.sheets), turn: count(saved.turn), counted };
}

export const serializeSavings = ({ sheets, turn, counted }) => ({ v: 2, sheets, turn, counted: counted.slice(-COUNTED_MAX) });
