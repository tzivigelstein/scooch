// Short confirmations (a modal <dialog>) for actions that delete something:
// removing a sheet with pieces (undoable) or deleting a project (not).

import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  body: string;
  /** The confirm button's text. */
  confirm: string;
  /** What starts focused: what can't be undone starts on «Cancelar». */
  focus: 'confirm' | 'cancel';
  /** Where the focus returns afterwards. */
  returnTo: Element | null;
  resolve: (ok: boolean) => void;
}

export const useConfirm = create<{ request: ConfirmRequest | null }>()(() => ({ request: null }));

/** Asks for confirmation. Resolves true or false. */
export function confirmAction({
  title,
  body,
  confirm,
  focus = 'confirm',
  returnTo = document.activeElement,
}: Pick<ConfirmRequest, 'title' | 'body' | 'confirm'> & Partial<Pick<ConfirmRequest, 'focus' | 'returnTo'>>): Promise<boolean> {
  if (useConfirm.getState().request) return Promise.resolve(false);
  return new Promise((resolve) => {
    useConfirm.setState({ request: { title, body, confirm, focus, returnTo, resolve } });
  });
}
