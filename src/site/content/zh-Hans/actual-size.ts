// «图片按实际尺寸打印» (print an image at actual size): exact measures, and
// why printers change them. The print dialog's options are quoted as the
// app's own print tip quotes them (“实际大小”, “100%”, “适合页面”).

import { actualSizeFacts } from '../../facts/actual-size.ts';
import { guide } from '../../guide.ts';
import { app, paragraphs, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function actualSize({ ui, num, mm, size }: Kit): SitePage {
  const f = actualSizeFacts();
  return guide({
    id: 'actual-size',
    lang: 'zh-Hans',
    path: PATHS['actual-size'],
    title: `图片按实际尺寸打印，精确到厘米和毫米 · ${app}`,
    description: '输入图片在纸上的宽度和高度，按厘米、毫米或英寸都可以，得到尺寸完全一致的PDF，打印出来就是这个尺寸。免费，在浏览器中完成，无需安装软件，也无需注册账号。',
    h1: '图片按实际尺寸打印',
    crumb: '图片按实际尺寸打印',
    lead: `输入你想要的纸上尺寸，单位可以是毫米、厘米或英寸，${app}会生成尺寸完全一致的PDF。用“实际大小”或“100%”打印，图片就会按你设定的尺寸打印出来。`,
    ctas: [
      { label: `用A4纸打开${app}`, href: f.open.a4 },
      { label: '用Letter纸打开', href: f.open.letter },
    ],
    sections: [
      {
        h2: '操作步骤',
        html: steps([
          `打开${app}，用${q(ui('bar.add'))}添加图片。`,
          `选中图片，在${q(ui('props.title'))}的${q(ui('props.tabs.piece'))}标签页中输入${q(ui('props.widthTip'))}或${q(ui('props.heightTip'))}。另一边会自动调整，图片不会变形。`,
          `想用厘米或英寸？在${q(ui('prefs.title'))}的${q(ui('prefs.units'))}中更改。`,
          `点击${q(ui('bar.print'))}，在打印对话框中选择“实际大小”或“100%”。`,
          '大量打印之前，先用尺子量一下打印出来的尺寸。',
        ]),
      },
      {
        h2: '为什么打印机会改变尺寸',
        html: paragraphs(
          `${app}生成的PDF中，纸张和每张图片的尺寸都完全准确。尺寸是在最后一步，也就是在打印对话框中改变的：选了“适合页面”“适合可打印区域”之类的选项，打印机就会把所有内容缩小，以放进它能打印的范围。选择“实际大小”或“100%”，并检查对话框中的纸张是否与这张纸相同。`,
          `如果图片碰到纸张边缘，可能会被裁掉：很多打印机无法打印到边缘。请留出页边距；素材超出页边距或超出纸张时，${app}会提示你。`
        ),
      },
      {
        h2: `${q(ui('props.actual'))}按钮`,
        html: paragraphs(
          `在${q(ui('props.title'))}中，${q(ui('props.actual'))}按钮会把图片设为它自身分辨率对应的尺寸。例如，一张${num(f.px.w)} × ${num(f.px.h)}像素、${num(f.ppi)} ppi的照片，尺寸是${size(f.printed.w, f.printed.h)}。如果图片本来就带有正确的尺寸，比如扫描的图纸或纸样，就可以使用它。`
        ),
      },
      {
        h2: '打印质量',
        html: paragraphs(
          `${app}会显示每张图片的打印分辨率（ppi，即每英寸像素数），如果在所选尺寸下可能会模糊，也会提示你。图片打印得越大，ppi就越低。`
        ),
      },
    ],
    faq: [
      {
        q: '怎样按精确的厘米尺寸打印图片？',
        a: `把图片添加到${app}，在${q(ui('prefs.title'))}中把单位改为厘米，然后在${q(ui('props.title'))}中输入宽度或高度。最后用“实际大小”或“100%”打印。`,
      },
      { q: '为什么打印出来的图片比应有的尺寸小？', a: '几乎总是打印对话框里的缩放设置造成的。选择“实际大小”或“100%”，不要选“适合页面”。' },
      {
        q: '可以按实际尺寸打印PDF吗？',
        a: '可以。添加PDF：每一页都是一个素材，保持原始尺寸。把它放在尺寸相同或更大的纸上，用“实际大小”或“100%”打印。',
      },
      { q: '什么是ppi？', a: `每英寸像素数：每英寸打印长度上有多少个图片像素。ppi太低，图片可能会模糊；分辨率对所选尺寸来说太低时，${app}会提示你。` },
      {
        q: '为什么要留页边距？',
        a: `因为很多打印机无法打印到纸张边缘，超出可打印区域的部分会被裁掉。需要多大的页边距取决于打印机：从本页打开时，${app}的页边距是${mm(f.layout.margin)}。`,
      },
    ],
  });
}
