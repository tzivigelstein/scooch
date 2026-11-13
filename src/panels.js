// Panel «Propiedades»: sección Pieza (solo con selección) y secciones
// plegables Hoja, Acomodo y Grilla, que recuerdan si están abiertas.

import { PAPERS, GRID_MIN, GRID_MAX, SECTIONS_STORAGE } from './config.js';
import { state, settings, assets, dims, selectedItem, commit, endEdit, render, setGrid, setAllowOverlap } from './store.js';
import { keepCenter, fillSummary, printResolution } from './layout.js';
import { icon } from './icons.js';
import { $, clamp, num, storageGet, storageSet } from './util.js';
import { t, hasText } from './copy/index.js';

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
    fill: $('fill'),
    remove: $('piece-remove'),
    // Hoja
    paper: $('paper'),
    portrait: $('portrait'),
    landscape: $('landscape'),
    margin: $('margin'),
    // Acomodo
    gap: $('gap'),
    rotate: $('allow-rotate'),
    allowOverlap: $('allow-overlap'),
    // Grilla
    gridShow: $('grid-show'),
    gridSize: $('grid-size'),
    gridChips: [...document.querySelectorAll('input[name="grid-size"]')],
    gridSnap: $('grid-snap'),
  };

  setupSections();

  // Pieza
  const toScale = (item, v) => (v > 0 ? { scale: clamp(v, 1, 1000) } : null);
  bindItemNumber(ui.scale, 'scale', toScale);
  bindItemNumber(ui.slider, 'slider', toScale);
  bindItemNumber(ui.width, 'width', (item, v) => scaleFor(item, v, 0));
  bindItemNumber(ui.height, 'height', (item, v) => scaleFor(item, v, 1));
  bindItemNumber(ui.posX, 'x', (item, v) => ({ x: v }));
  bindItemNumber(ui.posY, 'y', (item, v) => ({ y: v }));
  ui.actual.addEventListener('click', () =>
    actions.editSelected((item) => keepCenter(item, () => (item.scale = 100)), {
      announce: (item) => t('announce.actualSize', { size: sizeText(item) }),
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
  ui.paper.replaceChildren(...PAPERS.map(([name, w, h]) => new Option(t('sheet.paperOption', { paper: paperLabel(name), w, h }), name)));
  ui.paper.addEventListener('change', () => {
    if (state.busy) return render();
    commit();
    state.paper = ui.paper.value;
    actions.sheetChanged();
  });
  for (const radio of [ui.portrait, ui.landscape]) {
    radio.addEventListener('change', () => {
      if (radio.checked) actions.setOrientation(radio === ui.landscape);
    });
  }
  bindSheetNumber(ui.margin, 'margin');

  // Acomodo
  bindSheetNumber(ui.gap, 'gap');
  ui.rotate.addEventListener('change', () => {
    settings.rotate = ui.rotate.checked;
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
  for (const chip of ui.gridChips) {
    chip.addEventListener('change', () => {
      if (!chip.checked) return;
      setGrid({ size: Number(chip.value) });
      render();
    });
  }
  ui.gridSize.addEventListener('input', () => {
    const value = parseFloat(ui.gridSize.value);
    if (!Number.isFinite(value) || value <= 0) return;
    setGrid({ size: clamp(value, GRID_MIN, GRID_MAX) });
    render();
  });
  ui.gridSize.addEventListener('change', () => render());
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

const sizeText = (item) => {
  const [w, h] = dims(item);
  return t('units.size', { w, h });
};

/** Nombre visible de un papel (algunos se traducen: Carta, Oficio). */
const paperLabel = (name) => (hasText(`sheet.papers.${name}`) ? t(`sheet.papers.${name}`) : name);

/** Input numérico de la pieza: `patch(item, valor)` devuelve los cambios o null si no vale. */
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

function bindSheetNumber(input, name) {
  input.addEventListener('input', () => {
    const value = parseFloat(input.value);
    if (state.busy || !Number.isFinite(value)) return;
    commit(`sheet:${name}`);
    state[name] = clamp(value, 0, 50);
    render();
  });
  input.addEventListener('change', () => {
    endEdit();
    render();
  });
}

function scaleFor(item, value, axis) {
  const natural = dims({ ...item, scale: 100 })[axis];
  return value > 0 ? { scale: clamp((100 * value) / natural, 1, 1000) } : null;
}

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
  const paged = asset.kind === 'pdf' && asset.pdf?.numPages > 1;
  ui.pieceName.textContent = paged ? t('props.pieceNamePage', { name: asset.name, page: asset.page }) : asset.name;
  ui.pieceName.dataset.tip = asset.name;
  const [w, h] = dims(item);
  setValue(ui.posX, num(item.x));
  setValue(ui.posY, num(item.y));
  setValue(ui.width, num(w));
  setValue(ui.height, num(h));
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
    fillPageOptions(asset.pdf.numPages);
    ui.page.value = String(asset.page);
  }
  const summary = fillSummary(item);
  if (ui.fillSummary.textContent !== summary.text) ui.fillSummary.textContent = summary.text;
  ui.fill.disabled = busy || !summary.ok;
}

function renderSettings() {
  const busy = state.busy;
  for (const el of [ui.paper, ui.portrait, ui.landscape, ui.margin, ui.gap]) setDisabled(el, busy);
  ui.paper.value = state.paper;
  ui.portrait.checked = !state.landscape;
  ui.landscape.checked = state.landscape;
  setValue(ui.margin, num(state.margin));
  setValue(ui.gap, num(state.gap));
  ui.rotate.checked = settings.rotate;
  ui.allowOverlap.checked = settings.allowOverlap;
  const grid = settings.grid;
  ui.gridShow.checked = grid.show;
  ui.gridSnap.checked = grid.snap;
  setValue(ui.gridSize, num(grid.size));
  for (const chip of ui.gridChips) chip.checked = Number(chip.value) === grid.size;
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
