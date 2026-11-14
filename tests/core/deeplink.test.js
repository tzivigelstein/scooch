import { describe, expect, test } from 'vitest';
import { DEEP_LINK_KEYS, deepLinkSearch, parseDeepLink, setsUp, withoutDeepLink } from '../../src/core/deeplink.js';

const settings = (search, defaults) => parseDeepLink(search, defaults)?.settings;

describe('which queries are deep links', () => {
  test.each(['', '?', '?utm_source=news', '?project=p1', '#paper=A4'])('«%s» is not one', (search) => {
    expect(parseDeepLink(search)).toBeNull();
  });

  test('the parameters present are listed in a fixed order, valid or not', () => {
    expect(parseDeepLink('?rotate=maybe&utm=x&paper=A4&margin=abc')?.keys).toEqual(['paper', 'margin', 'rotate']);
    expect(DEEP_LINK_KEYS).toEqual(['paper', 'orientation', 'margin', 'gap', 'photo', 'cuts', 'rotate']);
  });

  test('a link whose values are all unreadable sets nothing up', () => {
    const link = parseDeepLink('?paper=A10&orientation=diagonal&margin=wide&gap=&photo=huge&cuts=dashed&rotate=maybe');
    expect(link?.settings).toEqual({});
    expect(link?.photo).toBeNull();
    expect(setsUp(link)).toBe(false);
    expect(setsUp(parseDeepLink('?photo=10x15'))).toBe(true);
    expect(setsUp(parseDeepLink('?gap=0'))).toBe(true);
    expect(setsUp(null)).toBe(false);
  });
});

describe('paper and orientation', () => {
  test.each([
    ['A4', 'A4'],
    ['a3', 'A3'],
    ['Letter', 'letter'],
    ['carta', 'letter'],
    ['OFICIO', 'legal'],
    ['tabloide', 'tabloid'],
    ['folio', 'folio'],
    ['photo-10x15', 'photo-10x15'],
  ])('«%s» is the preset %s, in any case', (text, id) => {
    expect(settings(`?paper=${text}`)).toEqual({ paper: id });
  });

  test('a custom size in mm is stored portrait, and its orientation comes from the size', () => {
    expect(settings('?paper=216x330mm')).toEqual({ paper: { custom: true, w: 216, h: 330 }, landscape: false });
    expect(settings('?paper=330x216mm')).toEqual({ paper: { custom: true, w: 216, h: 330 }, landscape: true });
    expect(settings('?paper=100,5x150.25mm')).toEqual({ paper: { custom: true, w: 100.5, h: 150.25 }, landscape: false });
  });

  test('a custom size out of range is clamped to the custom paper limits', () => {
    expect(settings('?paper=5x9000mm')).toEqual({ paper: { custom: true, w: 20, h: 2000 }, landscape: false });
  });

  test.each(['A10', '216x330', '216x330cm', 'x330mm', '-216x330mm', '216 x 330mm'])('«%s» is not a paper', (text) => {
    expect(settings(`?paper=${encodeURIComponent(text)}`)).toEqual({});
  });

  test.each([
    ['landscape', true],
    ['horizontal', true],
    ['Portrait', false],
    ['vertical', false],
  ])('orientation «%s»', (text, landscape) => {
    expect(settings(`?orientation=${text}`)).toEqual({ landscape });
  });

  test('the orientation the link says wins over the one a custom size implies', () => {
    expect(settings('?paper=216x330mm&orientation=landscape')).toEqual({ paper: { custom: true, w: 216, h: 330 }, landscape: true });
  });
});

describe('margin and gap', () => {
  test.each([
    ['5', 5],
    ['0', 0],
    ['2.5', 2.5],
    ['2,5', 2.5],
    ['3.14159', 3.14],
    ['80', 50],
    ['-3', 0],
  ])('«%s» mm is %s mm, clamped to 0–50', (text, mm) => {
    expect(settings(`?margin=${text}&gap=${text}`)).toEqual({ margin: mm, gap: mm });
  });

  test.each(['', 'abc', '5mm', '1e3', '.5', '5.', 'Infinity', '1/2'])('«%s» is not a length', (text) => {
    expect(settings(`?margin=${encodeURIComponent(text)}&gap=${encodeURIComponent(text)}`)).toEqual({});
  });

  test('a margin that leaves no printable area on the chosen paper is ignored, the paper is kept', () => {
    // Foto 9 × 13 is 88,9 mm wide.
    expect(settings('?paper=photo-9x13&margin=44.45')).toEqual({ paper: 'photo-9x13' });
    expect(settings('?paper=photo-9x13&margin=44.4')).toEqual({ paper: 'photo-9x13', margin: 44.4 });
    expect(settings('?paper=photo-9x13&orientation=landscape&margin=45')).toEqual({ paper: 'photo-9x13', landscape: true });
    expect(settings('?paper=A4&margin=50')).toEqual({ paper: 'A4', margin: 50 });
  });

  test('without a paper, the margin is checked against the default one', () => {
    expect(settings('?margin=50', { paper: { custom: true, w: 90, h: 120 } })).toEqual({});
    expect(settings('?margin=40', { paper: { custom: true, w: 90, h: 120 } })).toEqual({ margin: 40 });
  });
});

