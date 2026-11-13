// Empaquetado de rectángulos (MaxRects) para acomodar piezas en la hoja.
// Todo en las mismas unidades (mm), con origen arriba a la izquierda del área útil.

const EPS = 1e-6;

const intersects = (a, b) =>
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

const contains = (a, b) =>
  b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.w <= a.x + a.w + EPS && b.y + b.h <= a.y + a.h + EPS;

// Quita `used` de la lista de huecos libres, partiendo los que toca.
function occupy(free, used) {
  const kept = [];
  const parts = [];
  for (const f of free) {
    if (!intersects(f, used)) {
      kept.push(f);
      continue;
    }
    if (used.x > f.x + EPS) parts.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w - EPS)
      parts.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y + EPS) parts.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h - EPS)
      parts.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  // Los huecos intactos ya eran maximales entre sí y ninguno puede caber en un
  // pedazo nuevo (que sale de un hueco que no los contenía): alcanza con
  // descartar los pedazos nuevos contenidos en otro hueco.
  const fresh = parts.filter(
    (r, i) =>
      !kept.some((o) => contains(o, r)) &&
      !parts.some((o, j) => j !== i && contains(o, r) && (j < i || !contains(r, o)))
  );
  return kept.concat(fresh);
}

// Dónde poner cada pieza: menor es mejor; se comparan como tuplas.
const HEURISTICS = [
  (f, w, h) => [f.y + h, f.x], // abajo-izquierda
  (f, w, h) => [Math.min(f.w - w, f.h - h), Math.max(f.w - w, f.h - h)], // lado corto
  (f, w, h) => [Math.max(f.w - w, f.h - h), Math.min(f.w - w, f.h - h)], // lado largo
  (f, w, h) => [f.w * f.h - w * h, Math.min(f.w - w, f.h - h)], // área sobrante
];

// En qué orden ubicarlas (de mayor a menor según cada criterio).
const ORDERS = [
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  (a, b) => b.w + b.h - (a.w + a.h),
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
];

const better = (a, b) => a[0] < b[0] - EPS || (Math.abs(a[0] - b[0]) <= EPS && a[1] < b[1] - EPS);

// Piezas con orientación fija: `shouldFlip(r)` decide cuáles van giradas.
const fixedOrientation = (rects, shouldFlip) =>
  rects.map((r, i) => {
    const flip = shouldFlip(r, i);
    return { id: r.id, w: flip ? r.h : r.w, h: flip ? r.w : r.h, flip, free: false };
  });

const isSquare = (r) => Math.abs(r.w - r.h) <= EPS;

// Maneras de orientar las piezas antes de empaquetar. Cada pieza lleva `flip`
// (ya viene girada respecto de la original) y `free` (la heurística puede
// girarla). Con giro libre la heurística decide pieza por pieza y a veces se
// equivoca: en una grilla justa gira la primera porque "deja más lugar" y
// después no entran todas. Por eso también se prueban todas como vinieron y
// todas apaisadas o todas verticales.
function orientations(rects, rotate) {
  const asIs = fixedOrientation(rects, () => false);
  if (!rotate) return [asIs];

  const variants = [asIs];
  const landscape = fixedOrientation(rects, (r) => r.h > r.w + EPS);
  const portrait = fixedOrientation(rects, (r) => r.w > r.h + EPS);
  // Si ninguna pieza se gira, es igual a "como vinieron".
  if (landscape.some((p) => p.flip)) variants.push(landscape);
  if (portrait.some((p) => p.flip)) variants.push(portrait);
  const free = rects.map((r) => ({ id: r.id, w: r.w, h: r.h, flip: false, free: !isSquare(r) }));
  if (free.some((p) => p.free)) variants.push(free);
  return variants;
}

// Ubica las piezas en el orden dado; null si alguna no entra.
function packOnce(pieces, start, gap, heuristic) {
  let free = start;
  const placements = [];
  for (const p of pieces) {
    let best = null;
    for (const turn of p.free ? [false, true] : [false]) {
      const w = (turn ? p.h : p.w) + gap;
      const h = (turn ? p.w : p.h) + gap;
      for (const f of free) {
        if (w > f.w + EPS || h > f.h + EPS) continue;
        const s = heuristic(f, w, h);
        if (!best || better(s, best.s)) best = { s, x: f.x, y: f.y, w, h, turn };
      }
    }
    if (!best) return null;
    free = occupy(free, best);
    placements.push({ id: p.id, x: best.x, y: best.y, rotated: best.turn !== p.flip });
  }
  return placements;
}

