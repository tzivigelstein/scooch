// «Questions fréquentes»: about the tool itself (each guide has its own).

import { app, link, MAX_ITEMS, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { papersSentence, photoSizesSentence } from './chrome.ts';
import { PATHS } from './paths.ts';

export function faqPage(k: Kit): SitePage {
  const { ui, num } = k;
  return {
    id: 'faq',
    lang: 'fr',
    path: PATHS.faq,
    title: `Questions fréquentes sur ${app}`,
    description: `Ce qu’est ${app}, son prix, où restent vos fichiers, les papiers et formats photo proposés, et comment imprimer en taille réelle.`,
    h1: 'Questions fréquentes',
    crumb: 'Questions fréquentes',
    kind: 'faq',
    indexable: true,
    body: `<p class="lead">Ce qu’il vaut mieux savoir avant d’utiliser ${app}. Pour chaque usage, comme plusieurs photos sur une feuille ou les photos d’identité, un guide répond à ses propres questions.</p>`,
    faq: [
      {
        q: `Qu’est-ce que ${app} ?`,
        a: `${app} est un outil web gratuit qui dispose des images et des pages de PDF sur des feuilles de papier en taille réelle et crée un PDF à télécharger ou à imprimer. Il fonctionne dans le navigateur, sans rien installer.`,
      },
      { q: 'Combien ça coûte ?', a: `Rien. ${app} est gratuit, ne demande aucun compte et n’ajoute ni filigrane ni publicité.` },
      {
        q: `Puis-je utiliser ${app} pour un travail payant ou dans mon entreprise ?`,
        a: `Oui. Vous pouvez utiliser ${app} sur ce site à toutes fins, y compris commerciales : dans une imprimerie, pour imprimer des autocollants que vous vendez ou les supports de votre entreprise. Les PDF et les impressions que vous réalisez vous appartiennent : vous pouvez les utiliser et les vendre sans payer, sans mentionner ${app} et sans demander d’autorisation. Ce qui n’est pas autorisé, c’est de commercialiser l’outil lui-même : par exemple le vendre, faire payer son accès ou publier une copie avec des publicités. Plus de détails dans les ${link(PATHS['legal-terms'], 'conditions d’utilisation')}.`,
      },
      {
        q: 'Mes fichiers sont-ils envoyés sur un serveur ?',
        a: `Non. Les images et les PDF sont ouverts et traités dans votre navigateur, et le PDF y est créé aussi. Plus de détails dans la ${link(PATHS['legal-privacy'], 'politique de confidentialité')}.`,
      },
      {
        q: 'Où sont enregistrés mes projets ?',
        a: `Dans votre navigateur, sur cet appareil. Ils s’enregistrent tout seuls pendant que vous travaillez, et vous pouvez les ouvrir ou les supprimer dans ${ui('projects.title')}. Si vous effacez les données du site dans le navigateur, ils sont perdus : gardez vos fichiers d’origine.`,
      },
      {
        q: 'Quels fichiers puis-je ajouter ?',
        a: 'Les images que votre navigateur sait ouvrir (JPG, PNG, WebP…) et les PDF. Chaque page d’un PDF est un élément.',
      },
      { q: 'Quels papiers sont disponibles ?', a: `${papersSentence(k)}.` },
      { q: 'Quels formats photo sont disponibles ?', a: `${photoSizesSentence(k)}. Vous pouvez aussi saisir n’importe quelle largeur et hauteur.` },
      {
        q: 'Comment imprimer en taille réelle ?',
        a: `Appuyez sur ${ui('bar.print')} ou sur ${ui('bar.download')} et, dans la boîte de dialogue d’impression, choisissez « Taille réelle » ou « 100 % ». Pour en savoir plus, lisez le guide pour ${link(PATHS['actual-size'], 'imprimer une image en taille réelle')}.`,
      },
      { q: 'Peut-on l’utiliser sur un téléphone ?', a: 'Oui, dans le navigateur du téléphone ou de la tablette, sans rien installer.' },
      { q: 'Combien d’éléments puis-je ajouter ?', a: `Jusqu’à ${num(MAX_ITEMS)} éléments par projet, sur autant de feuilles que nécessaire.` },
      {
        q: 'Peut-on l’utiliser pour des photos d’identité ?',
        a: `Oui, pour les recadrer et les imprimer au bon format. Mais chaque démarche fixe ses propres exigences (format, fond, cadrage) et ${app} ne les vérifie pas : renseignez-vous toujours auprès de l’organisme qui demande la photo. Consultez le guide ${link(PATHS['id-photos'], 'photo d’identité à imprimer')}.`,
      },
      {
        q: 'Puis-je ouvrir l’éditeur déjà configuré depuis un lien ?',
        a: `Oui. Les guides ont des boutons qui ouvrent l’éditeur avec le papier, la marge et le format photo déjà réglés. Un nouveau projet est toujours créé : ceux que vous aviez restent enregistrés dans ${ui('projects.title')}.`,
      },
      {
        q: 'Le code source est-il disponible ?',
        a: `Le code source est publié sous la licence PolyForm Noncommercial 1.0.0 : vous pouvez l’utiliser, l’étudier et le modifier à des fins non commerciales. Le texte complet se trouve dans la ${link(PATHS['legal-license'], 'licence du code')}.`,
      },
    ],
  };
}
