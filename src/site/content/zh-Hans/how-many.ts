// «一张纸能打印几张照片？» (how many photos fit on a sheet): the calculator
// (calc-form.ts, run again in the browser by calculator.ts) and reference tables.

import { PHOTO_SIZES } from '../../../core/crop.js';
import { PAPERS } from '../../../core/papers.js';
import type { CalcTexts } from '../../calc.ts';
import { calculatorHtml } from '../../calc-form.ts';
import { CALC_START, howManyFacts } from '../../facts/how-many.ts';
import { guide } from '../../guide.ts';
import { app, MAX_ITEMS, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q, sizeCell } from './chrome.ts';
import { PATHS } from './paths.ts';

// Chinese has one plural form: «one» and «other» say the same. The count is
// shown large on a line of its own, above its words (calc.ts).
export const calcTexts = ({ ui, paperName, photoName }: Kit): CalcTexts => ({
  locale: 'zh-Hans',
  max: MAX_ITEMS,
  papers: Object.fromEntries(PAPERS.map((p) => [p.id, paperName(p.id)])),
  photos: Object.fromEntries(PHOTO_SIZES.map((s) => [s.id, photoName(s.id)])),
  orientation: { portrait: ui('props.portrait'), landscape: ui('props.landscape') },
  count: { one: '张照片／每张纸', other: '张照片／每张纸', capped: '超过{n}' },
  photoPreset: '{name}（{size}）',
  summary: '{photo}，{paper}，页边距{margin}，间距{gap}',
  noRotate: `，不${ui('props.rotate')}`,
  noteNone: '照片放不进纸张的可打印区域。减小页边距，或选择更大的纸张。',
  noteSame: {
    one: `添加照片后点击${q(ui('bar.arrange'))}，即可放好。`,
    other: `添加照片后使用${q(ui('props.fill'))}：一次放好{n}张。`,
  },
  noteMore: `${q(ui('props.fill'))}能放{grid}张，方向全部相同。要放到{n}张，先为照片创建副本，直到共有{n}张，再点击${q(ui('bar.arrange'))}：${app}会旋转需要旋转的照片。`,
  noteCapped: '一个项目最多可以有{max}个素材。',
  figure: { one: '一张{paper}纸上的{n}张照片', other: '一张{paper}纸上的{n}张照片' },
});

export function howMany(k: Kit): SitePage {
  const { ui, num, mm, size, photoName, paperName } = k;
  const f = howManyFacts();
  const calculator = calculatorHtml(k, CALC_START, calcTexts(k), {
    name: '照片数量计算器',
    custom: '其他尺寸',
    width: '照片宽度，单位：mm',
    height: '照片高度，单位：mm',
    margin: `${ui('props.margin')}，单位：mm`,
    gap: `照片${ui('props.gap')}，单位：mm`,
    noscript: '计算器需要JavaScript。下方表格列出了最常用的尺寸。',
    open: `用这张纸在${app}中打开`,
  });

  return guide({
    id: 'how-many',
    lang: 'zh-Hans',
    path: PATHS['how-many'],
    title: `一张A4纸能打印几张照片？在线计算器 · ${app}`,
    description: `计算一张A4、Letter或Legal纸能放几张${photoName('10x15')}照片、证件照、护照照片或其他尺寸的照片，页边距可以自己设，算好后直接在编辑器中打开这张纸。`,
    h1: '一张纸能打印几张照片？',
    crumb: '一张纸能打印几张照片',
    lead: `选择纸张、照片尺寸、页边距和间距。计算器使用与${app}的${q(ui('bar.arrange'))}按钮相同的方法，所以算出的数字就是你在编辑器中得到的结果。`,
    ctas: [],
    feature: calculator,
    scripts: ['calculator'],
    sections: [
      {
        h2: '常用纸张每张能放几张照片',
        html: table(
          [{ head: '照片' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
          f.rows.map((r) => [sizeCell(photoName(r.id), size(r.w, r.h)), ...r.counts.map((n) => num(n))]),
          `页边距${mm(f.margin)}，照片间距${mm(f.gap)}，开启${q(ui('props.rotate'))}。这就是${q(ui('bar.arrange'))}排出的结果。`
        ),
      },
      {
        h2: '哪些因素会改变结果',
        html: `<ul>
<li><strong>页边距。</strong>很多打印机无法打印到纸张边缘。页边距越小，能放的照片越多，但前提是打印机能打印到那里。</li>
<li><strong>间距。</strong>照片之间留几毫米，裁剪起来更容易，不过有时会少放一张。</li>
<li><strong>旋转。</strong>开启${q(ui('props.rotate'))}后，${app}可以旋转部分照片，放下更多张。</li>
<li><strong>精确尺寸。</strong>在${app}中，${photoName('10x15')}照片的尺寸是${size(f.tenByFifteen.w, f.tenByFifteen.h)}，也就是冲印照片的实际尺寸${size(4, 6, 'in')}。几毫米的差别就会改变结果。</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: `一张A4纸能放几张${photoName('10x15')}照片？`,
        a: `页边距为${mm(5)}时，可以放${num(f.a4Wide)}张。页边距不超过${mm(f.narrowMargin)}且照片之间没有间距时，可以放${num(f.a4Narrow)}张：两张竖放，下面一张横放。`,
      },
      {
        q: '一张A4纸能放几张4 × 4 cm的证件照？',
        a: `${num(f.id4Cut)}张，页边距${mm(f.margin)}，留${mm(f.gap)}间距方便裁剪。没有间距时，可以放${num(f.id4Tight)}张。`,
      },
      {
        q: '一张Letter纸能放几张护照照片？',
        a: `照片尺寸为${size(f.passport.w, f.passport.h)}，页边距${mm(f.margin)}，间距${mm(f.gap)}时，可以放${num(f.passport.count)}张${f.passport.grid < f.passport.count ? `，竖放和横放的照片混在一起；按行列整齐排列则是${num(f.passport.grid)}张` : ''}。`,
      },
      {
        q: '为什么其他计算器算出的数字不一样？',
        a: '因为它们假设的页边距、间距或精确尺寸不同，或者不会旋转照片。在这里，你可以修改每一项数据，并看到照片在纸上的排列方式。',
      },
    ],
  });
}
