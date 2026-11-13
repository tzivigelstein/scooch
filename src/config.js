// Configuración general. Para renombrar la app alcanza con cambiar APP_NAME:
// los textos (src/copy) lo usan con {app}, también en el HTML generado.
// Los papeles están en papers.js (ids estables; los nombres, en src/copy).

export const APP_NAME = 'Pliego';

export const MAX_ITEMS = 200;
export const MAX_UNDO = 50;
export const EPS = 0.01; // tolerancia en mm para bordes y superposiciones
export const CROWD_LIMIT = 0.48; // tamaño máximo de lo nuevo cuando ya hay cosas
export const DRAG_THRESHOLD = 3; // px antes de considerar que hubo arrastre

/** Pantallas angostas: sin columnas; barra de solo íconos; propiedades como hoja inferior. */
export const NARROW_QUERY = '(max-width: 799.98px)';
/** Desde acá para abajo, el panel de piezas se pliega a una franja y se abre superpuesto. */
export const LEFT_DRAWER_QUERY = '(max-width: 1099.98px)';
/** Clave de localStorage de las secciones plegadas del panel de propiedades. */
export const SECTIONS_STORAGE = 'panel-sections';

/** Clave de localStorage del interruptor «Atajos de una tecla». */
export const SINGLE_KEYS_STORAGE = 'single-key-shortcuts';

/** Preferencias de la grilla (vista, no documento: no entran en el historial). */
export const GRID_STORAGE = 'grid-preferences';
export const GRID_DEFAULTS = { show: false, size: 1, snap: true };
export const GRID_MIN = 0.5;
export const GRID_MAX = 50;
export const PIECES_STORAGE = 'piece-preferences';
/** Unidad de las medidas ('mm' | 'cm' | 'in'), elegida en «Preferencias». */
export const UNIT_STORAGE = 'unit-preference';
/** Último papel personalizado ({w, h} en mm, como se cargó): preferencia local. */
export const CUSTOM_PAPER_STORAGE = 'custom-paper';

// ---------- Donaciones ----------

/** Página de Patreon. Vacía: el modal no aparece nunca y exportar es como siempre. */
export const DONATE_URL = '';
/** 'session': solo la primera impresión/descarga de cada carga de página; 'always': todas. */
export const DONATE_EVERY = 'session';
/** Clave de localStorage de «No volver a mostrar en este dispositivo». */
export const DONATE_STORAGE = 'donate-dismissed';
// Los textos del modal están en src/copy (donate).
