// Opening the dialogs from buttons, shortcuts and notices.

import { create } from 'zustand';
import type { ListedProject } from '../../core/types.ts';
import { estimate, list, projectSession } from '../../services/projects.ts';
import { closeDialog, isDialogOpen, openDialog } from '../../components/dialogs/dialogs.ts';
import { PaletteContent, PrefsContent, ProjectsContent, ShortcutsContent, whenLoaded } from '../../components/dialogs/lazy.ts';
import { useProject } from '../project.ts';

/**
 * What the «Proyectos» dialog lists (loaded before it opens, and again when
 * something changes), and the space this browser uses and has (bytes; null
 * when it doesn't say, or nothing can be saved).
 */
export const useProjectList = create<{ records: ListedProject[]; usage: { usage: number; quota: number } | null }>()(() => ({ records: [], usage: null }));

/** Loads the list of projects and the space used. */
export async function refreshProjectList() {
  const records = await list();
  useProjectList.setState({ records });
  const info = projectSession().storage ? await estimate() : null;
  useProjectList.setState({ usage: info?.usage != null && info.quota ? { usage: info.usage, quota: info.quota } : null });
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

/** Mod+K or the search button: the command palette. */
export function openPalette() {
  const returnTo = document.activeElement;
  whenLoaded(PaletteContent, () => openDialog('palette', returnTo));
}

/** Opens «Preferencias». `returnTo`: where the focus goes when it closes. */
export function openPrefs({ returnTo }: { returnTo?: Element | null } = {}) {
  const back = returnTo ?? document.activeElement;
  whenLoaded(PrefsContent, () => openDialog('prefs', back));
}
