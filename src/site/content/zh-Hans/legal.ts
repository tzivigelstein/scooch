// The Simplified Chinese legal pages: the terms and the privacy policy from
// their translations (docs/legal/zh-Hans, the Spanish versions being the
// reference), and the license texts, in English, with a Chinese introduction.

import { app, type Kit } from '../../kit.ts';
import type { LegalDoc, LegalId, LegalMarkers } from '../../legal.ts';
import { legalPage as page, type LegalPageTexts } from '../../legal-page.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export const LEGAL_MARKERS: LegalMarkers = { draft: '_草稿。', analytics: '数据分析', pending: '待补充' };

const texts = ({ ui }: Kit): Readonly<Record<LegalId, LegalPageTexts>> => ({
  terms: {
    h1: ui('legal.terms'),
    description: `使用${app}须遵守的条款。${app}是一款免费的网页工具，可以按实际尺寸把图片和PDF页面排到纸上。条款包括禁止的用途、免责声明和责任限制。`,
  },
  privacy: {
    h1: ui('legal.privacy'),
    description: `${app}会在你的浏览器中保存哪些数据、怎样删除，以及网站的托管服务商会收到哪些技术数据。你的图片和PDF不会离开你的设备，也不会上传到任何服务器。`,
  },
  notices: {
    h1: '第三方许可证',
    description: `${app}包含的第三方库和字体，以及它们各自的许可证和版权声明。这些文本保留英文原文，与各许可证的原始文本完全一致，方便你核对每个组件的使用条件。`,
    intro: `${app}包含第三方软件，每个组件都有自己的许可证。以下是详细信息，和这些许可证的文本一样，保留英文原文。`,
  },
  license: {
    h1: '代码许可证',
    description: `PolyForm Noncommercial 1.0.0许可证的全文。${app}的源代码按这个许可证发布：可以出于非商业目的使用、研究和修改，但不允许商业用途。`,
    intro: `${app}的源代码按PolyForm Noncommercial 1.0.0许可证发布。以下是许可证原文（英文）；<a href="${PATHS['legal-terms']}">使用条款</a>说明了它允许哪些用途，也说明了在本网站上可以将${app}用于任何目的，包括商业用途。`,
  },
});

const LEGAL = { terms: PATHS['legal-terms'], privacy: PATHS['legal-privacy'], notices: PATHS['legal-notices'], license: PATHS['legal-license'] };

export const legalPage = (k: Kit, doc: LegalDoc): SitePage => page(doc, texts(k)[doc.id], LEGAL);
