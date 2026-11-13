import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  MIN_CROP,
  PHOTO_SIZES,
  photoSize,
  isIdentity,
  clampCrop,
  pieceSize,
  cropToAspect,
  fitToSize,
  panCrop,
  panDelta,
  zoomCrop,
  drawParams,
  cssParams,
} from '../../src/core/crop.js';
import { prng } from './support.js';

const PT_PER_MM = 72 / 25.4;
const ROTATIONS = [0, 90, 180, 270];
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function assertCropInside(crop, label = '', min = MIN_CROP) {
  if (crop === null) return;
  for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(crop[k]), `${label}: ${k} no finito`);
  assert.ok(crop.w > 0 && crop.h > 0, `${label}: vacío ${JSON.stringify(crop)}`);
  assert.ok(crop.w >= min - 1e-12 && crop.h >= min - 1e-12, `${label}: muy chico ${JSON.stringify(crop)}`);
  assert.ok(crop.x >= 0 && crop.y >= 0, `${label}: sale por arriba/izquierda ${JSON.stringify(crop)}`);
  assert.ok(crop.x + crop.w <= 1 + 1e-12 && crop.y + crop.h <= 1 + 1e-12, `${label}: sale ${JSON.stringify(crop)}`);
}

// Geometría de export.js tal como está hoy (pieza sin recorte).
function assertCropClose(actual, expected, label = '') {
  for (const k of ['x', 'y', 'w', 'h']) {
    assert.ok(close(actual[k], expected[k], 1e-12), `${label} ${k}: ${actual[k]} ≠ ${expected[k]}`);
  }
}

function currentPlacement({ x, y, w, h, uw, uh, r }, sheetHeight) {
  return {
    x: (x + (r === 180 || r === 270 ? w : 0)) * PT_PER_MM,
    y: (sheetHeight - y - (r === 90 || r === 180 ? 0 : h)) * PT_PER_MM,
    width: uw * PT_PER_MM,
    height: uh * PT_PER_MM,
    rotate: -r,
  };
}

// Lo que hace pdf-lib con drawImage: translate(x, y) · rotate(θ) · scale(width,
// height), con θ en grados antihorarios. (u, v) es un punto del cuadrado
// unitario de la imagen, con v hacia arriba.
function pdfPoint(p, u, v) {
  const t = (p.rotate * Math.PI) / 180;
  const lx = u * p.width;
  const ly = v * p.height;
  return { x: p.x + lx * Math.cos(t) - ly * Math.sin(t), y: p.y + lx * Math.sin(t) + ly * Math.cos(t) };
}

// Lo que hace el navegador: caja sin girar en (left, top), girada `rotate`
// grados horarios alrededor de su centro (y hacia abajo). (u, v) normalizado
// en la imagen, v hacia abajo.
function cssPoint(img, u, v) {
  const t = (img.rotate * Math.PI) / 180;
  const cx = img.left + img.width / 2;
  const cy = img.top + img.height / 2;
  const dx = u * img.width - img.width / 2;
  const dy = v * img.height - img.height / 2;
  return { x: cx + dx * Math.cos(t) - dy * Math.sin(t), y: cy + dx * Math.sin(t) + dy * Math.cos(t) };
}

// Esquina de la pieza en la que termina la esquina superior izquierda de la
// imagen (o del recorte) al girar r grados horarios: 0 → arriba izquierda,
// 90 → arriba derecha, 180 → abajo derecha, 270 → abajo izquierda.
const TOP_LEFT_GOES_TO = { 0: [0, 0], 90: [1, 0], 180: [1, 1], 270: [0, 1] };

const assets = [
  { w: 150, h: 100 }, // apaisada
  { w: 80, h: 120 }, // vertical
  { w: 90, h: 90 }, // cuadrada
  { w: 210, h: 297 }, // A4
];

