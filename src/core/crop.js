// Cropping pieces, and the standard photo sizes. No DOM.
//
// Model: `crop = {x, y, w, h}` in normalized coordinates (0–1) of the
// ORIGINAL unrotated image, origin at the top left; null (or missing) = no
// crop. The piece shows only that area: its unrotated printed size is
// asset.w × crop.w × scale/100 by asset.h × crop.h × scale/100, and the
// rotation `r` (0 | 90 | 180 | 270, clockwise) applies after that. Functions
// that return a crop return null when it covers the whole image, so «no
// crop» has a single representation.

const PT_PER_MM = 72 / 25.4;

/** The smallest side of a crop (a fraction of the image): up to 100 × closer. */
export const MIN_CROP = 0.01;

const FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const IDENTITY_TOL = 1e-6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Values a hair from 0 or 1 (rounding error) become exact.
const snapUnit = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.abs(v - 1) < 1e-9 ? 1 : v);

/** The rotation brought to 0, 90, 180 or 270. */
const normRotation = (r) => ((((Math.round((r || 0) / 90) * 90) % 360) + 360) % 360);

// Exact cos and sin of a clockwise rotation of r degrees on screen (y down),
// which is the same number as counterclockwise in PDF (y up).
const TRIG = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };

/**
 * Standard photo sizes, in mm and upright (w ≤ h). The ids are stable and
 * never translated (the interface texts name them). Lab prints use their real
 * sizes in inches: «10x15» is 4 × 6 in = 101.6 × 152.4 mm. Groups: 'print'
 * (prints), 'id' (documents) and 'instant' (instant film, its image area).
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

export const photoSize = (id) => PHOTO_SIZES.find((size) => size.id === id) ?? null;

/** Is it «no crop»? (null, missing, or the whole image within a tolerance). */
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
 * The valid crop closest to `crop`: sides between MIN_CROP and 1 (each on its
 * own, so the proportion may change) and the position inside the image. null
 * when it is the whole image, or when `crop` is null or has values that
 * aren't finite.
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
 * The piece's size with its crop, in mm: {w, h} as it sits on the sheet
 * (rotated) and {uw, uh} unrotated.
 */
export function pieceSize(asset, { scale, r = 0, crop = null }) {
  const c = isIdentity(crop) ? FULL : crop;
  const k = scale / 100;
  const uw = asset.w * k * c.w;
  const uh = asset.h * k * c.h;
  return normRotation(r) % 180 ? { w: uh, h: uw, uw, uh } : { w: uw, h: uh, uw, uh };
}

/**
 * The largest crop of proportion `aspect` (width / height, in real lengths)
 * of an imgW × imgH image (any unit, the same for both), centered on `focus`
 * (a normalized point of the image) as far as the edges allow. It always
 * takes the whole width or the whole height. Gives the normalized crop
 * ({x, y, w, h}; {0, 0, 1, 1} when the proportions match). The proportion
 * wins: with a very extreme one a side may end under MIN_CROP (clampCrop
 * would enlarge it and change the proportion).
 */
export function cropToAspect(imgW, imgH, aspect, focus = { x: 0.5, y: 0.5 }) {
  if (!(imgW > 0 && imgH > 0 && aspect > 0 && Number.isFinite(imgW * imgH * aspect))) {
    throw new RangeError(`invalid size: ${imgW}×${imgH}, aspect ${aspect}`);
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
 * The crop and scale that make the piece fill EXACTLY `target` ({w, h} in mm,
 * as it sits on the sheet) without distortion: it crops what is left over
 * (as much as possible, centered on `focus`, a normalized point of the
 * original image). `asset`: {w, h} in mm at 100 %; `r`: the piece's current
 * rotation, which it keeps. With `autoOrient` (default), when the image as
 * seen (rotated) is landscape and the target portrait, or the other way
 * round, it uses the target turned: a landscape photo with a 10×15 target
 * ends 15×10. Square ones (image or target) aren't turned. Gives {crop,
 * scale, r} (crop null when no cropping is needed).
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
  // The target in the original image's orientation.
  const uw = turned ? th : tw;
  const uh = turned ? tw : th;
  const crop = cropToAspect(asset.w, asset.h, uw / uh, focus);
  return { crop: normalize(crop), scale: (100 * uw) / (asset.w * crop.w), r: rot };
}

/**
 * Pans the crop by (dx, dy) in the image's normalized coordinates, stopping
 * at its edge. Without a crop there is nothing to pan: null. `panDelta` turns
 * a drag on the sheet into these.
 */
export function panCrop(crop, dx, dy) {
  if (isIdentity(crop)) return null;
  return clampCrop({ x: crop.x + dx, y: crop.y + dy, w: crop.w, h: crop.h });
}

/**
 * How far to pan the crop (for `panCrop`) so the piece's content follows a
 * drag of (dx, dy) mm on the sheet, given the piece's rotation and scale:
 * dragging right shows what was on the left. `item`: {scale, r}. Gives
 * normalized {dx, dy}.
 */
