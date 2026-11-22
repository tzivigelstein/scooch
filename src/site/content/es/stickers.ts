// «Hacer stickers en casa»: a sheet of stickers, each with the contour cut
// line (Silueta), what it needs (transparency) and what the PDF's line is:
// a printed vector stroke to cut by hand, with no layer of its own and no
// registration marks (services/pdf.ts, services/contours.ts, core/contour.js).

import { stickersFacts } from '../../facts/stickers.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, shapesFigure, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function stickers({ ui, num, mm, size }: Kit): SitePage {
  const f = stickersFacts();
  const contour = ui('cuts.modes.contour');
  const cutMargin = ui('cuts.margin').toLowerCase();
  const sticker = size(f.sticker.w, f.sticker.h);
  return guide({
    id: 'stickers',
    lang: 'es',
    path: PATHS.stickers,
    title: `Hacer stickers en casa con línea de corte por su silueta · ${app}`,
    description: 'Arma tu plantilla de stickers para imprimir con tus imágenes PNG: cada una lleva una línea de corte que sigue su forma. Gratis, sin cuenta y sin subir nada.',
    h1: 'Imprimir stickers en casa, cada uno con su línea de corte',
    crumb: 'Stickers en casa',
    lead: `Con ${app} acomodas tus imágenes en una hoja a tamaño real, y cada una lleva una línea de corte que sigue su forma: la opción ${contour} de las ${ui('cuts.title').toLowerCase()}. Imprimes la hoja en casa y recortas cada sticker por su línea, con tijeras o cúter.`,
    ctas: [
      { label: `Abrir ${app} con hoja A4`, href: f.open.a4 },
      { label: 'Abrir con hoja Carta', href: f.open.letter },
    ],
    feature: shapesFigure(f.figure, `${num(f.figure.count)} stickers de ${sticker} en una hoja A4, cada uno con su línea de corte a ${mm(f.cutMargin)} de la forma`),
    sections: [
      {
        h2: 'Qué necesitas',
        html:
          `<ul><li>Imágenes con fondo transparente, en PNG o WebP: la línea sigue la parte que no es transparente.</li><li>Papel adhesivo del tamaño de tu hoja (A4, Carta…) que sirva para tu impresora.</li><li>Tijeras o un cúter, y una regla para revisar la medida.</li></ul>` +
          note(
            `Un JPG no tiene transparencia: su línea de corte es el rectángulo de la imagen, como con ${ui('cuts.modes.outline')}. Lo mismo pasa con un PNG sin partes transparentes y con las páginas de un PDF. ${app} no quita fondos: si tu imagen tiene fondo blanco, quítalo antes con otro programa y guárdala como PNG.`
          ),
      },
      {
        h2: 'Cómo hacerlo',
        html:
          steps([
            `Abre ${app} con uno de los botones de arriba: la hoja queda con márgenes de ${mm(f.layout.margin)}, ${mm(f.layout.gap)} de separación y las ${ui('cuts.title').toLowerCase()} en ${contour}. Si ya lo tienes abierto, elige ${contour} en ${ui('cuts.title')}, en la pestaña ${ui('props.tabs.project')} de ${ui('props.title')}.`,
            `Agrega tus imágenes con ${ui('bar.add')} o suéltalas sobre la hoja. Cada imagen con transparencia muestra su línea en unos instantes.`,
            `Dale a cada sticker su medida: selecciónalo y escribe el ${ui('props.widthTip')} o el ${ui('props.heightTip')} en ${ui('props.title')}, en la pestaña ${ui('props.tabs.piece')}. El otro lado se ajusta solo.`,
            `En ${ui('cuts.title')}, abre ${ui('cuts.more')} y escribe el ${cutMargin}: la distancia entre la imagen y su línea. Con ${mm(f.cutMargin)}, cada sticker queda con un borde de papel alrededor.`,
            `Presiona ${ui('bar.arrange')}: ${app} ubica los stickers sin superponerlos, con la ${ui('props.gap').toLowerCase()} entre ellos, y suma las hojas que hagan falta.`,
            `Presiona ${ui('bar.print')} o ${ui('bar.download')} y, en el diálogo de impresión, elige «Tamaño real» o «100 %». Después recorta cada sticker por su línea.`,
          ]) +
          paragraphs(
            `${ui('bar.arrange')} cuenta cada sticker como un rectángulo con su ${cutMargin} y deja la ${ui('props.gap').toLowerCase()} entre esos rectángulos. Si cambias el ${cutMargin} después de acomodar, presiona ${ui('bar.arrange')} otra vez.`
          ),
      },
      {
        h2: 'Qué es la línea de corte y qué no',
        html: paragraphs(
          `La línea rodea la parte de la imagen que no es transparente, a la distancia del ${cutMargin}; con un margen negativo, entra en la imagen. Un píxel cuenta como parte de la forma desde un ${num(f.opacity)} % de opacidad, así que una sombra muy suave queda afuera. La línea se suaviza: no sigue los escalones de los píxeles.`,
          `En el PDF, cada línea es un trazo vectorial hecho de tramos rectos, con el ${ui('cuts.weight').toLowerCase()}, el ${ui('cuts.color').toLowerCase()} y el ${ui('cuts.dash').toLowerCase()} que elijas en ${ui('cuts.more')}. Está en la misma página que los stickers y se imprime con ellos: es una guía para recortar a mano. Recortados por la línea, los stickers quedan con su forma, lo que las imprentas llaman troquelado.`,
          `El PDF no trae marcas de registro ni separa las líneas en una capa propia: son trazos de la página, como los demás. Si el programa de tu máquina de corte importa trazos de un PDF, puedes probar, pero ${app} no se probó con ninguna máquina, y para imprimir primero y cortar después con una máquina hacen falta marcas de alineación que este PDF no tiene.`,
          `Los huecos de una imagen, como el centro de un anillo o de una letra O, no llevan línea: la línea va solo por fuera. Las partes separadas llevan una línea cada una, salvo que estén más cerca que el doble del ${cutMargin}: entonces comparten una sola. Los puntos sueltos muy pequeños, como restos de un fondo mal borrado, se ignoran.`,
          `La línea se calcula en segundo plano, a partir de una vista previa de la imagen, y con imágenes grandes puede tardar un momento en aparecer. El PDF espera a que estén todas.`
        ),
      },
      {
        h2: 'Consejos para que salgan bien',
        html: paragraphs(
          `Deja unos milímetros de ${ui('props.gap').toLowerCase()}: cada línea queda dentro del rectángulo de su sticker con el ${cutMargin}, así que con ${mm(f.layout.gap)} de separación las líneas de dos stickers vecinos no se tocan y es más fácil recortarlos.`,
          `Elige en ${ui('props.sheet')} el tamaño de tu papel adhesivo y deja un margen: muchas impresoras no imprimen hasta el borde de la hoja.`,
          `Imprime primero una prueba en papel común, con «Tamaño real» o «100 %», y mide un sticker con una regla.`,
          `Si no quieres que la línea se note en el borde del sticker, elige en ${ui('cuts.more')} una línea ${ui('cuts.weights.thin').toLowerCase()} y de color ${ui('cuts.colors.gray').toLowerCase()}.`,
          `Para una hoja llena del mismo sticker, usa ${ui('props.fill')}: lo explica la guía para ${link(PATHS['same-photo'], 'imprimir la misma foto varias veces')}.`
        ),
      },
    ],
    faq: [
      {
        q: '¿Por qué mi imagen tiene una línea rectangular?',
        a: `Porque no tiene partes transparentes: es un JPG, un PNG con fondo o una página de PDF. ${contour} necesita transparencia: quita el fondo con otro programa, guarda la imagen como PNG y vuelve a agregarla.`,
      },
      {
        q: '¿Puedo mandar el PDF a una máquina de corte?',
        a: `El PDF tiene cada línea como un trazo vectorial en la misma página que los stickers, sin marcas de registro ni una capa aparte. Si el programa de tu máquina importa trazos de un PDF, puedes probar, pero ${app} no se probó con ninguna. Está pensado para recortar a mano.`,
      },
      {
        q: '¿Cuántos stickers caben en una hoja A4?',
        a: `Depende de su medida, del ${cutMargin} y de la separación. Con márgenes de ${mm(f.layout.margin)}, ${mm(f.layout.gap)} de separación y ${mm(f.cutMargin)} de ${cutMargin}, entran ${num(f.figure.count)} stickers de ${sticker}, como en el dibujo. ${ui('bar.arrange')} los ubica y suma hojas si hace falta.`,
      },
      {
        q: '¿Qué pasa con las letras sueltas y los huecos?',
        a: `Cada parte separada lleva su propia línea, salvo que estén más cerca que el doble del ${cutMargin}. Con un ${cutMargin} mayor que la mitad del espacio entre las letras, una palabra queda en un solo sticker. Los huecos, como el centro de una O, no llevan línea.`,
      },
      {
        q: '¿Qué papel uso?',
        a: `Papel adhesivo del mismo tamaño que la hoja que elijas en ${app} (A4, Carta…) y que sirva para tu impresora. Antes de usarlo, imprime una prueba en papel común.`,
      },
    ],
  });
}
