// «一张纸打印多张照片» (print several photos on one sheet): the main guide.

import { severalPhotosFacts } from '../../facts/several-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, MAX_ITEMS, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function severalPhotos({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = severalPhotosFacts();
  return guide({
    id: 'several-photos',
    lang: 'zh-Hans',
    path: PATHS['several-photos'],
    title: `一张纸打印多张照片，按实际尺寸排版 · ${app}`,
    description: `把多张照片按实际尺寸排在一张A4、Letter或Legal纸上，再下载PDF或直接打印。免费使用，无需注册，照片只在你的浏览器中处理，不会上传。`,
    h1: '一张纸打印多张照片',
    crumb: '一张纸打印多张照片',
    lead: `用${app}可以把多张照片排在同一张纸上，每张都保持实际尺寸，然后在电脑或手机的浏览器中一起打印。免费使用，无需注册，照片不会离开你的设备。`,
    ctas: [
      { label: `用A4纸打开${app}`, href: f.open.a4 },
      { label: '用Letter纸打开', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `一张A4纸上的${num(f.figure.count)}张${photoName(f.figure.photo)}照片，页边距${mm(f.layout.margin)}`),
    sections: [
      {
        h2: '操作步骤',
        html: steps([
          `用你要使用的纸张打开${app}。如果要换一种纸，在${q(ui('props.title'))}的${q(ui('props.tabs.project'))}标签页中更改：有A4、Letter、Legal、${ui('papers.groups.photo')}和自定义尺寸。`,
          `点击${q(ui('bar.add'))}，或把照片拖放到纸上。可以一次添加多张，也可以添加PDF：每一页都是一个素材。`,
          `点击${q(ui('bar.arrange'))}：${app}会把所有照片排好，互不重叠，并按需要添加纸张。`,
          `如果想让所有照片尺寸相同，选中它们，选择一个${q(ui('crop.size'))}（${photoName('10x15')}、${photoName('13x18')}、${photoName('id-4x4')}…），或者输入宽度和高度。`,
          `点击${q(ui('bar.print'))}或${q(ui('bar.download'))}。在打印对话框中选择“实际大小”或“100%”，每张照片才会按它的尺寸打印。`,
        ]),
      },
      {
        h2: '一张纸能放几张照片',
        html:
          paragraphs(`这取决于照片的尺寸、纸张，以及打印机留出的边距。下表是${q(ui('bar.arrange'))}在每张纸上放下的相同照片数量：`) +
          table(
            [{ head: '照片' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map((r) => [`${photoName(r.id)}<span class="muted">（${size(r.w, r.h)}）</span>`, ...r.counts.map((n) => num(n))]),
            `页边距${mm(f.layout.margin)}，照片间距${mm(f.layout.gap)}，开启${q(ui('props.rotate'))}。`
          ) +
          paragraphs(`其他尺寸和页边距，可以用${link(PATHS['how-many'], '照片数量计算器')}算一算。`),
      },
      {
        h2: '按实际尺寸打印，不缩放',
        html: paragraphs(
          `${app}生成的PDF与纸张尺寸完全一致，每张照片都按毫米保持它的尺寸，而不是按像素。可能改变尺寸的是打印对话框：选了“适合页面”之类的选项，打印机就会把所有内容略微缩小。所以最好选择“实际大小”或“100%”，大量打印之前先打印一张测试。`,
          `更多细节见${link(PATHS['actual-size'], '图片按实际尺寸打印')}指南。`
        ),
      },
      {
        h2: '用手机打印',
        html: paragraphs(
          `${app}可以在手机或平板的浏览器中使用，无需安装任何应用。从相册添加照片，点击${q(ui('bar.arrange'))}，然后下载PDF，自己打印或拿到打印店打印。`
        ),
      },
    ],
    faq: [
      { q: '可以用手机在一张纸上打印多张照片吗？', a: `可以。${app}能在手机浏览器中使用：从相册添加照片，点击${q(ui('bar.arrange'))}，然后下载PDF。` },
      { q: '需要Word或其他软件吗？', a: '不需要。一切都在浏览器中完成：无需安装任何软件，也不用注册账号。' },
      {
        q: '为什么打印出来的照片变小了？',
        a: '几乎总是打印对话框里的缩放设置造成的。选了“适合页面”之类的选项，打印机会把整张纸缩小，以放进它的可打印区域。选择“实际大小”或“100%”即可。',
      },
      {
        q: '我的照片会上传到服务器吗？',
        a: `不会。照片在你的浏览器中打开和处理，PDF也在浏览器中生成。详见${link(PATHS['legal-privacy'], '隐私政策')}。`,
      },
      { q: '可以混合不同尺寸的照片，或者混合照片和PDF页面吗？', a: `可以。${q(ui('bar.arrange'))}能把任意尺寸的素材排在一起，PDF的每一页都是一个素材。` },
      { q: '有水印或照片数量限制吗？', a: `没有水印。一个项目最多可以有${num(MAX_ITEMS)}个素材。` },
    ],
  });
}
