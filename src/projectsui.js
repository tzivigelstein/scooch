// Proyectos en la interfaz: el nombre del abierto en la barra superior
// (editable en el lugar), el estado del guardado y el diálogo «Proyectos»
// (nuevo, abrir, duplicar, cambiar el nombre, eliminar y espacio usado).

import { session, list, openProject, newProject, duplicate, rename, remove, retry, estimate, takeOver } from './projects.js';
import { relativeTime, formatBytes } from './core/humanize.js';
import { sizeOf } from './core/papers.js';
import { setupDialog } from './dialogs.js';
import { confirmAction } from './confirm.js';
import { announce } from './live.js';
import { icon } from './icons.js';
import { $ } from './util.js';
import { t, numberLocale } from './copy/index.ts';

let ui = {};
let actions = {};
let openDialog = () => {};
let thumbUrls = [];
let editing = null; // {input, done(save)} mientras se cambia un nombre en el diálogo

/**
 * `actions.opened(record, how)`: después de abrir o crear un proyecto
 * (how: 'open' | 'new'); `actions.busy(on, text)`: mientras se abre algo;
 * `actions.failed(record, error)`: no se pudo abrir.
 */
export function initProjectsUi(a) {
  actions = a;
  ui = {
    box: $('project'),
    name: $('project-name'),
    nameText: $('project-name-text'),
    input: $('project-name-input'),
    status: $('project-status'),
    statusIcon: $('project-status-icon'),
    statusText: $('project-status-text'),
    retry: $('project-retry'),
    trigger: $('projects-open'),
    dialog: $('projects'),
    create: $('project-new'),
    list: $('project-list'),
    empty: $('projects-empty'),
    unavailable: $('projects-unavailable'),
    usage: $('projects-usage'),
  };
  openDialog = setupDialog(ui.dialog, { close: [$('projects-close')], fallback: () => ui.trigger });
  ui.dialog.addEventListener('close', releaseThumbs);

  // Nombre en la barra superior: clic o Enter para cambiarlo; Esc cancela.
  ui.name.addEventListener('click', startTopRename);
  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishTopRename(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finishTopRename(false);
    }
  });
  ui.input.addEventListener('blur', () => finishTopRename(true, { refocus: false }));
  ui.retry.addEventListener('click', () => (session.status === 'readonly' ? takeOverWithUi() : retry()));

  ui.trigger.addEventListener('click', () => openProjects());
  ui.create.addEventListener('click', () => createWithUi());
  ui.list.addEventListener('click', onListClick);
  ui.list.addEventListener('keydown', onListKey);
}

// ---------- Barra superior ----------

/** Nombre y estado del guardado del proyecto abierto. */
export function renderProjectBar() {
  const record = session.record;
  ui.box.hidden = !record;
  if (!record) return;
  if (ui.nameText.textContent !== record.name) ui.nameText.textContent = record.name;
  // El tooltip muestra el nombre entero (en la barra puede quedar cortado).
  ui.name.dataset.tip = record.name;
  const label = t('projects.nameLabel', { name: record.name });
  if (ui.name.getAttribute('aria-label') !== label) ui.name.setAttribute('aria-label', label);
  const status = session.status;
  const kind = status === 'saving' ? 'pending' : status;
  ui.status.dataset.status = kind;
  const text = t(`projects.status.${kind}`);
  if (ui.statusText.textContent !== text) ui.statusText.textContent = text;
  ui.status.dataset.tip = t(`projects.statusTip.${kind}`);
  const glyph = { saved: 'check', pending: 'loader-circle', loading: 'loader-circle', error: 'triangle-alert', off: 'circle-alert', readonly: 'circle-alert' }[kind];
  if (ui.statusIcon.dataset.icon !== glyph) {
    ui.statusIcon.dataset.icon = glyph;
    ui.statusIcon.innerHTML = icon(glyph, 'icon project-status-glyph');
  }
  const retryText = status === 'error' ? t('projects.retry') : status === 'readonly' && session.storage ? t('projects.takeOver') : '';
  ui.retry.hidden = !retryText;
  if (retryText && ui.retry.textContent !== retryText) ui.retry.textContent = retryText;
  ui.trigger.disabled = status === 'loading';
}

function startTopRename() {
  if (!session.record || !ui.input.hidden) return;
  ui.input.value = session.record.name;
  ui.name.hidden = true;
  ui.input.hidden = false;
  ui.input.focus();
  ui.input.select();
}

async function finishTopRename(save, { refocus = true } = {}) {
  if (ui.input.hidden) return;
  const value = ui.input.value;
  ui.input.hidden = true;
  ui.name.hidden = false;
  if (refocus) ui.name.focus();
  if (!save || value.trim() === session.record.name) return;
  try {
    const name = await rename(session.record.id, value);
    announce(t('announce.projectRenamed', { name }));
  } catch (err) {
    console.error(err);
    actions.failed?.(null, err);
  }
  renderProjectBar();
}

