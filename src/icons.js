// Íconos: Lucide (https://lucide.dev), del paquete `lucide` (licencia ISC;
// algunos íconos derivan de Feather, MIT). Cada ícono se importa por nombre
// para que el build incluya solo los que se usan.
//
// Único lugar con SVG de íconos: el resto de la app usa icon(nombre) o
// <span data-icon="nombre">, con los nombres oficiales de Lucide.

import {
  BringToFront,
  ChevronDown,
  CircleCheck,
  Copy,
  Crosshair,
  Download,
  DropletOff,
  Grid2x2Plus,
  Heart,
  ImagePlus,
  Info,
  Keyboard,
  Layers,
  LayoutDashboard,
  List,
  LoaderCircle,
  Magnet,
  Maximize2,
  MegaphoneOff,
  MoveHorizontal,
  MoveVertical,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  Redo2,
  RotateCcw,
  RotateCw,
  Scaling,
  Scissors,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from 'lucide';

const ICONS = {
  'bring-to-front': BringToFront,
  'chevron-down': ChevronDown,
  'circle-check': CircleCheck,
  'copy': Copy,
  'crosshair': Crosshair,
  'download': Download,
  'droplet-off': DropletOff,
  'grid-2x2-plus': Grid2x2Plus,
  'heart': Heart,
  'image-plus': ImagePlus,
  'info': Info,
  'keyboard': Keyboard,
  'layers': Layers,
  'layout-dashboard': LayoutDashboard,
  'list': List,
  'loader-circle': LoaderCircle,
  'magnet': Magnet,
  'maximize-2': Maximize2,
  'megaphone-off': MegaphoneOff,
  'move-horizontal': MoveHorizontal,
  'move-vertical': MoveVertical,
  'printer': Printer,
  'rectangle-horizontal': RectangleHorizontal,
  'rectangle-vertical': RectangleVertical,
  'redo-2': Redo2,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  'scaling': Scaling,
  'scissors': Scissors,
  'settings': Settings,
  'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal,
  'square-dashed': SquareDashed,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  'undo-2': Undo2,
  'upload': Upload,
  'x': X,
};

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Nodos de Lucide ([etiqueta, atributos, hijos?][]) → marcado SVG. */
const markup = (nodes = []) =>
  nodes
    .map(([tag, attrs, children]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
        .join('');
      return children?.length ? `<${tag}${attributes}>${markup(children)}</${tag}>` : `<${tag}${attributes}/>`;
    })
    .join('');

const bodies = new Map(); // nombre → marcado interno (se arma una vez)

/** SVG inline de un ícono decorativo (24×24, trazo 2, color del texto). */
export function icon(name, className = 'icon') {
  if (!bodies.has(name)) {
    const nodes = ICONS[name];
    if (!nodes) throw new Error(`Ícono desconocido: ${name}`);
    bodies.set(name, markup(nodes));
  }
  return (
    `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${bodies.get(name)}</svg>`
  );
}

/** Reemplaza cada `<span data-icon="nombre">` por su SVG (conserva sus otras clases). */
export function hydrateIcons(root = document) {
  for (const slot of root.querySelectorAll('[data-icon]')) {
    const extra = [...slot.classList].filter((c) => c !== 'icon');
    slot.outerHTML = icon(slot.dataset.icon, ['icon', ...extra].join(' '));
  }
}
