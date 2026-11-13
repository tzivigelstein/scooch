// Panel «Propiedades»: sección Pieza (solo con selección) y secciones
// plegables Hoja, Distribución y Grilla, que recuerdan si están abiertas.
// Las longitudes se muestran y se cargan en la unidad elegida (lengthfield.js).

import { GRID_MIN, GRID_MAX, SECTIONS_STORAGE, CUSTOM_PAPER_STORAGE } from './config.js';
import { PAPERS, PAPER_GROUPS, CUSTOM_MIN, CUSTOM_MAX, customPaper, validateSide, matchPreset } from './papers.js';
import { gridPresets } from './units.js';
import { state, settings, assets, dims, selectedItem, commit, endEdit, render, setGrid, setAllowOverlap, sheetSize } from './store.js';
import { keepCenterInside } from './sheets.js';
import { keepCenter, fillSummary, printResolution } from './layout.js';
import { bindLength, showLength } from './lengthfield.js';
import { lengthText, sizeText, unitName, unitSymbol } from './measure.js';
import { icon } from './icons.js';
import { $, clamp, num, storageGet, storageSet } from './util.js';
import { t, numberLocale } from './copy/index.js';

let ui = {};

export function initPanels(actions) {
  ui = {
    // Pieza
    pieceEmpty: $('piece-empty'),
    pieceProps: $('piece-props'),
    pieceName: $('piece-name'),
    posX: $('pos-x'),
    posY: $('pos-y'),
    width: $('width'),
    height: $('height'),
    scale: $('scale'),
    slider: $('slider'),
    resolutionNote: $('resolution-note'),
    resolutionIcon: $('resolution-icon'),
    resolutionText: $('resolution-text'),
    rotationNote: $('rotation-note'),
    rotationAngle: $('rotation-angle'),
    actual: $('actual'),
    fit: $('piece-fit'),
    center: $('piece-center'),
    front: $('piece-front'),
    pageRow: $('page-row'),
    page: $('page'),
    fillDetails: $('fill-details'),
    fillSummary: $('fill-summary'),
    fillWarning: $('fill-warning'),
    fill: $('fill'),
    remove: $('piece-remove'),
    // Hoja
    paper: $('paper'),
    customPaper: $('custom-paper'),
    paperW: $('paper-w'),
    paperH: $('paper-h'),
    paperError: $('paper-error'),
    paperMatch: $('paper-match'),
    portrait: $('portrait'),
    landscape: $('landscape'),
    margin: $('margin'),
    marginUnit: $('margin-unit'),
    // Distribución
    gap: $('gap'),
    gapUnit: $('gap-unit'),
    rotate: $('allow-rotate'),
    allowOverlap: $('allow-overlap'),
    // Grilla
    gridShow: $('grid-show'),
    gridSize: $('grid-size'),
    gridChips: $('grid-chips'),
    gridSnap: $('grid-snap'),
  };

  setupSections();

  // Pieza
  const toScale = (item, v) => (v > 0 ? { scale: clamp(v, 1, 1000) } : null);
  bindItemNumber(ui.scale, 'scale', toScale);
  bindItemNumber(ui.slider, 'slider', toScale);
  const positive = (mm) => (mm > 0 ? null : t('props.positive'));
  // X e Y: puede salirse de la hoja, pero no más de la mitad (el centro queda adentro).
  const inside = (item, changes) => {
    const [w, h] = dims(item);
    const [W, H] = sheetSize();
    const spot = keepCenterInside({ x: changes.x ?? item.x, y: changes.y ?? item.y, w, h }, W, H);
    return 'x' in changes ? { x: spot.x } : { y: spot.y };
  };
  bindItemLength(ui.posX, 'x', (item) => item.x, (item, mm) => inside(item, { x: mm }));
  bindItemLength(ui.posY, 'y', (item) => item.y, (item, mm) => inside(item, { y: mm }));
  bindItemLength(ui.width, 'width', (item) => dims(item)[0], (item, mm) => scaleFor(item, mm, 0), positive);
  bindItemLength(ui.height, 'height', (item) => dims(item)[1], (item, mm) => scaleFor(item, mm, 1), positive);
  ui.actual.addEventListener('click', () =>
    actions.editSelected((item) => keepCenter(item, () => (item.scale = 100)), {
      announce: (item) => t('announce.actualSize', { size: itemSize(item) }),
    })
  );
  ui.fit.addEventListener('click', () => actions.fit());
  ui.center.addEventListener('click', () => actions.center());
  ui.front.addEventListener('click', () => {
    if (ui.front.getAttribute('aria-disabled') !== 'true') actions.front();
  });
  ui.page.addEventListener('change', () => actions.changePage(Number(ui.page.value)));
  ui.fill.addEventListener('click', actions.fill);
  ui.remove.addEventListener('click', (e) => actions.remove({ viaKeyboard: e.detail === 0 }));

  // Hoja
  ui.paper.addEventListener('change', () => {
    if (state.busy) return render();
    if (ui.paper.value === 'custom') {
      // El último personalizado (preferencia local) o, si no hay, el tamaño de ahora.
      const [W, H] = sheetSize();
      const saved = loadCustomPaper();
      const next = (saved && customPaper(saved.w, saved.h)) ?? customPaper(W, H);
      if (!next) return render();
      commit();
      state.paper = next.paper;
      state.landscape = next.landscape;
    } else {
      commit();
      state.paper = ui.paper.value;
    }
    actions.sheetChanged();
  });
  bindPaperSide(ui.paperW, 'w', actions);
  bindPaperSide(ui.paperH, 'h', actions);
  for (const radio of [ui.portrait, ui.landscape]) {
    radio.addEventListener('change', () => {
      if (radio.checked) actions.setOrientation(radio === ui.landscape);
    });
  }
  bindSheetLength(ui.margin, 'margin');

  // Distribución
  bindSheetLength(ui.gap, 'gap');
  ui.rotate.addEventListener('change', () => {
    settings.rotate = ui.rotate.checked;
    actions.settingsChanged?.();
    render();
  });
  ui.allowOverlap.addEventListener('change', () => {
    setAllowOverlap(ui.allowOverlap.checked);
    render();
  });

  // Grilla: preferencias de vista (se guardan, pero no entran en el historial).
  ui.gridShow.addEventListener('change', () => actions.setGridVisible(ui.gridShow.checked));
  ui.gridSnap.addEventListener('change', () => {
    setGrid({ snap: ui.gridSnap.checked });
    render();
  });
  ui.gridChips.addEventListener('change', (e) => {
    const chip = e.target.closest('input[name="grid-size"]');
    if (!chip?.checked) return;
    setGrid({ size: Number(chip.value) });
    render();
  });
  bindLength(ui.gridSize, {
    value: () => settings.grid.size,
    check: (mm) => (mm > 0 ? null : t('props.positive')),
    limit: (mm) => clamp(mm, GRID_MIN, GRID_MAX),
    apply: (mm) => {
      setGrid({ size: clamp(mm, GRID_MIN, GRID_MAX) });
      render();
    },
  });

  applyUnit();
}

