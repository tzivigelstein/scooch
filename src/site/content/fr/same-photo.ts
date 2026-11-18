// «Imprimer plusieurs fois la même photo sur une page»: Remplir avec des copies and Dupliquer.

import { samePhotoFacts, type Copy } from '../../facts/same-photo.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function samePhoto({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = samePhotoFacts();
  const copyName = (copy: Copy) => (copy.kind === 'photo' ? photoName(copy.id) : copy.kind === 'label' ? 'Étiquette' : 'Autocollant carré');
  // Named where the Spanish page names «Carta» as a word, not as a fact.
  const letter = ui('papers.names.letter');
  const gap = ui('props.gap').toLowerCase();

  return guide({
    id: 'same-photo',
    lang: 'fr',
    path: PATHS['same-photo'],
    title: `Imprimer plusieurs fois la même photo sur une page · ${app}`,
    description: 'Remplissez une feuille de copies d’une photo, d’un logo ou d’une étiquette au format de votre choix, avec traits de coupe. Gratuit, sans compte et sans envoi.',
    h1: 'Imprimer plusieurs fois la même photo sur une page',
    crumb: 'La même photo plusieurs fois',
    lead: `Choisissez la taille, et ${app} remplit la feuille de copies de votre photo, logo ou étiquette en une seule étape. Chaque copie sort en taille réelle, avec des traits de coupe si vous en avez besoin.`,
    ctas: [
      { label: `Ouvrir ${app} avec une feuille A4`, href: f.open.a4 },
      { label: `Ouvrir avec une feuille ${letter}`, href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.figure.count)} étiquettes de ${size(f.label.w, f.label.h)} sur une feuille A4, avec ${mm(f.layout.gap)} d’espacement`),
    sections: [
      {
        h2: 'Comment faire',
        html:
          steps([
            `Ouvrez ${app} avec l’un des boutons ci-dessus et ajoutez votre image avec ${ui('bar.add')}.`,
            `Donnez à chaque copie sa taille : choisissez un format dans ${ui('crop.size')}, dans les ${ui('props.title')}, ou saisissez la largeur et la hauteur.`,
            `Appuyez sur ${ui('props.fill')}, dans l’onglet ${ui('props.tabs.piece')}. Avant de l’appliquer, vous voyez combien de copies tiennent. Les autres éléments de cette feuille sont remplacés, et vous pouvez annuler.`,
            `Vous voulez un nombre exact ? Utilisez ${ui('props.duplicate')} : chaque copie va dans un espace libre et, s’il n’y en a plus, sur une nouvelle feuille.`,
            `Appuyez sur ${ui('bar.print')} et choisissez « Taille réelle » ou « 100 % ». Les ${ui('cuts.title').toLowerCase()} indiquent où découper chaque copie.`,
          ]) + paragraphs(`Pour laisser plus d’espace entre les copies, augmentez l’${gap} dans l’onglet ${ui('props.tabs.project')} avant de remplir la feuille.`),
      },
      {
        h2: 'Combien de copies tiennent',
        html:
          table(
            [{ head: 'Copie' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
            f.rows.map(({ copy, counts }) => [`${copyName(copy)} <span class="muted">(${size(copy.w, copy.h)})</span>`, ...counts.map((n) => num(n))]),
            `Copies par feuille avec ${ui('props.fill')}, avec des marges de ${mm(f.layout.margin)} et ${mm(f.layout.gap)} d’espacement.`
          ) + paragraphs(`Pour tout autre format, utilisez le ${link(PATHS['how-many'], 'calculateur de photos par feuille')}.`),
      },
    ],
    faq: [
      {
        q: 'Combien de copies tiennent sur une feuille ?',
        a: `Cela dépend du format, de la marge et de l’espacement. ${ui('props.fill')} indique combien avant de l’appliquer, et le ${link(PATHS['how-many'], 'calculateur')} vous le dit avant même de commencer.`,
      },
      {
        q: 'Puis-je faire des copies de plusieurs photos différentes sur la même feuille ?',
        a: `Oui. Sélectionnez les photos et utilisez ${ui('props.duplicate')} : chacune est copiée autant de fois que vous le choisissez. Appuyez ensuite sur ${ui('bar.arrange')}.`,
      },
      { q: 'Les copies perdent-elles en qualité ?', a: `Non. Elles utilisent toutes le fichier d’origine. Si la résolution de l’image est faible pour le format choisi, ${app} vous prévient qu’elle risque d’être pixélisée.` },
      {
        q: 'Comment laisser de l’espace pour découper ?',
        a: `Augmentez l’${gap} dans l’onglet ${ui('props.tabs.project')} des ${ui('props.title')}, et activez les ${ui('cuts.title').toLowerCase()}. Avec quelques millimètres d’espacement, la découpe est plus facile.`,
      },
    ],
  });
}
