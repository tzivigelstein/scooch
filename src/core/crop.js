// Recorte de piezas y tamaños de foto estándar. Módulo puro, sin DOM.
//
// Modelo: `crop = {x, y, w, h}` en coordenadas normalizadas (0–1) de la
// imagen ORIGINAL sin girar, con origen arriba a la izquierda; null (o
// ausente) = sin recorte. La pieza muestra solo esa zona: su tamaño impreso
// sin girar es asset.w × crop.w × scale/100 por asset.h × crop.h × scale/100,
// y el giro `r` (0 | 90 | 180 | 270, horario) se aplica después, como hoy.
// Las funciones que devuelven un recorte devuelven null si abarca toda la
// imagen, así «sin recorte» tiene una sola representación.

const PT_PER_MM = 72 / 25.4;

/** Lado mínimo de un recorte (fracción de la imagen): hasta 100 × de acercamiento. */
export const MIN_CROP = 0.01;

const FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const IDENTITY_TOL = 1e-6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Valores a un pelo de 0 o 1 (error de redondeo) quedan exactos.
const snapUnit = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(v - 1) < 1e-9 ? 1 : v);

/** Giro llevado a 0, 90, 180 o 270. */
const normRotation = (r) => ((((Math.round((r || 0) / 90) * 90) % 360) + 360) % 360);

// cos y sin exactos de un giro horario de r grados en pantalla (y hacia
// abajo), que es el mismo número que antihorario en PDF (y hacia arriba).
const TRIG = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };

/**
 * Tamaños de foto estándar, en mm y en vertical (w ≤ h). Los ids son
 * estables y no se traducen (los nombres los pone el texto de la interfaz).
 * Las copias de laboratorio usan sus medidas reales en pulgadas: «10x15» es
 * 4 × 6 in = 101,6 × 152,4 mm. Grupos: 'print' (copias), 'id' (documentos) e
 * 'instant' (instantánea, zona de imagen).
 */
export const PHOTO_SIZES = Object.freeze(
  [
    { id: '9x13', w: 88.9, h: 127, group: 'print' },
    { id: '10x15', w: 101.6, h: 152.4, group: 'print' },
    { id: '13x18', w: 127, h: 177.8, group: 'print' },
    { id: '15x20', w: 152.4, h: 203.2, group: 'print' },
    { id: '20x25', w: 203.2, h: 254, group: 'print' },
    { id: '20x30', w: 203.2, h: 304.8, group: 'print' },
    { id: '10x10', w: 101.6, h: 101.6, group: 'print' },
    { id: 'id-4x4', w: 40, h: 40, group: 'id' },
    { id: 'passport-35x45', w: 35, h: 45, group: 'id' },
    { id: 'visa-5x5', w: 50.8, h: 50.8, group: 'id' },
    { id: 'instant', w: 88, h: 107, group: 'instant' },
  ].map((size) => Object.freeze(size))
);

/** El tamaño de PHOTO_SIZES con ese id, o null. */
export const photoSize = (id) => PHOTO_SIZES.find((size) => size.id === id) ?? null;

/** ¿Es «sin recorte»? (null, ausente o toda la imagen, con tolerancia). */
export function isIdentity(crop) {
  if (!crop) return true;
  return (
    Math.abs(crop.x) <= IDENTITY_TOL &&
    Math.abs(crop.y) <= IDENTITY_TOL &&
    Math.abs(crop.w - 1) <= IDENTITY_TOL &&
    Math.abs(crop.h - 1) <= IDENTITY_TOL
  );
}

const normalize = (crop) => (isIdentity(crop) ? null : crop);

/**
 * Recorte válido más parecido a `crop`: lados entre MIN_CROP y 1 (cada uno
 * por separado, puede cambiar la proporción) y posición dentro de la imagen.
 * null si es toda la imagen o si `crop` es null o tiene valores no finitos.
 */
