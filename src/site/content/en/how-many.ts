// «How many photos fit on a page?»: the calculator (calc-form.ts, run again
// in the browser by calculator.ts) and reference tables.

import { PHOTO_SIZES } from '../../../core/crop.js';
import { PAPERS } from '../../../core/papers.js';
import type { CalcTexts } from '../../calc.ts';
import { calculatorHtml } from '../../calc-form.ts';
import { CALC_START, howManyFacts } from '../../facts/how-many.ts';
import { guide } from '../../guide.ts';
import { app, MAX_ITEMS, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { bare } from './chrome.ts';
import { PATHS } from './paths.ts';

export const calcTexts = ({ ui, paperName, photoName }: Kit): CalcTexts => ({
  locale: 'en',
  max: MAX_ITEMS,
  papers: Object.fromEntries(PAPERS.map((p) => [p.id, paperName(p.id)])),
  photos: Object.fromEntries(PHOTO_SIZES.map((s) => [s.id, photoName(s.id)])),
  orientation: { portrait: 'portrait', landscape: 'landscape' },
  count: { one: 'photo per sheet', other: 'photos per sheet', capped: 'more than {n}' },
  photoPreset: '{name} ({size})',
  summary: '{photo} on {paper}, with a {margin} margin and {gap} spacing',
  noRotate: `, without ${ui('props.rotate').toLowerCase()}`,
  noteNone: 'The photo doesn’t fit in the sheet’s printable area. Reduce the margin or choose a larger paper.',
  noteSame: {
    one: `Add your photo and press ${ui('bar.arrange')} to place it.`,
    other: `Add your photo and use ${ui('props.fill')}: it places {n} copies at once.`,
  },
  noteMore: `${ui('props.fill')} places {grid}, all facing the same way. To get {n}, duplicate the photo until you have {n} and press ${ui('bar.arrange')}: ${app} rotates the ones that need it.`,
  noteCapped: 'A project holds up to {max} items.',
  figure: { one: '{n} photo on one {paper} sheet', other: '{n} photos on one {paper} sheet' },
});

export function howMany(k: Kit): SitePage {
  const { ui, num, mm, size, photoName, paperName } = k;
  const f = howManyFacts();
  const calculator = calculatorHtml(k, CALC_START, calcTexts(k), {
    name: 'Calculator',
    custom: 'Other size',
    width: 'Photo width, in mm',
    height: 'Photo height, in mm',
    margin: `${ui('props.margin')}, in mm`,
    gap: `${ui('props.gap')} between photos, in mm`,
    noscript: 'The calculator needs JavaScript. The tables below have the most common sizes.',
    open: `Open in ${app} with this sheet`,
  });
  const fourBySix = bare(photoName('10x15'));

  return guide({
    id: 'how-many',
    lang: 'en',
    path: PATHS['how-many'],
    title: `How many photos fit on a page? Calculator · ${app}`,
    description: `Work out how many ${fourBySix}, ID, passport or other photos fit on an A4, Letter or Legal sheet with your margins, then open the sheet in the editor.`,
    h1: 'How many photos fit on a page?',
    crumb: 'How many photos fit on a page',
    lead: `Choose the paper, the size of the photos, the margin and the spacing. The calculator uses the same method as ${app}’s ${ui('bar.arrange')} button, so the number is the one you’ll get in the editor.`,
    ctas: [],
    feature: calculator,
    scripts: ['calculator'],
    sections: [
      {
        h2: 'Photos per sheet on the most common papers',
        html: table(
          [{ head: 'Photo' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
          f.rows.map((r) => [`${photoName(r.id)} <span class="muted">(${size(r.w, r.h)})</span>`, ...r.counts.map((n) => num(n))]),
          `With ${mm(f.margin)} margins, ${mm(f.gap)} of spacing between photos and ${ui('props.rotate')} on. It’s what ${ui('bar.arrange')} places.`
        ),
      },
      {
        h2: 'What changes the result',
        html: `<ul>
<li><strong>The margin.</strong> Many printers can’t print all the way to the edge of the paper. With a smaller margin more photos fit, but only if your printer reaches that far.</li>
<li><strong>The spacing.</strong> A few millimeters between photos make them easier to cut, though sometimes one fewer fits.</li>
<li><strong>Rotation.</strong> With ${ui('props.rotate')}, ${app} can rotate some photos so that more of them fit.</li>
<li><strong>The exact size.</strong> In ${app}, a ${photoName('10x15')} photo measures ${size(f.tenByFifteen.w, f.tenByFifteen.h)}, the real size of lab prints. A few millimeters change the result.</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: `How many ${fourBySix} photos fit on an A4 sheet?`,
        a: `With ${mm(5)} margins, ${num(f.a4Wide)}. With margins of ${mm(f.narrowMargin)} or less and no spacing, ${num(f.a4Narrow)}: two upright and one sideways below them.`,
      },
      {
        q: 'How many 4 × 4 cm ID photos fit on an A4 sheet?',
        a: `${num(f.id4Cut)}, with ${mm(f.margin)} margins and ${mm(f.gap)} of spacing to cut them. Without spacing, ${num(f.id4Tight)}.`,
      },
      {
        q: 'How many passport photos fit on a Letter sheet?',
        a: `At ${size(f.passport.w, f.passport.h)}, with ${mm(f.margin)} margins and ${mm(f.gap)} of spacing: ${num(f.passport.count)}${f.passport.grid < f.passport.count ? `, mixing upright and rotated photos; in rows and columns, ${num(f.passport.grid)}` : ''}.`,
      },
      {
        q: 'Why do other calculators give a different number?',
        a: 'Because they assume other margins, other spacing or another exact size, or they don’t rotate photos. Here you can change each value and see how the photos sit on the sheet.',
      },
    ],
  });
}
