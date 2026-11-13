// Length fields (X, Y, width, height, margin, gap, grid, paper): a text input
// with inputmode="decimal" that shows and accepts the chosen unit. It reads
// «2,5», «2.5 cm», «1/2 in»… (core/units.js); the rest is NumberField's.

import type { Ref } from 'react';
import { isPartialLength, parseLength, stepFor } from '../../core/units.js';
import { lengthText, lengthValue } from '../../services/measure.ts';
import { getPrefs, usePrefs } from '../../state/prefs.ts';
import { NumberField, type NumberFieldHandle, type NumberFieldProps } from './NumberField.tsx';

export type LengthFieldHandle = NumberFieldHandle;

export type LengthFieldProps = Omit<NumberFieldProps, 'parse' | 'isPartial' | 'format' | 'describe' | 'stepBy' | 'ref'> & { ref?: Ref<LengthFieldHandle> };

const parse = (text: string) => parseLength(text, getPrefs().unit);
const isPartial = (text: string) => isPartialLength(text, getPrefs().unit);
const stepBy = (size: 'fine' | 'normal' | 'coarse') => stepFor(getPrefs().unit, size).mm;

export function LengthField(props: LengthFieldProps) {
  // A unit change re-renders the field, which shows the value in the new unit.
  usePrefs((s) => s.unit);
  return (
    <NumberField
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      parse={parse}
      isPartial={isPartial}
      format={lengthValue}
      describe={lengthText}
      stepBy={stepBy}
      {...props}
    />
  );
}
