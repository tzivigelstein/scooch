// «Preferencias»: units (mm, cm or in), «Atajos de 1 tecla» (WCAG 2.1.4),
// the advice before printing and the summary after, the theme, and the usage tips.
// Settings of this browser: saved in localStorage, outside the history and the project.

import { X } from 'lucide-react';
import { THEMES, type ThemeChoice } from '../../core/storedprefs.js';
import { UNITS, type Unit } from '../../core/units.js';
import { t } from '../../copy/index.ts';
import { setPrinting, setSingleKeys, setTheme, usePrefs } from '../../state/prefs.ts';
import { chooseUnit } from '../../state/actions/prefs.ts';
import { restoreTips, setTipsOn, useTips } from '../../state/tips.ts';
import { announce } from '../feedback/announcer.ts';
import { IconButton } from '../ui/Button.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Switch } from '../ui/Switch.tsx';
import { closeDialog } from './dialogs.ts';
import { LEGAL_PATHS } from '../../site/paths.ts';

export default function PrefsDialog() {
  const unit = usePrefs((s) => s.unit);
  const singleKeys = usePrefs((s) => s.singleKeys);
  const printing = usePrefs((s) => s.printing);
  const theme = usePrefs((s) => s.theme);
  const tipsOn = useTips((s) => s.on);
  const dismissed = useTips((s) => s.dismissed.length > 0);
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
            onChange={chooseUnit}
            options={UNITS.map((value) => ({
              value,
              input: { 'aria-label': t('prefs.unitLabel', { symbol: t(`units.${value}`), name: t(`units.names.${value}`) }) },
              label: <span>{t(`units.${value}`)}</span>,
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
        <div className="pref-section" role="group" aria-labelledby="prefs-theme-title">
          <h3 id="prefs-theme-title" className="pref-title">
            {t('prefs.theme')}
          </h3>
          <Segmented<ThemeChoice>
            className="segmented chips themes"
            name="theme"
            value={theme}
            onChange={setTheme}
            options={THEMES.map((value) => ({ value, label: <span>{t(`prefs.themes.${value}`)}</span> }))}
          />
        </div>
        <div className="pref-section" role="group" aria-labelledby="prefs-tips-title">
          <h3 id="prefs-tips-title" className="pref-title">
            {t('tips.prefsTitle')}
          </h3>
          <Switch id="tips-pref" label={<span>{t('tips.prefsSwitch')}</span>} checked={tipsOn} onChange={setTipsOn} />
          {/* Stays focusable when there is nothing to bring back: pressing it then does nothing. */}
          <button
            type="button"
            id="tips-restore"
            className="chip-btn pref-btn"
            aria-disabled={!dismissed || undefined}
            onClick={() => {
              if (!dismissed) return;
              restoreTips();
              announce(t('tips.restored'));
            }}
          >
            {t('tips.restore')}
          </button>
        </div>
      </div>
      <LegalLinks />
    </>
  );
}

/** The site's terms and privacy policy (pages of their own: the project saves itself before leaving). */
function LegalLinks() {
  return (
    <div className="dialog-foot">
      <p id="prefs-legal" className="dialog-note">
        <a className="link-btn" href={LEGAL_PATHS.terms}>
          {t('legal.terms')}
        </a>
        {t('legal.separator')}
        <a className="link-btn" href={LEGAL_PATHS.privacy}>
          {t('legal.privacy')}
        </a>
      </p>
    </div>
  );
}
