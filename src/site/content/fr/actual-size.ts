// «Imprimer une image en taille réelle»: exact measures, and why printers change them.

import { actualSizeFacts } from '../../facts/actual-size.ts';
import { guide } from '../../guide.ts';
import { app, paragraphs, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function actualSize({ ui, num, mm, size }: Kit): SitePage {
  const f = actualSizeFacts();
  // Named where the Spanish page names «Carta» as a word, not as a fact.
  const letter = ui('papers.names.letter');
  return guide({
    id: 'actual-size',
    lang: 'fr',
    path: PATHS['actual-size'],
    title: `Imprimer une image en taille réelle, en cm ou mm · ${app}`,
    description: 'Saisissez la largeur et la hauteur voulues sur le papier et obtenez un PDF à ces dimensions exactes. Gratuit, dans le navigateur, sans installation ni compte.',
    h1: 'Imprimer une image en taille réelle',
    crumb: 'Image en taille réelle',
    lead: `Saisissez la taille voulue sur le papier, en millimètres, centimètres ou pouces, et ${app} crée un PDF à ces dimensions exactes. En l’imprimant avec « Taille réelle » ou « 100 % », vous obtenez l’image telle que vous l’avez définie.`,
    ctas: [
      { label: `Ouvrir ${app} avec une feuille A4`, href: f.open.a4 },
      { label: `Ouvrir avec une feuille ${letter}`, href: f.open.letter },
    ],
    sections: [
      {
        h2: 'Comment faire',
        html: steps([
          `Ouvrez ${app} et ajoutez l’image avec ${ui('bar.add')}.`,
          `Sélectionnez-la et saisissez la ${ui('props.widthTip')} ou la ${ui('props.heightTip')} dans l’onglet ${ui('props.tabs.piece')} des ${ui('props.title')}. L’autre côté s’ajuste tout seul, pour que l’image ne soit pas déformée.`,
          `Vous préférez les centimètres ou les pouces ? Choisissez-les dans les ${ui('prefs.title')}, sous ${ui('prefs.units')}.`,
          `Appuyez sur ${ui('bar.print')} et, dans la boîte de dialogue d’impression, choisissez « Taille réelle » ou « 100 % ».`,
          'Mesurez l’impression avec une règle avant d’imprimer beaucoup d’exemplaires.',
        ]),
      },
      {
        h2: 'Pourquoi l’imprimante change la taille',
        html: paragraphs(
          `Le PDF de ${app} a les dimensions exactes de la feuille et de chaque image. La taille change à la dernière étape, dans la boîte de dialogue d’impression : avec « Ajuster à la page », « Ajuster à la zone imprimable » ou une option semblable, l’imprimante réduit tout pour le faire tenir dans ce qu’elle peut imprimer. Choisissez « Taille réelle » ou « 100 % », et vérifiez que le papier choisi dans la boîte de dialogue est bien celui de la feuille.`,
          `Si l’image touche le bord de la feuille, elle risque d’être coupée : beaucoup d’imprimantes n’impriment pas jusqu’au bord. Laissez une marge ; ${app} vous prévient quand un élément dépasse la marge ou sort de la feuille.`
        ),
      },
      {
        h2: `Le bouton ${ui('props.actual')}`,
        html: paragraphs(
          `Dans les ${ui('props.title')}, le bouton ${ui('props.actual')} donne à l’image la taille qu’indique sa propre résolution. Par exemple, une photo de ${num(f.px.w)} × ${num(f.px.h)} pixels à ${num(f.ppi)} ppp mesure ${size(f.printed.w, f.printed.h)}. Utilisez-le si l’image a déjà la bonne taille, comme un plan ou un patron numérisé.`
        ),
      },
      {
        h2: 'Qualité d’impression',
        html: paragraphs(
          `${app} indique à combien de ppp (points par pouce) chaque image sera imprimée et vous prévient si elle risque d’être pixélisée au format choisi. Plus vous l’imprimez grand, moins elle a de ppp.`
        ),
      },
    ],
    faq: [
      {
        q: 'Comment imprimer une image à une taille exacte en centimètres ?',
        a: `Ajoutez-la à ${app}, passez les unités en centimètres dans les ${ui('prefs.title')} et saisissez la largeur ou la hauteur dans les ${ui('props.title')}. Imprimez ensuite avec « Taille réelle » ou « 100 % ».`,
      },
      { q: 'Pourquoi l’image sort-elle plus petite qu’elle ne devrait ?', a: 'C’est presque toujours l’échelle de la boîte de dialogue d’impression. Choisissez « Taille réelle » ou « 100 % » au lieu de « Ajuster à la page ».' },
      {
        q: 'Puis-je imprimer un PDF en taille réelle ?',
        a: 'Oui. Ajoutez le PDF : chaque page devient un élément à sa taille d’origine. Placez-la sur une feuille de même taille ou plus grande et imprimez avec « Taille réelle » ou « 100 % ».',
      },
      { q: 'Que veut dire ppp ?', a: `Points par pouce : le nombre de pixels de l’image qui tiennent dans chaque pouce imprimé. Avec peu de ppp, l’image peut être pixélisée ; ${app} vous prévient quand la résolution est faible pour le format choisi.` },
      {
        q: 'Pourquoi laisser une marge ?',
        a: `Parce que beaucoup d’imprimantes n’impriment pas jusqu’au bord du papier, et ce qui sort de leur zone d’impression est coupé. La marge nécessaire dépend de chaque imprimante : ${app} commence avec ${mm(f.layout.margin)} quand vous l’ouvrez depuis cette page.`,
      },
    ],
  });
}
