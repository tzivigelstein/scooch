// The calculator's words for a count (src/site/calc.ts): the count and the
// drawing's name take the language's plural form; the note says whether one
// copy fits or several. Its answers are compared across languages in
// tests/site/languages.test.ts, and its script in e2e/specs/site-pages.spec.ts.
import { describe, expect, test } from 'vitest';
import { calc, type CalcTexts } from '../../src/site/calc.ts';
import { CALC_START } from '../../src/site/facts/how-many.ts';

const texts = (locale: string): CalcTexts => ({
  locale,
  max: 200,
  papers: { A4: 'A4' },
  photos: {},
  orientation: { portrait: 'P', landscape: 'L' },
  count: { one: 'ONE', other: 'OTHER', capped: '> {n}' },
  photoPreset: '{name}',
  summary: '{photo}',
  noRotate: '',
  noteNone: 'NONE',
  noteSame: { one: 'JUST ONE', other: 'SEVERAL {n}' },
  noteMore: 'MORE',
  noteCapped: 'CAP',
  figure: { one: '{n} ONE', other: '{n} OTHER' },
});
/** A custom photo that fits once, none or several times on A4 with 5 mm margins. */
const photo = (w: number, h: number) => ({ ...CALC_START, photo: 'custom', w, h });

describe('the calculator’s words for a count', () => {
  test.each([
    ['es', photo(150, 250), 'ONE', 'JUST ONE'],
    ['es', photo(300, 400), 'OTHER', 'NONE'],
    ['en', photo(50, 50), 'OTHER', 'SEVERAL 15'],
    ['fr', photo(300, 400), 'ONE', 'NONE'],
    ['hi', photo(300, 400), 'ONE', 'NONE'],
    ['zh-Hans', photo(150, 250), 'OTHER', 'JUST ONE'],
  ] as const)('in %s, %o: the count says «%s» and the note «%s»', (locale, state, words, note) => {
    const result = calc(state, texts(locale));
    expect(result.countHtml).toMatch(new RegExp(`</strong> ${words}$`));
    expect(result.svg).toContain(`aria-label="${result.count} ${words}"`);
    expect(result.note).toBe(note);
  });

  test('in Chinese, the count, the paper and its orientation, and the notes join without spaces', () => {
    const chinese: CalcTexts = {
      ...texts('zh-Hans'),
      orientation: { portrait: '纵向', landscape: '横向' },
      count: { one: '张', other: '张', capped: '超过{n}' },
      summary: '{paper}',
      noteSame: { one: '一张。', other: '{n}张。' },
      noteCapped: '上限{max}个。',
      figure: { one: '{paper}：{n}张', other: '{paper}：{n}张' },
    };
    const result = calc({ ...photo(50, 50), landscape: true }, chinese);
    expect(result.countHtml).toBe('<strong>15</strong>张');
    expect(result.summary).toBe('A4横向');
    expect(result.svg).toContain('aria-label="A4横向：15张"');
    expect(calc({ ...photo(5, 5), margin: 0, gap: 0 }, chinese).note).toBe('200张。上限200个。');
  });
});
