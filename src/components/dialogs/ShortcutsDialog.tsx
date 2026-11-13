// The keyboard shortcuts dialog. The «Atajos de 1 tecla» switch lives in
// «Preferencias»: here the single-key ones are marked when off, and a link
// opens it.

import { X } from 'lucide-react';
import { Fragment } from 'react';
import { keyLabel, splitLink, t } from '../../copy/index.ts';
import { SHORTCUT_ROWS } from '../../hooks/shortcuts.ts';
import { stepTexts } from '../../services/measure.ts';
import { usePrefs } from '../../state/prefs.ts';
import { openPrefs } from '../../state/actions/dialogs.ts';
import { IconButton } from '../ui/Button.tsx';
import { closeDialog, useDialogs } from './dialogs.ts';

export default function ShortcutsDialog() {
  const returnTo = useDialogs((s) => s.open.shortcuts?.returnTo ?? null);
  usePrefs((s) => s.unit);
  const steps = stepTexts();
  const [before, link, after] = splitLink('shortcuts.singleKeysNote');
  const close = () => closeDialog('shortcuts');
  return (
    <>
      <div className="dialog-head">
        <h2 id="shortcuts-title" className="dialog-title">
          {t('shortcuts.title')}
        </h2>
        <IconButton id="shortcuts-close" icon={X} label={t('app.close')} onClick={close} />
      </div>
      <div className="dialog-body">
        <p id="shortcuts-note" className="dialog-note">
          {before}
          {link !== null && (
            <button
              type="button"
              id="shortcuts-prefs"
              className="link-btn"
              aria-haspopup="dialog"
              onClick={() => {
                // Preferences opened from here return the focus to whoever opened this dialog.
                const back = returnTo?.isConnected && returnTo !== document.body ? returnTo : document.getElementById('help');
                close();
                openPrefs({ returnTo: back });
              }}
            >
              {link}
            </button>
          )}
          {after}
        </p>
        <table className="keys">
          <caption className="sr-only">{t('shortcuts.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('shortcuts.key')}</th>
              <th scope="col">{t('shortcuts.action')}</th>
            </tr>
          </thead>
          <tbody id="shortcuts-rows">
            {SHORTCUT_ROWS.map(([keys, action, single]) => (
              <tr key={action} data-single={single ? '' : undefined}>
                <td>
                  {keys.map((key, i) => (
                    <Fragment key={key}>
                      {i > 0 && (keys.length > 2 ? ' ' : t('shortcuts.or'))}
                      <kbd>{keyLabel(key)}</kbd>
                    </Fragment>
                  ))}
                </td>
                <td>
                  {t(action, steps)}
                  {single && (
                    <>
                      {' '}
                      <span className="off-badge">{t('shortcuts.off')}</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