// Huecos libres iniciales. Cada pieza (y cada obstáculo) reserva `gap` a su
// derecha y abajo; el área se agranda igual para que la última fila/columna
// no pierda ese espacio.
function startFree(W, H, gap, obstacles) {
  let free = [{ x: 0, y: 0, w: W + gap, h: H + gap }];
  for (const o of obstacles) free = occupy(free, { x: o.x, y: o.y, w: o.w + gap, h: o.h + gap });
  return free;
}

// Orden canónico de la entrada (lado mayor, lado menor y después id), para que
// el resultado no dependa del orden del arreglo: los empates de los
// ordenamientos son estables. No mira la orientación, así una pieza girada de
// antemano desempata igual que sin girar.
const compareIds = (a, b) => {
  if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};
const canonical = (rects) =>
  [...rects].sort(
    (a, b) =>
      Math.max(a.w, a.h) - Math.max(b.w, b.h) || Math.min(a.w, a.h) - Math.min(b.w, b.h) || compareIds(a.id, b.id)
  );

// Prueba las combinaciones fijas orientación × orden × heurística (hasta 80),
// siempre en el mismo orden, y llama a `visit(ubicaciones, orientación)` con
// cada una que entra. Si `visit` devuelve true, corta ahí.
function eachFixed(oriented, start, gap, visit) {
  for (const pieces of oriented) {
    for (const order of ORDERS) {
      const sorted = [...pieces].sort(order);
      for (const heuristic of HEURISTICS) {
        const placements = packOnce(sorted, start, gap, heuristic);
        if (placements && visit(placements, pieces)) return;
      }
    }
  }
}

// --- Puntaje ---------------------------------------------------------------
// Menor es mejor. Todo se mide en "fracciones del alto": 0,01 equivale a que
// la franja libre de abajo sea un 1 % del alto más chica. Una diferencia de
// altura chica (≲ 2–3 %) puede perder contra no girar o contra una hoja más
// prolija; una grande no: girar todas cuesta a lo sumo 5 % y la desprolijidad
// rara vez separa más de 2 % a dos candidatas.

// a. Hasta dónde llegan las piezas hacia abajo, sobre el alto (0–1).
const W_BOTTOM = 1;
// b. Girar piezas respecto de como las puso el usuario: girar aunque sea una
//    cuesta como un 2 % del alto, y girarlas todas un 3 % más (proporcional a
//    la fracción girada). O sea, solo se gira si libera más de ~2–5 % del alto.
const W_ROTATE_ANY = 0.02;
const W_ROTATE_SHARE = 0.03;
// c. Desprolijidad (cada medida va de 0 a 1):
//    - bordes: cuántas coordenadas x e y distintas tienen los bordes de las
//      piezas (cada una es un corte más; filas y columnas parejas comparten),
//    - dispersión: qué tan desparramadas quedan las piezas de igual medida,
//    - mezcla: piezas iguales con orientaciones distintas.
//    Entre una hoja prolija y una desprolija suele haber ~1 % del alto: le gana
//    a diferencias de altura chicas, pero no a girar (b) ni a ~3 % de altura.
const W_EDGES = 0.03;
const W_SCATTER = 0.02;
const W_MIXED = 0.02;
// d. Hasta dónde llegan hacia la derecha, sobre el ancho: solo desempata.
const W_RIGHT = 0.005;

// Dos bordes a menos de esto (mm) cuentan como alineados.
const ALIGN_TOL = 0.1;

// Cantidad de valores distintos.
function distinctCount(values) {
  values = Float64Array.from(values).sort();
  let count = 0;
  let last = -Infinity;
  for (const v of values) {
    if (v - last > ALIGN_TOL) count++;
    last = v;
  }
  return count;
}

// Piezas de igual medida (a 0,1 mm), sin importar cómo vinieron orientadas.
const sizeKey = (r) => `${Math.round(Math.max(r.w, r.h) * 10)}x${Math.round(Math.min(r.w, r.h) * 10)}`;

// id → {w, h, group}: `group` numera las medidas distintas (piezas iguales,
// mismo número). Se arma una vez y sirve para puntuar todos los candidatos.
function pieceInfo(rects) {
  const groups = new Map();
  const info = new Map();
  for (const r of rects) {
    const key = sizeKey(r);
    if (!groups.has(key)) groups.set(key, groups.size);
    info.set(r.id, { w: r.w, h: r.h, group: groups.get(key) });
  }
  return info;
}

