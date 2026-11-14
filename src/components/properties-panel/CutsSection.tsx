// «Líneas de corte» (Hojas tab): none, corner marks or the outline, and in
// «Más opciones» the marks' length and distance and the stroke (weight,
// color, dash). Document settings: in the undo history and saved with it;
// whether «Más opciones» is open is remembered in this browser.

import { Ban, Scan, Square, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CUT_COLORS, CUT_WEIGHTS, isHexColor } from '../../core/cutmarks.js';
import { CUT_LIMITS } from '../../core/projectdoc.js';
import type { CutDash, CutMode, CutWeight } from '../../core/types.ts';
import { t } from '../../copy/index.ts';
import { lengthText, unitName, unitSymbol } from '../../services/measure.ts';
import { getDocument, useDocument } from '../../state/document.ts';
import { endEdit } from '../../state/history.ts';
import { setCutOptionsOpen, usePrefs } from '../../state/prefs.ts';
import { gapForCuts, setCuts, useGapForCuts } from '../../state/actions/sheets.ts';
import { Icon } from '../ui/Icon.tsx';
import { LengthField } from '../ui/LengthField.tsx';
import { Section } from '../ui/Section.tsx';
import { Segmented } from '../ui/Segmented.tsx';

const MODES: readonly { value: CutMode; icon: LucideIcon }[] = [
  { value: 'none', icon: Ban },
  { value: 'corners', icon: Scan },
  { value: 'outline', icon: Square },
];

type ColorChoice = 'black' | 'gray' | 'custom';
const colorChoice = (color: string): ColorChoice => (color.toLowerCase() === CUT_COLORS.black ? 'black' : color.toLowerCase() === CUT_COLORS.gray ? 'gray' : 'custom');
/** The color «Otro» starts from when the current one is a preset. */
const FIRST_CUSTOM = '#1f6feb';

function HexField({ color }: { color: string }) {
  const [text, setText] = useState(color.toUpperCase());
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (document.activeElement?.id !== 'cut-hex') setText(color.toUpperCase());
  }, [color]);
  const confirm = () => {
    const value = text.trim().startsWith('#') ? text.trim() : `#${text.trim()}`;
    if (isHexColor(value)) {
      setInvalid(false);
      setText(value.toUpperCase());
      setCuts({ color: value.toLowerCase() }, { final: true });
    } else setInvalid(true);
  };
  return (
    <>
      <input
        id="cut-hex"
        type="text"
        className="hex-input"
        value={text}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-label={t('cuts.hex')}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'cut-hex-error' : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (invalid && isHexColor(e.target.value.trim())) setInvalid(false);
        }}
        onBlur={confirm}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm();
          if (e.key === 'Escape' && (invalid || text !== color.toUpperCase())) {
            e.stopPropagation();
            setText(color.toUpperCase());
            setInvalid(false);
          }
        }}
      />
      <p id="cut-hex-error" className="field-error" hidden={!invalid}>
        {t('cuts.hexInvalid')}
      </p>
    </>
  );
}

