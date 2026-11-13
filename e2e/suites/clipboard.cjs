// Copy, cut, paste and duplicate pieces: one piece and several, on one sheet and on two, with
// overlapping allowed and not. Each pastes or duplicates into free gaps (no overlaps when they are
// not allowed), selects what it added and is exactly one undo step; redo brings it back.
const { open, makeChecker, addFiles, lib, cards, overlapping } = require('../lib/selection.cjs');

const press = async (p, key) => {
  // The keys as a person presses them; the copy, cut and paste events as the browser would fire them.
  if (/^Control\+[cxv]$/i.test(key)) {
    const type = { c: 'copy', x: 'cut', v: 'paste' }[key.at(-1).toLowerCase()];
    await p.evaluate((type) => document.dispatchEvent(new ClipboardEvent(type, { clipboardData: new DataTransfer(), bubbles: true, cancelable: true })), type);
  } else await p.keyboard.press(key);
  await p.waitForTimeout(60);
};

(async () => {
  const { check, report } = makeChecker('Clipboard and duplicate');
  const errors = [];
  for (const allowOverlap of [false, true]) {
    const s = await open({ storage: { 'scooch:piece-preferences': JSON.stringify({ allowOverlap }) } });
    const p = s.page;
    const L = lib(p);
    await addFiles(p, cards(0, 6));
    const ids = await L.ids();
    // Sheet 1 with 4 pieces, sheet 2 with 2.
    for (const id of [ids[4], ids[5]]) {
      await L.piece(id).focus();
      await p.keyboard.press('Shift+PageDown');
      await p.waitForTimeout(40);
    }
    await p.keyboard.press('Escape');
    const g0 = await L.geom();
    const sheetOf = (id) => g0.pieces.find((x) => x.id === id).sheetIndex;
    check(`${allowOverlap ? 'overlap on' : 'overlap off'}: setup with 4 + 2 pieces`, g0.sheets.length === 2 && ids.filter((id) => sheetOf(id) === 0).length === 4, JSON.stringify(g0.pieces.map((x) => [x.id, x.sheetIndex])));
    const SELECTIONS = {
      'one piece, one sheet': [ids[0]],
      'one piece on sheet 2': [ids[4]],
      'several on one sheet': [ids[1], ids[2]],
      'several on two sheets': [ids[3], ids[5]],
    };
    const tag = allowOverlap ? 'overlap on' : 'overlap off';
    for (const [name, selection] of Object.entries(SELECTIONS)) {
      const n = selection.length;
      for (const action of ['copy + paste', 'cut + paste', 'duplicate']) {
        await L.selectIds(selection);
        const base = await L.snap();
        const count0 = (await L.geom()).pieces.length;
        const problems = [];
        if (action === 'copy + paste') {
          await press(p, 'Control+c');
          if ((await L.snap()) !== base) problems.push('copying changed something');
          await press(p, 'Control+v');
        } else if (action === 'cut + paste') {
          await press(p, 'Control+x');
          const cut = await L.geom();
          if (cut.pieces.length !== count0 - n) problems.push(`cut left ${cut.pieces.length}`);
          await L.undo();
          if ((await L.snap()) !== base) problems.push('undoing the cut didn’t restore it exactly');
          await L.redo();
          await press(p, 'Control+v');
        } else {
          await press(p, 'Control+d');
        }
        const g = await L.geom();
        const added = g.pieces.filter((x) => !JSON.parse(base).pieces.some((b) => Number(b[0]) === x.id));
        const expected = action === 'cut + paste' ? count0 : count0 + n;
        if (g.pieces.length !== expected) problems.push(`${g.pieces.length} pieces, ${expected} expected`);
        if (added.length !== n) problems.push(`${added.length} new`);
        const selected = (await L.selectedIds()).sort((a, b) => a - b);
        if (JSON.stringify(selected) !== JSON.stringify(added.map((x) => x.id).sort((a, b) => a - b))) problems.push(`selected ${selected}`);
        if (!allowOverlap && overlapping(g.pieces).length) problems.push(`overlaps ${JSON.stringify(overlapping(g.pieces))}`);
        const after = await L.snap();
        await L.undo();
        const undone = await L.snap();
        const wanted = action === 'cut + paste' ? JSON.stringify({ ...JSON.parse(base), pieces: JSON.parse(base).pieces.filter((b) => !selection.includes(Number(b[0]))) }) : base;
        if (undone !== wanted) problems.push('one undo step doesn’t give back exactly what was there');
        await L.redo();
        if ((await L.snap()) !== after) problems.push('redo doesn’t bring it back');
        await L.undo();
        if (action === 'cut + paste') await L.undo();
        if ((await L.snap()) !== base) problems.push('not back to the start');
        check(`${tag}, ${name}: ${action}`, problems.length === 0, problems.join(' | '));
      }
    }
    errors.push(...s.errors);
    await s.browser.close();
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