// ---------- Unidad ----------

let shownUnit = null;

/**
 * Lo que depende de la unidad y no se redibuja solo: símbolos junto a los
 * campos, nombres accesibles, tamaños de grilla sugeridos y opciones de papel.
 */
function applyUnit() {
  shownUnit = settings.unit;
  const unit = unitName();
  for (const el of document.querySelectorAll('[data-unit]')) el.textContent = unitSymbol();
  const labels = [
    [ui.posX, 'props.xLabel'],
    [ui.posY, 'props.yLabel'],
    [ui.width, 'props.widthLabel'],
    [ui.height, 'props.heightLabel'],
    [ui.gridSize, 'props.gridCustom'],
    [ui.paperW, 'papers.widthLabel'],
    [ui.paperH, 'papers.heightLabel'],
  ];
  for (const [input, key] of labels) input.setAttribute('aria-label', t(key, { unit }));
  ui.marginUnit.textContent = t('props.marginUnit', { unit });
  ui.gapUnit.textContent = t('props.gapUnit', { unit });
  ui.gridChips.replaceChildren(
    ...gridPresets(settings.unit, { locale: numberLocale }).map((preset) => {
      const label = document.createElement('label');
      label.className = 'seg';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'grid-size';
      radio.value = String(preset.mm);
      const text = document.createElement('span');
      text.textContent = t('props.gridChip', { n: preset.label, unit: unitSymbol() });
      label.append(radio, text);
      return label;
    })
  );
  fillPaperOptions();
}

// ---------- Secciones plegables ----------

let sectionState = {};

