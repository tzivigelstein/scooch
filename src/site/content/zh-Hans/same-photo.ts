// «同一张照片在一张纸上打印多张» (the same photo many times on one sheet):
// 用副本填满 (Fill with copies) and 创建副本 (Duplicate).

import { samePhotoFacts, type Copy } from '../../facts/same-photo.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function samePhoto({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = samePhotoFacts();
  const copyName = (copy: Copy) => (copy.kind === 'photo' ? photoName(copy.id) : copy.kind === 'label' ? '标签' : '方形贴纸');

  return guide({
    id: 'same-photo',
    lang: 'zh-Hans',
    path: PATHS['same-photo'],
    title: `同一张照片在一张纸上打印多张 · ${app}`,
    description: '用一张照片、标志或标签的副本排满整张纸，每个副本的尺寸由你决定，还可以加上裁切线，打印后方便裁开。免费使用，无需注册，你的文件也不会上传到任何服务器。',
    h1: '同一张照片在一张纸上打印多张',
    crumb: '同一张照片打印多张',
    lead: `选好尺寸，${app}一步就能用照片、标志或标签的副本排满整张纸。每个副本都按实际尺寸打印，需要时还可以加上裁切线。`,
    ctas: [
      { label: `用A4纸打开${app}`, href: f.open.a4 },
      { label: '用Letter纸打开', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `一张A4纸上的${num(f.figure.count)}个${size(f.label.w, f.label.h)}标签，间距${mm(f.layout.gap)}`),
    sections: [
      {
        h2: '操作步骤',
        html:
          steps([
            `用上方的任一按钮打开${app}，再用${q(ui('bar.add'))}添加图片。`,
            `设置每个副本的尺寸：在${q(ui('props.title'))}中选择一个${q(ui('crop.size'))}，或者输入宽度和高度。`,
            `在${q(ui('props.tabs.piece'))}标签页中点击${q(ui('props.fill'))}。应用之前，它会显示能放几个副本。它会替换这张纸上的其他素材，可以撤销。`,
            `需要精确的数量？使用${q(ui('props.duplicate'))}：每个副本都会放进空位，没有空位时放到新的纸张上。`,
            `点击${q(ui('bar.print'))}，选择“实际大小”或“100%”。${ui('cuts.title')}标出了每个副本的裁剪位置。`,
          ]) + paragraphs(`要让副本之间留出更多空间，先在${q(ui('props.tabs.project'))}标签页中调大${q(ui('props.gap'))}，再填满纸张。`),
      },
      {
        h2: '一张纸能放几个副本',
        html:
          table(
            [{ head: '副本' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map(({ copy, counts }) => [`${copyName(copy)}<span class="muted">（${size(copy.w, copy.h)}）</span>`, ...counts.map((n) => num(n))]),
            `用${q(ui('props.fill'))}时每张纸能放的副本数，页边距${mm(f.layout.margin)}，间距${mm(f.layout.gap)}。`
          ) + paragraphs(`其他尺寸，可以用${link(PATHS['how-many'], '照片数量计算器')}算一算。`),
      },
    ],
    faq: [
      {
        q: '一张纸能放几个副本？',
        a: `取决于尺寸、页边距和间距。${q(ui('props.fill'))}在应用之前会告诉你能放几个，${link(PATHS['how-many'], '计算器')}则能在你开始之前告诉你。`,
      },
      {
        q: '可以在同一张纸上为几张不同的照片分别创建副本吗？',
        a: `可以。选中这些照片，使用${q(ui('props.duplicate'))}：每张照片都会按你选择的次数创建副本。然后点击${q(ui('bar.arrange'))}。`,
      },
      { q: '副本会降低画质吗？', a: `不会。所有副本都使用原始文件。如果图片的分辨率对所选尺寸来说太低，${app}会提示可能会模糊。` },
      {
        q: '怎样留出裁剪的空间？',
        a: `在${q(ui('props.title'))}的${q(ui('props.tabs.project'))}标签页中调大${q(ui('props.gap'))}，并开启${ui('cuts.title')}。留出几毫米的间距，裁剪起来更容易。`,
      },
    ],
  });
}