export function clampCrop(crop) {
  if (!crop) return null;
  if (![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite)) return null;
  const w = snapUnit(clamp(crop.w, MIN_CROP, 1));
  const h = snapUnit(clamp(crop.h, MIN_CROP, 1));
  const x = snapUnit(clamp(crop.x, 0, 1 - w));
  const y = snapUnit(clamp(crop.y, 0, 1 - h));
  return normalize({ x, y, w, h });
}

/**
 * Tamaño de la pieza con su recorte: {w, h} en la hoja (ya girada) y {uw, uh}
 * sin girar, en mm. Es lo que reemplaza a `dims` cuando hay recorte.
 */
export function pieceSize(asset, { scale, r = 0, crop = null }) {
  const c = isIdentity(crop) ? FULL : crop;
  const k = scale / 100;
  const uw = asset.w * k * c.w;
  const uh = asset.h * k * c.h;
  return normRotation(r) % 180 ? { w: uh, h: uw, uw, uh } : { w: uw, h: uh, uw, uh };
}

/**
 * El recorte más grande con proporción `aspect` (ancho / alto, en medidas
 * reales) de una imagen de imgW × imgH (cualquier unidad, la misma para los
 * dos), centrado en `focus` (punto normalizado de la imagen) tanto como lo
 * permitan los bordes. Siempre ocupa todo el ancho o todo el alto. Devuelve el
 * recorte normalizado ({x, y, w, h}; {0, 0, 1, 1} si la proporción coincide).
 * Manda la proporción: con una muy extrema un lado puede quedar debajo de
 * MIN_CROP (clampCrop lo agrandaría y la cambiaría).
 */
export function cropToAspect(imgW, imgH, aspect, focus = { x: 0.5, y: 0.5 }) {
  if (!(imgW > 0 && imgH > 0 && aspect > 0 && Number.isFinite(imgW * imgH * aspect))) {
    throw new RangeError(`medidas inválidas: ${imgW}×${imgH}, proporción ${aspect}`);
  }
  const imageAspect = imgW / imgH;
  const w = imageAspect > aspect ? snapUnit(aspect / imageAspect) : 1;
  const h = imageAspect > aspect ? 1 : snapUnit(imageAspect / aspect);
  return {
    x: snapUnit(clamp(focus.x - w / 2, 0, 1 - w)),
    y: snapUnit(clamp(focus.y - h / 2, 0, 1 - h)),
    w,
    h,
  };
}

/**
 * Recorte y escala para que la pieza ocupe EXACTAMENTE `target` ({w, h} en
 * mm, tal como se ve en la hoja), llenándolo: recorta lo que sobra (lo máximo
 * posible, centrado en `focus`, punto normalizado de la imagen original), sin
 * deformar. `asset`: {w, h} en mm a 100 %; `r`: giro actual de la pieza, que se
 * conserva. Con `autoOrient` (por omisión), si la imagen como se ve (ya
 * girada) es apaisada y el objetivo vertical, o al revés, usa el objetivo
 * girado: una foto apaisada con objetivo 10×15 queda de 15×10. Las cuadradas
 * (imagen u objetivo) no se giran. Devuelve {crop, scale, r} (crop null si no
 * hace falta recortar).
 */
export function fitToSize(asset, r, target, { autoOrient = true, focus = { x: 0.5, y: 0.5 } } = {}) {
  const rot = normRotation(r);
  const turned = rot % 180 !== 0;
  const shownW = turned ? asset.h : asset.w;
  const shownH = turned ? asset.w : asset.h;
  let tw = target.w;
  let th = target.h;
  if (autoOrient) {
    const tol = 1e-9 * Math.max(shownW, shownH, tw, th);
    const imageLying = shownW > shownH + tol;
    const imageStanding = shownH > shownW + tol;
    const targetLying = tw > th + tol;
    const targetStanding = th > tw + tol;
    if ((imageLying && targetStanding) || (imageStanding && targetLying)) [tw, th] = [th, tw];
  }
  // El objetivo en la orientación de la imagen original.
  const uw = turned ? th : tw;
  const uh = turned ? tw : th;
  const crop = cropToAspect(asset.w, asset.h, uw / uh, focus);
  return { crop: normalize(crop), scale: (100 * uw) / (asset.w * crop.w), r: rot };
}

