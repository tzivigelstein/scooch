// «Combien de photos tiennent sur une feuille ?»: the calculator
// (calc-form.ts, run again in the browser by calculator.ts) and reference tables.

import { PHOTO_SIZES } from '../../../core/crop.js';
import { PAPERS } from '../../../core/papers.js';
import type { CalcTexts } from '../../calc.ts';
import { calculatorHtml } from '../../calc-form.ts';
import { CALC_START, howManyFacts } from '../../facts/how-many.ts';
import { guide } from '../../guide.ts';
import { app, MAX_ITEMS, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

// French says «one» for 0 too: «0 photo par feuille».
export const calcTexts = ({ ui, paperName, photoName }: Kit): CalcTexts => ({
  locale: 'fr',
  max: MAX_ITEMS,
  papers: Object.fromEntries(PAPERS.map((p) => [p.id, paperName(p.id)])),
  photos: Object.fromEntries(PHOTO_SIZES.map((s) => [s.id, photoName(s.id)])),
  orientation: { portrait: 'portrait', landscape: 'paysage' },
  count: { one: 'photo par feuille', other: 'photos par feuille', capped: 'plus de {n}' },
  photoPreset: '{name} ({size})',
  summary: '{photo} sur une feuille {paper}, avec une marge de {margin} et un espacement de {gap}',
  noRotate: `, sans ${ui('props.rotate').toLowerCase()}`,
  noteNone: 'La photo ne tient pas dans la zone imprimable de la feuille. Réduisez la marge ou choisissez un papier plus grand.',
  noteSame: {
    one: `Ajoutez votre photo et appuyez sur ${ui('bar.arrange')} pour la placer.`,
    other: `Ajoutez votre photo et utilisez ${ui('props.fill')} : les {n} copies sont placées d’un coup.`,
  },
  noteMore: `${ui('props.fill')} en place {grid}, toutes dans le même sens. Pour arriver à {n}, dupliquez la photo jusqu’à en avoir {n} et appuyez sur ${ui('bar.arrange')} : ${app} fait pivoter celles qui en ont besoin.`,
  noteCapped: 'Un projet accepte jusqu’à {max} éléments.',
  figure: { one: '{n} photo sur une feuille {paper}', other: '{n} photos sur une feuille {paper}' },
});

export function howMany(k: Kit): SitePage {
  const { ui, num, mm, size, photoName, paperName } = k;
  const f = howManyFacts();
  // Named where the Spanish page names «Carta» as a word, not as a fact.
  const letter = ui('papers.names.letter');
  const calculator = calculatorHtml(k, CALC_START, calcTexts(k), {
    name: 'Calculateur',
    custom: 'Autre format',
    width: 'Largeur de la photo, en mm',
    height: 'Hauteur de la photo, en mm',
    margin: `${ui('props.margin')}, en mm`,
    gap: `${ui('props.gap')} entre les photos, en mm`,
    noscript: 'Le calculateur a besoin de JavaScript. Les tableaux ci-dessous donnent les formats les plus courants.',
    open: `Ouvrir cette feuille dans ${app}`,
  });

  return guide({
    id: 'how-many',
    lang: 'fr',
    path: PATHS['how-many'],
    title: `Combien de photos sur une feuille A4 ? Calculateur · ${app}`,
    description: `Calculez combien de photos ${photoName('10x15')}, d’identité, de passeport ou d’un autre format tiennent sur une feuille A4 avec vos marges, puis ouvrez-la dans l’éditeur.`,
    h1: 'Combien de photos tiennent sur une feuille ?',
    crumb: 'Combien de photos sur une feuille',
    lead: `Choisissez le papier, le format des photos, la marge et l’espacement. Le calculateur utilise la même méthode que le bouton ${ui('bar.arrange')} de ${app} : le nombre affiché est celui que vous obtiendrez dans l’éditeur.`,
    ctas: [],
    feature: calculator,
    scripts: ['calculator'],
    sections: [
      {
        h2: 'Photos par feuille sur les papiers les plus courants',
        html: table(
          [{ head: 'Photo' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
          f.rows.map((r) => [`${photoName(r.id)} <span class="muted">(${size(r.w, r.h)})</span>`, ...r.counts.map((n) => num(n))]),
          `Avec des marges de ${mm(f.margin)}, ${mm(f.gap)} d’espacement entre les photos et l’option ${ui('props.rotate')} activée. C’est ce que place ${ui('bar.arrange')}.`
        ),
      },
      {
        h2: 'Ce qui change le résultat',
        html: `<ul>
<li><strong>La marge.</strong> Beaucoup d’imprimantes n’impriment pas jusqu’au bord du papier. Avec une marge plus petite, plus de photos tiennent, mais seulement si votre imprimante va jusque-là.</li>
<li><strong>L’espacement.</strong> Quelques millimètres entre les photos les rendent plus faciles à découper, même s’il en tient parfois une de moins.</li>
<li><strong>La rotation.</strong> Avec l’option ${ui('props.rotate')}, ${app} peut faire pivoter certaines photos pour en faire tenir davantage.</li>
<li><strong>La taille exacte.</strong> Dans ${app}, la photo ${photoName('10x15')} mesure ${size(f.tenByFifteen.w, f.tenByFifteen.h)} : la taille réelle des tirages photo, ${size(4, 6, 'in')}. Quelques millimètres changent le résultat.</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: `Combien de photos ${photoName('10x15')} tiennent sur une feuille A4 ?`,
        a: `Avec des marges de ${mm(5)}, ${num(f.a4Wide)}. Avec des marges de ${mm(f.narrowMargin)} ou moins et sans espacement, ${num(f.a4Narrow)} : deux verticales et une horizontale en dessous.`,
      },
      {
        q: 'Combien de photos d’identité 4 × 4 tiennent sur une feuille A4 ?',
        a: `${num(f.id4Cut)}, avec des marges de ${mm(f.margin)} et ${mm(f.gap)} d’espacement pour les découper. Sans espacement, ${num(f.id4Tight)}.`,
      },
      {
        q: `Combien de photos de passeport tiennent sur une feuille ${letter} ?`,
        a: `En ${size(f.passport.w, f.passport.h)}, avec des marges de ${mm(f.margin)} et ${mm(f.gap)} d’espacement : ${num(f.passport.count)}${f.passport.grid < f.passport.count ? `, en mélangeant photos droites et photos pivotées ; en lignes et en colonnes, ${num(f.passport.grid)}` : ''}.`,
      },
      {
        q: 'Pourquoi d’autres calculateurs donnent-ils un autre nombre ?',
        a: 'Parce qu’ils supposent d’autres marges, un autre espacement ou une autre taille exacte, ou qu’ils ne font pas pivoter les photos. Ici, vous pouvez changer chaque valeur et voir comment les photos se placent sur la feuille.',
      },
    ],
  });
}