function setupSections() {
  try {
    sectionState = JSON.parse(storageGet(SECTIONS_STORAGE) ?? '{}') ?? {};
  } catch {
    sectionState = {};
  }
  for (const section of document.querySelectorAll('.prop-section[data-section]')) {
    const name = section.dataset.section;
    const toggle = section.querySelector('.section-toggle');
    const apply = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      section.classList.toggle('is-collapsed', !open);
      $(toggle.getAttribute('aria-controls')).hidden = !open;
    };
    apply(sectionState[name] !== false);
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      apply(open);
      sectionState[name] = open;
      storageSet(SECTIONS_STORAGE, JSON.stringify(sectionState));
    });
  }
}

/** Abre una sección plegada (sin cambiar la preferencia guardada si ya estaba abierta). */
export function expandSection(name) {
  const toggle = document.querySelector(`.prop-section[data-section="${name}"] .section-toggle`);
  if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
}

/** Primer control de la sección Pieza (X) y de la sección Hoja (tamaño). */
export const firstPieceField = () => (ui.pieceProps.hidden ? null : ui.posX);
export const firstSheetField = () => ui.paper;

// ---------- Campos ----------

const itemSize = (item) => {
  const [w, h] = dims(item);
  return sizeText(w, h);
};

/** Input numérico de la pieza (escala): `patch(item, valor)` devuelve los cambios o null si no vale. */
function bindItemNumber(input, name, patch) {
  input.addEventListener('input', () => {
    const item = selectedItem();
    const value = parseFloat(input.value);
    if (!item || state.busy || !Number.isFinite(value)) return;
    const changes = patch(item, value);
    if (!changes) return;
    commit(`${name}:${item.id}`);
    Object.assign(item, changes);
    render();
  });
  input.addEventListener('change', () => {
    endEdit();
    render();
  });
}

// ¿Cambiaría algo? (Confirmar dos veces lo mismo no agrega pasos de deshacer.)
const differs = (target, changes) => Object.entries(changes).some(([key, value]) => target[key] !== value);

/** Longitud de la pieza: `get(item)` en mm y `patch(item, mm)` con los cambios (o null). */
function bindItemLength(input, name, get, patch, check) {
  bindLength(input, {
    value: () => {
      const item = selectedItem();
      return item ? get(item) : null;
    },
    check,
    busy: () => state.busy || !selectedItem(),
    apply: (mm, { final }) => {
      const item = selectedItem();
      const changes = item && patch(item, mm);
      if (changes && differs(item, changes)) {
        commit(`${name}:${item.id}`);
        Object.assign(item, changes);
      }
      if (final) endEdit();
      render();
    },
  });
}

/** Margen y separación: de 0 a 50 mm, en un solo paso de deshacer mientras se edita. */
function bindSheetLength(input, name) {
  const limit = (mm) => clamp(mm, 0, 50);
  bindLength(input, {
    value: () => state[name],
    limit,
    busy: () => state.busy,
    apply: (mm, { final }) => {
      const value = limit(mm);
      if (state[name] !== value) {
        commit(`sheet:${name}`);
        state[name] = value;
      }
      if (final) endEdit();
      render();
    },
  });
}

function scaleFor(item, value, axis) {
  const natural = dims({ ...item, scale: 100 })[axis];
  return value > 0 ? { scale: clamp((100 * value) / natural, 1, 1000) } : null;
}

// ---------- Papel ----------

/** Presets agrupados (<optgroup>) y, al final, «Personalizado». */
function fillPaperOptions() {
  const value = ui.paper.value;
  const groups = PAPER_GROUPS.map((id) => {
    const group = document.createElement('optgroup');
    group.label = t(`papers.groups.${id}`);
    group.append(
      ...PAPERS.filter((p) => p.group === id).map(
        (p) => new Option(t('papers.option', { paper: t(`papers.names.${p.id}`), size: sizeText(p.w, p.h) }), p.id)
      )
    );
    return group;
  });
  ui.paper.replaceChildren(...groups, new Option(t('papers.custom'), 'custom'));
  if (value) ui.paper.value = value;
}

function loadCustomPaper() {
  try {
    const saved = JSON.parse(storageGet(CUSTOM_PAPER_STORAGE) ?? 'null');
    return saved && Number.isFinite(saved.w) && Number.isFinite(saved.h) ? saved : null;
  } catch {
    return null;
  }
}

// Problema de un lado → clave del mensaje (papers.errors.*).
const PAPER_ERRORS = {
  w: { 'too-small': 'widthTooSmall', 'too-large': 'widthTooLarge' },
  h: { 'too-small': 'heightTooSmall', 'too-large': 'heightTooLarge' },
};