/**
 * Corre el recorte (dx, dy) en coordenadas normalizadas de la imagen, sin
 * salirse de ella (se frena contra el borde). Sin recorte no hay nada que
 * correr: devuelve null. Ver `panDelta` para arrastrar desde la hoja.
 */
export function panCrop(crop, dx, dy) {
  if (isIdentity(crop)) return null;
  return clampCrop({ x: crop.x + dx, y: crop.y + dy, w: crop.w, h: crop.h });
}

/**
 * Cuánto correr el recorte (para `panCrop`) para que el contenido de la pieza
 * siga a un arrastre de (dx, dy) mm en la hoja, teniendo en cuenta el giro y
 * la escala de la pieza: arrastrar hacia la derecha muestra lo que estaba a la
 * izquierda. `item`: {scale, r}. Devuelve {dx, dy} normalizados.
 */
export function panDelta(asset, item, dx, dy) {
  const [cos, sin] = TRIG[normRotation(item.r)];
  const k = item.scale / 100;
  // Del giro de la hoja a la imagen sin girar: giro inverso.
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  return { dx: -u / (asset.w * k) || 0, dy: -v / (asset.h * k) || 0 };
}

/**
 * Acerca (`factor` > 1) o aleja (< 1) el recorte manteniendo su proporción y
 * dejando fijo el punto `focus` (normalizado, de la imagen; por omisión el
 * centro del recorte). Se frena al llegar a toda la imagen (en el lado que
 * llegue primero) y a MIN_CROP, y se corre lo necesario para no salirse.
 * Sin recorte, parte de la imagen entera. Devuelve null si termina abarcando
 * toda la imagen.
 */
