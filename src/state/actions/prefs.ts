// Changing this browser's preferences from the interface (Preferencias, the
// command palette), with what they announce.

import type { Unit } from '../../core/units.js';
import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { unitName } from '../../services/measure.ts';
import { getPrefs, setUnit } from '../prefs.ts';

/** Shows and reads lengths in `unit`, and says so (nothing if it already was). */
export function chooseUnit(unit: Unit) {
  if (getPrefs().unit === unit) return;
  setUnit(unit);
  announce(t('prefs.unitChanged', { unit: unitName() }));
}