// El mensaje de error se asocia al campo solo mientras se ve (y mientras tanto
// no se dice con qué preset coincide: sería el tamaño anterior, no el escrito).
function showPaperError(input, text) {
  ui.paperError.hidden = !text;
  ui.paperError.textContent = text ?? '';
  if (text) ui.paperMatch.hidden = true;
  for (const field of [ui.paperW, ui.paperH]) {
    if (text && field === input) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    describePaperField(field);
  }
}

function describePaperField(field) {
  const ids = [];
  if (!ui.paperError.hidden && field.getAttribute('aria-invalid') === 'true') ids.push('paper-error');
  if (!ui.paperMatch.hidden) ids.push('paper-match');
  if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
  else field.removeAttribute('aria-describedby');
}

/**
 * Ancho o alto del papel personalizado: mientras se escribe, aplica lo que vale
 * y explica lo que no (fuera de 20–2000 mm o algo que no es un número); al
 * confirmar algo que no vale, vuelve al valor anterior y lo anuncia.
 */
function bindPaperSide(input, side, actions) {
  const current = () => sheetSize()[side === 'w' ? 0 : 1];
  bindLength(input, {
    value: current,
    busy: () => state.busy,
    check: (mm) => {
      const problem = validateSide(mm);
      return problem && t(`papers.errors.${PAPER_ERRORS[side][problem]}`, { min: lengthText(CUSTOM_MIN), max: lengthText(CUSTOM_MAX) });
    },
    limit: (mm) => clamp(mm, CUSTOM_MIN, CUSTOM_MAX),
    problem: (text) => showPaperError(input, text),
    unreadable: t(side === 'w' ? 'papers.errors.widthInvalid' : 'papers.errors.heightInvalid'),
    apply: (mm, { final }) => {
      const [W, H] = sheetSize();
      const w = side === 'w' ? mm : W;
      const h = side === 'h' ? mm : H;
      const next = customPaper(w, h);
      if (!next) return;
      const changed = typeof state.paper === 'string' || next.paper.w !== state.paper.w || next.paper.h !== state.paper.h || next.landscape !== state.landscape;
      if (changed) {
        commit('paper:custom');
        state.paper = next.paper;
        state.landscape = next.landscape;
        storageSet(CUSTOM_PAPER_STORAGE, JSON.stringify({ w, h }));
      }
      if (final) {
        endEdit();
        if (changed) return actions.sheetChanged();
      }
      render();
    },
  });
}

function renderPaper() {
  const custom = typeof state.paper !== 'string';
  ui.paper.value = custom ? 'custom' : state.paper;
  ui.customPaper.hidden = !custom;
  if (!custom) return;
  const [W, H] = sheetSize();
  for (const [input, value] of [
    [ui.paperW, W],
    [ui.paperH, H],
  ]) {
    if (document.activeElement === input) continue;
    showLength(input, value);
    if (input.getAttribute('aria-invalid') === 'true') showPaperError(input, null);
  }
  const match = matchPreset(W, H);
  const name = match && t(`papers.names.${match.id}`);
  const text = match ? t('papers.match', { paper: match.landscape ? t('sheet.landscapeName', { paper: name }) : name }) : '';
  ui.paperMatch.hidden = !match || !ui.paperError.hidden;
  if (ui.paperMatch.textContent !== text) ui.paperMatch.textContent = text;
  for (const field of [ui.paperW, ui.paperH]) describePaperField(field);
}

// ---------- Render ----------

// Mientras se carga algo, los controles se deshabilitan, salvo el que tiene el
// foco (deshabilitarlo lo haría perder; sus acciones ya se ignoran si está ocupado).
function setDisabled(el, disabled) {
  el.disabled = disabled && document.activeElement !== el;
}

// No pisa lo que el usuario está tipeando.
function setValue(input, value) {
  if (document.activeElement !== input) input.value = value;
}

/**
 * Redibuja el panel. Con `draft` (una copia del item durante un arrastre),
 * solo actualiza los valores de la pieza, en vivo.
 */
