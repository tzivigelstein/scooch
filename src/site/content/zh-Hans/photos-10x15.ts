// «6寸照片打印在A4纸上» (4 × 6 in photos on an A4 sheet): how many fit by
// margin, and how to print them. 6寸 is the catalogue's name for the app's
// 10 × 15 size, 4 × 6 in (101.6 × 152.4 mm), as mainland photo labs call it.

import { tenByFifteenFacts } from '../../facts/photos-10x15.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function tenByFifteen({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = tenByFifteenFacts();
  const p = f.photo;
  const name = photoName('10x15');
  const columns = [{ head: '页边距' }, ...f.papers.flatMap((paper) => f.gaps.map((gap) => ({ head: `${paperName(paper)}，${gap ? `间距${mm(gap)}` : '无间距'}`, num: true })))];
  const rows = f.rows.map((r) => [mm(r.margin), ...r.counts.map((n) => num(n))]);

  return guide({
    id: 'photos-10x15',
    lang: 'zh-Hans',
    path: PATHS['photos-10x15'],
    title: `A4纸打印${name}照片：一张能放几张 · ${app}`,
    description: `页边距为${mm(f.a4.margin)}时，一张A4纸能放${num(f.onA4)}张${name}照片；Letter纸在页边距为${mm(f.letter.margin)}时也一样。按实际尺寸排好，免费下载PDF，自己在家就能打印。`,
    h1: `${name}照片打印在A4纸上`,
    crumb: `A4纸打印${name}照片`,
    lead: `如果打印机的页边距不超过${mm(f.a4.margin)}，照片之间也不留间距，一张A4纸可以按实际尺寸放${num(f.onA4)}张${name}照片：上面两张竖放，下面一张横放。页边距为${mm(f.wideMargin)}时，可以放${num(f.onA4Wide)}张。${app}会自动排好，直接就能打印。`,
    ctas: [
      { label: `用${app}在A4纸上排${name}照片`, href: f.open.a4 },
      { label: '用Letter纸打开', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `一张A4纸上的${num(f.onA4)}张${name}照片，页边距${mm(f.a4.margin)}`),
    sections: [
      {
        h2: '操作步骤',
        html: steps([
          `点击上方按钮打开${app}：纸张设为A4，页边距${mm(f.a4.margin)}，照片之间没有间距。`,
          `用${q(ui('bar.add'))}添加照片，或把照片拖放到纸上。每张照片都会居中裁剪为${name}；横向的照片会裁剪为横版${photoName('10x15', { turned: true })}。`,
          '如果某张照片构图不理想，双击它进行裁剪，再移动图片。',
          `点击${q(ui('bar.arrange'))}：每张纸能放${num(f.onA4)}张，${app}会按需要添加纸张。`,
          `如果要把照片裁开，在${q(ui('props.title'))}的${q(ui('props.tabs.project'))}标签页中开启${q(ui('cuts.title'))}。`,
          `点击${q(ui('bar.print'))}，在打印对话框中选择“实际大小”或“100%”。`,
        ]),
      },
      {
        h2: '不同页边距能放几张',
        html:
          paragraphs(`页边距取决于打印机：很多打印机会在每条边上留出几毫米无法打印。下表是${q(ui('bar.arrange'))}在各种情况下放下的数量：`) +
          table(columns, rows, `每张纸能放的${name}照片（${size(p.w, p.h)}），开启${q(ui('props.rotate'))}。`),
      },
      {
        h2: `${name}照片的尺寸`,
        html: paragraphs(
          `在${app}中，${name}照片的尺寸是${size(p.w, p.h)}，也就是冲印照片的实际尺寸${size(4, 6, 'in')}。`,
          `如果需要正好${size(f.exact.w, f.exact.h)}，先选择${name}，然后在${q(ui('props.title'))}中把宽度改为${mm(f.exact.w)}：高度会变成${mm(f.exact.h)}。按这个尺寸，即使页边距为${mm(f.wideMargin)}，一张A4纸也能放${num(f.exact.count)}张。`
        ),
      },
    ],
    faq: [
      {
        q: `一张A4纸能放几张${name}照片？`,
        a: `页边距不超过${mm(f.a4.margin)}且照片之间没有间距时，可以放${num(f.onA4)}张；页边距为${mm(f.wideMargin)}时，可以放${num(f.onA4Wide)}张。`,
      },
      {
        q: `一张A4纸能打印4张${name}照片吗？`,
        a: `按${name}的尺寸不行：不裁剪的话，没有办法放下4张。能放下的是${num(f.quarter.count)}张${size(f.quarter.w, f.quarter.h)}的照片，比${name}略小（A4纸的四分之一），而且打印机必须能无边距打印。`,
      },
      {
        q: `一张Letter纸能放几张${name}照片？`,
        a: `页边距为${mm(f.letter.margin)}时，可以放${num(f.onLetter)}张${f.sameWithGap ? `，即使照片之间留${mm(f.cutGap)}间距也一样` : ''}。`,
      },
      {
        q: '用什么纸打印？',
        a: '用打印机支持的A4或Letter照片纸，光面或哑光都可以。在打印对话框中选择对应的纸张类型，打印机才会使用合适的打印质量。',
      },
      { q: '如果我的照片是其他尺寸呢？', a: `用${link(PATHS['how-many'], '照片数量计算器')}：选择尺寸和页边距，再在${app}中打开这张纸。` },
    ],
  });
}
