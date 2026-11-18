// «Photo d’identité à imprimer»: the app's document photo sizes, a sheet of
// copies, and the requirements the app doesn't check. Which size a procedure
// asks for is the office's to say: the page names no country or procedure
// for a size (facts/id-photos.ts).

import { idPhotosFacts } from '../../facts/id-photos.ts';
import { guide } from '../../guide.ts';
import { app, link, note, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function idPhotos({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = idPhotosFacts();
  const onA4 = (id: string) => num(f.onA4[id]);
  const passport = f.figure.piece;
  const more = f.more.map((m) => `${num(m.count)} au format ${photoName(m.id)} sur ${paperName(m.paper)}`);
  // Named where the Spanish page names «Carta» as a word, not as a fact.
  const letter = ui('papers.names.letter');

  return guide({
    id: 'id-photos',
    lang: 'fr',
    path: PATHS['id-photos'],
    title: `Photo d’identité à imprimer : une planche de copies · ${app}`,
    description: `Recadrez votre photo en ${size(4, 4, 'cm')}, ${size(3.5, 4.5, 'cm')} ou ${size(2, 2, 'in')} et remplissez une feuille A4 ou ${letter} de copies à découper. Gratuit, sans envoyer la photo.`,
    h1: 'Photos d’identité et de passeport à imprimer sur une feuille',
    crumb: 'Photo d’identité à imprimer',
    lead: `Avec ${app}, vous recadrez votre photo au format demandé pour votre démarche et vous remplissez une feuille de copies prêtes à découper. C’est gratuit et la photo ne quitte pas votre appareil : tout se passe dans le navigateur.`,
    ctas: f.open.map(({ id, href }) => ({ label: `Ouvrir au format ${photoName(id)}`, href })),
    feature:
      note(
        `Chaque démarche fixe ses propres exigences : le format, le fond, le cadrage, la taille du visage et l’acceptation ou non des photos imprimées chez soi. Avant d’imprimer, renseignez-vous auprès de l’organisme qui demande la photo. ${app} recadre et imprime au format que vous choisissez, mais ne vérifie pas ces exigences.`
      ) + sheetFigure(f.figure, `${onA4(f.figure.photo)} photos de ${size(passport.w, passport.h)} sur une feuille A4, placées par ${ui('props.fill')}`),
    sections: [
      {
        h2: `Formats inclus dans ${app}`,
        html:
          table(
            [{ head: 'Format' }, { head: 'Dimensions' }, ...f.papers.map((p) => ({ head: `Sur ${paperName(p)}`, num: true }))],
            f.rows.map((r) => [photoName(r.id), size(r.w, r.h), ...r.counts.map((n) => num(n))]),
            `Copies par feuille avec ${ui('props.fill')}, avec des marges de ${mm(f.layout.margin)} et ${mm(f.layout.gap)} d’espacement pour les découper.`
          ) +
          paragraphs(
            `Le format est fixé par l’organisme qui demande la photo, et il varie selon le pays et la démarche. Vérifiez ses exigences avant de choisir l’un de ces formats. S’il en demande un autre, choisissez Autre format dans le ${link(PATHS['how-many'], 'calculateur')} et ouvrez la feuille depuis celui-ci.`,
            ...(more.length ? [`Avec ${ui('bar.arrange')}, qui mélange photos droites et photos pivotées, il en tient parfois davantage : ${more.join(', ')}. Le ${link(PATHS['how-many'], 'calculateur')} l’indique pour chaque format.`] : [])
          ),
      },
      {
        h2: 'Comment faire',
        html:
          steps([
            `Ouvrez ${app} au format dont vous avez besoin, avec l’un des boutons ci-dessus. La feuille est réglée en A4, avec des marges de ${mm(f.layout.margin)}, ${mm(f.layout.gap)} d’espacement et des ${ui('cuts.title').toLowerCase()}.`,
            `Ajoutez votre photo avec ${ui('bar.add')}. Elle est recadrée à ce format, centrée.`,
            'Si le visage est mal cadré, double-cliquez sur la photo pour la recadrer et déplacez l’image.',
            `Une fois la photo sélectionnée, appuyez sur ${ui('props.fill')} dans l’onglet ${ui('props.tabs.piece')} des ${ui('props.title')}.`,
            `Appuyez sur ${ui('bar.print')} et choisissez « Taille réelle » ou « 100 % ». Mesurez une copie avec une règle avant de les découper toutes.`,
          ]) + paragraphs(`Vous utilisez du papier ${letter} ? Changez-le dans l’onglet ${ui('props.tabs.project')} des ${ui('props.title')} avant de remplir la feuille.`),
      },
    ],
    faq: [
      {
        q: 'Combien de photos d’identité tiennent sur une feuille A4 ?',
        a: `Avec ${ui('props.fill')}, des marges de ${mm(f.layout.margin)} et ${mm(f.layout.gap)} d’espacement : ${onA4('id-4x4')} en ${size(4, 4, 'cm')}, ${onA4('passport-35x45')} en ${size(3.5, 4.5, 'cm')} et ${onA4('visa-5x5')} en ${size(2, 2, 'in')}.`,
      },
      {
        q: 'Puis-je imprimer ma photo d’identité chez moi ?',
        a: `Oui : vous préparez la feuille dans ${app} et vous l’imprimez avec votre imprimante, de préférence sur du papier photo. Si la photo est destinée à une démarche, vérifiez d’abord que les photos imprimées chez soi sont acceptées.`,
      },
      {
        q: `Est-ce que ${app} vérifie que la photo respecte les exigences ?`,
        a: `Non. ${app} se contente de la recadrer et de l’imprimer au format que vous choisissez. Le fond, la lumière, le cadrage et la taille du visage dépendent de la photo utilisée. Les ${link(PATHS['legal-terms'], 'conditions d’utilisation')} le précisent aussi.`,
      },
      { q: `Quelle taille fait une photo de ${size(2, 2, 'in')} ?`, a: `${size(f.twoInches, f.twoInches)}, soit environ ${size(5, 5, 'cm')}. Dans ${app}, c’est le format ${photoName('visa-5x5')}.` },
      {
        q: 'Et s’il me faut un autre format ?',
        a: `Dans le ${link(PATHS['how-many'], 'calculateur')}, choisissez Autre format, saisissez la largeur et la hauteur, puis ouvrez la feuille dans ${app} : les photos que vous ajoutez sont recadrées à ce format.`,
      },
    ],
  });
}
