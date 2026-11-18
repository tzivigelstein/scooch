// «证件照排版打印» (ID and passport photos on one sheet): the app's document
// photo sizes, a sheet of copies, and the requirements the app doesn't check.
// Which size a procedure asks for is the office's to say: the page names no
// country or document for a size (facts/id-photos.ts). It gives 35 × 45 mm its
// mainland name, 小二寸, a size name and not a claim about who asks for it;
// 一寸 and 二寸 (25 × 35 and 35 × 49 mm) aren't sizes of the app.

import { idPhotosFacts } from '../../facts/id-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function idPhotos({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = idPhotosFacts();
  const onA4 = (id: string) => num(f.onA4[id]);
  const passport = f.figure.piece;
  const more = f.more.map((m) => `${paperName(m.paper)}纸上${num(m.count)}张${photoName(m.id)}`);

  return guide({
    id: 'id-photos',
    lang: 'zh-Hans',
    path: PATHS['id-photos'],
    title: `证件照排版打印：一张纸打印多张 · ${app}`,
    description: `把照片裁剪成${size(4, 4, 'cm')}、${size(3.5, 4.5, 'cm')}或${size(2, 2, 'in')}，在一张A4或Letter纸上排满副本，打印后裁开即可。免费使用，照片不会上传。`,
    h1: '证件照和护照照片排版打印',
    crumb: '证件照排版打印',
    lead: `用${app}把照片裁剪成所需的尺寸，在一张纸上排满副本，打印后裁开即可。免费使用，照片不会离开你的设备：一切都在浏览器中完成。`,
    ctas: f.open.map(({ id, href }) => ({ label: `按${photoName(id)}打开`, href })),
    feature:
      note(
        `不同的证件和手续有各自的要求：尺寸、背景、构图、脸部大小，以及是否接受自己打印的照片。打印前，请先向要求提供照片的机构确认。${app}只按你选择的尺寸裁剪和打印，不会检查这些要求。`
      ) + sheetFigure(f.figure, `一张A4纸上的${onA4(f.figure.photo)}张${size(passport.w, passport.h)}照片，按${q(ui('props.fill'))}的方式排列`),
    sections: [
      {
        h2: `${app}提供的尺寸`,
        html:
          table(
            [{ head: `在${app}中的名称` }, { head: '尺寸' }, ...f.papers.map((p) => ({ head: `${paperName(p)}纸`, num: true }))],
            f.rows.map((r) => [photoName(r.id), size(r.w, r.h), ...r.counts.map((n) => num(n))]),
            `用${q(ui('props.fill'))}时每张纸能放的副本数，页边距${mm(f.layout.margin)}，留${mm(f.layout.gap)}间距方便裁剪。`
          ) +
          paragraphs(
            `照片尺寸由要求提供照片的机构决定，不同国家、不同手续的要求都不一样。选择这些尺寸之前，先查看对方的要求。表中的${photoName('passport-35x45')}也叫小二寸（${size(passport.w, passport.h)}）。如果要求其他尺寸，在${link(PATHS['how-many'], '计算器')}中选择“其他尺寸”，再从那里打开这张纸。`,
            ...(more.length ? [`${q(ui('bar.arrange'))}会混合竖放和横放的照片，有时能放下更多：${more.join('、')}。${link(PATHS['how-many'], '计算器')}会显示每种尺寸的结果。`] : [])
          ),
      },
      {
        h2: '操作步骤',
        html:
          steps([
            `用上方的按钮按需要的尺寸打开${app}。纸张设为A4，页边距${mm(f.layout.margin)}，间距${mm(f.layout.gap)}，并带有${ui('cuts.title')}。`,
            `用${q(ui('bar.add'))}添加照片。照片会居中裁剪为这个尺寸。`,
            '如果脸部位置不合适，双击照片进行裁剪，再移动图片。',
            `选中照片，在${q(ui('props.title'))}的${q(ui('props.tabs.piece'))}标签页中点击${q(ui('props.fill'))}。`,
            `点击${q(ui('bar.print'))}，选择“实际大小”或“100%”。全部裁开之前，先用尺子量一张。`,
          ]) + paragraphs(`用Letter纸？先在${q(ui('props.title'))}的${q(ui('props.tabs.project'))}标签页中更改纸张，再填满纸张。`),
      },
    ],
    faq: [
      {
        q: '一张A4纸能放几张证件照？',
        a: `用${q(ui('props.fill'))}，页边距${mm(f.layout.margin)}，间距${mm(f.layout.gap)}时：${size(4, 4, 'cm')}的可以放${onA4('id-4x4')}张，${size(3.5, 4.5, 'cm')}的${onA4('passport-35x45')}张，${size(2, 2, 'in')}的${onA4('visa-5x5')}张。`,
      },
      {
        q: '证件照可以在家打印吗？',
        a: `可以：在${app}中排好，再用自己的打印机打印，最好用照片纸。如果照片要用于办理手续，请先确认对方是否接受自己打印的照片。`,
      },
      {
        q: `${app}会检查照片是否符合要求吗？`,
        a: `不会。它只按你选择的尺寸裁剪和打印。背景、光线、构图和脸部大小取决于你使用的照片。${link(PATHS['legal-terms'], '使用条款')}中也有说明。`,
      },
      { q: `${size(2, 2, 'in')}的照片有多大？`, a: `${size(f.twoInches, f.twoInches)}，约${size(5, 5, 'cm')}。在${app}中对应的尺寸是${photoName('visa-5x5')}。` },
      {
        q: '如果需要其他尺寸怎么办？',
        a: `在${link(PATHS['how-many'], '计算器')}中选择“其他尺寸”，输入宽度和高度，再在${app}中打开这张纸：添加的照片会裁剪为这个尺寸。`,
      },
    ],
  });
}
