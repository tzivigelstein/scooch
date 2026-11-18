// The frame of the Simplified Chinese pages and the sentences some of them
// share. Copy rules: docs/copy/zh-Hans.md (full-width punctuation, no space
// between Chinese and Latin letters or numbers, “ ” around the names of
// buttons and options, as the app's own texts quote them).

import { CUSTOM_MAX, CUSTOM_MIN, PAPERS } from '../../../core/papers.js';
import { PHOTO_SIZES } from '../../../core/crop.js';
import { app, type Kit } from '../../kit.ts';
import type { Chrome } from '../../layout.ts';
import { PATHS } from './paths.ts';

// The app's Chinese names for the legal pages say «（西班牙语）»: these pages aren't.
export const chrome = (_: Kit): Chrome => ({
  skip: '跳到正文',
  open: `打开${app}`,
  crumbs: '面包屑导航',
  guides: '使用指南',
  legal: '法律信息',
  languages: '语言',
  about: `${app}免费使用，无需注册，你的文件不会离开浏览器。`,
  faq: '常见问题',
  imageAlt: `${app}：按实际尺寸排在一张纸上的照片`,
  legalLinks: [
    ['使用条款', PATHS['legal-terms']],
    ['隐私政策', PATHS['legal-privacy']],
    ['第三方许可证', PATHS['legal-notices']],
    ['代码许可证', PATHS['legal-license']],
  ],
});

/** The name of a button, an option or a tab of the app, quoted: «“排版”». */
export const quoted = (name: string) => `“${name}”`;

/**
 * A table row's name with its measure, as the app's photo size menu writes
 * them («6寸 · 101.6 × 152.4 mm»): full-width parentheses around a measure
 * that can't break would make the column too wide for a phone.
 */
export const sizeCell = (name: string, measure: string) => `${name} <span class="muted">· ${measure}</span>`;

const photoPapers = PAPERS.filter((p) => p.group === 'photo');
const otherPapers = PAPERS.filter((p) => p.group !== 'photo');

/** «A0、…、Tabloid，以及5寸、6寸…和12寸照片纸，还可以自定义尺寸…» */
export const papersSentence = ({ ui, paperName, list, num, mm }: Kit) =>
  `${otherPapers.map((p) => paperName(p.id)).join('、')}，以及${list(photoPapers.map((p) => paperName(p.id).replace(/照片$/u, '')))}${ui('papers.groups.photo')}，还可以自定义尺寸，每边${num(CUSTOM_MIN)}到${mm(CUSTOM_MAX)}`;

/** «5寸、6寸、…、签证2×2英寸和拍立得» */
export const photoSizesSentence = ({ photoName, list }: Kit) => list(PHOTO_SIZES.map((s) => photoName(s.id)));

export const llmsSections = { guides: '简体中文使用指南', faq: '简体中文常见问题', legal: '简体中文法律信息' };