describe('cut lines and «Rotación automática»', () => {
  test.each(['none', 'corners', 'outline', 'OUTLINE'])('cut lines «%s»', (text) => {
    expect(settings(`?cuts=${text}`)).toEqual({ cutMode: text.toLowerCase() });
  });

  test.each([
    ['on', true],
    ['1', true],
    ['true', true],
    ['off', false],
    ['0', false],
    ['False', false],
  ])('rotate «%s»', (text, rotate) => {
    expect(settings(`?rotate=${text}`)).toEqual({ rotate });
  });
});

describe('photo size', () => {
  test.each([
    ['10x15', { id: '10x15', w: 101.6, h: 152.4 }],
    ['id-4x4', { id: 'id-4x4', w: 40, h: 40 }],
    ['Passport-35x45', { id: 'passport-35x45', w: 35, h: 45 }],
    ['visa-5x5', { id: 'visa-5x5', w: 50.8, h: 50.8 }],
  ])('the preset «%s»', (text, photo) => {
    expect(parseDeepLink(`?photo=${text}`)?.photo).toEqual(photo);
  });

  test('a preset id that looks like a size is the preset; a custom size says «mm»', () => {
    expect(parseDeepLink('?photo=20x30')?.photo).toEqual({ id: '20x30', w: 203.2, h: 304.8 });
    expect(parseDeepLink('?photo=20x30mm')?.photo).toEqual({ id: null, w: 20, h: 30 });
  });

  test('a custom size keeps its orientation and is clamped to 5–1000 mm', () => {
    expect(parseDeepLink('?photo=45x35mm')?.photo).toEqual({ id: null, w: 45, h: 35 });
    expect(parseDeepLink('?photo=1x2000mm')?.photo).toEqual({ id: null, w: 5, h: 1000 });
  });

  test.each(['', 'huge', '4x4', '30x40cm', '30x40'])('«%s» is not a photo size', (text) => {
    expect(parseDeepLink(`?photo=${text}`)?.photo).toBeNull();
  });
});

describe('building links', () => {
  test('a link writes only what it sets, in a fixed order', () => {
    expect(deepLinkSearch({})).toBe('');
    expect(deepLinkSearch({ rotate: false, margin: 5, paper: 'A4' })).toBe('?paper=A4&margin=5&rotate=off');
    expect(deepLinkSearch({ paper: { custom: true, w: 216, h: 330 }, landscape: true, gap: 2.5, photo: { w: 25, h: 30 }, cutMode: 'outline' })).toBe(
      '?paper=216x330mm&orientation=landscape&gap=2.5&photo=25x30mm&cuts=outline'
    );
  });

  test('what a built link sets is what parsing it gives back', () => {
    const requests = [
      { paper: 'letter', landscape: false, margin: 5, gap: 2, photo: 'passport-35x45', cutMode: 'outline', rotate: true },
      { paper: 'photo-10x15', margin: 0, gap: 0 },
      { paper: { custom: true, w: 100, h: 148 }, landscape: true, photo: { w: 25, h: 30 } },
    ];
    for (const { photo, ...request } of requests) {
      const link = parseDeepLink(deepLinkSearch({ ...request, photo }));
      expect(link?.settings).toEqual(request);
      if (typeof photo === 'string') expect(link?.photo?.id).toBe(photo);
      else if (photo) expect(link?.photo).toEqual({ id: null, ...photo });
    }
  });

  test('removing a link leaves the other parameters as they were', () => {
    expect(withoutDeepLink('?utm_source=a&paper=A4&margin=5&ref=b')).toBe('?utm_source=a&ref=b');
    expect(withoutDeepLink('?paper=A4')).toBe('');
    expect(withoutDeepLink('')).toBe('');
  });
});
