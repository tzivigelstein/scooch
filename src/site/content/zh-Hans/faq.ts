// «常见问题» (frequently asked questions): about the tool itself (each guide has its own).

import { app, link, MAX_ITEMS, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { papersSentence, photoSizesSentence, quoted as q } from './chrome.ts';
import { PATHS } from './paths.ts';

export function faqPage(k: Kit): SitePage {
  const { ui, num } = k;
  return {
    id: 'faq',
    lang: 'zh-Hans',
    path: PATHS.faq,
    title: `${app}常见问题`,
    description: `关于${app}的常见问题：它是什么、是否收费、你的文件保存在哪里、提供哪些纸张和照片尺寸、能放多少个素材、能不能在手机上用，以及怎样按实际尺寸打印。`,
    h1: '常见问题',
    crumb: '常见问题',
    kind: 'faq',
    indexable: true,
    body: `<p class="lead">使用${app}之前最值得了解的内容。每种用途（比如一张纸打印多张照片，或者证件照排版）都有一篇指南，附有各自的问题。</p>`,
    faq: [
      {
        q: `${app}是什么？`,
        a: `${app}是一款免费的网页工具，可以按实际尺寸把图片和PDF页面排到纸上，并生成可以下载或打印的PDF。它在浏览器中运行，无需安装任何软件。`,
      },
      { q: '收费吗？', a: `不收费。${app}免费使用，无需注册，也不会添加水印或广告。` },
      {
        q: `可以把${app}用于有偿工作或商业用途吗？`,
        a: `可以。你可以在本网站上将${app}用于任何目的，包括商业用途：例如在打印店使用，打印你要出售的贴纸，或打印你公司自己的资料。你制作的PDF和打印品归你所有：你可以使用和出售，无需付费，无需注明${app}，也无需征得许可。不允许的是将这个工具本身商业化，例如出售它、对使用它收费，或发布带广告的副本。详见${link(PATHS['legal-terms'], '使用条款')}。`,
      },
      {
        q: '我的文件会上传到服务器吗？',
        a: `不会。图片和PDF在你的浏览器中打开和处理，PDF也在浏览器中生成。详见${link(PATHS['legal-privacy'], '隐私政策')}。`,
      },
      {
        q: '我的项目保存在哪里？',
        a: `保存在你的浏览器里，也就是这台设备上。工作时会自动保存，你可以在${q(ui('projects.title'))}中打开或删除它们。如果在浏览器中清除这个网站的数据，项目就会丢失：请保留原始文件。`,
      },
      {
        q: '可以添加哪些文件？',
        a: '浏览器能打开的图片（JPG、PNG、WebP…）和PDF。PDF的每一页都是一个素材。',
      },
      { q: '提供哪些纸张？', a: `${papersSentence(k)}。` },
      { q: '提供哪些照片尺寸？', a: `${photoSizesSentence(k)}。也可以输入任意宽度和高度。` },
      {
        q: '怎样按实际尺寸打印？',
        a: `点击${q(ui('bar.print'))}或${q(ui('bar.download'))}，然后在打印对话框中选择“实际大小”或“100%”。更多细节见${link(PATHS['actual-size'], '图片按实际尺寸打印')}指南。`,
      },
      { q: '能在手机上使用吗？', a: '可以，在手机或平板的浏览器中就能使用，无需安装任何应用。' },
      { q: '最多可以放多少个素材？', a: `每个项目最多${num(MAX_ITEMS)}个素材，需要几张纸就用几张。` },
      {
        q: '能用来打印证件照吗？',
        a: `可以，用来按尺寸裁剪和打印。但每种证件或手续都有自己的要求（尺寸、背景、构图），${app}不会检查这些要求：请务必向要求提供照片的机构确认。参见${link(PATHS['id-photos'], '证件照排版打印')}指南。`,
      },
      {
        q: `可以通过链接打开已经设置好的${app}吗？`,
        a: `可以。各篇指南中的按钮会打开编辑器，并设置好纸张、页边距和照片尺寸。每次都会新建一个项目：原来的项目仍保存在${q(ui('projects.title'))}中。`,
      },
      {
        q: '源代码是开放的吗？',
        a: `源代码按PolyForm Noncommercial 1.0.0许可证发布：你可以出于非商业目的使用、研究和修改它。完整文本见${link(PATHS['legal-license'], '代码许可证')}。`,
      },
    ],
  };
}