export function renderPanels(draft = null) {
  if (shownUnit !== settings.unit) applyUnit();
  const item = draft ?? selectedItem();
  if (!draft) renderSettings();
  ui.pieceEmpty.hidden = !!item;
  ui.pieceProps.hidden = !item;
  if (!item) return;
  const asset = assets.get(item.asset);
  const busy = state.busy;
  for (const el of [ui.scale, ui.slider, ui.width, ui.height, ui.posX, ui.posY, ui.actual, ui.page, ui.fill]) {
    setDisabled(el, busy);
  }
  const paged = asset.kind === 'pdf' && asset.pages > 1;
  ui.pieceName.textContent = paged ? t('props.pieceNamePage', { name: asset.name, page: asset.page }) : asset.name;
  ui.pieceName.dataset.tip = asset.name;
  const [w, h] = dims(item);
  showLength(ui.posX, item.x);
  showLength(ui.posY, item.y);
  showLength(ui.width, w);
  showLength(ui.height, h);
  setValue(ui.scale, num(item.scale));
  setValue(ui.slider, String(clamp(item.scale, 1, 200)));
  ui.slider.setAttribute('aria-valuetext', t('units.scale', { n: item.scale }));

  // Girada: ancho y alto son los que ocupa en la hoja (por eso aparecen intercambiados).
  ui.rotationNote.hidden = !item.r;
  ui.rotationAngle.textContent = t('props.rotated', { deg: item.r });
  renderResolution(item);
  for (const input of [ui.scale, ui.slider]) input.setAttribute('aria-describedby', 'resolution-note');
  for (const input of [ui.width, ui.height]) {
    input.setAttribute('aria-describedby', item.r ? 'resolution-note rotation-note' : 'resolution-note');
  }
  if (draft) return;

  ui.pageRow.hidden = asset.kind !== 'pdf';
  if (asset.kind === 'pdf') {
    fillPageOptions(asset.pages);
    ui.page.value = String(asset.page);
  }
  const summary = fillSummary(item);
  if (ui.fillSummary.textContent !== summary.text) ui.fillSummary.textContent = summary.text;
  if (ui.fillWarning && summary.warning && ui.fillWarning.textContent !== summary.warning) ui.fillWarning.textContent = summary.warning;
  ui.fill.disabled = busy || !summary.ok;
}

function renderSettings() {
  const busy = state.busy;
  for (const el of [ui.paper, ui.paperW, ui.paperH, ui.portrait, ui.landscape, ui.margin, ui.gap]) setDisabled(el, busy);
  renderPaper();
  ui.portrait.checked = !state.landscape;
  ui.landscape.checked = state.landscape;
  showLength(ui.margin, state.margin);
  showLength(ui.gap, state.gap);
  ui.rotate.checked = settings.rotate;
  ui.allowOverlap.checked = settings.allowOverlap;
  const grid = settings.grid;
  ui.gridShow.checked = grid.show;
  ui.gridSnap.checked = grid.snap;
  showLength(ui.gridSize, grid.size);
  for (const chip of ui.gridChips.querySelectorAll('input')) chip.checked = Math.abs(Number(chip.value) - grid.size) < 1e-6;
}

/** Estado de «Traer al frente»: deshabilitado (pero enfocable y explicado) si no pisa a nadie. */
export function setFrontEnabled(enabled) {
  ui.front.setAttribute('aria-disabled', String(!enabled));
  ui.front.dataset.tip = t(enabled ? 'props.front' : 'props.frontDisabled');
}

// Ícono y aviso (clave en props.resolution) de cada nivel de resolución.
const QUALITY = {
  vector: { icon: 'circle-check', note: null },
  good: { icon: 'circle-check', note: null },
  ok: { icon: 'info', note: 'ok' },
  low: { icon: 'triangle-alert', note: 'low' },
};

function renderResolution(item) {
  const res = printResolution(item);
  const level = res.vector ? 'vector' : res.level;
  const note = QUALITY[level].note;
  const printsAt = res.vector ? '' : t('props.resolution.printsAt', { ppp: res.ppp });
  const text = res.vector
    ? t('props.resolution.vector')
    : note
      ? t('props.resolution.withNote', { text: printsAt, note: t(`props.resolution.${note}`) })
      : printsAt;
  if (ui.resolutionNote.dataset.level !== level) {
    ui.resolutionNote.dataset.level = level;
    ui.resolutionIcon.innerHTML = icon(QUALITY[level].icon);
  }
  if (ui.resolutionText.textContent !== text) ui.resolutionText.textContent = text;
}

function fillPageOptions(total) {
  if (ui.page.options.length === total && ui.page.dataset.total === String(total)) return;
  ui.page.dataset.total = String(total);
  ui.page.replaceChildren(
    ...Array.from({ length: total }, (_, i) => new Option(t('props.pageOption', { n: i + 1, total }), String(i + 1)))
  );
}
