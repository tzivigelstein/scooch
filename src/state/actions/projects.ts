// Opening, creating and deleting projects from the interface: busy state,
// focus, announcements and the notices of services/projects.ts.

import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { confirmAction } from '../../components/dialogs/confirm.ts';
import { closeDialog, projectListChanged } from '../../components/dialogs/dialogs.ts';
import type { ProjectRecord } from '../../core/types.ts';
import { initProjects, newProject, openProject, projectSession, remove, retry, saveAsNew, takeOver, type ProjectNotice } from '../../services/projects.ts';
import { setDocument } from '../document.ts';
import { useProject } from '../project.ts';
import { setView } from '../view.ts';
import { setBusy } from './files.ts';
import { scrollToStart } from '../../components/canvas/viewport.ts';
import { focusSheet, pieceNode } from './focus.ts';
import { restoreCut } from './clipboard.ts';
import { forgetSpill } from './layout.ts';
import { say } from './notify.ts';
import { openProjects } from './dialogs.ts';
import { linkOpened, startSettings, takeDeepLink } from './deeplink.ts';

type Failure = { code?: string; name?: string; inner?: { name?: string } } | null | undefined;

const isQuota = (err: unknown) => (err as Failure)?.name === 'QuotaExceededError' || (err as Failure)?.inner?.name === 'QuotaExceededError';

/** Notices from services/projects.ts (saving, opening, other tabs). */
function projectNotice(kind: ProjectNotice, { error = null, record = null }: { error?: unknown; record?: Pick<ProjectRecord, 'id' | 'name'> | null } = {}) {
  if (kind === 'unavailable') return say(t('projects.unavailable'), { warn: true, persist: true });
  if (kind === 'saveFailed') {
    if (isQuota(error)) return say(t('notices.quota'), { warn: true, action: { label: t('notices.seeProjects'), run: openProjects } });
    return say(t('notices.saveFailed'), { warn: true, action: { label: t('projects.retry'), run: () => void retry() } });
  }
  if (kind === 'openFailed') return openFailed(record, error);
  if (kind === 'takenOver') return say(t('notices.takenOver'), { warn: true, action: { label: t('projects.takeOver'), run: () => void takeOverWithUi() } });
  if (kind === 'deletedElsewhere') return say(t('notices.deletedElsewhere'), { warn: true, action: { label: t('notices.saveAsNew'), run: () => void saveAsNew() } });
}

/**
 * Ctrl/⌘ + S: nothing to do, changes save themselves; it says so, or what
 * stops them from being saved (with what to do about it).
 */
export function explainSaving() {
  const { status } = useProject.getState();
  if (status === 'off') return say(t('projects.unavailable'), { warn: true });
  if (status === 'readonly') return projectNotice('takenOver');
  if (status === 'error') return projectNotice('saveFailed', { error: projectSession().error });
  say(t('notices.autosave'), { info: true });
}

/** A project couldn't open: if it is damaged, deleting it is offered. */
export function openFailed(record: Pick<ProjectRecord, 'id' | 'name'> | null | undefined, error: unknown) {
  console.warn(error);
  const name = record?.name ?? t('projects.untitled');
  const code = (error as Failure)?.code;
  if (code === 'newer') return say(t('notices.openNewer', { name }), { warn: true, action: { label: t('notices.reload'), run: () => location.reload() } });
  if (code === 'corrupt' && record?.id) {
    return say(t('notices.openFailed', { name }), {
      warn: true,
      action: {
        label: t('notices.deleteProject'),
        run: async () => {
          const ok = await confirmAction({
            title: t('projects.deleteTitle', { name }),
            body: t('projects.deleteBody'),
            confirm: t('projects.deleteConfirm'),
            focus: 'cancel',
          });
          if (ok) await removeWithUi(record.id, name);
        },
      },
    });
  }
  say(t('notices.openError'), { warn: true });
}

/**
 * Renaming, duplicating, deleting or creating a project failed: the notice
 * says which (with no room left, that there is no room, and where to make it).
 */
export function projectFailed(action: 'rename' | 'duplicate' | 'delete' | 'create', name: string, error: unknown) {
  console.warn(error);
  if (isQuota(error)) return say(t('notices.quota'), { warn: true, action: { label: t('notices.seeProjects'), run: openProjects } });
  say(t(`notices.${action}Failed`, { name }), { warn: true });
}

/** After opening, creating or replacing the open project. */
function projectOpened(record: Pick<ProjectRecord, 'name'>, how: 'open' | 'new' | 'replaced', previous?: string | null) {
  forgetSpill();
  if (how === 'replaced') return announce(t('announce.projectReplaced', { name: record.name }));
  focusSheet();
  if (how === 'new') announce(t('announce.projectCreated', { name: previous ?? t('projects.untitled') }));
  else announce(t('announce.projectOpened', { name: record.name }));
}

/** For shortcuts and notices: opens another project with an accessible busy state. */
export async function openWithUi(id: string, name: string) {
  closeDialog('projects');
  setBusy(true, t('busy.openingProject'));
  try {
    const record = await openProject(id);
    setBusy(false);
    projectOpened(record, 'open');
  } catch (err) {
    setBusy(false);
    openFailed({ id, name }, err);
  }
}

/** «Nuevo proyecto». */
export async function createWithUi() {
  const previous = projectSession().record?.name;
  closeDialog('projects');
  // While the current one saves and the new one is set up, nothing else changes the document.
  setBusy(true, '');
  try {
    const record = await newProject();
    setBusy(false);
    projectOpened(record, 'new', previous);
  } catch (err) {
    setBusy(false);
    projectFailed('create', '', err);
  }
}

/** Delete (already confirmed). */
export async function removeWithUi(id: string, name: string) {
  const wasOpen = id === projectSession().record?.id;
  await remove(id);
  announce(t('announce.projectDeleted', { name }));
  if (wasOpen) projectOpened(projectSession().record!, 'replaced');
}

/** From a tab that stopped saving: edit here again. */
export async function takeOverWithUi() {
  setBusy(true, t('busy.openingProject'));
  try {
    const record = await takeOver();
    setBusy(false);
    projectOpened(record, 'open');
  } catch (err) {
    setBusy(false);
    openFailed(projectSession().record, err);
  }
}

let started = false;

/** On start: restores the last project, with an accessible loading state and no flashes. */
export async function startProjects() {
  if (started) return;
  started = true;
  const link = takeDeepLink();
  // If it takes long, the pill says so; meanwhile the canvas stays hidden (without the empty zone).
  const slow = setTimeout(() => setBusy(true, t('busy.openingProject')), 400);
  await initProjects({
    statusChanged: ({ recovered }) => {
      if (recovered) announce(t('announce.projectSaved'));
    },
    notify: projectNotice,
    listChanged: projectListChanged,
    thumbImage: (item) => pieceNode(item.id)?.querySelector('img') ?? null,
    documentReplaced: scrollToStart,
  }, { start: link && startSettings(link) });
  clearTimeout(slow);
  setDocument({ busy: false });
  setView({ busyText: '', loading: false });
  if (link) linkOpened(link);
  void restoreCut();
}
