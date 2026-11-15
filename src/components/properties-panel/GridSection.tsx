// The «Grilla» section: show it, its size and snapping. View preferences:
// saved, but outside the undo history.

import { GRID_MAX, GRID_MIN } from '../../config.ts';
import { gridPresets } from '../../core/units.js';
import { clamp } from '../../core/util.ts';
import { keyLabel, numberLocale, t } from '../../copy/index.ts';
import { SHORTCUTS, useShortcut } from '../../hooks/shortcuts.ts';
import { previewAttrs } from '../../hooks/usePreviewTriggers.ts';
import { unitName, unitSymbol } from '../../services/measure.ts';
import { getPrefs, setGrid, usePrefs } from '../../state/prefs.ts';
import { setGridVisible } from '../../state/actions/sheets.ts';
import { LengthField } from '../ui/LengthField.tsx';
import { Section } from '../ui/Section.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Switch } from '../ui/Switch.tsx';
import './sections.css';
import './GridSection.css';

export function GridSection() {
  const grid = usePrefs((s) => s.grid);
  const unit = usePrefs((s) => s.unit);
  const gridKeys = useShortcut('grid');
  const presets = gridPresets(unit, { locale: numberLocale() });
  const chosen = presets.find((preset) => Math.abs(preset.mm - grid.size) < 1e-6);
  return (
    <Section name="grid" title={t('props.grid')}>
      {/* The key goes in the tooltip, like every other control's: not in the name. */}
      <Switch
        id="grid-show"
        label={<span>{t('props.gridShow')}</span>}
        checked={grid.show}
        onChange={setGridVisible}
        aria-keyshortcuts={gridKeys['aria-keyshortcuts']}
        data-tip={t('props.gridShow')}
        data-kbd={keyLabel(SHORTCUTS.grid.aria)}
        data-single=""
      />
      <fieldset className="field" {...previewAttrs('grid')}>
        <legend className="field-label">{t('props.gridSize')}</legend>
        <div className="grid-size">
          <Segmented
            id="grid-chips"
            fit
            name="grid-size"
            value={chosen ? String(chosen.mm) : null}
            onChange={(value) => setGrid({ size: Number(value) })}
            options={presets.map((preset) => ({ value: String(preset.mm), label: <span>{t('props.gridChip', { n: preset.label, unit: unitSymbol() })}</span> }))}
          />
          <span className="num-field">
            <LengthField
              id="grid-size"
              aria-label={t('props.gridCustom', { unit: unitName() })}
              value={() => getPrefs().grid.size}
              range={() => ({ min: GRID_MIN, max: GRID_MAX })}
              apply={(mm) => setGrid({ size: clamp(mm, GRID_MIN, GRID_MAX) })}
            />
            <span className="num-unit" aria-hidden="true">
              {unitSymbol()}
            </span>
          </span>
        </div>
      </fieldset>
      <Switch
        id="grid-snap"
        label={<span>{t('props.snap')}</span>}
        hint={t('props.snapHint')}
        checked={grid.snap}
        onChange={(snap) => setGrid({ snap })}
      />
    </Section>
  );
}
