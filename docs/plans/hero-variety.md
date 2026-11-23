# Upstart v2 : des héros aussi variés que les commerces

## État (2026-11-23) : les cinq suggestions appliquées et mesurées, puis le geste par caractère (Q444)

| Suggestion | Fait | Commits |
|---|---|---|
| 1. Le banc élargi : six commerces opposés, Claude et Gemini, la variété comptée (Q439) | ✅ | f547e10, 312a439 |
| 2. Sept héros de compositions nouvelles, seize en tout (Q440) | ✅ | 939ec69 |
| 3. Le skill et la galerie parlent des mêmes gestes (Q441) | ✅ | 88694d3 |
| 4. Les exemples des skills ne poussent plus vers un seul look (Q442) | ✅ | 1d131f3 |
| 5. L'agent peut réécrire la structure du héros (Q443) | ✅ | b2dcd4c |
| Mesure et consignation | ✅ | ef063c8 |
| 6. Le geste suit le caractère du commerce, plus son métier (Q444) | ✅ | d06be62 |

Mesuré le 2026-11-23 avec le banc, six commerces par agent :

| | Claude avant | Claude après | Gemini avant | Gemini après |
|---|---|---|---|---|
| Héros différents sur 6 | 4 (éditorial ×3) | 6 | 3 (éditorial ×4) | 6 |
| Polices de titre différentes | 6 | 6 | 3 (Cormorant ×4) | 4 |
| Titres en serif | 4 | 1 | 5 | 3 |
| Sites sombres | 2 | 2 | 1 | 1 |
| Temps pour les six | 2 316 s | 2 479 s | 1 388 s | 1 250 s |

Après, chaque site s'ouvre sur le geste que le skill donne à son caractère, chez les deux agents : mosaïque pour la pâtisserie, giant type pour le tatoueur, déclaration sombre pour le bar, index pour la notaire, écran partagé pour l'escalade, photo pleine page pour le mariage. Le giant type dans une police large dépassait de quelques pixels sa règle sur ordinateur : son titre est un peu plus petit (`12vw`, `11rem` au plus).

Restait ouvert après cette mesure :
- les deux agents choisissaient le même geste pour le même métier, le tableau du skill donnant un geste par métier : deux tatoueurs s'ouvriraient pareil. Tu as choisi de faire suivre le geste au caractère du commerce (Q444, ci-dessous) ;
- Gemini garde un fond crème sur cinq sites sur six.

## Le geste par caractère (Q444)

Le tableau du skill web-design décrit chaque geste par le caractère qu'il sert (bruyant et graphique, sensoriel, précis et sobre…), et ses exemples mettent un même métier sous plusieurs gestes. L'agent lit le caractère dans les mots du maker. Les exemples du skill ne nomment pas les commerces du banc, pour que le banc mesure la règle et pas un exemple.

Le banc gagne deux commerces d'un métier déjà présent : Trait Fin, un tatoueur fine line calme et sur rendez-vous, et Chou Bidou, une pâtisserie colorée que les familles aiment. Son tableau dit si chaque paire s'ouvre sur des héros différents.

Mesuré le 2026-11-23 : Gemini sur les huit commerces, Claude sur les deux paires.

| Paire | Claude | Gemini |
|---|---|---|
| Encre Sauvage / Trait Fin | giant type / overlap (réécrit en panneau clair à côté de planches botaniques) | déclaration sombre / magazine serif |
| Maison Odile / Chou Bidou | mosaïque / écran partagé | mosaïque / écran partagé |

Les deux paires s'ouvrent différemment chez les deux agents. Chez Gemini, les huit sites s'ouvrent sur sept héros différents, le tatoueur et le bar tous deux sur la déclaration sombre. Les deux agents ne s'accordent plus toujours pour un même commerce : Encre Sauvage s'ouvre sur le giant type avec Claude, sur la déclaration sombre avec Gemini. Temps : Claude 1 631 s pour quatre, Gemini 1 915 s pour huit.

## Contexte

Après le banc web-design avec Gemini (Q438), la pâtisserie et le studio d'architecture s'ouvraient pareil, avec Claude comme avec Gemini. Tu as demandé une analyse, puis d'appliquer ses cinq suggestions dans l'ordre, sur une branche.

Les causes trouvées :
- la galerie avait neuf héros, tous un titre à côté ou au-dessus d'une image, et interdisait un texte sur une image ;
- le skill web-design nommait des gestes qu'aucun héros n'avait (l'image qui chevauche son texte) : l'agent se rabattait sur le héros éditorial ;
- ses exemples amorçaient un look littéraire : un serif en tête des polices, une direction « quiet and literary », le héros éditorial dans l'exemple du skill gallery ;
- un bloc placé gardait sa structure, le héros compris.

## Le banc

`e2e/agent-design.e2e.ts` (opt-in, `UPSTART_REAL_AGENT=1`, l'agent choisi par `UPSTART_DESIGN_AGENT`, une partie des commerces par `UPSTART_DESIGN_BRIEFS`, l'étiquette par `UPSTART_DESIGN_LABEL`). Pour chaque site : le bloc qui ouvre l'accueil, ce que l'agent a demandé à la galerie pour son héros, les polices, la surface et la couleur primaire du thème. Un tableau par passage dans `e2e/.runs/agent-design/<étiquette>-<agent>.md`, et `node e2e/agent-design-sheet.ts [desktop-1|phone-1]` met les premiers écrans côte à côte.

Le « avant » a tourné sur une copie de `main` (a99bf9c) avec le banc (f547e10) et la correction de la connexion de Claude depuis un worktree (312a439), sans les suggestions 2 à 5 ; le « après » sur cette branche.
