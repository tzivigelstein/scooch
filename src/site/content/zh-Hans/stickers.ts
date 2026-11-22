// «自制贴纸打印» (print stickers at home): a sheet of stickers, each with the
// contour cut line (轮廓), what it needs (transparency) and what the PDF's
// line is: a printed vector stroke to cut by hand, with no layer of its own
// and no registration marks (services/pdf.ts, core/contour.js).

import { stickersFacts } from '../../facts/stickers.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, shapesFigure, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function stickers({ ui, num, mm, size }: Kit): SitePage {
  const f = stickersFacts();
  const contour = ui('cuts.modes.contour');
  const cutLines = ui('cuts.title');
  const cutMargin = ui('cuts.margin');
  const letter = ui('papers.names.letter');
  const sticker = size(f.sticker.w, f.sticker.h);
  return guide({
    id: 'stickers',
    lang: 'zh-Hans',
    path: PATHS.stickers,
    title: `自制贴纸打印：每个图案都有沿轮廓的裁切线 · ${app}`,
    description: '用你自己的PNG图片做一张贴纸打印模板：每张图片都有一条沿着图案形状的裁切线，打印后沿线剪下就是异形贴纸。可以下载PDF，也可以直接打印。免费使用，无需注册，你的文件也不会上传到任何服务器。',
    h1: '在家打印贴纸，每张贴纸都有自己的裁切线',
    crumb: '自制贴纸打印',
    lead: `用${app}把你的图片按实际尺寸排在一张纸上，每张图片都会有一条沿着图案形状的裁切线，也就是${cutLines}中的${q(contour)}选项。在家打印出来，再用剪刀或美工刀沿线剪下每张贴纸。`,
    ctas: [
      { label: `用A4纸打开${app}`, href: f.open.a4 },
      { label: `用${letter}纸打开`, href: f.open.letter },
    ],
    feature: shapesFigure(f.figure, `一张A4纸上的${num(f.figure.count)}张${sticker}贴纸，每张的裁切线与图案相距${mm(f.cutMargin)}`),
    sections: [
      {
        h2: '需要准备什么',
        html:
          `<ul><li>背景透明的图片，PNG或WebP格式：裁切线沿着不透明的部分走。</li><li>尺寸与纸张相同（A4、${letter}…）、适合你的打印机的不干胶纸。</li><li>剪刀或美工刀，以及一把用来核对尺寸的尺子。</li></ul>` +
          note(
            `JPG没有透明部分：它的裁切线就是图片的矩形，和${q(ui('cuts.modes.outline'))}一样。没有透明部分的PNG和PDF页面也是这样。${app}不会去除背景：如果图片是白色背景，请先用其他软件去掉背景，再另存为PNG。`
          ),
      },
      {
        h2: '操作步骤',
        html:
          steps([
            `用上方的任一按钮打开${app}：纸张的页边距为${mm(f.layout.margin)}，间距为${mm(f.layout.gap)}，${cutLines}设为${q(contour)}。如果已经打开了，在${q(ui('props.title'))}的${q(ui('props.tabs.project'))}标签页中，把${q(cutLines)}设为${q(contour)}。`,
            `用${q(ui('bar.add'))}添加图片，或者把图片拖到纸张上。有透明部分的图片，片刻之后就会显示裁切线。`,
            `设置每张贴纸的尺寸：选中它，在${q(ui('props.title'))}的${q(ui('props.tabs.piece'))}标签页中输入${q(ui('props.widthTip'))}或${q(ui('props.heightTip'))}。另一边会自动调整。`,
            `在${q(cutLines)}中展开${q(ui('cuts.more'))}，输入${q(cutMargin)}，也就是图片和裁切线之间的距离。设为${mm(f.cutMargin)}时，每张贴纸周围都会留出一圈纸边。`,
            `点击${q(ui('bar.arrange'))}：${app}会把贴纸排开、互不重叠，彼此之间留出${q(ui('props.gap'))}，需要时还会添加纸张。`,
            `点击${q(ui('bar.print'))}或${q(ui('bar.download'))}，在打印对话框中选择“实际大小”或“100%”。然后沿线剪下每张贴纸。`,
          ]) +
          paragraphs(`${q(ui('bar.arrange'))}把每张贴纸连同${cutMargin}看作一个矩形，并在这些矩形之间留出${ui('props.gap')}。排版之后如果改了${cutMargin}，请再点击一次${q(ui('bar.arrange'))}。`),
      },
      {
        h2: '裁切线是什么，不是什么',
        html: paragraphs(
          `裁切线围绕图片中不透明的部分，与它相距一个${cutMargin}；边距为负数时，裁切线会进入图片内部。不透明度达到${num(f.opacity)}%的像素就算作图案的一部分，所以很淡的阴影会留在线外。裁切线经过平滑处理，不会沿着像素的锯齿走。`,
          `在PDF中，每条裁切线都是由直线段组成的矢量线条，它的${ui('cuts.weight')}、${ui('cuts.color')}和${ui('cuts.dash')}就是你在${q(ui('cuts.more'))}中选择的。它和贴纸在同一页上，会和贴纸一起打印出来：它是用来手工裁剪的线。沿线剪下，贴纸就保留了图案的形状，也就是常说的异形贴纸。`,
          `PDF中没有套准标记，也不会把裁切线放在单独的图层上：它们和这一页上的其他内容一样，只是线条。如果你的切割机软件可以从PDF导入线条，可以试试，但${app}没有用任何切割机测试过；而且先打印、再用切割机裁切，需要对齐标记，这个PDF里没有。`,
          `图片中的孔洞，比如圆环或字母O的中间，不会有裁切线：裁切线只沿外侧走。彼此分开的部分各有一条裁切线，除非它们之间的距离小于${cutMargin}的两倍，那样就会共用一条。很小的零散斑点，比如背景没擦干净留下的残渣，会被忽略。`,
          `裁切线是在后台根据图片的预览图计算的，图片很大时，可能要等一会儿才会出现。生成PDF时，会等所有裁切线都准备好。`
        ),
      },
      {
        h2: '让贴纸好剪的几点建议',
        html: paragraphs(
          `留出几毫米的${q(ui('props.gap'))}：每条裁切线都在贴纸连同${cutMargin}的矩形之内，所以间距为${mm(f.layout.gap)}时，相邻两张贴纸的裁切线不会碰到一起，剪起来也更容易。`,
          `在${q(ui('props.sheet'))}中选择与不干胶纸相同的尺寸，并留出页边距：很多打印机无法打印到纸张边缘。`,
          `先用普通纸按“实际大小”或“100%”打印一张测试，再用尺子量一下贴纸的尺寸。`,
          `如果不想让裁切线在贴纸边缘露出来，可以在${q(ui('cuts.more'))}中选择${q(ui('cuts.weights.thin'))}和${q(ui('cuts.colors.gray'))}的线条。`,
          `如果一整张纸都是同一张贴纸，可以使用${q(ui('props.fill'))}：${link(PATHS['same-photo'], '同一张照片打印多张')}指南中有详细说明。`
        ),
      },
    ],
    faq: [
      {
        q: '为什么我的图片的裁切线是矩形？',
        a: `因为它没有透明部分：它是JPG、带背景的PNG或PDF页面。${q(contour)}需要透明部分：用其他软件去掉背景，把图片另存为PNG，再重新添加。`,
      },
      {
        q: '可以把PDF发给切割机吗？',
        a: `PDF中的每条裁切线都是矢量线条，和贴纸在同一页上，没有套准标记，也没有单独的图层。如果你的切割机软件可以从PDF导入线条，可以试试，但${app}没有用任何切割机测试过。它是为手工裁剪设计的。`,
      },
      {
        q: '一张A4纸能放几张贴纸？',
        a: `取决于贴纸的尺寸、${cutMargin}和间距。页边距${mm(f.layout.margin)}、间距${mm(f.layout.gap)}、${cutMargin}${mm(f.cutMargin)}时，可以放${num(f.figure.count)}张${sticker}的贴纸，就像图中那样。${q(ui('bar.arrange'))}会排好贴纸，需要时还会添加纸张。`,
      },
      {
        q: '分开的字母和孔洞会怎样？',
        a: `每个分开的部分都有自己的裁切线，除非它们之间的距离小于${cutMargin}的两倍。${cutMargin}大于字母间距的一半时，一个词就会成为一张贴纸。孔洞，比如字母O的中间，不会有裁切线。`,
      },
      {
        q: '用什么纸？',
        a: `尺寸与你在${app}中选择的纸张相同（A4、${letter}…）、适合你的打印机的不干胶纸。正式使用之前，先用普通纸打印一张测试。`,
      },
    ],
  });
}
