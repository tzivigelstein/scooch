// Crop: every standard photo size on landscape, portrait and square images in the 4 rotations
// (exact to ±0.05 mm); crop mode by mouse and by keyboard (one undo step; Esc changes nothing; a
// standard size keeps its size); ppp of the cropped area; the list thumbnail; what other actions
// do with a cropped piece; PDF page changes; save and restore; and the exported PDF against the
// screen for cropped and rotated image and vector PDF pieces.
const { open, makeChecker, addFiles, lib, heard, download, path, fs, OUT } = require('../lib/selection.cjs');
const { bareSheet, rasterize, difference } = require('../lib/raster.cjs');
const { PDFDocument, PDFName, rgb } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '../..');
const TOL = 0.05;

const box = (page, sel) => page.locator(sel).boundingBox();
const one = async (L) => (await L.geom()).pieces.find((p) => p.selected) ?? (await L.geom()).pieces[0];
const sameSize = (p, w, h) => Math.abs(p.w - w) <= TOL && Math.abs(p.h - h) <= TOL;

// The live crop overlay: frame and whole image in px.
const OVERLAY = () => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  return { frame: r('#crop-frame'), ghost: r('.crop-ghost'), active: document.activeElement?.id, help: document.getElementById('crop-help')?.textContent ?? '' };
};

