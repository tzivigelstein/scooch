// Deep links (core/deeplink.js, docs/deep-links.md): on start, the address's
// parameters set up a NEW project, and the images added to it get the link's
// photo size. A link never opens or changes a saved project.

import { fitToSize } from '../../core/crop.js';
import { parseDeepLink, setsUp, withoutDeepLink, type DeepLink, type DeepLinkPhoto } from '../../core/deeplink.js';
import type { Item } from '../../core/types.ts';
import { t, type CopyKey } from '../../copy/index.ts';
import { paperName, sizeText } from '../../services/measure.ts';
import type { StartSettings } from '../../services/projects.ts';
import { getAsset } from '../assets.ts';
import { getDocument } from '../document.ts';
import { useProject } from '../project.ts';
import { say } from './notify.ts';

/** The link's photo size and the project it created: it applies only there, until this tab opens another. */
let startSize: { photo: DeepLinkPhoto; project: string | null } | null = null;

/**
 * Reads the deep link in the address and takes it out (so a reload opens the
 * project it created instead of creating another). Returns it, or null when
 * there is none or none of its values could be read.
 */
export function takeDeepLink(): DeepLink | null {
  const link = parseDeepLink(location.search, { paper: getDocument().paper });
  if (!link) return null;
  history.replaceState(history.state, '', `${location.pathname}${withoutDeepLink(location.search)}${location.hash}`);
  return setsUp(link) ? link : null;
}

/** The settings the new project is created with (initProjects' `start`). */
export function startSettings({ settings: { cutMode, ...rest } }: DeepLink): StartSettings {
  return cutMode ? { ...rest, cuts: { ...getDocument().cuts, mode: cutMode } } : rest;
}

/** Once the project is created: its photo size starts to apply, and the notice says what the link set up. */
export function linkOpened(link: DeepLink) {
  startSize = link.photo && { photo: link.photo, project: useProject.getState().id };
  const paper = paperName();
  if (!link.photo) return say(t('deepLink.created', { paper }));
  const size = sizeText(link.photo.w, link.photo.h);
  if (!link.photo.id) return say(t('deepLink.createdCustom', { paper, size }));
  say(t('deepLink.createdSized', { paper, size, name: t(`crop.names.${link.photo.id}` as CopyKey) }));
}

/**
 * An image just added to the project a link created takes the link's photo
 * size, exactly (cropped to fill it, centered, turned like the image; see
 * crop.fitToSize). PDF pages keep theirs. Returns whether it did.
 */
export function applyStartSize(item: Item): boolean {
  if (!startSize) return false;
  if (startSize.project !== useProject.getState().id) {
    startSize = null;
    return false;
  }
  const asset = getAsset(item.asset);
  if (asset.kind !== 'image') return false;
  const fit = fitToSize(asset, item.r, startSize.photo);
  if (fit.scale < 1 || fit.scale > 1000) return false;
  Object.assign(item, fit);
  return true;
}
