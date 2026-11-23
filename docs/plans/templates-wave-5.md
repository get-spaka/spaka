# Upstart v2 : la vague 5 de templates

Décidée avec Matt le 2026-11-23 (Q450-Q474, consignées dans `docs/v2.0-decisions.md`, « Templates (build step 5) »). Le vocabulaire (vague, lot, brief, move, effet signature, niveau de mouvement) est dans `GLOSSARY.md`.

## État (2026-11-23) : lot 1 fusionné (Batten, Covered, Dogear), lot 2 à lancer

| Tranche | Fait | Commits |
|---|---|---|
| 0. L'inventaire des 28 et la règle du skill | ✅ | (avec les briefs) |
| 1. Les tendances, sujet par sujet | ✅ | (notes de travail, reprises dans chaque brief) |
| 2. Les neuf briefs, approuvés ensemble | ✅ | c644b24 |
| 3. Lot 1 : Batten (théâtre), Covered (SaaS), Dogear (librairie) | ✅ | templates ec350d9 (Dogear), d8e01b5 (Covered), 11a72bf (Batten) ; inventaire et pointeur (ce commit) |
| 4. Lot 2 : Heats (modèle open source), Strum (école de musique), Spindle (restaurant) | | |
| 5. Lot 3 : Ruled (formation), Bolster (yoga), Overhead (coworking) | | |
| 6. Release v14 et pointeur | | |

## D'où l'on part

Le plan initial (Q230) visait 30 à 50 templates, en vagues, « surtout des designs originaux et animés ». Il ne reste aucun sujet en attente : les quatre vagues ont fait tous les sujets choisis, y compris les quatre que la vague 3 avait gardés pour la vague 4 (fleuriste, domaine viticole, CV, food truck). La release v13 compte 28 templates : 16 business, 5 portfolio, 3 event, 2 blog, 1 launch, 1 app.

## Ce que la vague 5 fait

**Neuf templates, 37 en tout (Q450, Q462).** Quatre hors de la catégorie business, pour remplir les plus minces (Q451, Q455, Q459), et cinq commerces qu'aucun des 28 ne sert (Q456, Q460) :

| Sujet | Catégorie | Ce qui le distingue des 28 |
|---|---|---|
| Un logiciel SaaS pour des équipes non techniques (Q463) | app | un produit déjà lancé : fonctionnalités, intégrations, tarifs par siège, essai, démo, clients. Pocket est une app mobile grand public, Beacon une page d'attente |
| Un projet open source | app | un outil de développeur : installation, documentation, sponsors, contributeurs |
| La saison d'un théâtre | event | une troupe ou une petite scène : les spectacles, les dates, l'abonnement. Marquee est un festival, Plinth une exposition |
| Une formation en cohorte | launch | un cours en ligne qui ouvre ses inscriptions : programme, dates, formateur, inscription |
| Une école de musique (Q461) | business | instruments et niveaux, professeurs, auditions d'élèves, location d'instruments |
| Une librairie indépendante | business | coups de cœur, rencontres d'auteurs, commande à retirer |
| Un studio de yoga ou de pilates | business | cours et planning, professeurs, carnets et abonnements, retraites |
| Un restaurant de quartier | business | la carte, les plats du jour, la réservation, l'emporter. Ember est un bar à vin du soir, Saucer un café de jour |
| Un coworking | business | postes et bureaux, formules, visite à réserver, la communauté |

Écartés : un blog de recettes, un blog de voyage, un auteur, un club de sport amateur, un garage, un vétérinaire ou toiletteur, une école de langues (trop proche de la formation), un cabinet dentaire (trop proche de Mend).

**Plus de « standard » ni d'« original » (Q454).** Ces mots ne vivaient plus que dans les briefs des vagues 1 à 3, depuis que Q396 a retiré `original` des manifestes, et la vague 4 ne les utilisait déjà plus. Chaque brief fixe son **niveau de mouvement** selon le caractère du commerce, parmi les quatre du skill web-design : still, gentle, expressive, orchestrated. Les templates ont en plus un cinquième niveau, au-dessus d'orchestrated (Q467) : **immersive**, où toute la page est une histoire qui se déroule au scroll (défilement de côté, transitions entre pages, une scène WebGL sur toute la page), comme bougent déjà Reel, Seam, Chalk et Pocket. La limite du skill web-design, « un moment orchestré par page », ne s'y applique pas. Chaque page reste lisible au téléphone et complète sous reduced motion et en mode édition. Les sites de l'agent gardent les quatre niveaux. La vague compte au moins trois niveaux, au moins deux templates expressive ou au-delà, et au moins un immersive, pour garder l'intention de Q230.

**Ce qu'aucun template de la vague ne partage avec un autre** : le sujet, les polices, l'effet signature (règles des vagues précédentes) et maintenant le **move** du héros, choisi parmi les onze du skill web-design (Q453). Les polices et les moves sont aussi comparés aux 28 : une police déjà livrée n'est pas reprise, et un move déjà pris n'est repris que si sa composition reste différente.

**Les images générées (Q452).** Chaque brief dit où une illustration, une texture ou une scène d'ambiance générée sert mieux son style qu'une photo libre, et les demande là. C'est `pnpm template:image generate`, payé par la clé du `.env`. Jamais l'équipe, une vraie personne, un logo ou du texte. Le template demande alors l'app 0.2.0.