/** Mod+O o el botón: abre el diálogo «Proyectos». */
export async function openProjects() {
  if (ui.dialog.open || ui.trigger.disabled) return;
  await refreshList();
  openDialog({ focus: ui.create });
}

/** Si el diálogo está abierto, vuelve a dibujar la lista (otra pestaña cambió algo). */
export function listChanged() {
  if (ui.dialog.open && !editing) refreshList();
}

export const closeProjects = () => ui.dialog.open && ui.dialog.close();

// ---------- Diálogo ----------

function releaseThumbs() {
  for (const url of thumbUrls) URL.revokeObjectURL(url);
  thumbUrls = [];
}

async function refreshList() {
  const records = await list();
  const focused = document.activeElement?.closest?.('.project-card');
  const focusKey = focused ? [focused.dataset.id, document.activeElement.dataset.act ?? 'open'] : null;
  renderList(records);
  renderUsage();
  if (focusKey) focusCard(...focusKey);
}

function renderList(records) {
  releaseThumbs();
  const available = !!session.storage;
  ui.unavailable.hidden = available;
  ui.create.disabled = false;
  const current = session.record?.id;
  const now = Date.now();
  ui.list.replaceChildren(
    ...records.map((record) => {
      const item = document.createElement('li');
      item.className = 'project-card';
      item.dataset.id = record.id;
      item.classList.toggle('is-current', record.id === current);
      item.classList.toggle('is-damaged', record.damaged);
      const metaId = `project-meta-${record.id}`;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'project-open';
      open.dataset.act = 'open';
      open.disabled = record.damaged;
      open.setAttribute('aria-label', t(record.id === current ? 'projects.openCurrent' : 'projects.open', { name: record.name }));
      open.setAttribute('aria-describedby', metaId);
      const thumb = document.createElement('span');
      thumb.className = 'project-thumb';
      if (record.thumb instanceof Blob) {
        const url = URL.createObjectURL(record.thumb);
        thumbUrls.push(url);
        const img = document.createElement('img');
        img.alt = '';
        img.src = url;
        thumb.append(img);
      } else {
        // Sin miniatura todavía (proyecto vacío): una hoja en blanco con la forma del papel.
        const page = document.createElement('span');
        page.className = 'blank-page';
        const size = record.damaged ? null : sizeOf(record.doc.paper, record.doc.landscape);
        page.style.aspectRatio = size ? `${size.w} / ${size.h}` : '210 / 297';
        thumb.append(page);
      }
      const title = document.createElement('span');
      title.className = 'project-title';
      title.textContent = record.name;
      open.dataset.tip = record.name;
      open.append(thumb, title);
      const meta = document.createElement('p');
      meta.className = 'project-meta';
      meta.id = metaId;
      meta.textContent = record.damaged
        ? t('projects.damagedMeta')
        : t('projects.meta', {
            when: relativeTime(record.modified, now, { locale: numberLocale }),
            sheets: t('projects.sheets', { n: record.counts?.sheets ?? 1 }),
            pieces: t('pieces.count', { n: record.counts?.pieces ?? 0 }),
          });
      const badges = document.createElement('span');
      badges.className = 'project-badges';
      if (record.id === current) badges.append(badge(t('projects.current'), 'current'));
      if (record.damaged) badges.append(badge(t('projects.damaged'), 'damaged'));
      const tools = document.createElement('div');
      tools.className = 'project-actions';
      const tool = (act, glyph, labelKey, tipKey, disabled = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `icon-btn small${act === 'delete' ? ' danger' : ''}`;
        button.dataset.act = act;
        button.dataset.tip = t(tipKey);
        button.setAttribute('aria-label', t(labelKey, { name: record.name }));
        button.disabled = disabled;
        button.innerHTML = icon(glyph);
        return button;
      };
      tools.append(
        tool('duplicate', 'copy', 'projects.duplicateLabel', 'projects.duplicate', record.damaged),
        tool('rename', 'pencil', 'projects.renameLabel', 'projects.rename', record.damaged),
        tool('delete', 'trash-2', 'projects.deleteLabel', 'projects.delete')
      );
      item.append(open, meta, badges, tools);
      return item;
    })
  );
  // Vacío: no hay otros proyectos además del abierto.
  ui.empty.hidden = !available || records.some((record) => record.id !== current);
  ui.list.hidden = !records.length;
}

function badge(text, kind) {
  const el = document.createElement('span');
  el.className = 'project-badge';
  el.dataset.kind = kind;
  el.textContent = text;
  return el;
}

async function renderUsage() {
  if (!session.storage) {
    ui.usage.textContent = t('projects.local');
    return;
  }
  const info = await estimate();
  const used = info?.usage != null ? formatBytes(info.usage, { locale: numberLocale }) : null;
  const quota = info?.quota ? formatBytes(info.quota, { locale: numberLocale }) : null;
  ui.usage.textContent = used
    ? quota
      ? t('projects.usage', { used, quota })
      : t('projects.usageOnly', { used })
    : t('projects.local');
}

