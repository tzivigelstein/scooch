// The app walked with the keyboard only (no mouse event): the skip link, the
// Tab order between regions, O and the file chooser, where the focus goes after
// each key on a piece (its toolbar, its fields, the list, the tabs and back),
// Ctrl+S, Ctrl+Shift+S, Ctrl+P and Ctrl+O, the focus rescue on «Deshacer», the dialogs giving
// the focus back, papers and units, several sheets, the projects dialog and
// the multiple selection. What each key does to the document is in
// tests/hooks/useGlobalShortcuts.test.tsx; the dialogs' content in
// tests/components (ShortcutsDialog, PrefsDialog); the paper fields in
// tests/components/SheetSection.test.tsx; the list in PieceList.test.tsx.
import type { Page } from '@playwright/test';
import { overlapping } from '../support/geometry.ts';
import { focused, region, tabTo } from '../support/keyboard.ts';
import { cards, expect, fixture, norm, test, tiles, type App } from '../support/test.ts';

const selectedId = (page: Page) => page.evaluate(() => Number(document.querySelector<HTMLElement>('#sheets .piece.is-selected')?.dataset.id ?? NaN) || null);
/** The pieces on each sheet, in order. */
const perSheet = async (app: App) => (await app.sheets()).map((s) => s.pieces.length);
const paperLabel = (page: Page) => page.locator('#paper-label');

