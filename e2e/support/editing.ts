// Helpers for the editing specs (pointer-editing, files, clipboard): dragging a
// piece by millimetres, dropping a file on the page, the grid settings and the
// save status.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, fixture, type App } from './test.ts';

/** A piece's geometry (mm) as the page shows it. */
export async function pieceOf(app: App, id: number) {
  const g = await app.geometry();
  return { ...g.pieces.find((p) => p.id === id)!, zoom: g.zoom };
}

/**
 * Drags a piece with the mouse so that, without snapping, its top-left corner
 * would land at (x, y) mm. Returns that unsnapped spot.
 */
export async function dragPieceTo(app: App, id: number, x: number, y: number) {
  const p = await pieceOf(app, id);
  await app.drag(app.piece(id), (x - p.x) * p.zoom, (y - p.y) * p.zoom, 16);
  return { x, y };
}

/** Waits until the project is saved («Guardado» next to its name). */
export async function saved(page: Page) {
  await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved');
}

/** Turns «Imán» on or off and picks a grid size: a quick size (1, 5…) or one typed («2,5»). */
export async function setGrid(app: App, { size, snap }: { size?: string; snap?: boolean }) {
  const page = app.page;
  if (size !== undefined) {
    await app.openSetting('#grid-size');
    const chip = page.locator(`#grid-chips input[value="${size}"]`);
    if (await chip.count()) await chip.check();
    else {
      await page.locator('#grid-size').fill(size);
      await page.locator('#grid-size').dispatchEvent('change');
    }
  }
  if (snap !== undefined) {
    await app.openSetting('#grid-snap');
    await page.locator('#grid-snap').setChecked(snap);
  }
}

/**
 * Fires the drag events of a file dragged from the desktop onto `selector`:
 * dragenter, then (after `during` runs) drop. The file is a real fixture.
 */
export async function dropFile(page: Page, selector: string, name: string, type: string, during: () => Promise<void>) {
  const data = await page.evaluateHandle(
    ([b64, fileName, mime]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], fileName, { type: mime }));
      return dt;
    },
    [readFileSync(fixture(name)).toString('base64'), name, type] as const
  );
  const target = page.locator(selector);
  await target.dispatchEvent('dragenter', { dataTransfer: data });
  await target.dispatchEvent('dragover', { dataTransfer: data });
  await during();
  await target.dispatchEvent('drop', { dataTransfer: data });
}