(async () => {
  const { check, report } = makeChecker('Crop and standard photo sizes');
  const errors = [];
  const { PHOTO_SIZES } = await import(path.join(ROOT, 'src/core/crop.js'));

  // ---------- 1. Every preset × image orientation × rotation, exact
  {
    const s = await open();
    const p = s.page;
    const L = lib(p);
    for (const [file, shape] of [['wide.png', 'landscape'], ['tall.png', 'portrait'], ['square.webp', 'square']]) {
      await p.evaluate(() => document.getElementById('clear')?.click());
      await addFiles(p, [file], 1);
      await L.piece((await L.ids())[0]).focus();
      for (let turn = 0; turn < 4; turn++) {
        const bad = [];
        // Adding may have turned it («Girar si conviene»): the sizes keep whatever rotation it has.
        const r = (await one(L)).r;
        for (const size of PHOTO_SIZES) {
          await L.openMeasures();
          await p.selectOption('#photo-size', size.id);
          const piece = await one(L);
          // The image as seen (rotated) decides the orientation; a square image keeps the size as listed.
          const lying = shape === 'square' ? false : (shape === 'landscape') === (piece.r % 180 === 0);
          const [w, h] = lying ? [Math.max(size.w, size.h), Math.min(size.w, size.h)] : [size.w, size.h];
          if (!sameSize(piece, w, h) || piece.r !== r) bad.push(`${size.id}: ${piece.w.toFixed(3)} × ${piece.h.toFixed(3)} (want ${w} × ${h}, r ${piece.r})`);
          if ((await p.inputValue('#photo-size')) !== size.id) bad.push(`${size.id}: the select shows ${await p.inputValue('#photo-size')}`);
        }
        check(`${file} at ${r}° (turn ${turn}): all ${PHOTO_SIZES.length} sizes exact (±${TOL} mm), select in sync`, bad.length === 0, bad.join(' | '));
        await L.piece((await one(L)).id).focus();
        await p.keyboard.press('r');
      }
    }
    // «Original» removes the crop; with several selected, each piece gets the size.
    await p.selectOption('#photo-size', 'original');
    check('«Original» removes the crop (the select says so)', (await p.inputValue('#photo-size')) === 'original');
    await p.evaluate(() => document.getElementById('clear')?.click());
    await addFiles(p, ['wide.png', 'tall.png'], 2);
    await L.selectIds(await L.ids());
    await L.openMeasures();
    await p.selectOption('#photo-size', '10x15');
    const g = await L.geom();
    // wide.png lies at 0°/180°; tall.png stands at 0°/180°.
    const want = (q, lyingAtZero) => (lyingAtZero === (q.r % 180 === 0) ? [152.4, 101.6] : [101.6, 152.4]);
    check('with 2 selected, each one becomes 10 × 15 in its orientation', sameSize(g.pieces[0], ...want(g.pieces[0], true)) && sameSize(g.pieces[1], ...want(g.pieces[1], false)), JSON.stringify(g.pieces.map((q) => [q.w, q.h, q.r])));
    await L.undo();
    const back = await L.geom();
    check('…in one undo step', !sameSize(back.pieces[0], ...want(back.pieces[0], true)) && !sameSize(back.pieces[1], ...want(back.pieces[1], false)), JSON.stringify(back.pieces.map((q) => [q.w, q.h])));
    errors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 2. Crop mode by mouse
  {
    const s = await open();
    const p = s.page;
    const L = lib(p);
    await addFiles(p, ['wide.png']);
    const id = (await L.ids())[0];
    await L.piece(id).click();
    const before = await L.snap();
    await L.piece(id).dblclick();
    await p.waitForSelector('#crop-frame');
    let o = await p.evaluate(OVERLAY);
    check('double click: crop mode, focus on the crop frame, full image = frame', o.active === 'crop-frame' && Math.abs(o.ghost.w - o.frame.w) < 1, JSON.stringify(o));
    check('the piece toolbar hides and the crop bar shows', !(await p.isVisible('#piecebar')) && (await p.isVisible('#cropbar')));
    // Wheel over the image: zoom in (the frame stays, the image grows).
    await p.mouse.move(o.frame.x + o.frame.w / 2, o.frame.y + o.frame.h / 2);
    await p.mouse.wheel(0, -300);
    await p.waitForTimeout(50);
    let o2 = await p.evaluate(OVERLAY);
    check('wheel zooms the image under the frame', o2.ghost.w > o.frame.w * 1.3 && Math.abs(o2.frame.w - o.frame.w) < 0.5, JSON.stringify(o2));
    const scaleLive = await p.inputValue('#scale');
    check('…the scale field follows live', Number(scaleLive.replace(',', '.')) > 101, scaleLive);
    // Drag inside: pans the image (content follows the pointer, stopping at its edge).
    const ghost0 = o2.ghost.x;
    await p.mouse.move(o2.frame.x + o2.frame.w / 2, o2.frame.y + o2.frame.h / 2);
    await p.mouse.down();
    await p.mouse.move(o2.frame.x + o2.frame.w / 2 + 25, o2.frame.y + o2.frame.h / 2, { steps: 5 });
    await p.mouse.up();
    o2 = await p.evaluate(OVERLAY);
    check('dragging pans the image, the frame stays', Math.abs(o2.ghost.x - ghost0 - 25) < 1 && Math.abs(o2.frame.x - o.frame.x) < 0.5, JSON.stringify({ ghost0, ghost: o2.ghost.x }));
    // East edge: free resize (no standard size).
    const f = o2.frame;
    await p.mouse.move(f.x + f.w, f.y + f.h / 2);
    await p.mouse.down();
    await p.mouse.move(f.x + f.w - 40, f.y + f.h / 2, { steps: 5 });
    await p.mouse.up();
    o2 = await p.evaluate(OVERLAY);
    check('the east edge narrows the frame freely', Math.abs(o2.frame.w - (f.w - 40)) < 1 && Math.abs(o2.frame.h - f.h) < 0.5, JSON.stringify(o2.frame));
    // A click outside applies it.
    const sheet = await box(p, '.sheet');
    await p.mouse.click(sheet.x + sheet.width - 6, sheet.y + sheet.height - 6);
    const piece = (await L.geom()).pieces[0];
    check('a click outside applies it: the piece is what the frame showed', !(await p.isVisible('#crop-frame')) && Math.abs(piece.w * (await L.geom()).zoom - o2.frame.w) < 1, JSON.stringify(piece));
    await L.undo();
    check('one undo step brings back exactly the piece before', (await L.snap()) === before);
    errors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 3. Crop mode by keyboard; Esc changes nothing; a standard size keeps its size
  {
    const s = await open();
    const p = s.page;
    const L = lib(p);
    await addFiles(p, ['wide.png', 'tall.png']);
    const [id] = await L.ids();
    await L.piece(id).focus();
    const before = await L.snap();
    const undoBefore = await p.isDisabled('#undo');
    await p.keyboard.press('k');
    await p.waitForSelector('#crop-frame');
    let o = await p.evaluate(OVERLAY);
    check('K: crop mode with the focus on the frame and the instructions', o.active === 'crop-frame' && /flechas/.test(o.help) && /Esc: cancelar/.test(o.help) && (await p.getAttribute('#crop-frame', 'aria-describedby')) === 'crop-help');
    check('the frame is named and says it is a crop', /^Recorte de wide\.png: /.test(await p.getAttribute('#crop-frame', 'aria-label')) && (await p.getAttribute('#crop-frame', 'aria-roledescription')) === 'recorte');
    await p.keyboard.press('Escape');
    check('Esc right away: nothing changed, no undo step', (await L.snap()) === before && (await p.isDisabled('#undo')) === undoBefore && (await heard(p, /Se canceló el recorte/)));
    check('…and the focus is back on the piece', (await p.evaluate(() => document.activeElement.dataset.id)) === String(id));
    await p.keyboard.press('k');
    await p.waitForSelector('#crop-frame');
    for (let i = 0; i < 4; i++) await p.keyboard.press('+');
    const o1 = await p.evaluate(OVERLAY);
    check('+ zooms in (the image grows under the frame)', o1.ghost.w > o1.frame.w * 1.3, JSON.stringify(o1));
    check('…announced', await heard(p, /Se ve el \d+ % de la imagen/));
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Shift+ArrowDown');
    const o2 = await p.evaluate(OVERLAY);
    check('arrows pan the image (Shift: more)', o2.ghost.x > o1.ghost.x && o2.ghost.y > o1.ghost.y, JSON.stringify([o1.ghost, o2.ghost]));
    check('…announced', await heard(p, /Se ve desde el \d+ % por la izquierda/));
    await p.keyboard.press('Alt+ArrowLeft');
    const o3 = await p.evaluate(OVERLAY);
    check('Alt+← narrows the frame', o3.frame.w < o2.frame.w - 1 && Math.abs(o3.frame.h - o2.frame.h) < 0.5);
    await p.keyboard.press('Escape');
    check('Esc after changes: exactly as before, no undo step', (await L.snap()) === before && (await p.isDisabled('#undo')) === undoBefore);
    await p.keyboard.press('k');
    await p.waitForSelector('#crop-frame');
    await p.keyboard.press('+');
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('Alt+ArrowUp');
    await p.keyboard.press('Enter');
    check('Enter applies it and the focus returns to the piece', !(await p.isVisible('#crop-frame')) && (await p.evaluate(() => document.activeElement.dataset.id)) === String(id) && (await heard(p, /Se recortó wide\.png/)));
    check('…a different piece now', (await L.snap()) !== before);
    await p.keyboard.press('Control+z');
    check('Ctrl+Z: exactly the piece before (one step)', (await L.snap()) === before);

    // A standard size: the frame keeps its proportion and, applied, the piece its exact size.
    await L.openMeasures();
    await p.selectOption('#photo-size', '10x15');
    await L.piece(id).focus();
    await p.keyboard.press('k');
    await p.waitForSelector('#crop-frame');
    check('with a standard size, the instructions say the proportion is kept', /mantiene la proporción de 10 × 15/.test((await p.evaluate(OVERLAY)).help));
    const f = (await p.evaluate(OVERLAY)).frame;
    await p.mouse.move(f.x + f.w, f.y + f.h);
    await p.mouse.down();
    await p.mouse.move(f.x + f.w - 50, f.y + f.h - 10, { steps: 6 });
    const during = (await p.evaluate(OVERLAY)).frame;
    check('the corner keeps the 10 × 15 proportion while dragging', Math.abs(during.w / during.h - 152.4 / 101.6) < 0.01, JSON.stringify(during));
    await p.mouse.up();
    await p.keyboard.press('Enter');
    const piece = (await L.geom()).pieces.find((q) => q.id === id);
    check('applied: still exactly 10 × 15', sameSize(piece, 152.4, 101.6), `${piece.w} × ${piece.h}`);
    check('…showing less of the image (a tighter crop)', await p.evaluate((pid) => {
      const node = document.querySelector(`#sheets .piece[data-id="${pid}"]`);
      return parseFloat(node.querySelector('img').style.width) > parseFloat(node.style.width) * 1.05;
    }, id));
    check('the select still says 10 × 15', (await p.inputValue('#photo-size')) === '10x15');
    errors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 4. ppp, thumbnail and what other actions do with a cropped piece
  {
    const s = await open();
    const p = s.page;
    const L = lib(p);
    await addFiles(p, ['wide.png', 'small.jpg']);
    const [id, other] = await L.ids();
    await L.piece(id).focus();
    await L.openMeasures();
    await p.selectOption('#photo-size', 'id-4x4');
    // ppp of the visible area: image px over the whole image's printed width.
    const ppp = await p.evaluate((pid) => {
      const node = document.querySelector(`#sheets .piece[data-id="${pid}"]`);
      const zoom = parseFloat(document.querySelector('.sheet-box').style.width) / 210;
      const fullMm = parseFloat(node.querySelector('img').style.width) / zoom;
      return Math.round((1772 * 25.4) / fullMm);
    }, id);
    check(`ppp is computed on the cropped area (${ppp} ppp)`, new RegExp(`Se imprime a ${ppp}\\sppp`).test(await p.textContent('#resolution-text')), await p.textContent('#resolution-text'));
    const thumb = await p.evaluate((pid) => {
      const t = document.querySelector(`#piece-list [role="option"][data-id="${pid}"] .thumb-piece`).getBoundingClientRect();
      return t.width / t.height;
    }, id);
    check('the list thumbnail shows the crop (square for 4 × 4)', Math.abs(thumb - 1) < 0.02, String(thumb));
    const ratio = async () =>
      p.evaluate((pid) => {
        const node = document.querySelector(`#sheets .piece[data-id="${pid}"]`);
        const img = node.querySelector('img');
        return [parseFloat(img.style.width) / parseFloat(node.style.width), parseFloat(img.style.height) / parseFloat(node.style.height)].map((v) => Math.round(v * 1000) / 1000).join();
      }, id);
    const cropRatio = await ratio();
    await L.piece(id).focus();
    await p.keyboard.press('r');
    let q = (await L.geom()).pieces.find((x) => x.id === id);
    // A square crop: the box stays 40 × 40 and the whole (unrotated) image keeps its size.
    check('rotate: the crop turns with it (still 40 × 40, same image)', sameSize(q, 40, 40) && (await ratio()) === cropRatio, `${await ratio()} vs ${cropRatio}`);
    await p.keyboard.press('Shift+r');
    await L.drag(p.locator('#handle'), 30, 30);
    q = (await L.geom()).pieces.find((x) => x.id === id);
    check('the handle scales it and keeps the crop', q.w > 41 && Math.abs(q.w - q.h) < 0.01 && (await ratio()) === cropRatio, JSON.stringify(q));
    await L.piece(id).focus();
    await p.keyboard.press('f');
    q = (await L.geom()).pieces.find((x) => x.id === id);
    check('«Ajustar a la hoja» keeps the crop', Math.abs(q.w - q.h) < 0.01 && q.w > 150 && (await ratio()) === cropRatio, JSON.stringify(q));
    await p.click('#actual');
    q = (await L.geom()).pieces.find((x) => x.id === id);
    check('«100 %» keeps the crop', (await p.inputValue('#scale')) === '100' && (await ratio()) === cropRatio);
    await L.piece(id).focus();
    await p.keyboard.press('Control+z');
    await p.keyboard.press('Control+z');
    await L.piece(id).focus();
    await p.selectOption('#photo-size', 'id-4x4');
    await L.piece(id).focus();
    await p.keyboard.press('d');
    let g = await L.geom();
    const copy = g.pieces.find((x) => x.id !== id && x.id !== other);
    check('duplicate copies the crop', copy && sameSize(copy, 40, 40), JSON.stringify(copy));
    await L.openMeasures();
    await p.click('#fill-details summary');
    await p.click('#fill');
    g = await L.geom();
    check('«Rellenar con copias» copies the crop', g.pieces.length > 10 && g.pieces.every((x) => sameSize(x, 40, 40)), `${g.pieces.length}`);
    await p.keyboard.press('Control+z');
    check('undoing the fill brings back the cropped pieces', (await L.geom()).pieces.length === 3);
    errors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 5. PDF page changes and save/restore
  {
    const same = await PDFDocument.create();
    for (const color of [rgb(0.9, 0.2, 0.2), rgb(0.2, 0.3, 0.9)]) {
      const pg = same.addPage([300, 420]);
      pg.drawRectangle({ x: 20, y: 20, width: 260, height: 380, color });
    }
    const samePath = path.join(OUT, 'same-size-pages.pdf');
    fs.writeFileSync(samePath, await same.save());
    const s = await open();
    const p = s.page;
    const L = lib(p);
    await addFiles(p, ['twopage.pdf']);
    await p.locator('#file').setInputFiles(samePath);
    await p.waitForFunction(() => document.querySelectorAll('#sheets .piece').length === 2);
    await L.waitIdle();
    const [a, b] = await L.ids();
    await L.piece(a).focus();
    await L.openMeasures();
    await p.selectOption('#photo-size', '9x13');
    await p.selectOption('#page', '2');
    await p.waitForFunction(() => /página 2/.test(document.getElementById('piece-name').textContent));
    let q = (await L.geom()).pieces.find((x) => x.id === a);
    check('another page of another size: the crop goes away and it says so', !sameSize(q, 88.9, 127) && /La página 2 tiene otro tamaño, así que se quitó el recorte/.test((await L.pill()).text), JSON.stringify([q, (await L.pill()).text]));
    await L.piece(b).focus();
    await L.openMeasures();
    await p.selectOption('#photo-size', '9x13');
    const sized = (await L.geom()).pieces.find((x) => x.id === b);
    await p.selectOption('#page', '2');
    await p.waitForFunction(() => /página 2/.test(document.getElementById('piece-name').textContent));
    q = (await L.geom()).pieces.find((x) => x.id === b);
    check('another page of the same size keeps the crop', sameSize(q, sized.w, sized.h) && Math.min(q.w, q.h) - 88.9 < TOL && Math.max(q.w, q.h) - 127 < TOL, JSON.stringify(q));
    await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
    const before = await L.snap();
    await p.reload();
    await p.waitForFunction(() => !document.body.classList.contains('is-loading') && document.querySelectorAll('#sheets .piece').length === 2);
    await p.waitForTimeout(200);
    check('save and restore: the same crops', (await L.snap()) === before);
    errors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 6. The PDF against the screen: cropped and rotated image and vector PDF pieces
  {
    const s = await open();
    const p = s.page;
    const L = lib(p);
    await addFiles(p, ['big.png', 'twopage.pdf']);
    const [img, vec] = await L.ids();
    await L.piece(img).focus();
    await L.openMeasures();
    await p.selectOption('#photo-size', '10x15');
    await L.piece(img).focus();
    await p.keyboard.press('r');
    await p.keyboard.press('k');
    await p.waitForSelector('#crop-frame');
    await p.keyboard.press('+');
    await p.keyboard.press('+');
    await p.keyboard.press('Shift+ArrowLeft');
    await p.keyboard.press('Enter');
    await L.piece(vec).focus();
    await p.keyboard.press('k');
    await p.waitForSelector('#crop-frame');
    for (let i = 0; i < 3; i++) await p.keyboard.press('+');
    await p.keyboard.press('Shift+ArrowUp');
    await p.keyboard.press('Alt+ArrowLeft');
    await p.keyboard.press('Enter');
    await L.piece(vec).focus();
    await p.keyboard.press('Shift+r');
    await p.click('#arrange');
    await p.keyboard.press('Escape');
    await bareSheet(p);
    const sheet = await box(p, '.sheet');
    const screen = path.join(OUT, 'crop-screen.png');
    await p.locator('.sheet').first().screenshot({ path: screen });
    const { file } = await download(p);
    const raster = await rasterize(p, file, sheet.width, path.join(OUT, 'crop-pdf.png'));
    const [mean, big] = await difference(p, screen, raster);
    check(`the PDF matches the sheet on screen (mean ${mean.toFixed(2)}/255, ${(big * 100).toFixed(2)} % very different)`, mean < 3 && big < 0.01);
    // The cropped, turned PDF page is still vector: a form XObject (its page), not an image.
    const pdf = await PDFDocument.load(fs.readFileSync(file));
    const xobjects = pdf.getPage(0).node.Resources().lookup(PDFName.of('XObject'));
    const kinds = xobjects.keys().map((key) => pdf.context.lookup(xobjects.get(key)).dict.get(PDFName.of('Subtype')).toString()).sort();
    check('the cropped PDF piece stays vector (a form XObject); the image piece is the only image', JSON.stringify(kinds) === JSON.stringify(['/Form', '/Image']), JSON.stringify(kinds));
    errors.push(...s.errors);
    await s.browser.close();
  }

  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