export function panDelta(asset, item, dx, dy) {
  const [cos, sin] = TRIG[normRotation(item.r)];
  const k = item.scale / 100;
  // From the sheet's rotation back to the unrotated image: the inverse rotation.
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  return { dx: -u / (asset.w * k) || 0, dy: -v / (asset.h * k) || 0 };
}

/**
 * Zooms the crop in (`factor` > 1) or out (< 1), keeping its proportion and
 * the point `focus` fixed (normalized, of the image; by default the crop's
 * center). It stops at the whole image (on whichever side gets there first)
 * and at MIN_CROP, and moves as needed to stay inside. Without a crop it
 * starts from the whole image. null when it ends covering the whole image.
 */
export function zoomCrop(crop, factor, focus) {
  if (!(factor > 0) || !Number.isFinite(factor)) throw new RangeError(`invalid factor: ${factor}`);
  const c = isIdentity(crop) ? FULL : crop;
  const f = focus ?? { x: c.x + c.w / 2, y: c.y + c.h / 2 };
  const most = Math.max(c.w, c.h); // the factor down to here: a side reaches 1
  const least = Math.min(c.w, c.h) / MIN_CROP; // up to here: a side reaches the minimum
  const k = clamp(factor, most, Math.max(most, least));
  const w = snapUnit(c.w / k);
  const h = snapUnit(c.h / k);
  return clampCrop({ x: f.x - (f.x - c.x) / k, y: f.y - (f.y - c.y) / k, w, h });
}

/**
 * Numbers to draw the piece (cropped and rotated) with pdf-lib, in PDF points
 * (origin at the bottom left). `item`: {x, y, scale, r, crop} in mm from the
 * sheet's top left corner; `asset`: {w, h} in mm at 100 %; `sheetH`: the
 * sheet's height in mm.
 *
 * Gives {clip, x, y, width, height, rotate}: `x, y, width, height` are those
 * of the WHOLE image (pdf-lib anchors it at its bottom left corner and
 * rotates it around that point) and `rotate` is in degrees (pass it through
 * `degrees()`); with them the cropped area lands right on the piece's
 * rectangle. `clip` ({x, y, width, height}) is that rectangle, to clip the
 * rest:
 *
 *   page.pushOperators(pushGraphicsState(), rectangle(c.x, c.y, c.width, c.height), clip(), endPath());
 *   page.drawImage(image, { x, y, width, height, rotate: degrees(rotate) });
 *   page.pushOperators(popGraphicsState());
 *
 * Without a crop, `clip` is null and the numbers are the whole image's, as
 * they were before crops existed. The same works for `drawPage` (vector PDF
 * pages).
 */
export function drawParams(item, asset, sheetH) {
  const r = normRotation(item.r);
  const cropped = !isIdentity(item.crop);
  const c = cropped ? item.crop : FULL;
  const k = item.scale / 100;
  const fw = asset.w * k; // the whole image, unrotated (mm)
  const fh = asset.h * k;
  const uw = fw * c.w; // the cropped area, unrotated (mm)
  const uh = fh * c.h;
  const [w, h] = r % 180 ? [uh, uw] : [uw, uh];
  // Where the cropped area's bottom left corner goes: the same sum the export
  // made with the whole image before crops existed.
  const x0 = (item.x + (r === 180 || r === 270 ? w : 0)) * PT_PER_MM;
  const y0 = (sheetH - item.y - (r === 90 || r === 180 ? 0 : h)) * PT_PER_MM;
  const rotate = r ? -r : 0;
  if (!cropped) return { clip: null, x: x0, y: y0, width: uw * PT_PER_MM, height: uh * PT_PER_MM, rotate };
  // In image coordinates (y up), its bottom left corner is (du, dv) from the
  // crop's; that vector rotates with the image.
  const du = -c.x * fw * PT_PER_MM;
  const dv = -(1 - c.y - c.h) * fh * PT_PER_MM;
  const [cos, sin] = TRIG[r]; // a counterclockwise rotation of −r in PDF = (cos r, −sin r)
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
 * The same for the screen, in px (`zoom` = px per mm), for a container with
 * `overflow: hidden` and an <img> inside. Gives:
 *
 * - `left, top, width, height`: the container (the piece on the sheet).
 * - `img.width, img.height`: the WHOLE unrotated image.
 * - `img.left, img.top, img.rotate`: where its unrotated box sits in the
 *   container, rotated `rotate` degrees (clockwise) around its center (the
 *   default transform-origin): `transform: rotate(…deg)`.
 * - `img.transform`: the alternative for an img at left/top 50 %:
 *   «translate(-50%, -50%) [translate(dx px, dy px)] rotate(r deg)».
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
  // The crop's center relative to the image's, rotated with it: the image
  // moves the opposite way so that point lands on the piece's center.
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
