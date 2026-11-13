// The DOM catches up with the stores right away: for actions that move the
// focus or scroll right after changing the state (React renders store updates
// asynchronously otherwise).

import { flushSync } from 'react-dom';

export function flushUi() {
  flushSync(() => {});
}
