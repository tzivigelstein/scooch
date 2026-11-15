// The keyboard shortcuts dialog: the commands' keys (state/commands.ts) and
// the keys that aren't commands, by section, as this device names them, with
// a field that filters the rows as it is typed in. The «Atajos de 1 tecla»
// switch lives in «Preferencias»: here the single-key ones are marked when
// off, and a link opens it.

import { X } from 'lucide-react';
import { Fragment, useState } from 'react';
import { prepare, fuzzyFilter } from '../../core/fuzzy.js';
import { choiceParts, keyText, splitLink, t } from '../../copy/index.ts';
import { stepTexts } from '../../services/measure.ts';
import { usePrefs } from '../../state/prefs.ts';
import { SECTIONS, shortcutRows, type KeyRow } from '../../state/commands.ts';
import { openPrefs } from '../../state/actions/dialogs.ts';
import { IconButton } from '../ui/Button.tsx';
import { Keys } from '../ui/Keys.tsx';
import { closeDialog, useDialogs } from './dialogs.ts';
import './ShortcutsDialog.css';

/** Two keys are alternatives («R o Shift+R»); more go side by side (the arrows). */
function RowKeys({ keys }: { keys: readonly string[] }) {
  if (keys.length > 2)
    return keys.map((key, i) => (
      <Fragment key={key}>
        {i > 0 && ' '}
        <Keys combo={key} />
      </Fragment>
    ));
  let k = 0;
  return choiceParts(keys.map((key) => keyText(key).shown)).map((part, i) => (part.type === 'element' ? <Keys key={i} combo={keys[k++]} /> : <Fragment key={i}>{part.value}</Fragment>));
}

/** What a row is found by: its text, its command's other words and its keys as shown and as said. */
const searchable = (row: KeyRow) => prepare(row.text, [row.aliases, ...row.keys.flatMap((key) => Object.values(keyText(key)))].join(', '));

export default function ShortcutsDialog() {
  const returnTo = useDialogs((s) => s.open.shortcuts?.returnTo ?? null);
  usePrefs((s) => s.unit);
  const [query, setQuery] = useState('');
  const rows = shortcutRows(stepTexts());
  const found = query.trim() ? new Set(fuzzyFilter(query, rows.map(searchable)).map((r) => rows[r.index].id)) : null;
  const sections = SECTIONS.map((section) => ({ section, rows: rows.filter((row) => row.section === section && (!found || found.has(row.id))) })).filter((s) => s.rows.length);
  const [before, link, after] = splitLink('shortcuts.singleKeysNote');
  const close = () => closeDialog('shortcuts');
  return (
    <>
      <div className="dialog-head">
        <h2 id="shortcuts-title" className="dialog-title">
          {t('shortcuts.title')}
        </h2>
        <IconButton id="shortcuts-close" icon={X} label={t('app.close')} tip={t('app.close')} onClick={close} />
      </div>
      <div className="dialog-body">
        <input
          id="shortcuts-search"
          className="keys-search"
          type="text"
          aria-label={t('shortcuts.search')}
          aria-controls="shortcuts-rows"
          placeholder={t('shortcuts.search')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
        <div id="shortcuts-rows" className="keys-sections">
          {sections.map(({ section, rows: shown }) => (
            <div key={section} className="keys-section">
              <h3 id={`keys-${section}`} className="keys-title">
                {t(`commands.sections.${section}`)}
              </h3>
              <table className="keys" aria-labelledby={`keys-${section}`}>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} data-single={row.single ? '' : undefined}>
                      <th scope="row">
                        {row.text}
                        {row.single && (
                          <>
                            {' '}
                            <span className="off-badge">{t('shortcuts.off')}</span>
                          </>
                        )}
                      </th>
                      <td>
                        <RowKeys keys={row.keys} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p id="shortcuts-empty" className="keys-empty" role="status">
            {sections.length ? '' : t('shortcuts.empty', { query: query.trim() })}
          </p>
        </div>
      </div>
    </>
  );
}
