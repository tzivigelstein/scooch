// The clipboard shortcuts with the real keyboard: Ctrl+C / Ctrl+V and Ctrl+D
// reach their actions, select what they added and are one undo step each; an
// image on the system clipboard is decoded into a piece; what is cut survives
// a reload until it is pasted. Every combination of
// selection × «Permitir superposición» × action is in tests/state/clipboard.test.ts.
import { overlapping } from '../support/geometry.ts';
import { saved } from '../support/projects.ts';
import { cards, expect, test } from '../support/test.ts';

test.describe('pieces', () => {
  test.beforeEach(async ({ app }) => {
    await app.addFiles(cards(0, 2));
  });

  test('Ctrl+C and Ctrl+V paste a copy in a free spot, selected, in one undo step', async ({ app, page }) => {
    const [first] = await app.ids();
    await app.selectIds([first]);
    const before = await app.snapshot();
    await page.keyboard.press('Control+c');
    await app.heard(/Se copió 1 pieza/);
    expect(await app.snapshot()).toBe(before);
    await page.keyboard.press('Control+v');
    await expect(app.pieces()).toHaveCount(3);
    const g = await app.geometry();
    const pasted = g.pieces.find((p) => p.id !== first && !JSON.parse(before).pieces.some((q: string[]) => Number(q[0]) === p.id))!;
    expect(await app.selectedIds()).toEqual([pasted.id]);
    expect(pasted.name).toBe(g.pieces.find((p) => p.id === first)!.name);
    expect(overlapping(g.pieces)).toEqual([]);
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
  });

  test('Ctrl+X, a reload and Ctrl+V: the cut piece comes back, its image loaded', async ({ app, page }) => {
    const [first, second] = await app.ids();
    const name = (await app.geometry()).pieces.find((p) => p.id === second)!.name;
    await app.selectIds([second]);
    await page.keyboard.press('Control+x');
    await expect(app.pieces()).toHaveCount(1);
    await saved(page);
    await page.reload();
    await app.ready();
    await expect(app.pieces()).toHaveCount(1);
    await app.selectIds([first]);
    await page.keyboard.press('Control+v');
    await expect(app.pieces()).toHaveCount(2);
    expect((await app.geometry()).pieces.map((p) => p.name).sort()).toEqual([(await app.geometry()).pieces.find((p) => p.id === first)!.name, name].sort());
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#sheets .piece img')].every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
  });

  test('Ctrl+D duplicates the selection, selected, in one undo step', async ({ app, page }) => {
    const ids = await app.ids();
    await app.selectIds(ids);
    const before = await app.snapshot();
    await page.keyboard.press('Control+d');
    await expect(app.pieces()).toHaveCount(4);
    const added = (await app.ids()).filter((id) => !ids.includes(id));
    expect(await app.selectedIds()).toEqual(added);
    expect(overlapping((await app.geometry()).pieces)).toEqual([]);
    await app.undo();
    await expect.poll(() => app.snapshot()).toBe(before);
  });
});

test.describe('an image on the system clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('Ctrl+V adds it as a piece', async ({ app, page }) => {
    // A 600 × 400 px PNG, as an image editor would leave it on the clipboard.
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#c00';
      ctx.fillRect(0, 0, 600, 400);
      const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    });
    await page.keyboard.press('Control+v');
    await expect(app.pieces()).toHaveCount(1);
    await app.idle();
    const [p] = (await app.geometry()).pieces;
    // 600 × 400 px at 300 ppp: 50.8 × 33.9 mm.
    expect(p.w).toBeCloseTo(50.8, 1);
    expect(p.h).toBeCloseTo(33.87, 1);
  });
});
