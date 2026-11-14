// Which dialog is open and where the focus returns when it closes. The
// dialogs are rendered (and loaded) only when opened.

import { create } from 'zustand';

export type DialogName = 'shortcuts' | 'prefs' | 'projects' | 'palette';

export interface DialogsState {
  open: Partial<Record<DialogName, { returnTo: Element | null }>>;
  /** Bumped when another tab changed the project list (the open dialog reloads it). */
  listVersion: number;
}

export const useDialogs = create<DialogsState>()(() => ({ open: {}, listVersion: 0 }));

export const isDialogOpen = (name: DialogName) => !!useDialogs.getState().open[name];

export function openDialog(name: DialogName, returnTo: Element | null = document.activeElement) {
  if (isDialogOpen(name)) return false;
  useDialogs.setState((s) => ({ open: { ...s.open, [name]: { returnTo } } }));
  return true;
}

export function closeDialog(name: DialogName) {
  if (!isDialogOpen(name)) return;
  useDialogs.setState((s) => {
    const open = { ...s.open };
    delete open[name];
    return { open };
  });
}

/** Another tab changed the projects: the dialog, if open, reloads its list. */
export const projectListChanged = () => useDialogs.setState((s) => ({ listVersion: s.listVersion + 1 }));
