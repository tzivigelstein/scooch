// Acciones sobre la selección cuando hay varias piezas elegidas (y alinear,
// que también sirve con una sola): mover, girar, escalar, alinear, distribuir,
// duplicar y quitar, cada una en un solo paso de deshacer.
//
// Este módulo solo une las piezas: lee el estado, le pide el plan a group.js
// (donde están todas las reglas, sin DOM y con pruebas), lo aplica con un paso
// de deshacer y lo anuncia; si no vale, lo explica en el aviso sin cambiar
// nada. Reglas (en tándem con «Imán» y «Permitir superposición»), ver group.js:
// - Cada subgrupo (las elegidas de una hoja) se transforma dentro de su hoja.
// - Lo incremental (flechas, + y −, el tirador, arrastrar) se acota, como con
//   una pieza: se frena al tocar a otra o al llegar al límite; las flechas
//   saltan lo que estorba; al soltar sobre otra, el bloque va al lugar libre
//   más cercano o vuelve. Lo que se pide de una vez (alinear, distribuir,
//   girar, escribir una medida) se aplica entero o no se aplica.
// - El centro de cada pieza queda en su hoja: mover, girar y escalar corren el
//   subgrupo lo justo; alinear, distribuir y los campos se rechazan si alguna
//   saldría.
// - La escala de cada pieza queda entre 1 % y 1000 %: el factor del grupo se
//   acota para que ninguna pase el límite (o se rechaza, si se escribió).
// - Con el imán, alinear, distribuir y arrastrar dejan el bloque en la grilla
//   (en el eje que cambió), sin cambiar las distancias internas.

import { MAX_ITEMS } from './config.ts';
import {
  state,
  settings,
  assets,
  view,
  area,
  boxOf,
  commit,
  endEdit,
  render,
  findItem,
  selectedItems,
  primaryItem,
  setSelection,
  itemsOn,
  currentSheet,
  sheetIndex,
  setAllowOverlap,
  cancelEdit,
} from './store.js';
import {
  groupBounds,
  planNudge,
  planMoveTo,
  scaleBounds,
  planScale,
  planScaleBy,
  planResizeTo,
  planCommonScale,
  planRotate,
  planAlign,
  planDistribute,
  canDistribute as canDistributeIn,
  distributeNeeds as needsFor,
  planDrag as planDragIn,
  planDrop,
  toggled,
  touchedSelection,
  selectAllTarget,
  neighborAfterRemoval,
  copiesAllowed,
  sameSource,
  withPrimaryLast,
} from './core/group.js';
import { duplicatePieces } from './layout.js';
import { lengthText, sizeText } from './measure.js';
import { say } from './notice.js';
import { announce } from './live.js';
import { animateNext } from './sheetview.js';
import { fine } from './util.js';
import { t } from './copy/index.ts';

/** Preferencias de la sección (vista, fuera del historial). */
export const groupPrefs = { alignTo: 'selection', distribute: 'gap' };

const ids = () => new Set(state.selection);
const boxes = () => state.items.map(boxOf);
const scales = () => selectedItems().map((item) => item.scale);
const sheetOf = (sheet) => sheetIndex(sheet) + 1;

// Lo que los planes necesitan saber de la hoja y de los ajustes.
function options() {
  const { W, H } = area();
  return { W, H, allowOverlap: settings.allowOverlap, round: fine, snapStep: settings.grid.snap ? settings.grid.size : 0 };
}

// ---------- Aplicar o explicar ----------

/** Aplica las posiciones de un plan y, con `patch(item)`, el resto de los cambios. */
function apply(rects, patch = null, key = null) {
  commit(key);
  for (const [id, r] of rects) {
    const item = findItem(id);
    patch?.(item);
    item.x = r.x;
    item.y = r.y;
  }
}

/**
 * No se aplicó nada: el aviso dice por qué y, si fue por superposición,
 * ofrece permitirla y volver a intentarlo.
 */
function refuse(plan, action, retry) {
  if (plan.reason === 'limit') return say(t('notices.scaleLimit'), { warn: true });
  const what = t(`notices.groupActions.${action}`);
  if (plan.reason === 'overlap') {
    return say(t('notices.wouldOverlap', { action: what }), {
      warn: true,
      action: {
        label: t('props.overlap'),
        run: () => {
          setAllowOverlap(true);
          retry();
        },
      },
    });
  }
  say(t('notices.wouldLeave', { action: what }), { warn: true });
}