function focusCard(id, act = 'open') {
  const card = ui.list.querySelector(`.project-card[data-id="${CSS.escape(id)}"]`);
  const target = card?.querySelector(`[data-act="${act}"]:not(:disabled)`) ?? card?.querySelector('button:not(:disabled)');
  (target ?? ui.create).focus();
}

const recordName = (card) => card.querySelector('.project-title').textContent;

async function onListClick(e) {
  const button = e.target.closest('button[data-act]');
  if (!button || button.disabled) return;
  const card = button.closest('.project-card');
  const id = card.dataset.id;
  const name = recordName(card);
  const act = button.dataset.act;
  if (act === 'open') {
    if (id === session.record?.id) return ui.dialog.close();
    return openWithUi(id, name);
  }
  if (act === 'duplicate') {
    try {
      const record = await duplicate(id);
      await refreshList();
      focusCard(record.id);
      announce(t('announce.projectDuplicated', { name }));
    } catch (err) {
      actions.failed?.(null, err);
    }
    return;
  }
  if (act === 'rename') return renameInCard(card);
  if (act === 'delete') {
    const ok = await confirmAction({
      title: t('projects.deleteTitle', { name }),
      body: t('projects.deleteBody'),
      confirm: t('projects.deleteConfirm'),
      focus: 'cancel',
      returnTo: button,
    });
    if (!ok) return;
    const cards = [...ui.list.querySelectorAll('.project-card')];
    const next = cards[cards.indexOf(card) + 1] ?? cards[cards.indexOf(card) - 1];
    try {
      await removeWithUi(id, name);
    } catch (err) {
      actions.failed?.(null, err);
    }
    if (!ui.dialog.open) return;
    await refreshList();
    if (next) focusCard(next.dataset.id);
    else ui.create.focus();
  }
}

// Cambiar el nombre desde la tarjeta: el título se vuelve un campo.
function renameInCard(card) {
  if (editing) return;
  const title = card.querySelector('.project-title');
  const id = card.dataset.id;
  const before = title.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'project-title-input';
  input.maxLength = 80;
  input.value = before;
  input.setAttribute('aria-label', t('projects.nameField'));
  card.querySelector('.project-open').hidden = true;
  card.prepend(input);
  input.focus();
  input.select();
  const done = async (save) => {
    if (editing?.input !== input) return;
    editing = null;
    const value = input.value;
    input.remove();
    card.querySelector('.project-open').hidden = false;
    if (save && value.trim() && value.trim() !== before) {
      try {
        const name = await rename(id, value);
        announce(t('announce.projectRenamed', { name }));
      } catch (err) {
        actions.failed?.(null, err);
      }
      renderProjectBar();
    }
    await refreshList();
    focusCard(id, 'rename');
  };
  editing = { input, done };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      done(true);
    } else if (e.key === 'Escape') {
      // Esc cancela el cambio de nombre, no cierra el diálogo.
      e.preventDefault();
      e.stopPropagation();
      done(false);
    }
  });
  input.addEventListener('blur', () => done(true));
}

// Flechas arriba y abajo (e Inicio y Fin) entre las tarjetas: al botón
// principal de cada una. Tab recorre también sus acciones.
function onListKey(e) {
  if (e.target.tagName === 'INPUT') return;
  const cards = [...ui.list.querySelectorAll('.project-card')];
  const i = cards.indexOf(e.target.closest('.project-card'));
  if (i < 0) return;
  const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: cards.length - 1 }[e.key];
  if (next === undefined || next < 0 || next >= cards.length) return;
  e.preventDefault();
  cards[next].querySelector('button:not(:disabled):not([hidden])')?.focus();
}

/** Para los atajos y avisos: abre otro proyecto con estado de carga accesible. */
export async function openWithUi(id, name) {
  closeProjects();
  actions.busy(true, t('busy.openingProject'));
  try {
    const record = await openProject(id);
    actions.busy(false);
    actions.opened(record, 'open');
  } catch (err) {
    actions.busy(false);
    actions.failed({ id, name }, err);
  }
}

/** «Nuevo proyecto». */
export async function createWithUi() {
  const previous = session.record?.name;
  closeProjects();
  // Mientras se guarda el actual y se arma el nuevo, nada más cambia el documento.
  actions.busy(true, '');
  try {
    const record = await newProject();
    actions.busy(false);
    actions.opened(record, 'new', previous);
  } catch (err) {
    actions.busy(false);
    actions.failed(null, err);
  }
}

/** Eliminar (ya confirmado). */
export async function removeWithUi(id, name) {
  const wasOpen = id === session.record?.id;
  await remove(id);
  announce(t('announce.projectDeleted', { name }));
  if (wasOpen) actions.opened(session.record, 'replaced');
}

/** Desde una pestaña que dejó de guardar: vuelve a editar aquí. */
export async function takeOverWithUi() {
  actions.busy(true, t('busy.openingProject'));
  try {
    const record = await takeOver();
    actions.busy(false);
    actions.opened(record, 'open');
  } catch (err) {
    actions.busy(false);
    actions.failed(session.record, err);
  }
}
