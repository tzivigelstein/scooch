// Opening the dialogs from buttons, shortcuts and notices.

import { create } from 'zustand';
import { formatBytes } from '../../core/humanize.js';
import type { ListedProject } from '../../core/types.ts';
import { numberLocale, t } from '../../copy/index.ts';
import { estimate, list, projectSession } from '../../services/projects.ts';
import { closeDialog, isDialogOpen, openDialog } from '../../components/dialogs/dialogs.ts';
import { PrefsContent, ProjectsContent, ShortcutsContent, whenLoaded } from '../../components/dialogs/lazy.ts';
import { useProject } from '../project.ts';

/** What the «Proyectos» dialog lists (loaded before it opens, and again when something changes). */
export const useProjectList = create<{ records: ListedProject[]; usage: string }>()(() => ({ records: [], usage: '' }));

async function usageText() {
  if (!projectSession().storage) return t('projects.local');
  const info = await estimate();
  const used = info?.usage != null ? formatBytes(info.usage, { locale: numberLocale }) : null;
  const quota = info?.quota ? formatBytes(info.quota, { locale: numberLocale }) : null;
  return used ? (quota ? t('projects.usage', { used, quota }) : t('projects.usageOnly', { used })) : t('projects.local');
}

/** Loads the list of projects and the space used. */
export async function refreshProjectList() {
  const records = await list();
  useProjectList.setState({ records });
  useProjectList.setState({ usage: await usageText() });
}

/** Mod+O or the button: opens «Proyectos». */
export async function openProjects() {
  if (isDialogOpen('projects') || useProject.getState().status === 'loading') return;
  const returnTo = document.activeElement;
  await Promise.all([refreshProjectList(), ProjectsContent.preload()]);
  openDialog('projects', returnTo);
}

export const closeProjects = () => closeDialog('projects');

export function openShortcuts() {
  const returnTo = document.activeElement;
  whenLoaded(ShortcutsContent, () => openDialog('shortcuts', returnTo));
}

/** Opens «Preferencias». `returnTo`: where the focus goes when it closes. */
export function openPrefs({ returnTo }: { returnTo?: Element | null } = {}) {
  const back = returnTo ?? document.activeElement;
  whenLoaded(PrefsContent, () => openDialog('prefs', back));
}
