// The notice of the last action (the pill), and the announcement for actions
// that only make sense with one piece. A result the canvas shows (in the
// sheet in view) is only announced; the notice is for what can't be seen
// there: a problem, pieces that went to other sheets, or a change that is hard
// to redo by hand (then it offers «Deshacer»).

import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { setView, type Flash } from '../view.ts';
import { undoLast } from './edit.ts';

/** Notice of an action's result: stays until the next action or until it goes away on its own. */
export function say(text: string, options: Omit<Flash, 'text'> = {}) {
  setView({ flash: { text, ...options } });
}

/** The notice of a change that replaced or removed several things at once, with «Deshacer». */
export function sayUndoable(text: string) {
  say(text, { action: { label: t('bar.undo'), run: undoLast } });
}

/** With several pieces selected, what only works with one explains itself. */
export const singleOnly = () => announce(t('announce.singleOnly'));
