// The loaded assets (images and PDF pages with their binaries), by key. Not
// part of the undo history: an asset never changes once added (another PDF
// page is another asset), and the ones nothing uses any more are released.

import type { AppAsset } from '../services/assets.ts';

const assets = new Map<string, AppAsset>();
let nextAssetId = 1;
// Bumped when another project's assets replace these (their keys and sources mean something else).
let generation = 0;

/** Which set of assets is loaded: it changes when another project opens. */
export const assetGeneration = () => generation;

/** The asset of a key (pieces always point to a loaded one). */
export function getAsset(key: string): AppAsset {
  const asset = assets.get(key);
  if (!asset) throw new Error(`Unknown asset ${key}`);
  return asset;
}

export const findAsset = (key: string) => assets.get(key);
export const allAssets = (): ReadonlyMap<string, AppAsset> => assets;
export const assetEntries = () => [...assets];

export function addAsset(asset: AppAsset): string {
  const key = `a${nextAssetId++}`;
  assets.set(key, asset);
  return key;
}

// Releases the binaries of assets nobody uses: the preview URL and, if no other
// asset shares it, the pdf.js document.
function release(dropped: readonly AppAsset[], alive: readonly AppAsset[]) {
  for (const asset of dropped) {
    if (!alive.some((other) => other.url === asset.url)) URL.revokeObjectURL(asset.url);
    if (asset.kind === 'pdf' && asset.pdf && !alive.some((other) => other.kind === 'pdf' && other.pdf === asset.pdf)) void asset.pdf.destroy();
  }
}

/** Keeps only the assets in `used` and releases the rest. */
export function retainAssets(used: ReadonlySet<string>) {
  const dropped: AppAsset[] = [];
  for (const [key, asset] of assets) {
    if (!used.has(key)) {
      assets.delete(key);
      dropped.push(asset);
    }
  }
  release(dropped, [...assets.values()]);
}

/**
 * Adds assets with their own keys (the ones of a saved undo history, by the
 * keys its steps use), keeping the loaded ones; new keys continue after them.
 */
export function adoptAssets(adopted: ReadonlyMap<string, AppAsset>) {
  for (const [key, asset] of adopted) {
    if (!assets.has(key)) assets.set(key, asset);
    nextAssetId = Math.max(nextAssetId, (Number(key.slice(1)) || 0) + 1);
  }
}

/** New keys continue at least after `nextId`. */
export function reserveAssetIds(nextId: number) {
  nextAssetId = Math.max(nextAssetId, nextId);
}

/** Replaces every asset (opening a project); new keys continue after `nextId`. */
export function replaceAssets(loaded: ReadonlyMap<string, AppAsset>, nextId: number) {
  const dropped = [...assets.values()];
  assets.clear();
  for (const [key, asset] of loaded) assets.set(key, asset);
  release(dropped, [...assets.values()]);
  nextAssetId = nextId;
  generation++;
}
