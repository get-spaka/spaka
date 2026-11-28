# Spaka v2 : ajuster une image dans son cadre

## État (2026-11-27) : fait, vérifié sur des images d'essai

| Partie | Fait |
|---|---|
| La formule du cadrage, partagée entre l'aperçu et l'écriture (`apps/desktop/src/shared/frame.ts`) | ✅ |
| L'écriture en classes Tailwind du `<img>`, par format d'affichage (`main/editing/edits.ts`, action `image-frame`) | ✅ |
| Le panneau dans l'aperçu, le glisser, l'aperçu en direct (`preload/editor/editor.ts`) | ✅ |
| Tests unitaires et de bout en bout (`e2e/media.e2e.ts`) | ✅ |
| Essai sur les images des templates (coins arrondis, effets de survol) | à faire |

## Le besoin

Sur une image sélectionnée, la barre ne proposait que « Replace… ». Quand l'image n'a pas les proportions de son cadre, rien ne permettait de choisir ce qu'on en voit sans passer par l'agent.

## Ce qui est fait (Q547)

Le bouton « Adjust the image » ouvre un panneau sous l'image :

- un curseur de zoom, de 100 à 300 % ;
- neuf boutons en carré : par où l'image est tenue dans son cadre ;
- les proportions du cadre, du plus large au plus haut : Auto (la forme que la page donne), 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16 ;
- Reset, Cancel, Save ;
- en tête, « For » : Desktop, Tablet, Phone, tous cochés au départ.

Tant que le panneau est ouvert, l'image se fait aussi glisser dans son cadre. Chaque geste se voit sur l'image elle-même ; Save écrit une fois (une version), Cancel ou Échap remettent l'image comme avant.

## Les choix

- **Seulement les images écrites dans le template pour un seul endroit.** Une image d'une liste ou d'une fiche partage son `<img>` avec toutes les autres : pas de bouton, c'est à l'agent.
- **Partout, sauf exception.** Le réglage vaut pour les trois formats ; le format que l'aperçu affiche est toujours coché, et décocher les autres règle l'image à part sur ce format. Pour un autre format, on l'affiche dans l'aperçu et on rouvre le panneau. Trois réglages indépendants : trop à tenir en tête. Un seul pour tous : il écrasait ce que les templates prévoient par largeur d'écran (une image sur cinq environ).
- **Écrit en classes Tailwind du `<img>`**, marquées importantes (`object-cover!`, `aspect-[4/3]!`, `[transform:scale(1.4)]!`…) pour l'emporter sur celles du template sans les lire ni les retirer. Téléphone < 768 px (`max-md:`), tablette jusqu'à 1023 px (`md:max-lg:`), ordinateur à partir de 1024 px (`lg:`). Chaque format a son réglage entier sous sa variante ; les voisins identiques la partagent (`max-lg:`, `md:`), et les trois n'en ont pas.
- **L'aperçu en direct** passe par le `style` de l'image, en `important`, le temps du réglage ; à Save le rendu le remplace par les classes, que le Tailwind de l'aperçu compile.
- **Le zoom se suffit à lui-même** : `transform: scale(z)` depuis le point tenu, et `clip-path: inset(…)` qui recoupe l'image à son cadre. Parts coupées : gauche = x·(1 − 1/z), droite = (1 − x)·(1 − 1/z), de même en hauteur. Les coins arrondis de l'image sont repris dans le `round` du `clip-path`, divisés par z.
- **Glisser** : Δx = dx / (largeur du cadre − z × largeur affichée de l'image) ; un axe sans marge ne bouge pas.
- **Ce n'est pas l'inspecteur** que les décisions écartent : un panneau de la barre de plus, pour une seule chose.

La description de l'image (`alt`) n'est pas dans le panneau : elle reste celle du fichier, dans la médiathèque.

« Show it whole » a été essayé puis retiré : des bandes vides autour d'une photo, et un choix de plus à comprendre. Le panneau laisse la façon de remplir au template (un logo montré en entier le reste) et ne met « remplir » que si des proportions déformeraient l'image.

Le format est la largeur de la page, pas l'appareil choisi dans la barre : un site publié ne connaît que la largeur dont il dispose. Le panneau le dit par une ligne quand l'appareil est tourné.

| Vue de l'aperçu | Largeur | Format réglé |
|---|---|---|
| Téléphone, debout | 393 px | Phone |
| Téléphone, tourné | 852 px | Tablet |
| Tablette, debout | 820 px | Tablet |
| Tablette, tournée | 1180 px | Desktop |

Une image zoomée déborde de son cadre pour la mise en page, même recoupée à l'œil : mesuré en vue tablette, une image pleine largeur porte la page de 820 à 1027 px à 160 %, 1568 px à 300 %. Rien de ce qu'on pose sur l'image ne l'empêche. La feuille de base (`ZOOMED_IMAGE`, `packages/runtime/src/theme.ts`) fait donc couper ce qui dépasse par l'élément qui contient l'image ; `body` en est exclu. Le format affiché se lit par les requêtes de largeur des classes (`matchMedia`), pas par `innerWidth`, qui grandit avec le débordement sur mobile : c'est ce qui fermait le panneau vers 150 %.

## Limites connues

- L'élément qui contient une image zoomée coupe aussi ce qui dépassait de lui par ailleurs (l'ombre ou le décor d'un voisin).
- Une image zoomée placée directement dans `body` n'est pas coupée.

- Les proportions n'ont pas d'effet là où le template fixe la largeur et la hauteur.
- Les coins repris sous un zoom sont ceux du format affiché au moment du réglage.
- Un thème qui déplace les points de rupture de Tailwind déplace les formats avec eux.
- Un effet de survol qui agrandit l'image déborde du découpage si le parent ne coupe pas déjà.
- Les images de fond en CSS ne sont pas concernées.
- Une image sans taille propre (certains SVG) ne se fait pas glisser.

## Vérification

`pnpm check`, puis `pnpm exec vitest run --config e2e/vitest.config.ts media visual-editing images-field` ; capture du panneau dans `e2e/.runs/image-frame.png`.
