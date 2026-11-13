// The notice of the last action (the pill), and the announcement for actions
// that only make sense with one piece.

import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { setView, type Flash } from '../view.ts';

/** Notice of an action's result: stays until the next action or until it goes away on its own. */
export function say(text: string, options: Omit<Flash, 'text'> = {}) {
  setView({ flash: { text, ...options } });
}

/** With several pieces selected, what only works with one explains itself. */
export const singleOnly = () => announce(t('announce.singleOnly'));
