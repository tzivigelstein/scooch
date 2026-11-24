// «Faire ses stickers soi-même»: a sheet of stickers, each with the contour
// cut line (Silhouette), what it needs (transparency) and what the PDF's line
// is: a printed vector stroke to cut by hand, with no layer of its own and no
// registration marks (services/pdf.ts, services/contours.ts, core/contour.js).

import { stickersFacts } from '../../facts/stickers.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, shapesFigure, steps, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function stickers({ ui, num, mm, size }: Kit): SitePage {
  const f = stickersFacts();
  const contour = ui('cuts.modes.contour');
  const cutLines = ui('cuts.title').toLowerCase();
  const cutMargin = ui('cuts.margin').toLowerCase();
  const gap = ui('props.gap').toLowerCase();
  const more = ui('cuts.more');
  // Named where the Spanish page names «Carta» as a word, not as a fact.
  const letter = ui('papers.names.letter');
  const sticker = size(f.sticker.w, f.sticker.h);
  return guide({
    id: 'stickers',
    lang: 'fr',
    path: PATHS.stickers,
    title: `Faire ses stickers soi-même : trait de coupe à la forme · ${app}`,
    description: 'Créez une planche de stickers à imprimer avec vos images PNG : chacune a un trait de coupe qui suit sa forme. Imprimez-la gratuitement, sans compte.',
    h1: 'Imprimer ses stickers à la maison, chacun avec son trait de coupe',
    crumb: 'Stickers à la maison',
    lead: `Avec ${app}, vous placez vos images sur une feuille en taille réelle, et chacune reçoit un trait de coupe qui suit sa forme : l’option ${contour} des ${cutLines}. Imprimez la feuille chez vous et découpez chaque sticker le long de son trait, aux ciseaux ou au cutter.`,
    ctas: [
      { label: `Ouvrir ${app} avec une feuille A4`, href: f.open.a4 },
      { label: `Ouvrir avec une feuille ${letter}`, href: f.open.letter },
    ],
    feature: shapesFigure(f.figure, `${num(f.figure.count)} stickers de ${sticker} sur une feuille A4, chacun avec son trait de coupe à ${mm(f.cutMargin)} de sa forme`),
    sections: [
      {
        h2: 'Ce qu’il vous faut',
        html:
          `<ul><li>Des images à fond transparent, en PNG ou WebP : le trait suit la partie qui n’est pas transparente.</li><li>Du papier autocollant au format de votre feuille (A4, ${letter}…), adapté à votre imprimante.</li><li>Des ciseaux ou un cutter, et une règle pour vérifier la taille.</li></ul>` +
          note(
            `Un JPG n’a pas de transparence : son trait de coupe est le rectangle de l’image, comme avec ${ui('cuts.modes.outline')}. C’est pareil pour un PNG sans parties transparentes et pour les pages d’un PDF. ${app} ne supprime pas les fonds : si votre image a un fond blanc, retirez-le d’abord avec un autre logiciel et enregistrez-la en PNG.`
          ),
      },
      {
        h2: 'Comment faire',
        html:
          steps([
            `Ouvrez ${app} avec l’un des boutons ci-dessus : la feuille a des marges de ${mm(f.layout.margin)}, ${mm(f.layout.gap)} d’espacement et les ${cutLines} en ${contour}, avec une ${cutMargin} de ${mm(f.cutMargin)}. S’il est déjà ouvert, choisissez ${contour} dans ${ui('cuts.title')}, dans l’onglet ${ui('props.tabs.project')} des ${ui('props.title')}.`,
            `Ajoutez vos images avec ${ui('bar.add')} ou déposez-les sur la feuille. Chaque image avec de la transparence affiche son trait en quelques instants.`,
            `Donnez à chaque sticker sa taille : sélectionnez-le et saisissez la ${ui('props.widthTip')} ou la ${ui('props.heightTip')} dans l’onglet ${ui('props.tabs.piece')} des ${ui('props.title')}. L’autre côté s’ajuste tout seul.`,
            `Dans ${ui('cuts.title')}, ouvrez ${more} pour vérifier la ${cutMargin} : la distance entre l’image et son trait. Avec ${mm(f.cutMargin)}, chaque sticker garde une bordure de papier tout autour. Pour la changer, saisissez une autre valeur.`,
            `Appuyez sur ${ui('bar.arrange')} : ${app} place les stickers sans qu’ils se superposent, avec l’${gap} entre eux, et ajoute autant de feuilles qu’il faut.`,
            `Appuyez sur ${ui('bar.print')} ou ${ui('bar.download')} et, dans la boîte de dialogue d’impression, choisissez « Taille réelle » ou « 100 % ». Découpez ensuite chaque sticker le long de son trait.`,
          ]) +
          paragraphs(`${ui('bar.arrange')} compte chaque sticker comme un rectangle avec sa ${cutMargin}, et laisse l’${gap} entre ces rectangles. Si vous changez la ${cutMargin} après avoir organisé la feuille, appuyez de nouveau sur ${ui('bar.arrange')}.`),
      },
      {
        h2: 'Ce qu’est le trait de coupe, et ce qu’il n’est pas',
        html: paragraphs(
          `Le trait fait le tour de la partie de l’image qui n’est pas transparente, à la distance de la ${cutMargin} ; avec une marge négative, il entre dans l’image. Un pixel fait partie de la forme à partir de ${num(f.opacity)} % d’opacité : une ombre très légère reste donc à l’extérieur. Le trait est lissé : il ne suit pas les marches des pixels.`,
          `Dans le PDF, chaque trait est un tracé vectoriel fait de segments droits, avec les réglages ${ui('cuts.weight')}, ${ui('cuts.color')} et ${ui('cuts.dash')} choisis dans ${more}. Il est sur la même page que les stickers et s’imprime avec eux : c’est un guide pour découper à la main. Découpés le long du trait, les stickers gardent leur forme : c’est ce que les imprimeurs appellent la découpe à la forme.`,
          `Le PDF n’a pas de marques de repérage et ne place pas les traits sur un calque à part : ce sont des tracés de la page comme les autres. Si le logiciel de votre machine de découpe importe des tracés depuis un PDF, vous pouvez essayer, mais ${app} n’a été testé avec aucune machine, et imprimer puis découper à la machine demande des marques d’alignement que ce PDF n’a pas.`,
          `Les trous d’une image, comme le centre d’un anneau ou d’une lettre O, n’ont pas de trait : le trait passe seulement à l’extérieur. Les parties séparées ont chacune leur trait, sauf si elles sont plus proches que le double de la ${cutMargin} : elles en partagent alors un seul. Les très petits points isolés, comme les restes d’un fond mal effacé, sont ignorés.`,
          `Le trait est calculé en arrière-plan, à partir d’un aperçu de l’image, et avec de grandes images il peut mettre un moment à apparaître. Le PDF attend que tous les traits soient prêts.`
        ),
      },
      {
        h2: 'Conseils pour des stickers réussis',
        html: paragraphs(
          `Laissez quelques millimètres d’${gap} : chaque trait reste dans le rectangle de son sticker avec sa ${cutMargin}, donc avec ${mm(f.layout.gap)} d’espacement les traits de deux stickers voisins ne se touchent pas, et ils sont plus faciles à découper.`,
          `Choisissez dans ${ui('props.sheet')} le format de votre papier autocollant, et laissez une marge : beaucoup d’imprimantes n’impriment pas jusqu’au bord de la feuille.`,
          `Imprimez d’abord un test sur du papier ordinaire, en « Taille réelle » ou « 100 % », et mesurez un sticker avec une règle.`,
          `Si vous ne voulez pas que le trait se voie sur le bord du sticker, choisissez l’épaisseur ${ui('cuts.weights.thin')} et la couleur ${ui('cuts.colors.gray')} dans ${more}.`,
          `Pour une feuille remplie du même sticker, utilisez ${ui('props.fill')} : le guide pour ${link(PATHS['same-photo'], 'imprimer plusieurs fois la même photo')} l’explique.`
        ),
      },
    ],
    faq: [
      {
        q: 'Pourquoi le trait de mon image est-il rectangulaire ?',
        a: `Parce qu’elle n’a pas de parties transparentes : c’est un JPG, un PNG avec un fond ou une page de PDF. ${contour} a besoin de transparence : retirez le fond avec un autre logiciel, enregistrez l’image en PNG et ajoutez-la de nouveau.`,
      },
      {
        q: 'Puis-je envoyer le PDF à une machine de découpe ?',
        a: `Le PDF contient chaque trait sous forme de tracé vectoriel, sur la même page que les stickers, sans marques de repérage ni calque à part. Si le logiciel de votre machine importe des tracés depuis un PDF, vous pouvez essayer, mais ${app} n’a été testé avec aucune. Il est conçu pour découper à la main.`,
      },
      {
        q: 'Combien de stickers tiennent sur une feuille A4 ?',
        a: `Cela dépend de leur taille, de la ${cutMargin} et de l’espacement. Avec des marges de ${mm(f.layout.margin)}, ${mm(f.layout.gap)} d’espacement et une ${cutMargin} de ${mm(f.cutMargin)}, ${num(f.figure.count)} stickers de ${sticker} tiennent, comme sur le dessin. ${ui('bar.arrange')} les place et ajoute des feuilles si besoin.`,
      },
      {
        q: 'Que se passe-t-il avec les lettres séparées et les trous ?',
        a: `Chaque partie séparée a son propre trait, sauf si elles sont plus proches que le double de la ${cutMargin}. Avec une ${cutMargin} supérieure à la moitié de l’espace entre les lettres, un mot forme un seul sticker. Les trous, comme le centre d’un O, n’ont pas de trait.`,
      },
      {
        q: 'Quel papier utiliser ?',
        a: `Du papier autocollant au même format que la feuille choisie dans ${app} (A4, ${letter}…), adapté à votre imprimante. Avant de l’utiliser, imprimez un test sur du papier ordinaire.`,
      },
    ],
  });
}