export function zoomCrop(crop, factor, focus) {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError(`factor inválido: ${factor}`);
  const c = isIdentity(crop) ? FULL : crop;
  const f = focus ?? { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  const most = Math.max(c.w, c.h); // achicar el factor hasta acá: un lado llega a 1
  const least = Math.min(c.w, c.h) / MIN_CROP; // agrandarlo hasta acá: un lado llega al mínimo
  const k = clamp(factor, most, Math.max(most, least));
  const w = snapUnit(c.w / k);
  const h = snapUnit(c.h / k);
  return clampCrop({ x: f.x - (f.x - c.x) / k, y: f.y - (f.y - c.y) / k, w, h });
}

/**
 * Números para dibujar la pieza (recortada y girada) con pdf-lib, en puntos
 * PDF (origen abajo a la izquierda). `item`: {x, y, scale, r, crop} en mm
 * desde la esquina superior izquierda de la hoja; `asset`: {w, h} en mm a
 * 100 %; `sheetH`: alto de la hoja en mm.
 *
 * Devuelve {clip, x, y, width, height, rotate}: `x, y, width, height` son
 * los de la imagen COMPLETA (pdf-lib la ancla en su esquina inferior izquierda
 * y la gira alrededor de ese punto) y `rotate` está en grados (pasarlo por
 * `degrees()`); con eso la zona recortada cae justo sobre el rectángulo de la
 * pieza. `clip` ({x, y, width, height}) es ese rectángulo, para recortar lo
 * demás:
 *
 *   page.pushOperators(pushGraphicsState(), rectangle(c.x, c.y, c.width, c.height), clip(), endPath());
 *   page.drawImage(image, { x, y, width, height, rotate: degrees(rotate) });
 *   page.pushOperators(popGraphicsState());
 *
 * Sin recorte, `clip` es null y lo demás es idéntico a lo que hoy calcula
 * export.js. Sirve igual para `drawPage` (páginas de PDF vectoriales).
 */
export function drawParams(item, asset, sheetH) {
  const r = normRotation(item.r);
  const cropped = !isIdentity(item.crop);
  const c = cropped ? item.crop : FULL;
  const k = item.scale / 100;
  const fw = asset.w * k; // imagen completa, sin girar (mm)
  const fh = asset.h * k;
  const uw = fw * c.w; // zona recortada, sin girar (mm)
  const uh = fh * c.h;
  const [w, h] = r % 180 ? [uh, uw] : [uw, uh];
  // Dónde va la esquina inferior izquierda de la zona recortada: la misma
  // cuenta que hace export.js con la imagen entera.
  const x0 = (item.x + (r === 180 || r === 270 ? w : 0)) * PT_PER_MM;
  const y0 = (sheetH - item.y - (r === 90 || r === 180 ? 0 : h)) * PT_PER_MM;
  const rotate = r ? -r : 0;
  if (!cropped) return { clip: null, x: x0, y: y0, width: uw * PT_PER_MM, height: uh * PT_PER_MM, rotate };
  // En coordenadas de la imagen (y hacia arriba), su esquina inferior
  // izquierda está a (du, dv) de la del recorte; ese vector gira con la imagen.
  const du = -c.x * fw * PT_PER_MM;
  const dv = -(1 - c.y - c.h) * fh * PT_PER_MM;
  const [cos, sin] = TRIG[r]; // giro antihorario de −r en PDF = (cos r, −sin r)
  return {
    clip: { x: item.x * PT_PER_MM, y: (sheetH - item.y - h) * PT_PER_MM, width: w * PT_PER_MM, height: h * PT_PER_MM },
    x: x0 + du * cos + dv * sin,
    y: y0 - du * sin + dv * cos,
    width: fw * PT_PER_MM,
    height: fh * PT_PER_MM,
    rotate,
  };
}

/**
 * Lo mismo para la pantalla, en px (`zoom` = px por mm), para un contenedor
 * con `overflow: hidden` y un <img> adentro. Devuelve:
 *
 * - `left, top, width, height`: el contenedor (la pieza en la hoja).
 * - `img.width, img.height`: la imagen COMPLETA sin girar.
 * - `img.left, img.top, img.rotate`: posición de su caja sin girar dentro del
 *   contenedor, girada `rotate` grados (horario) alrededor de su centro
 *   (transform-origin por omisión): `transform: rotate(…deg)`.
 * - `img.transform`: alternativa para el CSS actual (img con left/top 50 %):
 *   «translate(-50%, -50%) [translate(dx px, dy px)] rotate(r deg)»; sin
 *   recorte es exactamente la cadena que usa hoy sheetview.js.
 */
export function cssParams(item, asset, zoom) {
  const r = normRotation(item.r);
  const cropped = !isIdentity(item.crop);
  const c = cropped ? item.crop : FULL;
  const k = item.scale / 100;
  const fw = asset.w * k * zoom;
  const fh = asset.h * k * zoom;
  const uw = fw * c.w;
  const uh = fh * c.h;
  const [width, height] = r % 180 ? [uh, uw] : [uw, uh];
  // Centro del recorte respecto del centro de la imagen, girado con ella: la
  // imagen se corre al revés para que ese punto quede en el centro de la pieza.
  const ox = (c.x + c.w / 2 - 0.5) * fw;
  const oy = (c.y + c.h / 2 - 0.5) * fh;
  const [cos, sin] = TRIG[r];
  const tx = -(ox * cos - oy * sin) || 0;
  const ty = -(ox * sin + oy * cos) || 0;
  const shift = tx || ty ? ` translate(${tx}px, ${ty}px)` : '';
  return {
    left: item.x * zoom,
    top: item.y * zoom,
    width,
    height,
    img: {
      width: fw,
      height: fh,
      left: width / 2 + tx - fw / 2,
      top: height / 2 + ty - fh / 2,
      rotate: r,
      transform: `translate(-50%, -50%)${shift} rotate(${r}deg)`,
    },
  };
}

// ---------- Standard sizes on the sheet ----------

/** Tolerance (mm) to call a piece's size a standard photo size. */
export const SIZE_MATCH_TOLERANCE = 0.05;

/**
 * The standard photo size a w × h mm piece (as it sits on the sheet) has, in
 * either orientation, or null.
 */
export function matchPhotoSize(w, h, tolerance = SIZE_MATCH_TOLERANCE) {
  const same = (a, b) => Math.abs(a - b) <= tolerance;
  return PHOTO_SIZES.find((size) => (same(w, size.w) && same(h, size.h)) || (same(w, size.h) && same(h, size.w))) ?? null;
}

// ---------- Crop frame on the sheet (crop mode) ----------
//
// Crop mode works in sheet millimetres with two rectangles: `frame`, the
// piece's visible area (what prints), and `image`, the whole image as it
// sits on the sheet (rotated, so its w/h follow the rotation). The frame
// always lies inside the image. The crop is the frame relative to the image,
// turned back into the unrotated image's normalized coordinates.

/** A normalized rect of the unrotated image → the same rect as seen rotated `r` degrees clockwise. */
export function rotateCrop(crop, r) {
  const c = isIdentity(crop) ? FULL : crop;
  switch (normRotation(r)) {
    case 90:
      return { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w };
    case 180:
      return { x: 1 - c.x - c.w, y: 1 - c.y - c.h, w: c.w, h: c.h };
    case 270:
      return { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
    default:
      return { x: c.x, y: c.y, w: c.w, h: c.h };
  }
}

/** The inverse of rotateCrop: a rect as seen rotated → the unrotated image's rect. */
export function unrotateCrop(rect, r) {
  return rotateCrop(rect, (360 - normRotation(r)) % 360);
}

/** The frame and the whole image of a placed piece, in sheet mm. */
export function cropFrame(item, asset) {
  const { w, h } = pieceSize(asset, item);
  const seen = rotateCrop(item.crop, item.r);
  const iw = w / seen.w;
  const ih = h / seen.h;
  return {
    frame: { x: item.x, y: item.y, w, h },
    image: { x: item.x - seen.x * iw, y: item.y - seen.y * ih, w: iw, h: ih },
  };
}

/**
 * Back from a frame and an image (sheet mm) to the piece: its position, scale
 * and crop. `asset` at 100 %; `r` the piece's rotation (unchanged by cropping).
 */
export function pieceFromFrame(asset, r, { frame, image }) {
  const turned = normRotation(r) % 180 !== 0;
  const seen = { x: (frame.x - image.x) / image.w, y: (frame.y - image.y) / image.h, w: frame.w / image.w, h: frame.h / image.h };
  const crop = clampCrop(unrotateCrop(seen, r));
  const fullW = turned ? image.h : image.w; // the unrotated image's width on the sheet
  return { x: frame.x, y: frame.y, scale: (100 * fullW) / asset.w, crop };
}

// Moves `image` the least so the frame stays inside it.
function containFrame(frame, image) {
  const x = clamp(image.x, frame.x + frame.w - image.w, frame.x);
  const y = clamp(image.y, frame.y + frame.h - image.h, frame.y);
  return { ...image, x, y };
}

/** Pans the image under a fixed frame by (dx, dy) mm, stopping where the frame would leave it. */
export function panFrame({ frame, image }, dx, dy) {
  return { frame, image: containFrame(frame, { ...image, x: image.x + dx, y: image.y + dy }) };
}

/**
 * Zooms the image under a fixed frame by `factor` (> 1 closer) around `focus`
 * (sheet mm): never smaller than the frame and never closer than MIN_CROP.
 */
export function zoomFrame({ frame, image }, factor, focus = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }) {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError(`invalid factor: ${factor}`);
  const least = Math.max(frame.w / image.w, frame.h / image.h);
  const most = Math.max(least, Math.min(frame.w / (image.w * MIN_CROP), frame.h / (image.h * MIN_CROP)));
  const k = clamp(factor, least, most);
  const next = { x: focus.x + (image.x - focus.x) * k, y: focus.y + (image.y - focus.y) * k, w: image.w * k, h: image.h * k };
  return { frame, image: containFrame(frame, next) };
}

/** The handles of the crop frame: edges and corners. */
export const FRAME_HANDLES = Object.freeze(['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']);

/**
 * Drags a handle of the frame by (dx, dy) mm over a fixed image. Free, each
 * dragged edge moves on its own; with `lock`, the frame keeps its proportion
 * (from the opposite corner, or the opposite edge's middle). The frame stays
 * inside the image and never gets thinner than MIN_CROP of it.
 */
export function resizeFrame({ frame, image }, handle, dx, dy, { lock = false } = {}) {
  if (!FRAME_HANDLES.includes(handle)) throw new RangeError(`unknown handle: ${handle}`);
  const minW = image.w * MIN_CROP;
  const minH = image.h * MIN_CROP;
  const right = image.x + image.w;
  const bottom = image.y + image.h;
  let x0 = frame.x;
  let y0 = frame.y;
  let x1 = frame.x + frame.w;
  let y1 = frame.y + frame.h;
  const moves = (side) => handle.includes(side);
  if (!lock) {
    if (moves('w')) x0 = clamp(x0 + dx, image.x, x1 - minW);
    if (moves('e')) x1 = clamp(x1 + dx, x0 + minW, right);
    if (moves('n')) y0 = clamp(y0 + dy, image.y, y1 - minH);
    if (moves('s')) y1 = clamp(y1 + dy, y0 + minH, bottom);
    return { frame: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, image };
  }
  const aspect = frame.w / frame.h;
  const horizontal = moves('e') || moves('w');
  const vertical = moves('n') || moves('s');
  // How much the frame grows (mm of width), from the pointer along the axes it drags.
  const grownW = moves('e') ? dx : moves('w') ? -dx : 0;
  const grownH = moves('s') ? dy : moves('n') ? -dy : 0;
  // A corner follows the pointer projected on the frame's diagonal (like the piece's handle).
  const diagonal = (grownW * frame.w + grownH * frame.h) / (frame.w * frame.w + frame.h * frame.h);
  let w = horizontal && vertical ? frame.w * (1 + diagonal) : horizontal ? frame.w + grownW : frame.w + grownH * aspect;
  // The anchor: the opposite corner, or the middle of the opposite edge.
  const ax = moves('e') ? frame.x : moves('w') ? x1 : frame.x + frame.w / 2;
  const ay = moves('s') ? frame.y : moves('n') ? y1 : frame.y + frame.h / 2;
  // Largest width that keeps the frame inside the image around that anchor.
  const room = (anchor, lo, hi, dir) => (dir > 0 ? hi - anchor : dir < 0 ? anchor - lo : 2 * Math.min(anchor - lo, hi - anchor));
  const dirX = moves('e') ? 1 : moves('w') ? -1 : 0;
  const dirY = moves('s') ? 1 : moves('n') ? -1 : 0;
  const maxW = Math.min(room(ax, image.x, right, dirX), room(ay, image.y, bottom, dirY) * aspect);
  const minLocked = Math.max(minW, minH * aspect);
  w = clamp(w, Math.min(minLocked, maxW), maxW);
  const h = w / aspect;
  const x = dirX > 0 ? ax : dirX < 0 ? ax - w : ax - w / 2;
  const y = dirY > 0 ? ay : dirY < 0 ? ay - h : ay - h / 2;
  return { frame: { x, y, w, h }, image };
}

/**
 * Scales frame and image together around the frame's center so the frame is
 * exactly `size` ({w, h} mm, in the frame's orientation): a locked standard
 * size stays that size after its crop changes.
 */
export function frameToSize({ frame, image }, size) {
  const k = size.w / frame.w;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const scaled = (r) => ({ x: cx + (r.x - cx) * k, y: cy + (r.y - cy) * k, w: r.w * k, h: r.h * k });
  return { frame: { ...scaled(frame), w: size.w, h: size.h }, image: scaled(image) };
}