// Desglose del puntaje (para afinar y para tests); `info` viene de pieceInfo.
function scoreParts(placements, info, W, H) {
  const n = placements.length;
  if (!n) return { bottom: 0, rotated: 0, edges: 0, scatter: 0, mixed: 0, right: 0 };
  let bottom = 0;
  let right = 0;
  let rotated = 0;
  const xs = [];
  const ys = [];
  const groups = [];
  for (const p of placements) {
    const r = info.get(p.id);
    const w = p.rotated ? r.h : r.w;
    const h = p.rotated ? r.w : r.h;
    bottom = Math.max(bottom, p.y + h);
    right = Math.max(right, p.x + w);
    if (p.rotated) rotated++;
    xs.push(p.x, p.x + w);
    ys.push(p.y, p.y + h);
    // Orientación con que quedó en la hoja (las cuadradas no cuentan).
    const lying = w > h + EPS ? 1 : 0;
    const standing = h > w + EPS ? 1 : 0;
    const g = groups[r.group];
    if (g) {
      g.count++;
      g.lying += lying;
      g.standing += standing;
      g.area += w * h;
      g.x0 = Math.min(g.x0, p.x);
      g.y0 = Math.min(g.y0, p.y);
      g.x1 = Math.max(g.x1, p.x + w);
      g.y1 = Math.max(g.y1, p.y + h);
    } else groups[r.group] = { count: 1, lying, standing, area: w * h, x0: p.x, y0: p.y, x1: p.x + w, y1: p.y + h };
  }
  // Bordes: entre 4 (todas alineadas en una sola caja) y 4n (ninguno compartido).
  const edges = n > 1 ? (distinctCount(xs) + distinctCount(ys) - 4) / (4 * n - 4) : 0;
  // Por cada grupo de piezas iguales: dispersión = cuánto de la caja que las
  // encierra no es pieza del grupo (0 = juntas, cerca de 1 = desparramadas);
  // mezcla = cuántas quedaron en la orientación minoritaria del grupo.
  let scattered = 0;
  let minority = 0;
  let grouped = 0;
  for (const g of groups) {
    if (!g || g.count < 2) continue;
    scattered += g.count * (1 - g.area / ((g.x1 - g.x0) * (g.y1 - g.y0)));
    minority += Math.min(g.lying, g.standing);
    grouped += g.count;
  }
  return {
    bottom: bottom / H,
    rotated: rotated / n,
    edges,
    scatter: grouped ? scattered / grouped : 0,
    mixed: grouped ? (2 * minority) / grouped : 0,
    right: right / W,
  };
}

function combine(s) {
  return (
    W_BOTTOM * s.bottom +
    (s.rotated > 0 ? W_ROTATE_ANY + W_ROTATE_SHARE * s.rotated : 0) +
    W_EDGES * s.edges +
    W_SCATTER * s.scatter +
    W_MIXED * s.mixed +
    W_RIGHT * s.right
  );
}

/**
 * Puntaje de una distribución de `pack` ({id, x, y, rotated}) de las piezas
 * `rects` en un área W×H. Menor es mejor. Ver los pesos W_* arriba.
 */
export function score(placements, rects, W, H) {
  return combine(scoreParts(placements, pieceInfo(rects), W, H));
}

// --- Búsqueda --------------------------------------------------------------

// PRNG con semilla (mulberry32): misma entrada, mismo resultado.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Criterios para los órdenes perturbados (los de ORDERS, sin desempate).
const KEYS = [(p) => p.w * p.h, (p) => Math.max(p.w, p.h), (p) => p.w + p.h, (p) => p.h, (p) => p.w];
const SEED = 0x5eed;
// Cuántos órdenes perturbados probar además de los fijos. Es una cantidad fija
// (no un tiempo) para que el resultado sea determinístico. Cada intento cuesta
// ~n² (n piezas × huecos libres), así que baja con n: 400 hasta 100 piezas
// (~70 ms con 60), 100 con 200 piezas (~180 ms). Rinde cada vez menos: el doble
// de intentos mejora el puntaje medio ~0,1 % del alto y duplica el tiempo.
const extraAttempts = (n) => Math.max(40, Math.min(400, Math.round(4e6 / (n * n || 1))));

/**
 * Ubica `rects` ({id, w, h}) dentro de un área W×H sin superponerlos.
 * Devuelve [{id, x, y, rotated}] o null si no entran todos; `rotated` indica
 * que la pieza ocupa h×w. Entre piezas, y entre piezas y obstáculos, queda al
 * menos `gap` (contra el borde del área no se exige).
 * `obstacles` ({x, y, w, h}) son zonas ya ocupadas que hay que esquivar.
 *
 * Genera muchas distribuciones válidas (combinaciones fijas de orientación,
 * orden y heurística, y órdenes perturbados con semilla fija) y devuelve la de
 * menor `score`. Es determinística y no depende del orden de `rects`.
 */
