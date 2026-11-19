_En cas de divergence entre cette traduction et la
[version espagnole](../privacidad.md), c’est la version espagnole qui fait foi._

# Politique de confidentialité

En vigueur à compter du 19 novembre 2026.

## En bref

- Vos fichiers ne quittent pas votre navigateur. Nous ne les envoyons sur
  aucun serveur, ne les voyons pas et ne les conservons pas.
- Il n’y a ni compte ni inscription.
- Ce que Scooch enregistre reste sur votre appareil, et vous pouvez l’effacer
  quand vous voulez.
- Comme pour tout site web, le prestataire qui héberge Scooch (Vercel) reçoit
  des données techniques de chaque visite.

## Qui est responsable

Tzivi Santiago Gelstein propose Scooch. Lorsque cette politique dit _nous_,
elle le désigne. Vous pouvez nous écrire à
[gelsteintzivisantiago@gmail.com](mailto:gelsteintzivisantiago@gmail.com).

## Vos fichiers

Les images et les PDF que vous ajoutez sont ouverts et traités dans votre
navigateur. Scooch ne les envoie à aucun serveur : ni à nous ni à personne
d’autre.

Le PDF que vous téléchargez ou imprimez est lui aussi créé dans votre
navigateur. À l’impression, le navigateur l’envoie à l’imprimante que vous
choisissez, comme n’importe quel autre document.

Il en va de même pour les images que vous collez dans Scooch : elles sont
traitées comme un fichier que vous ajoutez. Quand vous copiez ou coupez des
éléments, Scooch ne place dans le presse-papiers de votre système qu’une ligne
de texte (par exemple « 2 éléments de Scooch ») et l’heure de la copie, pas
les images.

## Ce qui est enregistré sur votre appareil

Pour que vous ne perdiez pas votre travail et pour retenir vos préférences,
Scooch enregistre des données dans le stockage de votre navigateur : IndexedDB
et localStorage. Ces données restent uniquement dans ce navigateur, sur cet
appareil. Elles ne sont envoyées ni à nous ni à personne d’autre. Scooch
n’enregistre pas de cookies.

### Vos projets

Dans la base de données `scooch` d’IndexedDB :

- **Projets.** Pour chaque projet : son nom ; quand il a été créé, quand il a
  été enregistré et quand vous l’avez ouvert pour la dernière fois ; combien
  de feuilles et d’éléments il contient ; une miniature de la première
  feuille, pour la liste des Projets, et le document. Le document contient les
  feuilles, le papier, la marge, l’espacement, la rotation automatique, si le
  chevauchement des éléments est autorisé, les traits de coupe et, pour chaque
  élément, sa position, sa taille, sa rotation et son recadrage, avec le nom
  et les dimensions du fichier dont il provient.
- **Fichiers.** Les fichiers d’origine que vous avez ajoutés (images et PDF),
  un aperçu de chaque élément et, si nécessaire, une version convertie de
  l’image pour l’inclure dans le PDF. Chaque fichier n’est enregistré qu’une
  fois, même si plusieurs éléments ou plusieurs projets l’utilisent : pour le
  reconnaître, votre navigateur calcule une empreinte de son contenu (un
  _hash_), qui ne quitte pas non plus votre appareil.
- **Historique d’annulation.** Les dernières étapes de chaque projet (jusqu’à
  50), pour qu’Annuler et Rétablir continuent de fonctionner si vous rechargez
  la page ou rouvrez le projet. Il comprend les éléments que ces étapes
  peuvent faire revenir, avec leurs fichiers, même si vous les avez déjà
  retirés de la feuille.
- **Éléments coupés.** Les éléments que vous avez coupés avec Couper et pas
  encore collés, avec leurs fichiers, pour qu’ils ne soient pas perdus si vous
  rechargez la page. Ils sont effacés quand vous les collez, ou quand vous
  copiez ou coupez d’autres éléments.