// Edición continua de un campo: lo que vale se aplica (un paso de deshacer
// para toda la edición); si al confirmar no vale, vuelve a como estaba.
function editOrRefuse(plan, patch, key, final, action, retry) {
  if (plan.ok) {
    if (plan.changed) apply(plan.rects, patch, key);
    if (final) endEdit();
    render();
    return true;
  }
  if (final) {
    cancelEdit(key);
    render();
    refuse(plan, action, retry);
  }
  return false;
}

// ---------- Selección ----------

/** Anuncia cuántas hay elegidas. */
export const announceCount = () => announce(t('announce.selectedCount', { n: state.selection.length }), { key: 'selection', delay: 200 });

/**
 * Agrega o quita una pieza de la selección (Shift o Ctrl + clic, Shift+Espacio).
 * Con `pinFirst`, si es la única elegida porque se enfocó, en lugar de quitarla
 * la fija (así se puede seguir con Tab a otra y agregarla). Devuelve si quedó elegida.
 */
export function toggleInSelection(id, { pinFirst = false } = {}) {
  if (pinFirst && !view.pinned && state.selection.length === 1 && state.selection[0] === id) {
    view.pinned = true;
    render();
    announce(t('announce.selectionPinned'));
    return true;
  }
  const { selection, on } = toggled(state.selection, id);
  setSelection(selection, { pinned: true });
  const primary = primaryItem();
  if (primary) view.sheet = primary.sheet;
  render();
  announceCount();
  return on;
}

/** Recuadro: las que toca (sumadas a las que había, con Shift o Ctrl). */
export function selectTouched(touched, additive) {
  setSelection(touchedSelection(state.selection, touched, additive), { pinned: true });
  render();
  announceCount();
}

/** Ctrl+A: todas las de la hoja actual; si ya estaban todas, las de todo el documento. */
export function selectAll() {
  const sheet = currentSheet();
  const onSheet = itemsOn(sheet).map((item) => item.id);
  const { selection, everything } = selectAllTarget(
    state.selection,
    onSheet,
    state.items.map((item) => item.id)
  );
  if (!selection.length) return announce(t('announce.noPieces'));
  setSelection(selection, { pinned: true });
  render();
  announce(everything ? t('announce.selectedAll', { n: selection.length }) : t('announce.selectedSheet', { n: selection.length, i: sheetOf(sheet) }));
}

/**
 * «Seleccionar iguales»: todas las piezas del documento que vienen del mismo
 * archivo de origen que alguna de las elegidas (ver group.sameSource: las
 * páginas de un mismo PDF cuentan como iguales; el recorte, la escala, el giro
 * y la página no importan).
 */
export function selectSame() {
  if (!state.selection.length) return announce(t('announce.needSelection'));
  const items = state.items.map((item) => ({ id: item.id, src: assets.get(item.asset).src }));
  const same = sameSource(items, ids());
  setSelection(withPrimaryLast(same, state.selection.at(-1)), { pinned: true });
  render();
  const sheets = new Set(selectedItems().map((item) => item.sheet)).size;
  announce(sheets > 1 ? t('announce.selectedSameSheets', { n: same.length, sheets }) : t('announce.selectedSame', { n: same.length }));
}

// ---------- Mover ----------

/** Flechas: mueve el grupo; si chocaría, salta lo que estorba (como una pieza). */
export function nudgeGroup(dx, dy) {
  const { plan, jumped } = planNudge(boxes(), ids(), dx, dy, options());
  const primary = primaryItem();
  if (!plan.ok || !plan.changed) return announcePosition(primary);
  apply(plan.rects, null, `nudge:${state.selection.join(',')}`);
  render();
  if (jumped.length) {
    const names = jumped.map((b) => assets.get(findItem(b.id)?.asset)?.name ?? t('pieces.other'));
    announce(t('announce.jumped', { names: names.join(', ') }));
  }
  announcePosition(primary);
}

function announcePosition(primary) {
  const box = groupBounds(boxes(), ids()).get(primary.sheet);
  if (box) announce(t('announce.position', { x: lengthText(box.x), y: lengthText(box.y) }), { key: 'move', delay: 600 });
}

/** Arrastre del grupo: ver group.planDrag. */
export function planDrag(dx, dy, target = null, offsetY = 0) {
  return planDragIn(boxes(), ids(), dx, dy, { ...options(), target, offsetY });
}

/**
 * Suelta el grupo (`drag`: el último planDrag) y lo aplica en un paso de
 * deshacer. Devuelve 'moved', 'moved-aside', 'reverted' o null (no cambió nada).
 */
