// «Preferencias»: units (mm, cm or in), «Atajos de 1 tecla» (WCAG 2.1.4) and
// the advice before printing and the summary after.
// Settings of this browser: saved in localStorage, outside the history and the project.

import { X } from 'lucide-react';
import { UNITS, type Unit } from '../../core/units.js';
import { t } from '../../copy/index.ts';
import { unitName } from '../../services/measure.ts';
import { setPrinting, setSingleKeys, setUnit, usePrefs } from '../../state/prefs.ts';
import { announce } from '../feedback/announcer.ts';
import { IconButton } from '../ui/Button.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Switch } from '../ui/Switch.tsx';
import { closeDialog } from './dialogs.ts';

export default function PrefsDialog() {
  const unit = usePrefs((s) => s.unit);
  const singleKeys = usePrefs((s) => s.singleKeys);
  const printing = usePrefs((s) => s.printing);
  const close = () => closeDialog('prefs');
  return (
    <>
      <div className="dialog-head">
        <h2 id="prefs-title" className="dialog-title">
          {t('prefs.title')}
        </h2>
        <IconButton id="prefs-close" icon={X} label={t('app.close')} tip={t('app.close')} onClick={close} />
      </div>
      <div className="dialog-body">
        <div className="pref-section" role="group" aria-labelledby="prefs-units-title">
          <h3 id="prefs-units-title" className="pref-title">
            {t('prefs.units')}
          </h3>
          <Segmented<Unit>
            className="segmented chips units"
            name="unit"
            value={unit}
            onChange={(value) => {
              if (value === unit) return;
              setUnit(value);
              announce(t('prefs.unitChanged', { unit: unitName() }));
            }}
            options={UNITS.map((value) => ({
              value,
              label: (
                <span>
                  <span>{t(`units.${value}`)}</span>
                  <span className="sr-only">{t(`prefs.unitNames.${value}`)}</span>
                </span>
              ),
            }))}
          />
        </div>
        <div className="pref-section" role="group" aria-labelledby="prefs-keys-title">
          <h3 id="prefs-keys-title" className="pref-title">
            {t('prefs.keyboard')}
          </h3>
          <Switch id="single-keys" label={<span>{t('prefs.singleKeys')}</span>} hint={t('prefs.singleKeysHint')} checked={singleKeys} onChange={setSingleKeys} />
        </div>
        <div className="pref-section" role="group" aria-labelledby="prefs-printing-title">
          <h3 id="prefs-printing-title" className="pref-title">
            {t('prefs.printing')}
          </h3>
          <Switch id="print-tip-pref" label={<span>{t('prefs.printTip')}</span>} checked={printing.tip} onChange={(tip) => setPrinting({ tip })} />
          <Switch id="print-summary-pref" label={<span>{t('prefs.printSummary')}</span>} checked={printing.summary} onChange={(summary) => setPrinting({ summary })} />
        </div>
      </div>
    </>
  );
}
