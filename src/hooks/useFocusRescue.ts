// If the focused element disappears or gets disabled, the focus isn't lost: it
// goes to the neighbor button, the list or the selected piece.

import { useEffect, useLayoutEffect } from 'react';
import { useDocument } from '../state/document.ts';
import { useProject } from '../state/project.ts';
import { useView } from '../state/view.ts';
import { focusList, focusSheet } from '../state/actions/focus.ts';

let lastFocus: Element | null = null;

function rescueFocus() {
  const active = document.activeElement;
  const candidate = active && active !== document.body ? active : lastFocus;
  if (!candidate) return;
  const gone = !candidate.isConnected || (candidate as HTMLButtonElement).disabled || !!candidate.closest('[hidden]');
  if (!gone || (active && active !== document.body && active !== candidate)) return;
  lastFocus = null;
  const undo = document.getElementById('undo') as HTMLButtonElement | null;
  const redo = document.getElementById('redo') as HTMLButtonElement | null;
  if (candidate.id === 'undo' && redo && !redo.disabled) return redo.focus();
  if (candidate.id === 'redo' && undo && !undo.disabled) return undo.focus();
  if (candidate.closest('#piece-list') && focusList({ flush: false })) return;
  focusSheet({ flush: false });
}

/** Rescues the focus after every render of the stores' state. */
export function useFocusRescue() {
  useDocument((s) => s);
  useView((s) => s);
  useProject((s) => s.status);
  useLayoutEffect(rescueFocus);
  useEffect(() => {
    const remember = (e: FocusEvent) => (lastFocus = e.target as Element);
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
}
