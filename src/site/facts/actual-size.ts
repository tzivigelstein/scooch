// «Imprimir una imagen a tamaño real» (actual-size), in every language: the
// layouts its buttons open and the example of the 100 % button.

import { editorHref } from '../kit.ts';

export function actualSizeFacts() {
  const layout = { margin: 5 };
  const px = { w: 1200, h: 1800 };
  const ppi = 300;
  return {
    layout,
    /** A photo of `px` pixels at `ppi` measures `printed` mm. */
    px,
    ppi,
    printed: { w: (px.w / ppi) * 25.4, h: (px.h / ppi) * 25.4 },
    open: { a4: editorHref({ paper: 'A4', ...layout }), letter: editorHref({ paper: 'letter', ...layout }) },
  };
}
