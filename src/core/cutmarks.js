// Líneas de corte: marcas en las esquinas de cada pieza o su contorno, como
// segmentos en mm (origen arriba a la izquierda de la hoja). Módulo puro.

// Dos coordenadas a menos de esto (mm) son la misma línea; un tramo más corto
// que esto no se dibuja.
const TOL = 1e-6;

/** Modos de `cutLines`. */
export const CUT_MODES = Object.freeze(['none', 'corners', 'outline']);

// Internamente cada segmento es {dir, c, a, b}: horizontal ('h') sobre y = c
// de x = a a x = b, o vertical ('v') sobre x = c de y = a a y = b; a < b.

// Los bordes de la pieza paralelos a `dir`: [desde, hasta] a lo largo del
// segmento y [lo, hi] en la coordenada perpendicular.
const span = (q, dir) => (dir === 'h' ? [q.x, q.x + q.w, q.y, q.y + q.h] : [q.y, q.y + q.h, q.x, q.x + q.w]);

// Las 8 marcas de una pieza: en cada esquina, una horizontal sobre la línea
// del borde de arriba o de abajo y una vertical sobre la del borde izquierdo
// o derecho, hacia afuera, empezando a `offset` de la esquina.
function cornerMarks(q, length, offset) {
  const x0 = q.x;
  const x1 = q.x + q.w;
  const y0 = q.y;
  const y1 = q.y + q.h;
  const before = (v) => [v - offset - length, v - offset];
  const after = (v) => [v + offset, v + offset + length];
  const marks = [];
  for (const [y, xs] of [
    [y0, [before(x0), after(x1)]],
    [y1, [before(x0), after(x1)]],
  ]) {
    for (const [a, b] of xs) marks.push({ dir: 'h', c: y, a, b });
  }
  for (const [x, ys] of [
    [x0, [before(y0), after(y1)]],
    [x1, [before(y0), after(y1)]],
  ]) {
    for (const [a, b] of ys) marks.push({ dir: 'v', c: x, a, b });
  }
  return marks;
}

function outline(q) {
  return [
    { dir: 'h', c: q.y, a: q.x, b: q.x + q.w },
    { dir: 'h', c: q.y + q.h, a: q.x, b: q.x + q.w },
    { dir: 'v', c: q.x, a: q.y, b: q.y + q.h },
    { dir: 'v', c: q.x + q.w, a: q.y, b: q.y + q.h },
  ];
}

// Saca del segmento lo que cae sobre alguna pieza, borde incluido: una marca
// que corre por el borde de otra pieza se imprimiría sobre su imagen.
function outsidePieces(seg, pieces) {
  let parts = [[seg.a, seg.b]];
  for (const q of pieces) {
    const [from, to, lo, hi] = span(q, seg.dir);
    if (seg.c < lo - TOL || seg.c > hi + TOL) continue;
    parts = parts.flatMap(([a, b]) => {
      if (to <= a || from >= b) return [[a, b]];
      const kept = [];
      if (from > a) kept.push([a, from]);
      if (to < b) kept.push([to, b]);
      return kept;
    });
    if (!parts.length) break;
  }
  return parts.filter(([a, b]) => b - a > TOL).map(([a, b]) => ({ dir: seg.dir, c: seg.c, a, b }));
}

// Une los segmentos colineales que se pisan o se tocan. Devuelve primero las
// horizontales (por y, después x) y después las verticales (por x, después y).
function merge(segments) {
  const out = [];
  for (const dir of ['h', 'v']) {
    const list = segments.filter((s) => s.dir === dir).sort((p, q) => p.c - q.c || p.a - q.a);
    for (let i = 0; i < list.length; ) {
      const c = list[i].c;
      let j = i;
      while (j < list.length && list[j].c - c <= TOL) j++;
      const line = list.slice(i, j).sort((p, q) => p.a - q.a);
      let current = { dir, c, a: line[0].a, b: line[0].b };
      for (const s of line.slice(1)) {
        if (s.a <= current.b + TOL) current.b = Math.max(current.b, s.b);
        else {
          out.push(current);
          current = { dir, c, a: s.a, b: s.b };
        }
      }
      out.push(current);
      i = j;
    }
  }
  return out;
}

// Recorta al área `bounds`. Lo que corre justo sobre su borde se descarta:
// ahí ya hay corte (el borde de la hoja) y no se imprime.
function clip(seg, bounds) {
  const [from, to, lo, hi] = span(bounds, seg.dir);
  if (seg.c <= lo + TOL || seg.c >= hi - TOL) return [];
  const a = Math.max(seg.a, from);
  const b = Math.min(seg.b, to);
  return b - a > TOL ? [{ ...seg, a, b }] : [];
}

const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Líneas de corte para las piezas `rects` ({x, y, w, h} en mm, ya giradas),
 * como segmentos horizontales o verticales [{x1, y1, x2, y2}] (x1 ≤ x2,
 * y1 ≤ y2): primero las horizontales (por y, después x) y después las
 * verticales (por x, después y).
 *
 * Modos:
 * - 'corners': marcas en L hacia afuera en cada esquina de cada pieza: un
 *   trazo sobre la línea del borde horizontal y otro sobre la del vertical,
 *   que arrancan a `offset` mm de la esquina y miden `length` mm. Lo que caería
 *   sobre otra pieza (adentro o justo sobre su borde) se recorta, y las marcas
 *   colineales que se pisan o se tocan se unen: piezas pegadas o alineadas
 *   comparten marca, y entre piezas más cerca que `offset + length` la marca
 *   cruza el espacio entre ellas de lado a lado.
 * - 'outline': el contorno de cada pieza; los bordes compartidos (o que se
 *   continúan en la misma línea) quedan como un solo segmento. Las piezas
 *   superpuestas no se recortan entre sí.
 * - 'none': [].
 *
 * Con `bounds` ({x, y, w, h}, la hoja) todo se recorta a esa área, y lo que
 * cae justo sobre su borde se descarta. Las piezas de medidas no positivas
 * o no finitas se ignoran; `offset` negativo cuenta como 0 y `length` ≤ 0 no
 * dibuja marcas.
 */
export function cutLines(rects, { mode = 'corners', length = 4, offset = 1.5, bounds = null } = {}) {
  if (!CUT_MODES.includes(mode)) throw new RangeError(`modo de corte desconocido: ${mode}`);
  if (mode === 'none') return [];
  const pieces = rects.filter(
    (q) => [q.x, q.y, q.w, q.h].every((v) => typeof v === 'number' && Number.isFinite(v)) && q.w > 0 && q.h > 0
  );
  let segments;
  if (mode === 'outline') segments = pieces.flatMap(outline);
  else {
    const len = finite(length, 0);
    if (len <= 0) return [];
    const off = Math.max(0, finite(offset, 0));
    segments = pieces.flatMap((q) => cornerMarks(q, len, off)).flatMap((s) => outsidePieces(s, pieces));
  }
  let merged = merge(segments);
  if (bounds) merged = merged.flatMap((s) => clip(s, bounds));
  return merged.map(({ dir, c, a, b }) =>
    dir === 'h' ? { x1: a, y1: c, x2: b, y2: c } : { x1: c, y1: a, x2: c, y2: b }
  );
}