Un fichier est effacé du navigateur quand plus aucun projet, aucun historique
d’annulation ni aucun élément coupé ne l’utilise.

### Préférences et données de fonctionnement

Dans localStorage, sous des noms qui commencent par `scooch:` :

- **Unités :** mm, cm ou po, selon votre choix dans les Préférences.
- **Thème :** automatique, clair ou sombre.
- **Langue :** automatique (celle de votre navigateur) ou celle que vous avez
  choisie dans les Préférences.
- **Raccourcis à 1 touche :** s’ils sont activés.
- **Affichage :** le zoom (Voir la feuille entière, Voir la largeur de la
  feuille ou le pourcentage choisi, mais jamais l’endroit où vous avez fait
  défiler) et ce que vous avez choisi dans Aligner sur et Répartir avec.
- **Grille et aimantation :** si la grille est affichée, sa taille et si
  l’aimantation est activée.
- **Sections des Propriétés :** celles que vous avez fermées, et si vous avez
  laissé ouvert Plus d’options dans les traits de coupe.
- **Impression :** si les Conseils avant d’imprimer ou de télécharger et le
  Bilan après l’impression s’affichent, ou si vous avez choisi Ne plus
  afficher.
- **Papier personnalisé :** la dernière taille de papier que vous avez saisie.
- **Actions récentes :** les 5 dernières actions que vous avez choisies dans
  Rechercher une action.
- **Conseils d’utilisation :** s’ils s’affichent, ceux que vous avez choisi
  de ne plus voir et, pour savoir quand en proposer un, combien de fois vous
  avez fait certaines actions avec un bouton ou un menu plutôt qu’avec leur
  raccourci, et lesquelles vous avez déjà faites de la manière la plus rapide.
  Ce ne sont que des chiffres et des noms d’actions, pas le contenu de vos
  projets.
- **Feuilles économisées :** le total des feuilles que vous avez économisées
  sur cet appareil, qu’affiche le bilan après l’impression ; un chiffre rond
  que vous avez atteint, si le bilan ne vous l’a pas encore montré, et la
  comparaison que doit utiliser le prochain bilan. Pour ne pas compter deux fois le même PDF, aussi une clé courte de
  chacun des 50 derniers PDF et du dernier que vous avez imprimé, qui s’ajoute
  au total plus tard. La clé est calculée à partir du contenu du PDF, mais
  elle ne permet ni de le reconstituer ni de voir ses images.
- **Invitation à soutenir :** si vous avez choisi de ne plus l’afficher.
- **Dernier projet :** le dernier projet ouvert, pour le rouvrir à votre
  retour.
- **Copie temporaire :** si vous fermez l’onglet avant la fin de
  l’enregistrement d’une modification, une copie du document ouvert (sans les
  fichiers), utilisée à votre retour et effacée une fois le projet enregistré.
- **Marque de version antérieure :** une marque interne qui indique que les
  données d’une version antérieure de l’application ont déjà été passées aux
  noms actuels.

Si le navigateur contenait des données enregistrées par une version
antérieure de l’application (sous le nom `pliego`), Scooch les passe une seule
fois aux noms ci-dessus, puis efface les anciennes. Certaines préférences
qu’enregistraient les versions antérieures peuvent rester dans le navigateur,
comme l’autorisation du chevauchement des éléments (aujourd’hui enregistrée
avec chaque projet) : Scooch ne les modifie plus, il les lit seulement pour
ouvrir les projets de cette époque tels qu’ils étaient.

Quand il enregistre un projet qui contient des éléments, Scooch demande au
navigateur de conserver ces données et de ne pas les effacer de lui-même pour
libérer de l’espace. Le navigateur décide s’il accepte. Dans Projets, Scooch
lui demande aussi combien d’espace occupent les données et combien il en
reste, pour vous l’afficher.

Si vous ouvrez Scooch dans plusieurs onglets, les onglets s’indiquent entre
eux quel projet chacun a ouvert, pour ne pas écraser les modifications des
autres. Ces messages passent par des mécanismes internes du navigateur (un
canal entre onglets et un verrou par projet) et ne quittent pas votre
appareil.

