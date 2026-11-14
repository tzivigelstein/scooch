// The command palette in the real browser: Ctrl+K and the search button open
// it with the focus in its field, a command typed and chosen runs and the
// focus goes back where it was, Esc gives the focus back, Ctrl+K does nothing
// under another dialog, and on a phone a finger reaches a paper in the second
// step, which is remembered after a reload. What it lists, its keys and its
// ARIA are in tests/components/CommandPalette.test.tsx; what each command
// does, in tests/state/commands.test.ts.
import { expect, test } from '../support/test.ts';

const palette = '#palette[open]';

test.describe('with the keyboard', () => {
  test('Ctrl+K opens it with the focus in the field; «girar» and Enter rotate the focused piece, close it and give the focus back to the piece', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    const piece = app.pieces().first();
    await piece.focus();
    await expect(piece).toHaveClass(/\bis-selected\b/);
    await page.keyboard.press('Control+k');
    await expect(page.locator(palette)).toBeVisible();
    await expect(page.locator('#palette-input')).toBeFocused();
    await page.keyboard.type('girar der');
    await expect(page.locator('#palette-option-rotateRight')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page.locator(palette)).toHaveCount(0);
    await expect.poll(async () => (await app.geometry()).pieces[0].r).toBe(90);
    await expect(piece).toBeFocused();
  });

  test('Esc closes it and gives the focus back; under Preferences, Ctrl+K does nothing at all', async ({ app }) => {
    const page = app.page;
    await page.locator('#prefs-open').focus();
    await page.keyboard.press('Control+k');
    await expect(page.locator(palette)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(palette)).toHaveCount(0);
    await expect(page.locator('#prefs-open')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#prefs[open]')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.locator('#prefs[open]')).toBeVisible();
    await expect(page.locator(palette)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#prefs[open]')).toHaveCount(0);
    await expect(page.locator('#prefs-open')).toBeFocused();
  });

  test('the search button in the bar opens it too; a command that opens a dialog hands that dialog the focus to give back', async ({ app }) => {
    const page = app.page;
    await page.locator('#palette-open').click();
    await expect(page.locator(palette)).toBeVisible();
    await expect(page.locator('#palette-input')).toBeFocused();
    await page.keyboard.type('preferencias');
    await page.keyboard.press('Enter');
    await expect(page.locator('#prefs[open]')).toBeVisible();
    await expect(page.locator(palette)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#palette-open')).toBeFocused();
  });
});

test.describe('on a phone, with a finger', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the search button, «Cambiar el papel» and A3 in the second step change the paper; after a reload it is the recent command', async ({ app, page }) => {
    await page.locator('#palette-open').tap();
    await expect(page.locator(palette)).toBeVisible();
    const box = (await page.locator(palette).boundingBox())!;
    expect(box.width, 'the whole width but its margins').toBeGreaterThan(370);
    await page.locator('#palette-option-paper').tap();
    await expect(page.locator('#palette-step')).toHaveText('Cambiar el papel');
    await page.locator('#palette-option-choice-A3').tap();
    await expect(page.locator(palette)).toHaveCount(0);
    await expect(page.locator('#paper')).toHaveValue('A3');

    await page.reload();
    await app.ready();
    await page.locator('#palette-open').tap();
    const first = page.locator('#palette-list [role="group"]').first();
    await expect(first.locator('[role="presentation"]')).toHaveText('Recientes');
    await expect(first.locator('[role="option"]')).toHaveText(['Cambiar el papel']);
  });
});
