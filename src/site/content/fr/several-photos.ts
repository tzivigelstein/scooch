// «Imprimer plusieurs photos sur une feuille»: the main guide.

import { severalPhotosFacts } from '../../facts/several-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, MAX_ITEMS, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function severalPhotos({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = severalPhotosFacts();
  // Named where the Spanish page names «Carta» and «Oficio» as words, not as facts.
  const letter = ui('papers.names.letter');
  const legal = ui('papers.names.legal');
  return guide({
    id: 'several-photos',
    lang: 'fr',
    path: PATHS['several-photos'],
    title: `Imprimer plusieurs photos sur une page en taille réelle · ${app}`,
    description: `Disposez plusieurs photos sur une feuille A4 en taille réelle, puis téléchargez le PDF ou imprimez-le. Gratuit, sans compte et sans envoyer vos photos.`,
    h1: 'Imprimer plusieurs photos sur une feuille',
    crumb: 'Plusieurs photos sur une feuille',
    lead: `Avec ${app}, vous placez plusieurs photos sur une même feuille, chacune à sa taille réelle, et vous les imprimez ensemble depuis le navigateur de votre ordinateur ou de votre téléphone. C’est gratuit, sans compte, et vos photos ne quittent pas votre appareil.`,
    ctas: [
      { label: `Ouvrir ${app} avec une feuille A4`, href: f.open.a4 },
      { label: `Ouvrir avec une feuille ${letter}`, href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.figure.count)} photos ${photoName(f.figure.photo)} sur une feuille A4, avec des marges de ${mm(f.layout.margin)}`),
    sections: [
      {
        h2: 'Comment faire',
        html: steps([
          `Ouvrez ${app} avec le papier que vous allez utiliser. Si c’en est un autre, changez-le dans l’onglet ${ui('props.tabs.project')} des ${ui('props.title')} : vous y trouverez A4, ${letter}, ${legal}, du papier photo et des formats personnalisés.`,
          `Appuyez sur ${ui('bar.add')} ou déposez les photos sur la feuille. Vous pouvez en ajouter plusieurs à la fois, et aussi des PDF : chaque page devient un élément de plus.`,
          `Appuyez sur ${ui('bar.arrange')} : ${app} place toutes les photos sans chevauchement et ajoute les feuilles nécessaires.`,
          `Si vous voulez qu’elles aient toutes la même taille, sélectionnez-les et choisissez un format dans ${ui('crop.size')} (${photoName('10x15')}, ${photoName('13x18')}, ${photoName('id-4x4')}…) ou saisissez la largeur et la hauteur.`,
          `Appuyez sur ${ui('bar.print')} ou sur ${ui('bar.download')}. Dans la boîte de dialogue d’impression, choisissez « Taille réelle » ou « 100 % » pour que chaque photo sorte à sa taille.`,
        ]),
      },
      {
        h2: 'Combien de photos tiennent sur une feuille',
        html:
          paragraphs(`Cela dépend de la taille des photos, du papier et de la marge que laisse votre imprimante. Voici combien de photos identiques ${ui('bar.arrange')} place sur chaque feuille :`) +
          table(
            [{ head: 'Photo' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map((r) => [`${photoName(r.id)} <span class="muted">(${size(r.w, r.h)})</span>`, ...r.counts.map((n) => num(n))]),
            `Avec des marges de ${mm(f.layout.margin)}, ${mm(f.layout.gap)} d’espacement entre les photos et l’option ${ui('props.rotate')} activée.`
          ) +
          paragraphs(`Pour d’autres formats et d’autres marges, utilisez le ${link(PATHS['how-many'], 'calculateur de photos par feuille')}.`),
      },
      {
        h2: 'En taille réelle, sans mise à l’échelle',
        html: paragraphs(
          `${app} crée un PDF aux dimensions exactes de la feuille, et chaque photo garde sa taille en millimètres, pas en pixels. Ce qui peut changer la taille, c’est la boîte de dialogue d’impression : avec « Ajuster à la page » ou une option semblable, l’imprimante réduit tout un peu. Mieux vaut donc choisir « Taille réelle » ou « 100 % » et faire un essai avant d’imprimer beaucoup d’exemplaires.`,
          `Pour en savoir plus, lisez le guide pour ${link(PATHS['actual-size'], 'imprimer une image en taille réelle')}.`
        ),
      },
      {
        h2: 'Depuis un téléphone',
        html: paragraphs(
          `${app} fonctionne dans le navigateur du téléphone ou de la tablette, sans rien installer. Ajoutez les photos depuis la galerie, appuyez sur ${ui('bar.arrange')} et téléchargez le PDF pour l’imprimer ou le faire imprimer.`
        ),
      },
    ],
    faq: [
      { q: 'Puis-je imprimer plusieurs photos sur une page depuis mon téléphone ?', a: `Oui. ${app} fonctionne dans le navigateur du téléphone : ajoutez les photos depuis la galerie, appuyez sur ${ui('bar.arrange')} et téléchargez le PDF.` },
      { q: 'Faut-il Word ou un autre logiciel ?', a: 'Non. Tout se passe dans le navigateur : rien à installer, aucun compte à créer.' },
      {
        q: 'Pourquoi les photos sortent-elles plus petites à l’impression ?',
        a: 'C’est presque toujours l’échelle de la boîte de dialogue d’impression. Avec « Ajuster à la page » ou une option semblable, l’imprimante réduit la feuille pour la faire tenir dans sa zone d’impression. Choisissez « Taille réelle » ou « 100 % ».',
      },
      {
        q: 'Mes photos sont-elles envoyées sur un serveur ?',
        a: `Non. Les photos sont ouvertes et traitées dans votre navigateur, et le PDF y est créé aussi. La ${link(PATHS['legal-privacy'], 'politique de confidentialité')} l’explique.`,
      },
      { q: 'Puis-je mélanger des photos de tailles différentes, ou des photos et des pages de PDF ?', a: `Oui. ${ui('bar.arrange')} place ensemble des éléments de toutes tailles, et chaque page d’un PDF est un élément de plus.` },
      { q: 'Y a-t-il un filigrane ou une limite de photos ?', a: `Il n’y a pas de filigrane. Un projet accepte jusqu’à ${num(MAX_ITEMS)} éléments.` },
    ],
  });
}