**Comment on construit (Q457, Q458, Q464).** Les neuf briefs sont écrits dans cette session et approuvés ensemble. Ensuite chaque template est construit par une session à lui, dans sa worktree et sur sa branche `template/<id>` de upstart-gg/upstart-templates, trois à la fois, en lots mélangés. Chacun est relu ici, puis mergé à son tour dans le main des templates. Une seule release, v14, à la fin. Le pointeur du submodule passe par une PR de upstart-editor.

**Les contrôles (Q465).** Ceux des vagues 2 à 4 : `template:check`, `template:shoot` et sa feuille de relecture, `e2e/templates-again.e2e.ts`. Pas d'adaptation par l'agent réel.

## Tranches

### 0. L'inventaire des 28 et la règle du skill

- `docs/template-briefs/inventory.md`, une ligne par template :
  - le nom et la catégorie ;
  - le niveau de mouvement, lu dans le brief et le code ;
  - le move du héros ;
  - l'effet signature ;
  - les polices, d'après les `@font-face` ;
  - la couleur primaire et la teinte qui lui « appartient » (le violet est à Transfer, le pourpre raisin à Coteau, l'indigo à Cursus…).
- Les niveaux et les moves des 28 sont attribués après coup : je les relis dans les briefs et les pages, et je les marque ainsi.
- Le skill making-templates :
  - le brief donne déjà son move, et depuis l'écriture de ce plan son niveau de mouvement et son effet signature ;
  - il gagne : avant d'écrire un brief, on lit l'inventaire ; après le merge d'un template, on y ajoute sa ligne.
- **Fini quand** l'inventaire a ses 28 lignes, et que le skill et l'index des plans sont à jour.

### 1. Les tendances, sujet par sujet

- L'étape 1 du skill, pour les neuf sujets : au moins huit sites récents par sujet (Awwwards, Siteinspire, Land-book, Godly, Lapa Ninja, One Page Love), et de trois à six tendances vues chacune sur au moins deux sites, avec leurs adresses.
- Neuf subagents en parallèle, un par sujet ; leurs listes reviennent ici. Ce sont des sources d'inspiration, jamais la mise en page d'un site.
- **Fini quand** chaque sujet a sa liste de tendances.

### 2. Les neuf briefs, approuvés ensemble

- Un brief par template dans `docs/template-briefs/<id>.md`, au format de l'étape 2 du skill, plus :
  - le niveau de mouvement et le move ;
  - l'effet signature ;
  - les images libres et générées ;
  - le nom, vérifié contre les produits et les templates du commerce (Framer, Webflow, ThemeForest, BigCommerce… comme pour Transfer et Chalk).
- Les commerces fictifs sont écrits en anglais, à l'orthographe américaine, dans des lieux différents.
- Vérifié sur les neuf ensemble :
  - aucun sujet, police, effet signature ou move partagé ;
  - au moins trois niveaux de mouvement, au moins deux templates expressive ou au-delà, et au moins un immersive ;
  - aucune police livrée par les 28 ;
  - aucune teinte déjà prise ;
  - le SaaS et l'open source ne se ressemblent pas.
- Je te les présente ensemble. Tes corrections sont écrites dedans, et l'approbation est consignée dans les décisions, comme pour la vague 4.
- Les briefs et l'inventaire passent par une PR de upstart-editor (case non cochée), mergée avant les sessions : elles partent de main et y trouvent leur brief.
- **Fini quand** les neuf briefs sont approuvés et mergés.

### 3 à 5. Les trois lots

| Lot | Templates |
|---|---|
| 1 | Batten (théâtre), Covered (SaaS), Dogear (librairie) |
| 2 | Heats (modèle open source), Strum (école de musique), Spindle (restaurant) |
| 3 | Ruled (formation), Bolster (yoga), Overhead (coworking) |

Pour chaque lot :
- Trois sessions, lancées d'ici, une par template, chacune dans sa worktree partant de main, avec un brief court :
  - le chemin de son brief approuvé ;
  - les étapes 3 à 5 du skill making-templates ;
  - sa branche `template/<id>` dans le submodule, poussée sur upstart-gg/upstart-templates ;
  - fini quand `template:check` ne trouve rien, que `template:shoot` a fait ses photos et sa feuille de relecture sans rien relever, et que `templates-again` passe sur ce template.
- Je relis chaque template ici : la feuille de relecture, les pages en mouvement et sous reduced motion, le guide `TEMPLATE.md` et les notes de design, les crédits et les images générées.
- Ce que je trouve repart à sa session. Une fois le template bon, il est mergé dans le main des templates, à son tour, et sa ligne entre dans l'inventaire.
- Le lot suivant part quand les trois sont mergés, ce qui laisse corriger le skill entre deux lots.
- **Fini quand** les trois templates du lot sont sur le main des templates.

### 6. Release v14 et pointeur

- `pnpm template:release` en local d'abord, avec le catalogue de v13, puis le tag v14 et la CI du dépôt des templates : 37 templates, Latest.
- Le pointeur du submodule passe sur ce commit par une PR de upstart-editor (case non cochée), avec le tableau d'état et les décisions à jour.
- **Fini quand** v14 est publiée et la PR du pointeur mergée.

## Ce qui reste hors de ce plan

- La vague 6, de 0 à 13 templates de plus pour atteindre 50. Les sujets écartés ci-dessus en sont les premiers candidats.
- La fabrication de templates dans l'app par les makers (Q266), conçue plus tard.
