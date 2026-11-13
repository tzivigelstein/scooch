import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { UNITS, toMm, decimalsFor, formatLength, parseLength } from '../../src/core/units.js';
import { prng } from '../support/prng.js';

describe('round trip', () => {
  const values = [0, 0.04, 0.05, 0.1, 1, 1.5875, 3.175, 10, 12.7, 25.4, 99.95, 101.6, 148, 210, 215.9, 297, 355.6, 1189, 2000];
  const rnd = prng(2024);
  for (let i = 0; i < 300; i++) values.push(rnd() * 2000, rnd() * 50, -rnd() * 100);

  test('mm → text → mm stays within the resolution of the format and is stable', () => {
    for (const locale of ['es', 'en', 'es-AR', 'de-CH', 'fr', 'sv', 'fi', 'ar-EG', 'hi-IN']) {
      for (const unit of UNITS) {
        const half = (0.5 * toMm(1, unit)) / 10 ** decimalsFor(unit);
        for (const mm of values) {
          const text = formatLength(mm, unit, { locale });
          const back = parseLength(text, unit);
          assert.ok(back !== null, `${locale} ${unit}: could not read «${text}»`);
          assert.ok(Math.abs(back - mm) <= half + 1e-9, `${locale} ${unit}: ${mm} → «${text}» → ${back}`);
          // Formatting what was read gives the same text: no drift however many round trips.
          assert.equal(formatLength(back, unit, { locale }), text, `${locale} ${unit}: ${mm}`);
          // Without a symbol, with the global unit, too.
          const bare = formatLength(mm, unit, { locale, withUnit: false });
          assert.equal(parseLength(bare, unit), back, `${locale} ${unit}: «${bare}»`);
          // The suffix overrides the global unit.
          const other = unit === 'mm' ? 'in' : 'mm';
          assert.equal(parseLength(text, other), back, `${locale} ${unit} read with ${other}`);
        }
      }
    }
  });

  test('going through another unit does not accumulate error', () => {
    for (const mm of values.slice(0, 60)) {
      let v = mm;
      for (let i = 0; i < 5; i++) v = parseLength(formatLength(v, 'in'), 'in');
      const once = parseLength(formatLength(mm, 'in'), 'in');
      assert.equal(v, once, `${mm}`);
    }
  });
});
