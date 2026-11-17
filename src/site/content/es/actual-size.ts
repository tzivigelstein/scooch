// «Imprimir una imagen a tamaño real»: exact measures, and why printers change them.

import { actualSizeFacts } from '../../facts/actual-size.ts';
import { guide } from '../../guide.ts';
import { app, paragraphs, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function actualSize({ ui, num, mm, size }: Kit): SitePage {
  const f = actualSizeFacts();
  return guide({
    id: 'actual-size',
    lang: 'es',
    path: PATHS['actual-size'],
    title: `Imprimir una imagen a tamaño real, en cm o mm · ${app}`,
    description: 'Escribe el ancho y el alto que quieres en el papel y obtén un PDF con esa medida exacta. Gratis y en el navegador, sin instalar nada ni crear una cuenta.',
    h1: 'Imprimir una imagen a tamaño real',
    crumb: 'Imagen a tamaño real',
    lead: `Escribe la medida que quieres en el papel, en milímetros, centímetros o pulgadas, y ${app} crea un PDF con esa medida exacta. Al imprimirlo con «Tamaño real» o «100 %», la imagen sale como la definiste.`,
    ctas: [
      { label: `Abrir ${app} con hoja A4`, href: f.open.a4 },
      { label: 'Abrir con hoja Carta', href: f.open.letter },
    ],
    sections: [
      {
        h2: 'Cómo hacerlo',
        html: steps([
          `Abre ${app} y agrega la imagen con ${ui('bar.add')}.`,
          `Selecciónala y escribe el ${ui('props.widthTip')} o el ${ui('props.heightTip')} en ${ui('props.title')}, en la pestaña ${ui('props.tabs.piece')}. El otro lado se ajusta solo, para que la imagen no se deforme.`,
          `¿Prefieres centímetros o pulgadas? Cámbialo en ${ui('prefs.title')}, en ${ui('prefs.units')}.`,
          `Presiona ${ui('bar.print')} y, en el diálogo de impresión, elige «Tamaño real» o «100 %».`,
          'Mide la impresión con una regla antes de imprimir muchas copias.',
        ]),
      },
      {
        h2: 'Por qué la impresora cambia el tamaño',
        html: paragraphs(
          `El PDF de ${app} tiene la medida exacta de la hoja y de cada imagen. El tamaño cambia en el último paso, en el diálogo de impresión: con «Ajustar a la página», «Ajustar al área de impresión» o una opción parecida, la impresora reduce todo para que entre en lo que puede imprimir. Elige «Tamaño real» o «100 %», y revisa que el papel del diálogo sea el mismo de la hoja.`,
          `Si la imagen toca el borde de la hoja, puede quedar cortada: muchas impresoras no imprimen hasta el borde. Deja un margen; ${app} avisa cuando una pieza pasa el margen o se sale de la hoja.`
        ),
      },
      {
        h2: `El botón ${ui('props.actual')}`,
        html: paragraphs(
          `En ${ui('props.title')}, el botón ${ui('props.actual')} lleva la imagen a la medida que indica su propia resolución. Por ejemplo, una foto de ${num(f.px.w)} × ${num(f.px.h)} píxeles a ${num(f.ppi)} ppp mide ${size(f.printed.w, f.printed.h)}. Úsalo si la imagen ya trae la medida correcta, como un plano o un patrón escaneado.`
        ),
      },
      {
        h2: 'Calidad de impresión',
        html: paragraphs(
          `${app} muestra a cuántos ppp (puntos por pulgada) se va a imprimir cada imagen y avisa si puede verse pixelada a la medida elegida. Cuanto más grande la imprimas, menos ppp tiene.`
        ),
      },
    ],
    faq: [
      {
        q: '¿Cómo imprimo una imagen a una medida exacta en centímetros?',
        a: `Agrégala a ${app}, cambia las unidades a centímetros en ${ui('prefs.title')} y escribe el ancho o el alto en ${ui('props.title')}. Después imprime con «Tamaño real» o «100 %».`,
      },
      { q: '¿Por qué la imagen sale más pequeña de lo que debería?', a: 'Casi siempre es la escala del diálogo de impresión. Elige «Tamaño real» o «100 %» en lugar de «Ajustar a la página».' },
      {
        q: '¿Puedo imprimir un PDF a tamaño real?',
        a: 'Sí. Agrega el PDF: cada página es una pieza con su medida original. Ponla en una hoja del mismo tamaño o más grande e imprime con «Tamaño real» o «100 %».',
      },
      { q: '¿Qué es ppp?', a: `Puntos por pulgada: cuántos píxeles de la imagen caben en cada pulgada impresa. Con pocos ppp, la imagen puede verse pixelada; ${app} avisa cuando la resolución es baja para la medida elegida.` },
      {
        q: '¿Por qué conviene dejar un margen?',
        a: `Porque muchas impresoras no imprimen hasta el borde del papel, y lo que queda fuera de su área de impresión se corta. Cuánto margen hace falta depende de cada impresora: ${app} empieza con ${mm(f.layout.margin)} cuando lo abres desde esta página.`,
      },
    ],
  });
}
