# Upstart v2 : plan des templates (étape 5)

## État (2026-11-22) : terminé

| Tranche | Fait | Commits |
|---|---|---|
| 0. Le mode visiteur par défaut | ✅ | 68f173f |
| 1. Le runtime : scripts et feuille d'un site | ✅ | 88544e2 |
| 2. L'agent et le JavaScript | ✅ | 8af328f |
| 3. Le format d'un template et ses contrôles | ✅ | ee7712f |
| 4. Le skill `making-templates` | ✅ | 8db5278 |
| 5. Vague 1 : huit templates | ✅ | db2605f, 3fafc81, f05093c, d60f705, 8052230, 629f4cd, f029e5a, fcf74c5 |
| 6. L'écran de départ | ✅ | 16e297a |
| 7. Partir d'un template et l'adapter | ✅ | 0f1c51f |
| 8. L'onglet Blocks : « Ce design » | ✅ | 94dcae8 |
| 9. Distribution et import | ✅ | f60b9bb |
| 10. Ensemble, agent réel, app empaquetée | ✅ | 28c7644 (templates devenus un sous-module, Q267) |

Après ce plan : les vagues 2, 3 et 4 de templates, soit 28 templates dans la release v13 (2026-11-22). Les briefs sont dans `docs/template-briefs/`.

## Contexte

La conception est faite : Q229 à Q256, dans `docs/v2.0-decisions.md`, section « Templates (build step 5) », plus l'ADR 0011 (un site peut avoir du JavaScript).

Le but :
- 30 à 50 templates, en vagues, surtout des designs originaux et animés ;
- les quatre premiers originaux viennent dans une première vague de huit ;
- un skill pour les fabriquer, ici et chez des auteurs externes ;
- un écran de départ où l'on choisit un template, puis l'agent l'adapte.

La tournée de découverte et le polish de l'étape 5 viendront après ce plan.

### Ce qui existe aujourd'hui

**Démarrer un site**
- « New website » ferme le projet (`projects:close`).
- Le premier message crée le projet (`conversation:send`, `projects.create(projectNameFrom(message))`). L'agent part de rien.

**La page**
- `previewHead` et `exportHead` (`packages/runtime/src/head.ts`) mettent daisyUI, Tailwind, htmx et le thème dans le `<head>`.
- Les pages n'ont aucun script, et les instructions de l'agent interdisent le JavaScript.
- L'aperçu se met à jour par Idiomorph (`preload/preview.ts`, `render`).

**Les blocs**
- La galerie vit dans `apps/desktop/gallery/<kind>/<id>/` : `block.liquid`, `block.json`, `data/`, `detail.liquid`, `fragments/`.
- Elle est lue par `main/gallery/catalogue.ts` et contrôlée par `gallery.test.ts`.
- Vignettes et aperçu passent par `/__up/block/<id>`.

**Les skills**
- Ceux livrés avec l'app sont dans `apps/desktop/skills/`, ceux d'un projet dans `.upstart/skills/`. `main/skills/skills.ts` les lit.

**Les modes de l'aperçu**
- Visiteur par défaut depuis Q253 (en cours dans ce tour) : un site s'ouvre en mode visiteur.
- Glisser un bloc ou une image fait passer en mode édition (Q254).

## Règles de travail (inchangées)

- Lancements hors écran (`UPSTART_BACKGROUND=1`).
- Un commit par tranche sur `main`, sans attribution, poussé sur `origin/main`.
- Toute nouvelle question de conception passe par AskUserQuestion, à partir de Q257.
- Vérification avec l'agent réel à la fin seulement (elle coûte votre abonnement).
- Créer le dépôt public des templates est une action visible de l'extérieur : je vous demande avant.

## Choix techniques retenus (sans nouvelle décision de produit)

