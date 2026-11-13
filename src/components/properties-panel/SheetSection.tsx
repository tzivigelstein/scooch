// The «Hoja» section: paper, orientation, custom size and margin.

import { MoveHorizontal, MoveVertical, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { CUSTOM_MAX, CUSTOM_MIN, PAPER_GROUPS, PAPERS, matchPreset, validateSide } from '../../core/papers.js';
import type { PaperId } from '../../core/types.ts';
import { clamp } from '../../core/util.ts';
import { t } from '../../copy/index.ts';
import { useShortcut } from '../../hooks/shortcuts.ts';
import { lengthText, sizeText, unitName, unitSymbol } from '../../services/measure.ts';
import { getDocument, useDocument } from '../../state/document.ts';
import { usePrefs } from '../../state/prefs.ts';
import { sheetSize } from '../../state/selectors.ts';
import { choosePaper, setOrientation, setPaperSide, setSheetLength } from '../../state/actions/sheets.ts';
import { Icon } from '../ui/Icon.tsx';
import { LengthField } from '../ui/LengthField.tsx';
import { Section } from '../ui/Section.tsx';

const busyOff = (busy: boolean, id: string) => busy && document.activeElement?.id !== id;

// A side's problem → the key of its message (papers.errors.*).
const PAPER_ERRORS = {
  w: { 'too-small': 'widthTooSmall', 'too-large': 'widthTooLarge' },
  h: { 'too-small': 'heightTooSmall', 'too-large': 'heightTooLarge' },
} as const;

export function SheetSection() {
  const paper = useDocument((s) => s.paper);
  const landscape = useDocument((s) => s.landscape);
  const busy = useDocument((s) => s.busy);
  useDocument((s) => s.margin);
  usePrefs((s) => s.unit);
  const landscapeKeys = useShortcut('landscape');
  // The error is tied to its field only while it shows (and meanwhile the
  // matching preset isn't mentioned: it would be the previous size, not the typed one).
  const [error, setError] = useState<{ side: 'w' | 'h'; text: string } | null>(null);
  const custom = typeof paper !== 'string';
  const [W, H] = sheetSize();
  const match = custom ? matchPreset(W, H) : null;
  const matchName = match && t(`papers.names.${match.id}`);
  const matchText = match ? t('papers.match', { paper: match.landscape ? t('sheet.landscapeName', { paper: matchName! }) : matchName! }) : '';
  const showMatch = !!match && !error;
  const unit = unitSymbol();

  // An error whose field isn't being edited any more goes away.
  useLayoutEffect(() => {
    if (error && document.activeElement?.id !== `paper-${error.side}`) setError(null);
  });

  const describedBy = (side: 'w' | 'h') => [error?.side === side ? 'paper-error' : '', showMatch ? 'paper-match' : ''].filter(Boolean).join(' ') || undefined;

  const sideField = (side: 'w' | 'h') => (
    <label className="num-field prefixed">
      <span className="num-prefix" aria-hidden="true">
        <Icon icon={side === 'w' ? MoveHorizontal : MoveVertical} />
      </span>
      <LengthField
        id={`paper-${side}`}
        data-tip={t(side === 'w' ? 'papers.width' : 'papers.height')}
        aria-label={t(side === 'w' ? 'papers.widthLabel' : 'papers.heightLabel', { unit: unitName() })}
        aria-invalid={error?.side === side ? 'true' : undefined}
        aria-describedby={describedBy(side)}
        disabled={busyOff(busy, `paper-${side}`)}
        value={() => sheetSize()[side === 'w' ? 0 : 1]}
        busy={() => getDocument().busy}
        check={(mm) => {
          const problem = validateSide(mm);
          return problem && problem !== 'invalid' ? t(`papers.errors.${PAPER_ERRORS[side][problem]}`, { min: lengthText(CUSTOM_MIN), max: lengthText(CUSTOM_MAX) }) : null;
        }}
        limit={(mm) => clamp(mm, CUSTOM_MIN, CUSTOM_MAX)}
        problem={(text) => setError(text ? { side, text } : null)}
        unreadable={t(side === 'w' ? 'papers.errors.widthInvalid' : 'papers.errors.heightInvalid')}
        apply={(mm, { final }) => setPaperSide(side, mm, { final })}
      />
      <span className="num-unit" aria-hidden="true">
        {unit}
      </span>
    </label>
  );

  return (
    <Section name="sheet" title={t('props.sheet')}>
      <div className="paper-row">
        <label className="field">
          <span className="field-label">{t('props.size')}</span>
          <select id="paper" value={custom ? 'custom' : paper} disabled={busyOff(busy, 'paper')} onChange={(e) => choosePaper(e.target.value as PaperId | 'custom')}>
            {PAPER_GROUPS.map((group) => (
              <optgroup key={group} label={t(`papers.groups.${group}`)}>
                {PAPERS.filter((p) => p.group === group).map((p) => (
                  <option key={p.id} value={p.id}>
                    {t('papers.option', { paper: t(`papers.names.${p.id}`), size: sizeText(p.w, p.h) })}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="custom">{t('papers.custom')}</option>
          </select>
        </label>
        <fieldset className="field">
          <legend className="field-label">{t('props.orientation')}</legend>
          <div className="segmented icons">
            <label className="seg">
              <input type="radio" name="orientation" id="portrait" value="portrait" data-tip={t('props.portrait')} checked={!landscape} disabled={busyOff(busy, 'portrait')} onChange={(e) => e.target.checked && setOrientation(false)} />
              <span>
                <Icon icon={RectangleVertical} />
                <span className="sr-only">{t('props.portrait')}</span>
              </span>
            </label>
            <label className="seg">
              <input
                type="radio"
                name="orientation"
                id="landscape"
                value="landscape"
                data-tip={t('props.landscape')}
                {...landscapeKeys}
                checked={landscape}
                disabled={busyOff(busy, 'landscape')}
                onChange={(e) => e.target.checked && setOrientation(true)}
              />
              <span>
                <Icon icon={RectangleHorizontal} />
                <span className="sr-only">{t('props.landscape')}</span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>
      <div id="custom-paper" className="custom-paper" hidden={!custom}>
        <div className="prop-grid">
          {sideField('w')}
          {sideField('h')}
        </div>
        <p id="paper-error" className="field-error" hidden={!error}>
          {error?.text}
        </p>
        <p id="paper-match" className="field-note" hidden={!showMatch}>
          {matchText}
        </p>
      </div>
      <SheetLength name="margin" />
    </Section>
  );
}

/** Margin and gap: 0 to 50 mm, in one undo step while editing. */
export function SheetLength({ name }: { name: 'margin' | 'gap' }) {
  const busy = useDocument((s) => s.busy);
  useDocument((s) => s[name]);
  usePrefs((s) => s.unit);
  return (
    <label className="field inline">
      <span className="field-label">
        <span>{t(name === 'margin' ? 'props.margin' : 'props.gap')}</span>
        <span id={`${name}-unit`} className="sr-only">
          {t(name === 'margin' ? 'props.marginUnit' : 'props.gapUnit', { unit: unitName() })}
        </span>
      </span>
      <span className="num-field">
        <LengthField
          id={name}
          disabled={busyOff(busy, name)}
          value={() => getDocument()[name]}
          limit={(mm) => clamp(mm, 0, 50)}
          busy={() => getDocument().busy}
          apply={(mm, { final }) => setSheetLength(name, mm, { final })}
        />
        <span className="num-unit" aria-hidden="true">
          {unitSymbol()}
        </span>
      </span>
    </label>
  );
}