export function pack(rects, W, H, { gap = 0, rotate = true, obstacles = [] } = {}) {
  const pieces = canonical(rects);
  const info = pieceInfo(pieces);
  const start = startFree(W, H, gap, obstacles);
  const oriented = orientations(pieces, rotate);

  let best = null;
  let bestScore = Infinity;
  const consider = (placements) => {
    const s = combine(scoreParts(placements, info, W, H));
    // Ante un empate (o casi) queda la primera encontrada.
    if (s < bestScore - 1e-9) {
      best = placements;
      bestScore = s;
    }
  };

  const working = new Set(); // orientaciones con al menos una solución
  eachFixed(oriented, start, gap, (placements, o) => {
    working.add(o);
    consider(placements);
  });
  // Los órdenes perturbados solo buscan algo mejor: si ninguna combinación fija
  // entra, no entra (así `fitScale` puede cortar en la primera que entre).
  if (!best) return null;

  // Órdenes perturbados: un criterio de ORDERS con cada clave multiplicada por
  // (1 ± amp). El ruido a veces es uno por grupo de piezas iguales (siguen
  // juntas, más prolijo) y a veces uno por pieza. Los intentos repetidos
  // (misma orientación, orden y heurística) se saltean.
  const group = pieces.map((r) => info.get(r.id).group);
  const groupCount = Math.max(0, ...group) + 1;
  const pool = oriented.filter((o) => working.has(o));
  const canFlip = rotate && pieces.some((r) => !isSquare(r));
  const rnd = prng(SEED);
  const tried = new Set();
  const attempts = extraAttempts(pieces.length);
  for (let i = 0; i < attempts; i++) {
    let base;
    let baseKey;
    if (canFlip && rnd() < 0.25) {
      // Cada grupo de iguales, todo junto: como vino, acostado o parado.
      const mode = Array.from({ length: groupCount }, () => Math.floor(rnd() * 3));
      base = fixedOrientation(pieces, (r, j) => {
        const m = mode[group[j]];
        return m === 1 ? r.h > r.w + EPS : m === 2 ? r.w > r.h + EPS : false;
      });
      baseKey = mode.join('');
    } else {
      const k = Math.floor(rnd() * pool.length);
      base = pool[k];
      baseKey = `o${k}`;
    }
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    const h = Math.floor(rnd() * HEURISTICS.length);
    const amp = 0.05 + 0.6 * rnd();
    const noise = rnd() < 0.5 ? Array.from({ length: groupCount }, () => 1 + amp * (2 * rnd() - 1)) : null;
    const order = base
      .map((p, j) => ({ j, k: key(p) * (noise ? noise[group[j]] : 1 + amp * (2 * rnd() - 1)) }))
      .sort((a, b) => b.k - a.k)
      .map((e) => e.j);
    const signature = `${h}:${baseKey}:${order.join(',')}`;
    if (tried.has(signature)) continue;
    tried.add(signature);
    const placements = packOnce(order.map((j) => base[j]), start, gap, HEURISTICS[h]);
    if (placements) consider(placements);
  }
  return best;
}

// ¿Entra con alguna de las combinaciones fijas? Es lo mismo que `pack` !== null,
// pero corta en la primera que entra y no puntúa.
function fits(rects, W, H, { gap = 0, rotate = true, obstacles = [] } = {}) {
  let ok = false;
  eachFixed(orientations(canonical(rects), rotate), startFree(W, H, gap, obstacles), gap, () => (ok = true));
  return ok;
}

/**
 * Las distribuciones de las combinaciones fijas que entran (las que `pack`
 * compara antes de los órdenes perturbados). Expuesta para tests.
 */
export function fixedCandidates(rects, W, H, { gap = 0, rotate = true, obstacles = [] } = {}) {
  const out = [];
  eachFixed(orientations(canonical(rects), rotate), startFree(W, H, gap, obstacles), gap, (p) => {
    out.push(p);
  });
  return out;
}

/**
 * Mayor factor (0–1] por el que hay que escalar todas las piezas para que
 * entren (el gap y los obstáculos no se escalan). Devuelve 0 si ni
 * reduciéndolas al mínimo se puede (o si haría falta menos de 0.01).
 * Garantía: `pack` con piezas de w·k × h·k y las mismas opciones entra. Con un
 * factor apenas menor casi siempre también, pero no está asegurado.
 */
export function fitScale(rects, W, H, options = {}) {
  const scaled = (k) => rects.map((r) => ({ id: r.id, w: r.w * k, h: r.h * k }));
  if (fits(rects, W, H, options)) return 1;
  // Búsqueda binaria: `lo` siempre es un factor con el que se pudo empaquetar.
  // Como el empaquetado es heurístico no es estrictamente monótono, así que
  // puede no ser el máximo exacto, pero sí uno que funciona.
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 16; n++) {
    const mid = (lo + hi) / 2;
    if (fits(scaled(mid), W, H, options)) lo = mid;
    else hi = mid;
  }
  return lo < 0.01 ? 0 : lo;
}