export function dropGroup(drag, target = null) {
  const { result, rects } = planDrop(drag, ids(), options());
  if (!rects) return result;
  const changed = [...rects].some(([id, r]) => {
    const item = findItem(id);
    return r.x !== item.x || r.y !== item.y || (target !== null && item.sheet !== target);
  });
  if (!changed) return null;
  apply(rects, target !== null ? (item) => (item.sheet = target) : null);
  return result;
}

/**
 * Campos X e Y con varias: la caja del grupo en la hoja de la principal pasa a
 * (x, y); los otros subgrupos se corren lo mismo. Con `final`, si no vale,
 * vuelve a como estaba antes de editar y lo explica.
 */
export function moveGroupTo(axis, mm, { final = false } = {}) {
  const key = `group-${axis}`;
  const plan = planMoveTo(boxes(), ids(), primaryItem().sheet, axis, mm, options());
  // Lo que ya está (también el «change» que llega al salir del campo): nada que hacer.
  if (!plan) {
    if (final) endEdit();
    return;
  }
  editOrRefuse(plan, null, key, final, 'move', () => moveGroupTo(axis, mm, { final: true }));
}

// ---------- Girar ----------

/** Gira el grupo 90° alrededor del centro de su caja (cada subgrupo en su hoja). */
export function rotateSelection(dir) {
  const { plan, dr } = planRotate(boxes(), ids(), dir, options());
  if (!plan.ok) return refuse(plan, 'rotate', () => rotateSelection(dir));
  apply(plan.rects, (item) => (item.r = (item.r + dr) % 360));
  animateNext();
  render();
  announce(t('announce.groupRotated', { n: plan.rects.size, dir: t(dir > 0 ? 'announce.toRight' : 'announce.toLeft') }));
  return true;
}

// ---------- Escalar ----------

/** Factores posibles para escalar todo el grupo (tirador: desde la esquina de cada parte). */
export const groupScaleBounds = (anchor = 'center') => scaleBounds(boxes(), ids(), scales(), anchor, options());

/** Aplica un factor ya acotado (tirador). */
export function applyScale(k, anchor = 'top-left') {
  const plan = planScale(boxes(), ids(), k, anchor, options());
  if (!plan.ok || !plan.changed) return false;
  apply(plan.rects, (item) => (item.scale = item.scale * k));
  return true;
}

/** + y −: agranda o reduce el grupo desde el centro de su caja (ver group.planScaleBy). */
export function scaleSelectionBy(delta) {
  const result = planScaleBy(boxes(), ids(), scales(), primaryItem().scale, delta, options());
  if (!result) return announce(t(delta > 0 ? 'announce.noRoomGroup' : 'announce.noSmallerGroup'), { key: 'scale' });
  apply(result.plan.rects, (item) => (item.scale = item.scale * result.k), `scale-key:${state.selection.join(',')}`);
  render();
  const box = groupBounds(boxes(), ids()).get(primaryItem().sheet);
  announce(t('announce.groupScaled', { n: state.selection.length, size: sizeText(box.w, box.h) }), { key: 'scale', delay: 600 });
}

/**
 * Campos de ancho y alto con varias: la caja del grupo (en la hoja de la
 * principal) pasa a medir `mm`, en proporción, desde su esquina superior
 * izquierda; los otros subgrupos cambian igual.
 */
export function resizeGroupTo(axis, mm, { final = false } = {}) {
  const key = `group-${axis}`;
  const result = planResizeTo(boxes(), ids(), primaryItem().sheet, axis, mm, scales(), options());
  if (!result) {
    if (final) endEdit();
    return;
  }
  editOrRefuse(result.plan, (item) => (item.scale = item.scale * result.k), key, final, 'scale', () => resizeGroupTo(axis, mm, { final: true }));
}

/**
 * Escala común (campo, deslizador y «100 %»): todas pasan a `value` %, cada
 * una desde su propio centro.
 */
export function setSelectionScale(value, { final = false, key = 'group-scale' } = {}) {
  const current = new Map(selectedItems().map((item) => [item.id, item.scale]));
  const { plan, scale } = planCommonScale(boxes(), ids(), current, value, options());
  return editOrRefuse(plan, (item) => (item.scale = scale), key, final, 'scale', () => setSelectionScale(value, { final: true, key }));
}

// ---------- Alinear y distribuir ----------