**Le JavaScript et la feuille d'un site (ADR 0011, Q234, Q237, Q243)**
- `scripts/lib/*.js` : les bibliothèques embarquées, chargées en premier, par ordre de nom.
- `scripts/libraries.json` : les bibliothèques données par adresse (Q241), avec `{ name, url, licence }`.
- `scripts/*.js` : des modules ES qui exportent `start(root)`, et éventuellement `stop(root)`.
- Un petit script d'Upstart, `up-start.js`, servi comme htmx :
  - il importe ces modules ;
  - il appelle `start(document)` au chargement, puis `start(cible)` après chaque swap htmx et après chaque mise à jour de l'aperçu ;
  - l'aperçu émet pour cela un événement à lui après le morph.
- `styles/*.css` : la feuille du site, chargée après le thème. À l'export, elle est compilée avec Tailwind, pour que `@apply` et les variables du thème y marchent.
- **Mode édition (Q242)** :
  - la page est rendue sans aucun de ces scripts ;
  - une feuille d'Upstart y arrête animations et transitions ;
  - passer en visiteur recharge la page avec ses scripts.
- **Les conventions imposées par le skill et les contrôles** :
  - un état caché « jusqu'à l'apparition » est posé par le script, jamais par la feuille seule ;
  - `prefers-reduced-motion` est toujours respecté.

**Un template sur le disque (Q240)**
C'est un dossier de projet ordinaire, plus :
- `template.json`, validé par un schéma zod. Il contient :
  - `id`, `name`, `description`, `category` (commerce, portfolio, blog, event, launch, app, original…) ;
  - `author`, `licence` ;
  - `pictures` : des vignettes en images fixes, plus une courte séquence animée pour le survol ;
  - les crédits des images ;
  - les bibliothèques et leur licence ;
- `blocks/` : ses blocs, au format de la galerie, avec la liberté de Q256 et de sa propre feuille ;
- `.upstart/skills/<id>-design/SKILL.md` : ses notes de design pour l'agent (Q239) ;
- ses images dans `media/`, avec leur `media/<x>.json` de crédits (Q231).
- Au départ d'un site, tout est copié dans le nouveau projet sauf `template.json`. Le projet garde `template: <id>` dans son fichier `.upstart`, pour la vérification de fin d'adaptation.

**Les contrôles d'un template (`templates.test.ts` et la commande `template:check`)**
- le manifeste est valide ;
- chaque page se rend sans note d'erreur sous son thème ;
- les crédits des images et les licences des bibliothèques sont présents ;
- il n'y a aucune image distante ;
- chaque module de `scripts/` exporte `start` ;
- les notes de design sont présentes ;
- les couleurs viennent du thème (Q234) : la feuille et les blocs ne contiennent aucune couleur en dur, hors transparences et dégradés construits sur les variables du thème.

**Les photos d'un template (`template:shoot`)**
- L'app est lancée hors écran.
- Chaque page est prise en largeur bureau et téléphone, en mode visiteur.
- La séquence de survol est une suite d'images capturées pendant l'animation, assemblée en WebP animé.
- Le tout donne une planche à relire.

**La distribution (Q247, Q250)**
- Le dépôt public `upstart-gg/upstart-templates`, créé le 2026-11-13 (`upstart-gg/templates` est celui de l'ancien Upstart : on n'y touche pas). Chaque version publie :
  - `catalogue.json` (manifestes, empreinte sha256 et taille de chaque .zip) ;
  - les vignettes ;
  - un .zip par template.
- Le dépôt est la seule source des templates, en sous-module à `apps/desktop/templates` (Q267) ; sa CI construit chaque version sur un tag (catalogue, vignettes, .zip attachés à la release GitHub). Les .zip ne sont jamais versionnés (Q265).
- L'app embarque un instantané du catalogue et des vignettes, puis regarde la dernière version au démarrage.
- Un template est téléchargé dans le cache de l'app quand on le voit en grand ou qu'on le choisit. Son empreinte est vérifiée.
- Hors ligne, un message s'affiche, et le départ sans template reste possible.
- Un template importé (Q236) est copié dans le dossier de l'app. L'import montre seulement son nom et ses images (Q248).