export function CutsSection() {
  const cuts = useDocument((s) => s.cuts);
  const gap = useDocument((s) => s.gap);
  const busy = useDocument((s) => s.busy);
  usePrefs((s) => s.unit);
  const optionsOpen = usePrefs((s) => s.cutOptions);
  const choice = colorChoice(cuts.color);
  const needed = gapForCuts();
  const tight = cuts.mode === 'corners' && gap < needed - 1e-9;
  return (
    <Section name="cuts" title={t('cuts.title')}>
      <Segmented
        id="cut-mode"
        className="segmented chips cut-modes"
        name="cut-mode"
        label={t('cuts.title')}
        value={cuts.mode}
        onChange={(mode) => setCuts({ mode })}
        options={MODES.map(({ value, icon }) => ({
          value,
          input: { 'data-tip': t(`cuts.modeTips.${value}`), disabled: busy },
          label: (
            <span>
              <Icon icon={icon} />
              {t(`cuts.modes.${value}`)}
            </span>
          ),
        }))}
      />
      {tight && (
        <p id="cut-gap-note" className="field-note gap-note">
          <span>{t('cuts.gapNote', { value: lengthText(needed) })}</span>
          <button type="button" id="cut-gap-fix" className="link-btn" disabled={busy} onClick={useGapForCuts}>
            {t('cuts.gapFix', { value: lengthText(needed) })}
          </button>
        </p>
      )}
      <details id="cut-options" className="fill-details cut-details" hidden={cuts.mode === 'none'} open={optionsOpen} onToggle={(e) => setCutOptionsOpen(e.currentTarget.open)}>
        <summary>{t('cuts.more')}</summary>
        <div className="fill-body">
          <div className="field cut-margin">
            <label className="field-label" htmlFor="cut-margin">
              {t('cuts.margin')}
            </label>
            <span className="num-field">
              <LengthField
                id="cut-margin"
                aria-label={t('cuts.marginLabel', { unit: unitName() })}
                data-tip={t('cuts.margin')}
                disabled={busy}
                value={() => getDocument().cuts.margin}
                range={() => ({ min: CUT_LIMITS.margin[0], max: CUT_LIMITS.margin[1] })}
                editKey={() => 'cuts:margin'}
                busy={() => getDocument().busy}
                apply={(mm, { final }) => setCuts({ margin: mm }, { key: 'cuts:margin', final })}
              />
              <span className="num-unit" aria-hidden="true">
                {unitSymbol()}
              </span>
            </span>
          </div>
          {cuts.mode === 'corners' && (
            <div className="prop-grid">
              {(['length', 'offset'] as const).map((name) => (
                <label key={name} className="field">
                  <span className="field-label">{t(`cuts.${name}`)}</span>
                  <span className="num-field">
                    <LengthField
                      id={`cut-${name}`}
                      aria-label={t(name === 'length' ? 'cuts.lengthLabel' : 'cuts.offsetLabel', { unit: unitName() })}
                      data-tip={t(name === 'length' ? 'cuts.lengthTip' : 'cuts.offsetTip')}
                      disabled={busy}
                      value={() => getDocument().cuts[name]}
                      range={() => ({ min: CUT_LIMITS[name][0], max: CUT_LIMITS[name][1] })}
                      editKey={() => `cuts:${name}`}
                      busy={() => getDocument().busy}
                      apply={(mm, { final }) => setCuts({ [name]: mm }, { key: `cuts:${name}`, final })}
                    />
                    <span className="num-unit" aria-hidden="true">
                      {unitSymbol()}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="field">
            <span id="cut-weight-label" className="field-label">
              {t('cuts.weight')}
            </span>
            <Segmented
              id="cut-weight"
              className="segmented chips small"
              name="cut-weight"
              labelledBy="cut-weight-label"
              value={cuts.weight}
              onChange={(weight: CutWeight) => setCuts({ weight })}
              options={(Object.keys(CUT_WEIGHTS) as CutWeight[]).map((value) => ({
                value,
                input: { 'data-tip': t('cuts.weightTip', { n: CUT_WEIGHTS[value] }) },
                label: <span>{t(`cuts.weights.${value}`)}</span>,
              }))}
            />
          </div>
          <div className="field">
            <span id="cut-color-label" className="field-label">
              {t('cuts.color')}
            </span>
            <Segmented
              id="cut-colors"
              className="segmented chips small"
              name="cut-color"
              labelledBy="cut-color-label"
              value={choice}
              onChange={(value: ColorChoice) => setCuts({ color: value === 'custom' ? (choice === 'custom' ? cuts.color : FIRST_CUSTOM) : CUT_COLORS[value] })}
              options={(['black', 'gray', 'custom'] as const).map((value) => ({
                value,
                label: (
                  <span>
                    <i className="swatch" style={{ background: value === 'custom' ? (choice === 'custom' ? cuts.color : 'conic-gradient(#e5484d, #f5a623, #30a46c, #1f6feb, #8e4ec6, #e5484d)') : CUT_COLORS[value] }} aria-hidden="true" />
                    {t(`cuts.colors.${value}`)}
                  </span>
                ),
              }))}
            />
            {choice === 'custom' && (
              <div className="color-row">
                <input
                  id="cut-color"
                  type="color"
                  value={cuts.color}
                  aria-label={t('cuts.picker')}
                  data-tip={t('cuts.picker')}
                  disabled={busy}
                  onChange={(e) => setCuts({ color: e.target.value.toLowerCase() }, { key: 'cuts:color' })}
                  onBlur={() => endEdit()}
                />
                <HexField color={cuts.color} />
              </div>
            )}
          </div>
          <div className="field">
            <span id="cut-dash-label" className="field-label">
              {t('cuts.dash')}
            </span>
            <Segmented
              id="cut-dash"
              className="segmented chips small"
              name="cut-dash"
              labelledBy="cut-dash-label"
              value={cuts.dash}
              onChange={(dash: CutDash) => setCuts({ dash })}
              options={(['solid', 'dotted'] as const).map((value) => ({ value, label: <span>{t(`cuts.dashes.${value}`)}</span> }))}
            />
          </div>
        </div>
      </details>
    </Section>
  );
}