## Comment effacer ces données

- **Un projet :** dans Projets, utilisez Supprimer. Le projet est effacé du
  navigateur avec son historique d’annulation et sa copie temporaire, ainsi
  que ses fichiers, sauf ceux qu’utilise encore un autre projet ou un élément
  coupé. Cette action est irréversible.
- **Tout :** dans les paramètres de votre navigateur, effacez les données
  enregistrées par ce site. L’option se trouve généralement dans la section
  confidentialité ou données des sites, selon le navigateur. Cela efface les
  projets, leurs fichiers et leurs historiques, les éléments coupés et les
  préférences.

Dans certaines fenêtres de navigation privée, le navigateur ne permet pas
d’enregistrer des projets. Scooch vous en avertit, et ce que vous faites est
perdu à la fermeture de l’onglet.

Comme vos fichiers et vos projets se trouvent uniquement sur votre appareil,
nous ne pouvons ni les voir, ni vous les remettre, ni les effacer à votre
place.

## Ce que nous ne faisons pas

- Nous ne demandons ni compte, ni nom, ni adresse e-mail, ni aucune autre
  donnée personnelle pour utiliser Scooch.
- Scooch n’utilise ni cookies, ni publicité, ni traceurs, ni outils de
  mesure d’audience.
- Scooch ne charge rien depuis d’autres serveurs : le code, les polices et les
  bibliothèques sont servis depuis le même site.
- Nous ne vendons pas de données personnelles.

## Autres services

### Hébergement : Vercel

Le site est hébergé par Vercel. Comme pour tout serveur web, quand votre
navigateur demande les pages et les fichiers de Scooch, Vercel reçoit des
données techniques de chaque requête. Par exemple : votre adresse IP, le
navigateur et le système que vous utilisez, la page demandée, la date et
l’heure. Vercel traite ces données selon sa propre
[politique de confidentialité](https://vercel.com/legal/privacy-notice).

Vos images, vos PDF et vos projets ne font jamais partie de ces requêtes.

### Soutien : Patreon

Si l’option de soutenir Scooch apparaît et que vous ouvrez le lien Soutenir
sur Patreon, vous arrivez sur le site de Patreon, dans un autre onglet.
Scooch n’envoie à Patreon aucune donnée vous concernant ni concernant vos
fichiers. Si vous n’ouvrez pas le lien, Patreon ne reçoit rien. Ce que vous
faites sur Patreon est régi par sa
[politique de confidentialité](https://privacy.patreon.com/).

### Mesure d’audience

> **À COMPLÉTER uniquement si une mesure d’audience est ajoutée.** Aujourd’hui,
> Scooch n’utilise aucun outil de mesure d’audience. Si un outil est ajouté,
> cette section doit indiquer lequel, quelles données il recueille, dans quel
> but, s’il utilise des cookies ou d’autres identifiants, qui les traite et
> où, combien de temps elles sont conservées et comment le désactiver. Il faut
> aussi mettre à jour [Ce que nous ne faisons pas](#ce-que-nous-ne-faisons-pas)
> et la date d’entrée en vigueur, avant de l’activer.

## Mineurs

Scooch ne demande de données personnelles à personne, mineurs compris. Si
vous êtes mineur, utilisez Scooch avec l’accompagnement d’un adulte
responsable, surtout si vous allez imprimer des photos d’autres personnes.

## Modifications de cette politique

Nous pouvons mettre à jour cette politique, par exemple lorsque l’application
change. La date d’entrée en vigueur indiquée plus haut précise quelle est la
version actuelle. Si une modification touche ce qui est enregistré ou ce qui
est envoyé, nous l’expliquerons sur cette page.

## Contact

Pour toute question sur la confidentialité, écrivez à
[gelsteintzivisantiago@gmail.com](mailto:gelsteintzivisantiago@gmail.com).