## Tranches

### 0. Le mode visiteur par défaut (Q253 à Q255), en cours
- L'aperçu s'ouvre en visiteur, et glisser un bloc ou une image fait passer en édition.
- Les e2e qui supposaient l'édition par défaut sont adaptés.
- Un e2e vérifie le nouveau défaut et le passage automatique.

### 1. Le runtime : scripts et feuille d'un site (ADR 0011)
- **`head.ts`** :
  - dans l'aperçu : les bibliothèques par adresse, `scripts/lib`, la feuille, `up-start.js` et les modules, en mode visiteur seulement, plus la feuille qui arrête le mouvement en édition ;
  - à l'export, la même chose.
- **Le runtime** sert `scripts/` et `styles/`.
- **Le builder** copie `scripts/`, compile `styles/` avec Tailwind et ajoute `up-start.js`.
- **`preload/preview.ts`** :
  - après le morph, il émet l'événement de redémarrage ;
  - au changement de mode, il recharge la page.
- **La vérification de l'isolation (ADR 0011)** : un e2e où un script hostile de la page tente d'atteindre le pont de l'éditeur et l'app. On regarde ce qu'il obtient. Si ça fuit, je corrige avant d'aller plus loin et je vous le dis.
- **Tests** :
  - unitaires : le head, l'export ;
  - e2e : un module démarre en visiteur, pas en édition ; il redémarre après un swap htmx et après une mise à jour ; une bibliothèque par adresse est chargée.

### 2. L'agent et le JavaScript
- **`instructions.ts`** : ce qui interdit le JS devient « où il va et comment il démarre ».
- **Un skill livré, `site-scripts`** :
  - les modules `start`/`stop` ;
  - les bibliothèques de la liste vérifiée (Motion, Lenis, Splitting, Swiper, OGL : licences vérifiées avant de les lister) ;
  - le mouvement réduit ;
  - l'état caché posé par le script.

### 3. Le format d'un template et ses contrôles
- `main/templates/manifest.ts` (le schéma), `reader.ts` (dossier ou .zip) et `templates.test.ts` sur chaque template du dépôt de dev (`apps/desktop/templates/`, en attendant le dépôt public).
- Les commandes `pnpm template:check <dossier>` et `pnpm template:shoot <dossier>`. Elles servent à Claude Code ici et sont décrites pour les auteurs.

### 4. Le skill `making-templates` (Q232, Q252)
- Un skill livré avec l'app, qui sert quand le projet a un `template.json`. Il est aussi exposé à Claude Code dans ce dépôt (`.claude/skills/making-templates` pointe vers le même fichier).
- **Ses étapes** :
  1. étudier les tendances, en inspiration seulement, jamais en copie d'un site précis ;
  2. écrire le brief (concept, typographie, palette, mouvements, pages) et le faire valider par l'auteur ;
  3. écrire les blocs du template, la feuille, les scripts, les pages, les enregistrements et les notes de design ;
  4. chercher les images avec `find_images` et `use_image`, crédits compris ;
  5. lancer les contrôles, puis les photos.
- **Avant de l'écrire**, je vérifie que l'agent d'Upstart peut lire le web pour la recherche (outils actuels de la session). Sinon, je vous pose la question.

### 5. Vague 1 : huit templates, faits ici avec le skill
- Les quatre standard (commerce local, portfolio, blog, page de lancement), puis les quatre originaux.
- **Pour chacun** :
  - le brief vous est soumis ;
  - je construis ;
  - je fais la planche (bureau, téléphone, séquence de survol) et je vous l'envoie ;
  - je corrige ;
  - un commit par template.
- Ce sera le vrai banc d'essai du skill : je le corrige au fil de la vague.

