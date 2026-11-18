// «Photos 10 × 15 sur une feuille A4»: how many fit by margin, and how to print them.

import { tenByFifteenFacts } from '../../facts/photos-10x15.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function tenByFifteen({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = tenByFifteenFacts();
  const p = f.photo;
  const name = photoName('10x15');
  // Named where the Spanish page names «Carta» as a word, not as a fact.
  const letter = ui('papers.names.letter');
  const columns = [{ head: 'Marge' }, ...f.papers.flatMap((paper) => f.gaps.map((gap) => ({ head: `${paperName(paper)}, ${gap ? `${mm(gap)} d’espacement` : 'sans espacement'}`, num: true })))];
  const rows = f.rows.map((r) => [mm(r.margin), ...r.counts.map((n) => num(n))]);

  return guide({
    id: 'photos-10x15',
    lang: 'fr',
    path: PATHS['photos-10x15'],
    title: `Imprimer des photos ${name} sur une feuille A4 · ${app}`,
    description: `Sur A4, ${num(f.onA4)} photos ${name} tiennent avec des marges de ${mm(f.a4.margin)} ; sur ${letter}, avec ${mm(f.letter.margin)}. Disposez-les en taille réelle et téléchargez le PDF, gratuitement.`,
    h1: `Photos ${name} sur une feuille A4`,
    crumb: `Photos ${name} sur A4`,
    lead: `Sur une feuille A4, ${num(f.onA4)} photos ${name} tiennent en taille réelle si votre imprimante laisse une marge de ${mm(f.a4.margin)} ou moins et que les photos n’ont pas d’espacement : deux verticales en haut et une horizontale en bas. Avec des marges de ${mm(f.wideMargin)}, il en tient ${num(f.onA4Wide)}. ${app} les organise automatiquement et les prépare pour l’impression.`,
    ctas: [
      { label: `Ouvrir ${app} avec des photos ${name} sur A4`, href: f.open.a4 },
      { label: `Ouvrir avec une feuille ${letter}`, href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.onA4)} photos ${name} sur une feuille A4 avec des marges de ${mm(f.a4.margin)}`),
    sections: [
      {
        h2: 'Comment faire',
        html: steps([
          `Ouvrez ${app} avec le bouton ci-dessus : la feuille est réglée en A4, avec des marges de ${mm(f.a4.margin)} et sans espacement entre les photos.`,
          `Ajoutez vos photos avec ${ui('bar.add')} ou déposez-les sur la feuille. Chacune est recadrée au format ${name}, centrée ; celles à l’horizontale, au format ${photoName('10x15', { turned: true })}.`,
          'Si l’une d’elles est mal cadrée, double-cliquez dessus pour la recadrer et déplacez l’image.',
          `Appuyez sur ${ui('bar.arrange')} : ${num(f.onA4)} photos tiennent par feuille, et ${app} ajoute les feuilles nécessaires.`,
          `Si vous allez les découper, activez les ${ui('cuts.title')} dans l’onglet ${ui('props.tabs.project')} des ${ui('props.title')}.`,
          `Appuyez sur ${ui('bar.print')} et choisissez « Taille réelle » ou « 100 % » dans la boîte de dialogue d’impression.`,
        ]),
      },
      {
        h2: 'Combien de photos selon la marge',
        html:
          paragraphs(`La marge dépend de votre imprimante : beaucoup laissent quelques millimètres non imprimés sur chaque bord. Voici ce que place ${ui('bar.arrange')} dans chaque cas :`) +
          table(columns, rows, `Photos ${name} (${size(p.w, p.h)}) par feuille, avec l’option ${ui('props.rotate')} activée.`),
      },
      {
        h2: `La taille d’une photo ${name}`,
        html: paragraphs(
          `Dans ${app}, la photo ${name} mesure ${size(p.w, p.h)} : c’est la taille réelle des tirages photo, ${size(4, 6, 'in')}.`,
          `S’il vous faut exactement ${size(f.exact.w, f.exact.h)}, choisissez ${name} puis saisissez ${mm(f.exact.w)} de largeur dans les ${ui('props.title')} : la hauteur passe à ${mm(f.exact.h)}. Dans ce format, ${num(f.exact.count)} photos tiennent sur une feuille A4, même avec des marges de ${mm(f.wideMargin)}.`
        ),
      },
    ],
    faq: [
      {
        q: `Combien de photos ${name} tiennent sur une feuille A4 ?`,
        a: `${num(f.onA4)} si la marge est de ${mm(f.a4.margin)} ou moins et qu’il n’y a pas d’espacement entre les photos ; avec des marges de ${mm(f.wideMargin)}, ${num(f.onA4Wide)}.`,
      },
      {
        q: `Peut-on imprimer 4 photos ${name} sur une feuille A4 ?`,
        a: `Au format ${name}, non : impossible d’en placer 4 sans les recadrer. Ce qui tient, ce sont ${num(f.quarter.count)} photos de ${size(f.quarter.w, f.quarter.h)}, un peu plus petites (le quart d’une feuille A4), et seulement si l’imprimante imprime sans marges.`,
      },
      {
        q: `Combien de photos ${name} tiennent sur une feuille ${letter} ?`,
        a: `${num(f.onLetter)} avec des marges de ${mm(f.letter.margin)}${f.sameWithGap ? `, même avec ${mm(f.cutGap)} d’espacement entre elles` : ''}.`,
      },
      {
        q: 'Quel papier utiliser ?',
        a: `Du papier photo A4 ou ${letter} accepté par votre imprimante, brillant ou mat. Dans la boîte de dialogue d’impression, choisissez ce type de papier pour que l’imprimante utilise la qualité qui convient.`,
      },
      { q: 'Et si mes photos ont d’autres formats ?', a: `Utilisez le ${link(PATHS['how-many'], 'calculateur de photos par feuille')} : choisissez le format et la marge, puis ouvrez la feuille dans ${app}.` },
    ],
  });
}