/** ¿Alinear va contra el área útil? (con una sola pieza, siempre) */
export const alignsToSheet = () => state.selection.length === 1 || groupPrefs.alignTo === 'sheet';

/**
 * Alinea: con 2 o más, contra la caja de la selección (de cada hoja) o, con
 * «Alinear a: hoja», contra el área útil; con una sola, contra el área útil.
 */
export function alignSelection(mode) {
  const n = state.selection.length;
  if (!n || state.busy) return false;
  const toSheet = alignsToSheet();
  const { m, aw, ah } = area();
  if (toSheet && (aw <= 0 || ah <= 0)) return say(t('errors.marginTooBig'), { warn: true });
  const plan = planAlign(boxes(), ids(), mode, { ...options(), area: toSheet ? { x: m, y: m, w: aw, h: ah } : null });
  if (!plan.ok) return refuse(plan, 'align', () => alignSelection(mode));
  if (!plan.changed) return announce(t('announce.alignedAlready', { n }));
  apply(plan.rects);
  animateNext();
  render();
  announce(t(toSheet ? 'announce.alignedSheet' : 'announce.aligned', { n, how: t(`announce.alignHow.${mode}`) }));
  return true;
}

/** Cuántas hacen falta (en una misma hoja) para distribuir con el modo actual. */
export const distributeNeeds = () => needsFor(groupPrefs.distribute);

/** ¿Hay alguna hoja con suficientes elegidas para distribuir? */
export const canDistribute = () => canDistributeIn(boxes(), ids(), groupPrefs.distribute);

/**
 * Distribuye en `axis` ('x' | 'y'): con la «Separación» de Distribución entre
 * consecutivas (la primera queda donde está) o repartidas parejo entre la
 * primera y la última. Cada hoja por su lado.
 */
export function distributeSelection(axis) {
  if (!state.selection.length || state.busy) return false;
  const mode = groupPrefs.distribute;
  if (!canDistribute()) return announce(t(needsFor(mode) === 2 ? 'props.distributeNeedTwo' : 'props.distributeNeedThree'));
  const plan = planDistribute(boxes(), ids(), axis, { ...options(), mode, gap: state.gap });
  if (!plan.ok) return refuse(plan, 'distribute', () => distributeSelection(axis));
  const n = state.selection.length;
  if (!plan.changed) return announce(t('announce.distributedAlready'));
  apply(plan.rects);
  animateNext();
  render();
  const dir = t(axis === 'x' ? 'announce.horizontally' : 'announce.vertically');
  announce(mode === 'even' ? t('announce.distributedEven', { n, dir }) : t('announce.distributedGap', { n, dir, gap: lengthText(state.gap) }));
  return true;
}

// ---------- Duplicar y quitar ----------

/** Cuántas veces se puede duplicar la selección sin pasar el máximo de piezas. */
export const maxCopies = () => copiesAllowed(state.items.length, state.selection.length, MAX_ITEMS);

/**
 * `times` copias de cada elegida, en los huecos desde la hoja actual (y en
 * las siguientes u hojas nuevas), sin mover nada. Las copias quedan elegidas.
 */
export function duplicateSelection(times = 1) {
  const items = selectedItems();
  if (!items.length || state.busy) return null;
  if (times > maxCopies()) {
    say(t('errors.maxCopies', { max: MAX_ITEMS, n: maxCopies() }), { warn: true });
    return null;
  }
  const sheetsBefore = state.sheets.length;
  commit();
  const copies = duplicatePieces(items, times, sheetIndex(currentSheet()));
  setSelection(
    copies.map((copy) => copy.id),
    { pinned: copies.length > 1 }
  );
  view.sheet = copies.at(-1).sheet;
  return { copies, sheets: new Set(copies.map((copy) => copy.sheet)).size, added: state.sheets.length - sheetsBefore };
}

/** Quita las elegidas. Con `focus`, la selección pasa a una vecina de la hoja de la principal. */
export function removeSelection({ focus = true } = {}) {
  const items = selectedItems();
  if (!items.length || state.busy) return null;
  const primary = primaryItem();
  const removed = ids();
  const neighbor = focus
    ? neighborAfterRemoval(
        itemsOn(primary.sheet).map((item) => item.id),
        primary.id,
        removed
      )
    : null;
  commit();
  state.items = state.items.filter((item) => !removed.has(item.id));
  setSelection(neighbor ? [neighbor] : []);
  view.sheet = primary.sheet;
  return { n: items.length, sheet: primary.sheet };
}