### 6. L'écran de départ (Q245, Q249)
- **Sans projet ouvert**, la fenêtre a la barre latérale et un seul grand panneau :
  - la grille des templates, avec des puces de catégorie, des vignettes animées au survol et un clic pour sélectionner ;
  - « Voir » ouvre le template en grand dans le panneau, en vrai, rendu par un runtime à lui, avec ses pages parcourables ;
  - « Importer un template » ;
  - la boîte de message en bas au centre, qui montre le template choisi.
- Au premier message, la fenêtre reprend sa forme habituelle.
- **e2e** : choisir, voir, envoyer, puis vérifier que la mise en page change.

### 7. Partir d'un template et l'adapter (Q229, Q246)
- **Au premier message avec un template choisi** :
  - le template est copié dans le nouveau projet ;
  - l'agent reçoit le message, le nom du template et la consigne d'adaptation : tout réécrire, remplacer les images, ajouter ou retirer des pages, garder le design ;
  - il lit les notes de design.
- **Le hook Stop** vérifie qu'il ne reste aucun texte du template : les textes des pages, des blocs et des enregistrements, comparés comme pour le lorem ipsum.
- **Tests** : unitaires (copie, liste des textes restants), puis e2e avec l'agent enregistré.

### 8. L'onglet Blocks : « Ce design » (Q235)
- Le catalogue lit aussi les `blocks/` du projet. Ils apparaissent en premier, dans un groupe à eux, avec leurs vignettes et l'aperçu au survol.
- `find_blocks` les propose d'abord à l'agent.
- **e2e** : un bloc du design est glissé dans une page.

### 9. Distribution et import (Q236, Q247, Q248, Q250)
- La création du dépôt public, avec votre accord, et un script de publication d'une version (catalogue, vignettes, .zip, empreintes).
- Le téléchargement à la demande, le cache, l'empreinte vérifiée et le cas hors ligne.
- L'import d'un dossier ou d'un .zip : ses contrôles, son aperçu (nom et images), puis la copie.
- **e2e** avec un faux serveur de catalogue.

### 10. Ensemble, agent réel, app empaquetée
- Tests, lint, tous les e2e, réempaquetage.
- **Avec l'agent réel** :
  - partir d'un template original pour un vrai cas (par exemple un studio de céramique), puis vérifier que tout est réécrit, que le design et les effets sont gardés, et qu'aucun texte du template ne reste ;
  - ~~faire fabriquer un petit template par l'agent d'Upstart~~ : retiré (Q266). La fabrication dans l'app et la soumission par pull request (compte GitHub exigé des créateurs) feront une étape à part, conçue plus tard.
- Je vous propose ensuite de l'essayer dans la fenêtre de dev.

## Ordre

Les tranches 1 à 3 viennent avant le skill (4), parce qu'il décrit le format et les scripts qu'elles fixent. Les vagues suivantes, de 22 à 42 templates de plus, se feront après ce plan, avec le même skill.

## Fichiers principaux

- **Runtime et export** : `packages/runtime/src/head.ts`, `runtime.ts`, `packages/builder/src/shared.ts`, le nouveau `up-start.js`.
- **Aperçu** : `apps/desktop/src/preload/preview.ts`, `preload/editor/editor.ts`, `main/preview/preview.ts`.
- **Templates** (nouveaux) : `apps/desktop/src/main/templates/`, et `apps/desktop/templates/` pour la vague 1.
- **Agent** : `main/agent/instructions.ts`, les hooks dans `main/index.ts`, et les skills `skills/site-scripts/` et `skills/making-templates/`.
- **Interface** : le nouvel écran de départ (`StartPanel.tsx`), `App.tsx`, `BlocksTab.tsx`, `main/gallery/catalogue.ts`.
- **Tests** : `templates.test.ts` (nouveau), et les e2e `scripts.e2e.ts`, `start.e2e.ts`, `templates.e2e.ts` (nouveaux).