describe('tamaños de foto', () => {
  test('ids estables, medidas en vertical y grupos', () => {
    assert.deepEqual(
      PHOTO_SIZES.map((s) => s.id),
      ['9x13', '10x15', '13x18', '15x20', '20x25', '20x30', '10x10', 'id-4x4', 'passport-35x45', 'visa-5x5', 'instant']
    );
    assert.equal(new Set(PHOTO_SIZES.map((s) => s.id)).size, PHOTO_SIZES.length);
    for (const s of PHOTO_SIZES) {
      assert.ok(s.w > 0 && s.w <= s.h, s.id);
      assert.ok(['print', 'id', 'instant'].includes(s.group), s.id);
    }
    assert.deepEqual(photoSize('10x15'), { id: '10x15', w: 101.6, h: 152.4, group: 'print' });
    assert.deepEqual(photoSize('passport-35x45'), { id: 'passport-35x45', w: 35, h: 45, group: 'id' });
    assert.deepEqual(photoSize('instant'), { id: 'instant', w: 88, h: 107, group: 'instant' });
    assert.equal(photoSize('nope'), null);
    assert.ok(Object.isFrozen(PHOTO_SIZES) && Object.isFrozen(PHOTO_SIZES[0]));
  });
});

describe('isIdentity y clampCrop', () => {
  test('isIdentity', () => {
    assert.equal(isIdentity(null), true);
    assert.equal(isIdentity(undefined), true);
    assert.equal(isIdentity({ x: 0, y: 0, w: 1, h: 1 }), true);
    assert.equal(isIdentity({ x: 1e-9, y: 0, w: 1 - 1e-9, h: 1 }), true);
    assert.equal(isIdentity({ x: 0, y: 0, w: 0.5, h: 1 }), false);
    assert.equal(isIdentity({ x: 0.1, y: 0, w: 1, h: 1 }), false);
  });

  test('clampCrop', () => {
    assert.equal(clampCrop(null), null);
    assert.equal(clampCrop({ x: 0, y: 0, w: 1, h: 1 }), null);
    assert.equal(clampCrop({ x: -1, y: -1, w: 5, h: 5 }), null);
    assert.deepEqual(clampCrop({ x: 0.8, y: -0.2, w: 0.5, h: 0.5 }), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    assert.deepEqual(clampCrop({ x: 0.5, y: 0.5, w: 0, h: 0.2 }), { x: 0.5, y: 0.5, w: MIN_CROP, h: 0.2 });
    assert.equal(clampCrop({ x: NaN, y: 0, w: 0.5, h: 0.5 }), null);
    assert.equal(clampCrop({ x: 0, y: 0, w: Infinity, h: 0.5 }), null);
    const rnd = prng(1);
    for (let i = 0; i < 300; i++) {
      const crop = { x: rnd() * 3 - 1, y: rnd() * 3 - 1, w: rnd() * 2 - 0.2, h: rnd() * 2 - 0.2 };
      assertCropInside(clampCrop(crop), `caso ${i}`);
    }
  });
});

describe('cropToAspect', () => {
  test('proporciones exactas, siempre todo el ancho o todo el alto', () => {
    const rnd = prng(2);
    for (let i = 0; i < 300; i++) {
      const W = 10 + rnd() * 500;
      const H = 10 + rnd() * 500;
      const aspect = 0.1 + rnd() * 5;
      const focus = { x: rnd() * 1.4 - 0.2, y: rnd() * 1.4 - 0.2 };
      const c = cropToAspect(W, H, aspect, focus);
      // Con proporciones extremas un lado puede quedar debajo de MIN_CROP: manda la proporción.
      assertCropInside(c, `caso ${i}`, 0);
      assert.ok(close((c.w * W) / (c.h * H), aspect, 1e-12), `caso ${i}: proporción`);
      assert.ok(c.w === 1 || c.h === 1, `caso ${i}: máximo`);
      // Centrado en el foco salvo que lo frene un borde.
      const cx = c.x + c.w / 2;
      if (c.x > 0 && c.x + c.w < 1) assert.ok(close(cx, focus.x), `caso ${i}: foco x`);
    }
  });

  test('casos', () => {
    assertCropClose(cropToAspect(300, 200, 1), { x: 1 / 6, y: 0, w: 2 / 3, h: 1 });
    assertCropClose(cropToAspect(300, 200, 1, { x: 0, y: 0 }), { x: 0, y: 0, w: 2 / 3, h: 1 });
    assertCropClose(cropToAspect(300, 200, 1, { x: 1, y: 1 }), { x: 1 / 3, y: 0, w: 2 / 3, h: 1 });
    assert.deepEqual(cropToAspect(200, 400, 1), { x: 0, y: 0.25, w: 1, h: 0.5 });
    assert.deepEqual(cropToAspect(150, 100, 1.5), { x: 0, y: 0, w: 1, h: 1 });
    // 10×15 sobre una foto 3:2 apaisada en vertical.
    const c = cropToAspect(150, 100, 101.6 / 152.4);
    assert.ok(close(c.w, 4 / 9) && c.h === 1);
  });

  test('medidas inválidas → RangeError', () => {
    for (const args of [
      [0, 100, 1],
      [100, -1, 1],
      [100, 100, 0],
      [100, 100, NaN],
      [Infinity, 100, 1],
    ]) {
      assert.throws(() => cropToAspect(...args), RangeError, JSON.stringify(args));
    }
  });
});

describe('fitToSize', () => {
  test('llena el objetivo exacto en todas las rotaciones y orientaciones', () => {
    const targets = [...PHOTO_SIZES, { w: 152.4, h: 101.6 }, { w: 30, h: 90 }, { w: 200, h: 50 }];
    for (const asset of assets) {
      for (const r of ROTATIONS) {
        for (const target of targets) {
          for (const autoOrient of [true, false]) {
            const label = `${asset.w}×${asset.h} r${r} → ${target.w}×${target.h} auto:${autoOrient}`;
            const fit = fitToSize(asset, r, target, { autoOrient });
            assert.equal(fit.r, r, label);
            assertCropInside(fit.crop, label);
            const size = pieceSize(asset, fit);
            // Con autoOrient puede quedar el objetivo girado; nunca deformado.
            const straight = close(size.w, target.w) && close(size.h, target.h);
            const turned = close(size.w, target.h) && close(size.h, target.w);
            assert.ok(autoOrient ? straight || turned : straight, `${label}: ${size.w}×${size.h}`);
            // El recorte conserva la proporción de la imagen (no deforma).
            const c = fit.crop ?? { w: 1, h: 1 };
            assert.ok(close((c.w * asset.w) / (c.h * asset.h), size.uw / size.uh, 1e-12), `${label}: proporción`);
            assert.ok(c.w === 1 || c.h === 1, `${label}: recorte máximo`);
          }
        }
      }
    }
  });

  test('autoOrient: el objetivo sigue la orientación de la imagen como se ve', () => {
    const landscape = { w: 150, h: 100 };
    const target = photoSize('10x15'); // vertical
    const lying = pieceSize(landscape, fitToSize(landscape, 0, target));
    assert.ok(close(lying.w, 152.4) && close(lying.h, 101.6), 'apaisada → 15×10');
    // Girada 90°, la imagen se ve vertical: el objetivo queda como está.
    const standing = pieceSize(landscape, fitToSize(landscape, 90, target));
    assert.ok(close(standing.w, 101.6) && close(standing.h, 152.4), 'girada → 10×15');
    // Sin autoOrient, siempre el objetivo tal cual (recortando más).
    const forced = fitToSize(landscape, 0, target, { autoOrient: false });
    const forcedSize = pieceSize(landscape, forced);
    assert.ok(close(forcedSize.w, 101.6) && close(forcedSize.h, 152.4));
    assert.ok(forced.crop.w < 0.5);
    // Objetivo cuadrado: nunca se gira.
    const square = pieceSize(landscape, fitToSize(landscape, 0, photoSize('id-4x4')));
    assert.ok(close(square.w, 40) && close(square.h, 40));
  });

  test('sin recorte cuando la proporción ya coincide; foco', () => {
    const fit = fitToSize({ w: 150, h: 100 }, 0, { w: 75, h: 50 });
    assert.deepEqual(fit, { crop: null, scale: 50, r: 0 });
    const left = fitToSize({ w: 150, h: 100 }, 0, { w: 50, h: 50 }, { focus: { x: 0, y: 0.5 } });
    assert.equal(left.crop.x, 0);
    const right = fitToSize({ w: 150, h: 100 }, 0, { w: 50, h: 50 }, { focus: { x: 1, y: 0.5 } });
    assert.ok(close(right.crop.x + right.crop.w, 1));
    assert.equal(fitToSize({ w: 150, h: 100 }, 450, { w: 10, h: 10 }).r, 90, 'giro normalizado');
  });
});

describe('panCrop, panDelta y zoomCrop', () => {
  test('panCrop se frena en el borde y no cambia el tamaño', () => {
    const c = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    assert.deepEqual(panCrop(c, 0.1, -0.1), { x: 0.30000000000000004, y: 0.1, w: 0.5, h: 0.5 });
    assert.deepEqual(panCrop(c, 1, 1), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    assert.deepEqual(panCrop(c, -1, 0), { x: 0, y: 0.2, w: 0.5, h: 0.5 });
    assert.equal(panCrop(null, 0.1, 0.1), null);
    const rnd = prng(3);
    for (let i = 0; i < 200; i++) {
      const crop = clampCrop({ x: rnd(), y: rnd(), w: 0.05 + rnd() * 0.9, h: 0.05 + rnd() * 0.9 });
      const moved = panCrop(crop, rnd() * 2 - 1, rnd() * 2 - 1);
      assertCropInside(moved, `caso ${i}`);
      if (crop && moved) assert.ok(close(moved.w, crop.w) && close(moved.h, crop.h), `caso ${i}`);
    }
  });

  test('panDelta: el contenido sigue al arrastre en todas las rotaciones', () => {
    const asset = { w: 150, h: 100 };
    const crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const zoom = 3;
    for (const r of ROTATIONS) {
      const item = { x: 20, y: 30, scale: 80, r, crop };
      for (const [dx, dy] of [
        [4, 0],
        [0, -3],
        [2.5, 1.5],
      ]) {
        const d = panDelta(asset, item, dx, dy);
        const moved = { ...item, crop: panCrop(crop, d.dx, d.dy) };
        // Un mismo punto de la imagen se corre (dx, dy) mm en la hoja.
        const before = cssPoint(cssParams(item, asset, zoom).img, 0.5, 0.5);
        const after = cssPoint(cssParams(moved, asset, zoom).img, 0.5, 0.5);
        assert.ok(close(after.x - before.x, dx * zoom, 1e-9), `r${r} (${dx}, ${dy}): x ${after.x - before.x}`);
        assert.ok(close(after.y - before.y, dy * zoom, 1e-9), `r${r} (${dx}, ${dy}): y ${after.y - before.y}`);
      }
    }
  });

  test('zoomCrop mantiene la proporción, el foco y no se sale', () => {
    const c = { x: 0.2, y: 0.3, w: 0.4, h: 0.2 };
    const z = zoomCrop(c, 2);
    assert.ok(close(z.w, 0.2) && close(z.h, 0.1));
    assert.ok(close(z.x + z.w / 2, 0.4) && close(z.y + z.h / 2, 0.4), 'centro fijo');
    // Foco en una esquina del recorte: esa esquina no se mueve.
    const corner = zoomCrop(c, 2, { x: 0.2, y: 0.3 });
    assert.ok(close(corner.x, 0.2) && close(corner.y, 0.3));
    // Alejar hasta toda la imagen: se frena cuando un lado llega a 1.
    const out = zoomCrop(c, 0.01);
    assert.ok(close(out.w, 1) && close(out.h, 0.5), JSON.stringify(out));
    assertCropInside(out);
    // Desde «sin recorte»: alejar no hace nada; acercar recorta con la proporción de la imagen.
    assert.equal(zoomCrop(null, 0.5), null);
    assert.deepEqual(zoomCrop(null, 2), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    assert.equal(zoomCrop(zoomCrop(null, 2), 0.5), null, 'ida y vuelta');
    // No baja de MIN_CROP.
    const deep = zoomCrop(c, 1e6);
    assert.ok(close(Math.min(deep.w, deep.h), MIN_CROP));
    assert.throws(() => zoomCrop(c, 0), RangeError);
    assert.throws(() => zoomCrop(c, NaN), RangeError);
  });

  test('zoomCrop: fuzz dentro de [0, 1] y con la misma proporción', () => {
    const rnd = prng(4);
    for (let i = 0; i < 300; i++) {
      const crop = clampCrop({ x: rnd(), y: rnd(), w: 0.02 + rnd() * 0.98, h: 0.02 + rnd() * 0.98 });
      const factor = Math.exp(rnd() * 6 - 3);
      const focus = rnd() < 0.5 ? undefined : { x: rnd(), y: rnd() };
      const z = zoomCrop(crop, factor, focus);
      assertCropInside(z, `caso ${i}`);
      const before = crop ?? { w: 1, h: 1 };
      const after = z ?? { w: 1, h: 1 };
      assert.ok(close(after.w / after.h, before.w / before.h, 1e-9), `caso ${i}: proporción`);
    }
  });
});

describe('drawParams (PDF)', () => {
  test('sin recorte es idéntico a export.js', () => {
    for (const asset of assets) {
      for (const r of ROTATIONS) {
        for (const scale of [100, 37.5, 250]) {
          const item = { x: 12.3, y: 45.6, scale, r };
          const k = scale / 100;
          const [w, h] = r % 180 ? [asset.h * k, asset.w * k] : [asset.w * k, asset.h * k];
          const expected = currentPlacement({ x: item.x, y: item.y, w, h, uw: asset.w * k, uh: asset.h * k, r }, 297);
          for (const crop of [undefined, null, { x: 0, y: 0, w: 1, h: 1 }]) {
            const p = drawParams({ ...item, crop }, asset, 297);
            assert.equal(p.clip, null);
            assert.deepEqual({ x: p.x, y: p.y, width: p.width, height: p.height, rotate: p.rotate }, {
              ...expected,
              rotate: expected.rotate || 0,
            });
          }
        }
      }
    }
  });

  test('las esquinas del recorte caen sobre la pieza, en el orden correcto (fuzz)', () => {
    const rnd = prng(5);
    const sheetH = 297;
    for (let i = 0; i < 400; i++) {
      const asset = { w: 20 + rnd() * 300, h: 20 + rnd() * 300 };
      const r = ROTATIONS[i % 4];
      const random = clampCrop({ x: rnd() * 0.6, y: rnd() * 0.6, w: 0.05 + rnd() * 0.6, h: 0.05 + rnd() * 0.6 });
      const crop = i % 5 === 0 ? null : random;
      const item = { x: rnd() * 150, y: rnd() * 200, scale: 10 + rnd() * 200, r, crop };
      const p = drawParams(item, asset, sheetH);
      const { w, h } = pieceSize(asset, item);
      // Rectángulo de la pieza en puntos PDF (y hacia arriba).
      const left = item.x * PT_PER_MM;
      const right = (item.x + w) * PT_PER_MM;
      const top = (sheetH - item.y) * PT_PER_MM;
      const bottom = (sheetH - item.y - h) * PT_PER_MM;
      if (crop) {
        assert.ok(close(p.clip.x, left) && close(p.clip.y, bottom), `caso ${i}: clip`);
        assert.ok(close(p.clip.width, right - left) && close(p.clip.height, top - bottom), `caso ${i}: clip`);
      } else assert.equal(p.clip, null);
      // Las 4 esquinas de la zona recortada (u a la derecha, v hacia arriba).
      const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const u0 = c.x;
      const u1 = c.x + c.w;
      const vTop = 1 - c.y;
      const vBottom = 1 - c.y - c.h;
      const corners = [
        [u0, vTop, 0, 0], // arriba izquierda de la imagen recortada
        [u1, vTop, 1, 0],
        [u1, vBottom, 1, 1],
        [u0, vBottom, 0, 1],
      ];
      // Al girar r horario, la esquina (cx, cy) de la imagen va a parar a otra de la pieza.
      const turn = (cx, cy) => {
        let [a, b] = [cx, cy];
        for (let t = 0; t < r / 90; t++) [a, b] = [1 - b, a];
        return [a, b];
      };
      assert.deepEqual(turn(0, 0), TOP_LEFT_GOES_TO[r]);
      for (const [u, v, cx, cy] of corners) {
        const got = pdfPoint(p, u, v);
        const [ex, ey] = turn(cx, cy);
        const want = { x: ex ? right : left, y: ey ? bottom : top };
        const where = `caso ${i} r${r}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
        assert.ok(close(got.x, want.x, 1e-9) && close(got.y, want.y, 1e-9), where);
      }
    }
  });
});

describe('cssParams (pantalla)', () => {
  test('sin recorte es idéntico a sheetview.js', () => {
    for (const asset of assets) {
      for (const r of ROTATIONS) {
        const item = { x: 10, y: 20, scale: 55, r };
        const zoom = 2.7;
        const k = item.scale / 100;
        const [w, h] = r % 180 ? [asset.h * k, asset.w * k] : [asset.w * k, asset.h * k];
        const p = cssParams(item, asset, zoom);
        assert.equal(p.left, item.x * zoom);
        assert.equal(p.top, item.y * zoom);
        assert.equal(p.width, w * zoom);
        assert.equal(p.height, h * zoom);
        assert.equal(p.img.width, asset.w * k * zoom);
        assert.equal(p.img.height, asset.h * k * zoom);
        assert.equal(p.img.transform, `translate(-50%, -50%) rotate(${r}deg)`);
        assert.ok(close(p.img.left + p.img.width / 2, p.width / 2), 'centrada en x');
        assert.ok(close(p.img.top + p.img.height / 2, p.height / 2), 'centrada en y');
      }
    }
  });

  test('las esquinas del recorte llenan el contenedor, en el orden correcto (fuzz)', () => {
    const rnd = prng(6);
    for (let i = 0; i < 400; i++) {
      const asset = { w: 20 + rnd() * 300, h: 20 + rnd() * 300 };
      const r = ROTATIONS[i % 4];
      const crop = clampCrop({ x: rnd() * 0.6, y: rnd() * 0.6, w: 0.05 + rnd() * 0.6, h: 0.05 + rnd() * 0.6 });
      const item = { x: rnd() * 150, y: rnd() * 200, scale: 10 + rnd() * 200, r, crop };
      const zoom = 0.5 + rnd() * 4;
      const p = cssParams(item, asset, zoom);
      const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const corners = [
        [c.x, c.y, 0, 0],
        [c.x + c.w, c.y, 1, 0],
        [c.x + c.w, c.y + c.h, 1, 1],
        [c.x, c.y + c.h, 0, 1],
      ];
      for (const [u, v, cx, cy] of corners) {
        let [a, b] = [cx, cy];
        for (let t = 0; t < r / 90; t++) [a, b] = [1 - b, a];
        const got = cssPoint(p.img, u, v);
        const want = { x: a * p.width, y: b * p.height };
        const where = `caso ${i} r${r}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
        assert.ok(close(got.x, want.x, 1e-9) && close(got.y, want.y, 1e-9), where);
      }
      // La cadena `transform` (con left/top 50 %) pone el centro en el mismo lugar.
      const m = /^translate\(-50%, -50%\)(?: translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\))? rotate\((\d+)deg\)$/.exec(
        p.img.transform
      );
      assert.ok(m, p.img.transform);
      const tx = Number(m[1] ?? 0);
      const ty = Number(m[2] ?? 0);
      assert.equal(Number(m[3]), r);
      assert.ok(close(p.width / 2 + tx, p.img.left + p.img.width / 2, 1e-9), `caso ${i}: transform x`);
      assert.ok(close(p.height / 2 + ty, p.img.top + p.img.height / 2, 1e-9), `caso ${i}: transform y`);
    }
  });

  test('pieceSize coincide con el contenedor', () => {
    const asset = { w: 120, h: 80 };
    const item = { x: 0, y: 0, scale: 50, r: 90, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } };
    assert.deepEqual(pieceSize(asset, item), { w: 10, h: 30, uw: 30, uh: 10 });
    const p = cssParams(item, asset, 2);
    assert.ok(close(p.width, 20) && close(p.height, 60));
    assert.deepEqual(pieceSize(asset, { scale: 100 }), { w: 120, h: 80, uw: 120, uh: 80 });
  });
});
