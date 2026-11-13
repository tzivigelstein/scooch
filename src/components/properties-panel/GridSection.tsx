// The «Grilla» section: show it, its size and snapping. View preferences:
// saved, but outside the undo history.

import { Magnet } from 'lucide-react';
import { GRID_MAX, GRID_MIN } from '../../config.ts';
import { gridPresets } from '../../core/units.js';
import { clamp } from '../../core/util.ts';
import { numberLocale, t } from '../../copy/index.ts';
import { useShortcut } from '../../hooks/shortcuts.ts';
import { unitName, unitSymbol } from '../../services/measure.ts';
import { getPrefs, setGrid, usePrefs } from '../../state/prefs.ts';
import { setGridVisible } from '../../state/actions/sheets.ts';
import { Icon } from '../ui/Icon.tsx';
import { LengthField } from '../ui/LengthField.tsx';
import { Section } from '../ui/Section.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Switch } from '../ui/Switch.tsx';

export function GridSection() {
  const grid = usePrefs((s) => s.grid);
  const unit = usePrefs((s) => s.unit);
  const gridKeys = useShortcut('grid');
  const presets = gridPresets(unit, { locale: numberLocale });
  const chosen = presets.find((preset) => Math.abs(preset.mm - grid.size) < 1e-6);
  return (
    <Section name="grid" title={t('props.grid')}>
      <Switch
        id="grid-show"
        label={
          <span>
            <span>{t('props.gridShow')}</span>{' '}
            <kbd className="inline-kbd" data-single-hint="">
              G
            </kbd>
          </span>
        }
        hint={t('props.gridShowHint')}
        checked={grid.show}
        onChange={setGridVisible}
        aria-keyshortcuts={gridKeys['aria-keyshortcuts']}
        data-single=""
      />
      <fieldset className="field">
        <legend className="field-label">{t('props.gridSize')}</legend>
        <div className="grid-size">
          <Segmented
            id="grid-chips"
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
              check={(mm) => (mm > 0 ? null : t('props.positive'))}
              limit={(mm) => clamp(mm, GRID_MIN, GRID_MAX)}
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
        label={
          <span className="with-icon">
            <Icon icon={Magnet} />
            <span>{t('props.snap')}</span>
          </span>
        }
        hint={t('props.snapHint')}
        checked={grid.snap}
        onChange={(snap) => setGrid({ snap })}
      />
    </Section>
  );
}