test.describe('editing with the keyboard only', () => {
  test('the skip link goes to the empty sheet, O opens the file chooser, and Tab crosses the regions in order with the list as one stop', async ({ app, page }) => {
    await test.step('the first Tab reaches «Ir a la hoja»; Enter goes to the empty sheet’s drop zone', async () => {
      await page.keyboard.press('Tab');
      await expect(page.locator('#skip')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#empty')).toBeFocused();
    });

    await test.step('O opens the file chooser, for several files', async () => {
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press('o');
      const files = await chooser;
      expect(files.isMultiple()).toBe(true);
      await files.setFiles(['small.jpg', 'square.webp', 'tall.png'].map(fixture));
      await expect(app.pieces()).toHaveCount(3);
      await app.idle();
    });

    await test.step('Tab order: skip link → top bar → pieces panel → sheet title → its pieces → «Agregar hoja» → piece toolbar → zoom → properties', async () => {
      await page.locator('#skip').focus();
      const seq = ['skip'];
      for (let i = 0; i < 40 && seq.at(-1) !== 'properties panel'; i++) {
        await page.keyboard.press('Tab');
        const r = await region(page);
        if (seq.at(-1) !== r) seq.push(r);
      }
      expect(seq).toEqual(['skip', 'top bar', 'pieces panel', 'sheet', 'piece', 'sheet', 'piece toolbar', 'zoom', 'properties panel']);
      await expect(page.locator('#piece-list [tabindex="0"]')).toHaveCount(1);
    });

    await test.step('Shift+Tab back over the zoom, the toolbar and «Agregar hoja» lands on a piece and selects it; its name says its size and place', async () => {
      for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+Tab');
      const f = await focused(page);
      expect(f.piece).not.toBeNull();
      expect(await selectedId(page)).toBe(f.piece);
      expect(norm(f.label)).toMatch(/^\S+\.(jpg|webp|png), [\d,]+ × [\d,]+ mm, a [\d,-]+ mm del borde izquierdo y [\d,-]+ mm del superior$/);
    });
  });

  test('keys on a piece keep the focus where it belongs: A, the arrows, D, Delete, Ctrl+Z, M to its fields, Enter to its toolbar, Esc back', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
    await page.locator('#skip').focus();
    await page.keyboard.press('Enter');
    const first = (await focused(page)).piece!;
    expect(first).not.toBeNull();
    const piece = app.piece(first);

    await test.step('A arranges (they were already: it says so), and the focus stays on the piece', async () => {
      await page.keyboard.press('a');
      await app.heard(/Las piezas ya están acomodadas/);
      await expect(piece).toBeFocused();
    });

    await test.step('↓ moves it, and the focus stays on it', async () => {
      const y = (await app.geometry()).pieces.find((p) => p.id === first)!.y;
      await page.keyboard.press('ArrowDown');
      await expect.poll(async () => (await app.geometry()).pieces.find((p) => p.id === first)!.y).toBeGreaterThan(y);
      await expect(piece).toBeFocused();
    });

    let copy = 0;
    await test.step('D duplicates without overlapping, and the copy gets the focus and the selection', async () => {
      await page.keyboard.press('d');
      await expect(app.pieces()).toHaveCount(4);
      const f = await focused(page);
      copy = f.piece!;
      expect(copy).not.toBeNull();
      expect(copy).not.toBe(first);
      expect(await app.selectedIds()).toEqual([copy]);
      expect(overlapping((await app.geometry()).pieces)).toEqual([]);
    });

    await test.step('Delete removes it, and a neighbor gets the focus and the selection', async () => {
      await page.keyboard.press('Delete');
      await expect(app.pieces()).toHaveCount(3);
      const f = await focused(page);
      expect(f.piece).not.toBeNull();
      expect(f.piece).not.toBe(copy);
      expect(await app.selectedIds()).toEqual([f.piece]);
    });

    await test.step('Ctrl+Z brings it back, and the focus is on the selected piece', async () => {
      await page.keyboard.press('Control+z');
      await expect(app.pieces()).toHaveCount(4);
      await expect(page.locator('#sheets .piece.is-selected')).toBeFocused();
    });

    await test.step('M: the Pieza tab; Esc back to the piece; M and Tab: X with its text selected; Esc back to the piece', async () => {
      await piece.focus();
      await page.keyboard.press('m');
      await expect(page.locator('#props-tab-piece')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(piece).toBeFocused();
      await page.keyboard.press('m');
      await page.keyboard.press('Tab');
      await expect(page.locator('#pos-x')).toBeFocused();
      const f = await focused(page);
      expect(f.selected).toBe(f.value);
      expect(f.value).not.toBe('');
      await page.keyboard.press('Escape');
      await expect(piece).toBeFocused();
    });

    await test.step('Enter: into its toolbar; → moves to the next button (roving focus); Esc closes the button’s tooltip, Esc again goes back to the piece', async () => {
      await page.keyboard.press('Enter');
      await expect.poll(() => region(page)).toBe('piece toolbar');
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await focused(page)).action).toBe('rotate-right');
      await expect(page.locator('#tooltip')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#tooltip')).toBeHidden();
      expect((await focused(page)).action).toBe('rotate-right');
      await page.keyboard.press('Escape');
      await expect(piece).toBeFocused();
    });
  });

  test('P goes to the list: Home and ↓ select, Enter goes to the piece, Delete keeps the focus in the list; removing the last piece focuses the drop zone', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
    await page.locator('#skip').focus();
    await page.keyboard.press('Enter');
    expect((await focused(page)).piece).not.toBeNull();

    await test.step('P: the focus on the selected piece’s row', async () => {
      await page.keyboard.press('p');
      await expect(page.locator('#piece-list [role="option"][aria-selected="true"]')).toBeFocused();
    });

    let second = 0;
    await test.step('Home and ↓: the second row, selected on the sheet too', async () => {
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      const row = page.locator('#piece-list [role="option"]').nth(1);
      await expect(row).toBeFocused();
      second = Number(await row.getAttribute('data-id'));
      expect(await app.selectedIds()).toEqual([second]);
    });

    await test.step('Enter: the focus on that piece on the sheet', async () => {
      await page.keyboard.press('Enter');
      await expect(app.piece(second)).toBeFocused();
    });

    await test.step('P and Delete: removed, and the focus stays in the list on a selected neighbor', async () => {
      await page.keyboard.press('p');
      await page.keyboard.press('Delete');
      await expect(app.pieces()).toHaveCount(2);
      await expect(page.locator('#piece-list [role="option"][aria-selected="true"]')).toBeFocused();
    });

    await test.step('Enter to the piece, Delete twice: with the last one gone, the focus is on the drop zone', async () => {
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await focused(page)).piece).not.toBeNull();
      await page.keyboard.press('Delete');
      await expect(app.pieces()).toHaveCount(1);
      await page.keyboard.press('Delete');
      await expect(app.pieces()).toHaveCount(0);
      await expect(page.locator('#empty')).toBeFocused();
    });
  });

  test('H and Tab reach the paper; the orientation with →, L back to portrait, G shows and hides the grid', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await app.pieces().first().focus();

    await test.step('H: the Hoja tab; Tab: the «Papel» header, then the paper size', async () => {
      await page.keyboard.press('h');
      await expect(page.locator('#props-tab-sheet')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('[aria-controls="section-sheet"]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#paper')).toBeFocused();
    });

    await test.step('Tab past the margin to the orientation; → chooses «Horizontal»', async () => {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#landscape')).toBeChecked();
      await expect(paperLabel(page)).toHaveText('A4 · 297 × 210 mm');
    });

    await test.step('Esc back to the canvas, L: portrait again', async () => {
      await page.keyboard.press('Escape');
      await expect.poll(() => region(page)).toMatch(/^(piece|sheet)$/);
      await page.keyboard.press('l');
      await expect(paperLabel(page)).toHaveText('A4 · 210 × 297 mm');
    });

    await test.step('G shows the grid on the sheet, G again hides it', async () => {
      const grid = page.locator('#sheets .grid-layer').first();
      await page.keyboard.press('g');
      await expect(grid).toBeVisible();
      await page.keyboard.press('g');
      await expect(grid).toBeHidden();
    });
  });

  test('Ctrl+Shift+S downloads the PDF, Ctrl+S says changes save themselves, and Ctrl+P prints it', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await app.pieces().first().focus();

    await test.step('Ctrl+S: no download and no «Save page», a notice', async () => {
      let downloads = 0;
      page.on('download', () => downloads++);
      await page.keyboard.press('Control+s');
      await expect.poll(async () => (await app.notice()).text).toBe('Los cambios se guardan automáticamente');
      expect(downloads).toBe(0);
    });

    await test.step('Ctrl+Shift+S: scooch-a4.pdf', async () => {
      const download = page.waitForEvent('download');
      await page.keyboard.press('Control+Shift+S');
      expect((await download).suggestedFilename()).toBe('scooch-a4.pdf');
      await app.idle();
    });

    await test.step('Ctrl+P: without a PDF viewer, the PDF opens in another tab to print it there', async () => {
      // Headless Chromium has no PDF viewer; with one, the PDF prints from a hidden frame (print-and-download.spec).
      expect(await page.evaluate(() => navigator.pdfViewerEnabled)).toBe(false);
      const popup = page.context().waitForEvent('page');
      await page.keyboard.press('Control+p');
      const tab = await popup;
      await expect.poll(async () => (await app.notice()).text).toBe('Se abrió el PDF en otra pestaña. Imprímelo desde ahí.');
      await tab.close();
    });
  });

  test('focus rescue: Enter on «Deshacer» until nothing is left to undo hands the focus to «Rehacer»', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await app.pieces().first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const undo = page.locator('#undo');
    const redo = page.locator('#redo');
    await page.locator('#skip').focus();
    expect(await tabTo(page, (f) => f.id === 'undo', { max: 15 })).toBe(true);
    for (let i = 0; i < 10 && (await undo.isEnabled()); i++) {
      await expect(undo).toBeFocused();
      await page.keyboard.press('Enter');
    }
    await expect(undo).toBeDisabled();
    await expect(redo).toBeFocused();
    await expect(redo).toBeEnabled();
  });

  test('single keys turned off through the shortcuts dialog’s link to Preferences: the focus comes back to the piece, and the choice survives a reload', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp']);
    const piece = app.pieces().first();
    await piece.focus();

    await test.step('?: the shortcuts; Tab reaches the «Preferencias» link; Enter opens Preferences instead', async () => {
      await page.keyboard.press('Shift+Slash');
      await expect(page.locator('#shortcuts')).toHaveAttribute('open', '');
      expect(await tabTo(page, (f) => f.id === 'shortcuts-prefs', { max: 4 })).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator('#prefs')).toHaveAttribute('open', '');
      await expect(page.locator('#shortcuts')).not.toHaveAttribute('open');
    });

    await test.step('Tab to «Atajos de 1 tecla», Space turns them off; Esc closes, the focus back on the piece', async () => {
      expect(await tabTo(page, (f) => f.id === 'single-keys', { max: 8 })).toBe(true);
      await page.keyboard.press('Space');
      await expect(page.locator('#single-keys')).not.toBeChecked();
      await page.keyboard.press('Escape');
      await expect(page.locator('#prefs')).not.toHaveAttribute('open');
      await expect(piece).toBeFocused();
    });

    await test.step('after a reload the single keys are still off', async () => {
      await page.reload();
      await app.ready();
      await page.locator('#prefs-open').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#single-keys')).not.toBeChecked();
      await page.keyboard.press('Escape');
      await expect(page.locator('#prefs-open')).toBeFocused();
    });
  });
});

test.describe('papers, units, sheets and projects with the keyboard only', () => {
  test('Preferences from the gear: → chooses cm; then a custom 30 × 20 cm paper from the paper list, and back to A4', async ({ app, page }) => {
    expect(await app.pieces().count()).toBe(0);
    await test.step('Tab reaches the gear; Enter opens Preferences on the units (mm); → chooses cm; Tab: «Atajos de 1 tecla»', async () => {
      await page.locator('#skip').focus();
      expect(await tabTo(page, (f) => f.id === 'prefs-open', { max: 15 })).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.locator('#prefs')).toHaveAttribute('open', '');
      for (let i = 0; i < 4 && !(await page.evaluate(() => (document.activeElement as HTMLInputElement).name === 'unit')); i++) await page.keyboard.press('Tab');
      await expect(page.locator('#prefs input[name="unit"][value="mm"]')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#prefs input[name="unit"][value="cm"]')).toBeChecked();
      await page.keyboard.press('Tab');
      await expect(page.locator('#single-keys')).toBeFocused();
    });

    await test.step('Esc closes it, the focus back on the gear; the sheet is in cm already', async () => {
      await page.keyboard.press('Escape');
      await expect(page.locator('#prefs')).not.toHaveAttribute('open');
      await expect(page.locator('#prefs-open')).toBeFocused();
      await expect(paperLabel(page)).toHaveText('A4 · 21 × 29,7 cm');
    });

    await test.step('H, Tab, Tab: the paper size; End: «Personalizado», with width and height', async () => {
      await page.keyboard.press('h');
      await expect(page.locator('#props-tab-sheet')).toBeFocused();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(page.locator('#paper')).toBeFocused();
      await page.keyboard.press('End');
      await expect(page.locator('#paper')).toHaveValue('custom');
      await expect(page.locator('#paper-w')).toBeVisible();
    });

    await test.step('Tab reaches the width (after the orientation); 30, Tab, 20, Enter: a custom landscape sheet', async () => {
      expect(await tabTo(page, (f) => f.id === 'paper-w', { max: 4 })).toBe(true);
      await page.keyboard.press('Control+a');
      await page.keyboard.type('30');
      await page.keyboard.press('Tab');
      await expect(page.locator('#paper-h')).toBeFocused();
      await page.keyboard.press('Control+a');
      await page.keyboard.type('20');
      await page.keyboard.press('Enter');
      await expect(paperLabel(page)).toHaveText('Personalizado · 30 × 20 cm');
      await expect(page.locator('#landscape')).toBeChecked();
    });

    await test.step('Esc from the field goes back to the sheet; H, Tab, Tab, Home and ↓ four times: A4; Esc: the focus on the empty sheet', async () => {
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await focused(page)).id).toBe('empty');
      await page.keyboard.press('h');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Home');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
      await expect(page.locator('#paper')).toHaveValue('A4');
      await page.keyboard.press('Escape');
      await expect(page.locator('#empty')).toBeFocused();
      // The orientation stays landscape, as the custom size was.
      await expect(paperLabel(page)).toHaveText('A4 · 29,7 × 21 cm');
    });
  });

  test('several sheets: Page Up and Page Down, Shift+Page Down to a new sheet, «Agregar hoja» and removing sheets by Tab and Enter, the list across sheets', async ({ app, page }) => {
    await app.addFiles(cards(0, 12));

    await test.step('«Ir a la hoja»: the focus on a piece; 12 pieces on 2 sheets', async () => {
      await page.locator('#skip').focus();
      await page.keyboard.press('Enter');
      expect((await focused(page)).piece).not.toBeNull();
      expect(await perSheet(app)).toEqual([9, 3]);
    });

    const sheetIds = async () => (await app.sheets()).map((s) => s.id);
    await test.step('Page Up: sheet 1; Page Down: sheet 2, on its first piece', async () => {
      const ids = await sheetIds();
      await page.keyboard.press('PageUp');
      await page.keyboard.press('PageUp');
      await expect.poll(async () => (await focused(page)).sheet).toBe(ids[0]);
      await page.keyboard.press('PageDown');
      await expect.poll(async () => (await focused(page)).sheet).toBe(ids[1]);
      expect((await focused(page)).piece).toBe(Number((await app.sheets())[1].pieces[0].id));
    });

    await test.step('Shift+Page Down: the piece goes on to a new sheet 3, with the focus, announced', async () => {
      await page.keyboard.press('Shift+PageDown');
      await expect.poll(() => perSheet(app)).toEqual([9, 2, 1]);
      expect((await focused(page)).sheet).toBe((await sheetIds())[2]);
      await app.heard(/Se movió a la hoja 3 de 3/);
    });

    await test.step('A: arranged on 2 sheets (9 + 3), the empty one gone', async () => {
      await page.keyboard.press('a');
      await expect.poll(() => perSheet(app)).toEqual([9, 3]);
    });

    await test.step('Tab from the piece reaches «Agregar hoja»; Enter adds sheet 3', async () => {
      expect(await tabTo(page, (f) => f.id === 'add-sheet', { max: 20 })).toBe(true);
      await page.keyboard.press('Enter');
      await expect.poll(() => perSheet(app)).toEqual([9, 3, 0]);
      await app.heard(/Se agregó la hoja 3/);
    });

    await test.step('Shift+Tab reaches «Quitar la hoja 3»; Enter removes it at once (empty), the focus on a sheet', async () => {
      expect(await tabTo(page, (f) => /page-remove/.test(f.cls), { max: 4, back: true })).toBe(true);
      expect((await focused(page)).label).toBe('Quitar la hoja 3');
      await page.keyboard.press('Enter');
      await expect.poll(() => perSheet(app)).toEqual([9, 3]);
      await expect.poll(async () => (await focused(page)).cls).toMatch(/\bsheet\b/);
    });

    await test.step('Shift+Tab: «Quitar la hoja 2»; Enter: sheet 2 goes at once with its 3 pieces, the notice offers «Deshacer»; Ctrl+Z brings it back', async () => {
      await page.keyboard.press('Shift+Tab');
      expect((await focused(page)).label).toBe('Quitar la hoja 2');
      await page.keyboard.press('Enter');
      await expect.poll(() => perSheet(app)).toEqual([9]);
      await expect(page.locator('#confirm')).not.toHaveAttribute('open');
      expect(await app.notice()).toMatchObject({ text: 'Se quitó la hoja 2 con 3 piezas', action: 'Deshacer' });
      await page.keyboard.press('Control+z');
      await expect.poll(() => perSheet(app)).toEqual([9, 3]);
    });

    await test.step('P: a row of the list; ↓ walks from sheet 1’s group into sheet 2’s; Enter: the piece on the sheet', async () => {
      await page.keyboard.press('p');
      await expect.poll(async () => (await focused(page)).cls).toMatch(/piece-row/);
      for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
      expect(await page.evaluate(() => document.activeElement?.closest('[role="group"]')?.querySelector('.group-title')?.textContent)).toBe('Hoja 2');
      const row = Number(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.id));
      await page.keyboard.press('Enter');
      await expect(app.piece(row)).toBeFocused();
    });
  });

  test('projects: renaming in the top bar, «Proyectos» and Ctrl+O, a new project, renaming in a card, opening and deleting, all by keyboard', async ({ app, page }) => {
    await test.step('Tab reaches the project’s name; Enter: a field with the name selected; Enter saves and the focus is back on the button', async () => {
      await page.locator('#skip').focus();
      expect(await tabTo(page, (f) => f.id === 'project-name', { max: 5 })).toBe(true);
      await page.keyboard.press('Enter');
      const f = await focused(page);
      expect(f.id).toBe('project-name-input');
      expect(f.selected).toBe(f.value);
      expect(f.value).not.toBe('');
      await page.keyboard.type('Tarjetas');
      await page.keyboard.press('Enter');
      await expect(page.locator('#project-name')).toBeFocused();
      await expect(page.locator('#project-name-text')).toHaveText('Tarjetas');
    });

    await test.step('Tab: «Proyectos»; Enter opens it on «Nuevo proyecto»; Esc closes it, the focus back on «Proyectos»', async () => {
      await page.keyboard.press('Tab');
      await expect(page.locator('#projects-open')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#projects')).toHaveAttribute('open', '');
      await expect(page.locator('#project-new')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#projects')).not.toHaveAttribute('open');
      await expect(page.locator('#projects-open')).toBeFocused();
    });

    await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
    await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved');

    await test.step('Ctrl+O and Enter: a new blank project, the focus on the drop zone', async () => {
      await page.keyboard.press('Control+o');
      await expect(page.locator('#projects')).toHaveAttribute('open', '');
      await page.keyboard.press('Enter');
      await expect(page.locator('#project-name-text')).toHaveText('Sin título');
      await expect(app.pieces()).toHaveCount(0);
      await expect(page.locator('#empty')).toBeFocused();
      await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved');
    });

    /** From the first card, ↓ until the focused card is the project named `name` (the order is projects.spec’s). */
    async function downTo(name: string) {
      for (let i = 0; i < 2 && !(await focused(page)).label?.includes(`«${name}»`); i++) await page.keyboard.press('ArrowDown');
      expect((await focused(page)).act).toBe('open');
      expect((await focused(page)).label).toContain(`«${name}»`);
    }

    await test.step('Ctrl+O, Tab: the first card; ↓ to «Tarjetas»; Tab, Tab: its rename button; renamed with Enter, the focus on that button', async () => {
      await page.keyboard.press('Control+o');
      await expect(page.locator('#projects')).toHaveAttribute('open', '');
      await expect(page.locator('#projects .project-card')).toHaveCount(2);
      await page.keyboard.press('Tab');
      expect((await focused(page)).act).toBe('open');
      await downTo('Tarjetas');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      expect((await focused(page)).label).toBe('Cambiar el nombre de «Tarjetas»');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Control+a');
      await page.keyboard.type('Tarjetas finales');
      await page.keyboard.press('Enter');
      await expect(page.locator('#projects .project-title', { hasText: /^Tarjetas finales$/ })).toHaveCount(1);
      expect((await focused(page)).act).toBe('rename');
    });

    await test.step('Shift+Tab twice: «Abrir»; Enter opens it with its 3 pieces and the focus on the canvas', async () => {
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      expect((await focused(page)).act).toBe('open');
      await page.keyboard.press('Enter');
      await expect(page.locator('#project-name-text')).toHaveText('Tarjetas finales');
      await expect(app.pieces()).toHaveCount(3);
      await expect.poll(() => region(page)).toMatch(/^(piece|sheet)$/);
    });

    await test.step('Ctrl+O, Tab, ↓ to «Sin título», Tab ×3: «Eliminar «Sin título»»; Enter asks with the focus on «Cancelar»; Tab, Enter deletes it and the focus stays in the dialog', async () => {
      await page.keyboard.press('Control+o');
      await expect(page.locator('#projects')).toHaveAttribute('open', '');
      await expect(page.locator('#projects .project-card')).toHaveCount(2);
      await page.keyboard.press('Tab');
      await downTo('Sin título');
      for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
      expect((await focused(page)).label).toBe('Eliminar «Sin título»');
      await page.keyboard.press('Enter');
      await expect(page.locator('#confirm')).toHaveAttribute('open', '');
      await expect(page.locator('#confirm-cancel')).toBeFocused();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.locator('#projects .project-card')).toHaveCount(1);
      expect(await page.evaluate(() => !!document.activeElement?.closest('#projects'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('#projects')).not.toHaveAttribute('open');
    });
  });
});

test('multiple selection with the keyboard only: Shift+Space, Shift+Tab without changing it, Alt+Shift+↑, the group’s toolbar and fields, Duplicar ×N, I, Ctrl+A and Esc', async ({ app, page }) => {
  await app.addFiles(tiles(50, 4));
  const before = await app.geometry();

  let first = 0;
  let second = 0;
  await test.step('the skip link: the focus on the last piece; Shift+Tab: the one before, selected; ↓ three times moves it 3 mm down', async () => {
    // Four tiles load as three on the first row and one on the second (the last one, selected).
    expect(before.pieces.map((p) => Math.round(p.y))).toEqual([10, 10, 10, 65]);
    await page.locator('#skip').focus();
    await page.keyboard.press('Enter');
    expect((await focused(page)).piece).toBe(before.pieces[3].id);
    await page.keyboard.press('Shift+Tab');
    first = (await focused(page)).piece!;
    expect(first).toBe(before.pieces[2].id);
    expect(await app.selectedIds()).toEqual([first]);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await app.geometry()).pieces.find((p) => p.id === first)!.y).toBeCloseTo(13, 3);
    // The new place is announced a moment later; once said, it can't cover what comes next.
    await app.heard(/del borde izquierdo y 13\smm del superior/);
  });

  await test.step('Shift+Space pins it and says how to go on; Shift+Tab to the piece beside it leaves the selection as it was; Shift+Space adds it', async () => {
    await page.keyboard.press('Shift+Space');
    await app.heard(/agrégala con Shift\+Espacio/);
    expect(await app.selectedIds()).toEqual([first]);
    await page.keyboard.press('Shift+Tab');
    second = (await focused(page)).piece!;
    expect(second).toBe(before.pieces[1].id);
    expect(await app.selectedIds()).toEqual([first]);
    await page.keyboard.press('Shift+Space');
    await expect.poll(() => app.selectedIds()).toEqual([second, first]);
    await app.heard(/2 piezas seleccionadas/);
  });

  await test.step('Alt+Shift+↑ aligns the two to the top of the higher one (y = 10 mm), announced', async () => {
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await app.heard(/Se alinearon 2 piezas arriba/);
    const after = await app.geometry();
    for (const id of [first, second]) expect(after.pieces.find((p) => p.id === id)!.y).toBeCloseTo(10, 3);
  });

  await test.step('Enter: the group’s toolbar on its first button; Esc closes its tooltip, Esc again back to the piece', async () => {
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await focused(page)).label).toBe('Rotar 90° a la izquierda');
    await expect(page.locator('#piecebar')).toHaveAttribute('aria-label', 'Acciones de 2 piezas');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await focused(page)).piece).not.toBeNull();
  });

  await test.step('M: the Pieza tab; Tab: the group’s X; Tab reaches «Alinear a la izquierda», with its shortcut; Enter: refused, they would overlap', async () => {
    await page.keyboard.press('m');
    await expect(page.locator('#props-tab-piece')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#pos-x')).toBeFocused();
    expect(await tabTo(page, (f) => f.label === 'Alinear a la izquierda', { max: 20 })).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-keyshortcuts'))).toBe('Alt+Shift+ArrowLeft');
    const snapshot = await app.snapshot();
    await page.keyboard.press('Enter');
    // Side by side on one row, aligned to the left they would be one on top of the other.
    await expect.poll(async () => (await app.notice()).text).toBe('No se puede alinear: las piezas se superpondrían');
    expect((await app.notice()).action).toBe('Permitir superposición');
    expect(await app.snapshot()).toEqual(snapshot);
  });

  await test.step('Tab reaches the copies field; 3 and Enter: six new copies, announced', async () => {
    expect(await tabTo(page, (f) => f.id === 'dup-count', { max: 20 })).toBe(true);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect(app.pieces()).toHaveCount(10);
    await app.heard(/Se agregaron 6 copias/);
  });

  await test.step('I on the first piece: it and its 3 copies; Ctrl+A: every piece of the sheet, announced; Esc: none, announced', async () => {
    await app.piece(first).focus();
    await page.keyboard.press('i');
    await expect.poll(async () => (await app.selectedIds()).length).toBe(4);
    const names = new Set((await app.geometry()).pieces.filter((p) => p.selected).map((p) => p.name));
    expect(names.size).toBe(1);
    await page.keyboard.press('Control+a');
    await expect.poll(async () => (await app.selectedIds()).length).toBe((await app.sheets())[0].pieces.length);
    await app.heard(/Se seleccionaron las \d+ piezas de la hoja/);
    await page.keyboard.press('Escape');
    await expect.poll(() => app.selectedIds()).toEqual([]);
    await app.heard(/Ninguna pieza seleccionada/);
  });
});
