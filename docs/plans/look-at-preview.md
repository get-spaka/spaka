# Upstart v2 : plan de construction du regard de l'agent sur une page

## État (2026-11-22) : terminé

La conception (Q314-Q324) est dans [`docs/design/look-at-preview.md`](../design/look-at-preview.md) (c496f50).

| Tranche | Fait | Commits |
|---|---|---|
| 0. Sonde | ✅ | 9f70c10 (résultats dans `docs/spikes/`) |
| 1. La vue de l'agent | ✅ | 601c2ec |
| 2. Les étapes et la réponse | ✅ | 9ed4f31 |
| 3. Les mesures | ✅ | 0b87fc8 |
| 4. L'outil et les deux agents | ✅ | 0b87fc8 |
| 5. Vérifications | ✅ | 1aa3863 ; templates v6 (Beacon, Folio, Marquee 1.1.1) |

## Contexte

Tu as arbitré la conception le 2026-11-15, de Q314 à Q324. Elle est consignée dans `docs/design/look-at-preview.md` et dans la section « The agent looks at a page » de `docs/v2.0-decisions.md` (commit `c496f50`).

**Le problème.** Aujourd'hui, `look_at_preview` déplace ton aperçu et n'en photographie que le premier écran, à la largeur de ta colonne.

**Le but.** L'agent regarde dans une vue à lui, cachée, et il peut :
- choisir l'écran (desktop 1440×900, tablette, téléphone) ;
- descendre jusqu'à une partie de la page ;
- enchaîner des actions dont l'état est gardé jusqu'à la fin du tour : survol, clic, défilement, touches, saisie, sans jamais envoyer de formulaire, en suivant les liens du site ;
- recevoir, avec l'image, les problèmes mesurés sur l'écran regardé, chacun avec le fichier et la ligne de l'élément.

## Ce qui existe

**L'aperçu.** `main/preview/preview.ts` contient la classe `Preview`.
- Sa `WebContentsView` utilise le preload `preload/preview.cjs` et la partition `preview`.
- Les rendus lui arrivent par des messages `render`, fondus dans la page (morph, ADR 0009). Quand les scripts du site changent, la page est rechargée.
- `look()` et `lookNow()` naviguent dans la vue du client, puis appellent `capture()`, c'est-à-dire `Page.captureScreenshot` sans option : seul l'écran visible est pris.
- Les erreurs viennent de `console-message`, et les notes de `renderRoute`, `dataNotes` et `pageNotes`.
- `emulate()` émule déjà un appareil par `Emulation.setDeviceMetricsOverride`, avec `mobile: true`.
- La vue peut être « garée » hors de la fenêtre et rester dessinée (Q142).

**La grille « All pages »** (`main/preview/grid.ts`) a deux mécanismes réutilisables :
- une vue vivante, autre `WebContentsView` avec le même preload, fondue à chaque rendu ;
- une fenêtre hors écran (`offscreen: true`) pour les images. `capturePage` n'y marche pas : les images viennent de l'événement `paint`.

**L'outil.**
- `main/agent/upstart-tools.ts` définit `look_at_preview`, avec un seul champ, `route`.
- Il est branché dans `main/index.ts:372` par `look: (route) => preview.look(route)`. Le même outil sert à Claude (MCP) et à Pi.
- `activity.ts` affiche « Looking at the preview », sans détail.

**Chaque élément rendu** porte `data-up-src="fichier:ligne:offset"`, ajouté par `injectTrace` dans `packages/runtime/src/template.ts`.

**Les tests et les consignes.**
- `e2e/preview.e2e.ts:107` vérifie qu'un coup d'œil avec une adresse déplace l'aperçu. C'est à réécrire.
- Les consignes nomment l'outil dans `templates/adapt.ts` (adaptation) et dans `skills/site-scripts/SKILL.md` (erreurs de modules).
- Dans les vrais tests, l'agent a regardé 0 à 6 fois par site.

## Règles de travail (inchangées)

- Toute ouverture de l'app se fait hors écran (`UPSTART_BACKGROUND=1`), sans prendre le focus.
- Un commit par tranche sur `main`, sans attribution, poussé. `git add` avec des chemins explicites, après un contrôle des clés.
- `pnpm lint` reste propre. Les e2e tournent en arrière-plan.
- Toute nouvelle question de conception passe par AskUserQuestion, à partir de Q325.
- Les vérifications avec l'agent réel se font dans l'app empaquetée pour Claude, et avec Pi (Gemini).

## Choix techniques retenus (sans nouvelle décision de produit)

**La vue de l'agent** : `main/preview/agent-view.ts`, classe `AgentView`, détenue par `Preview`.
- C'est une fenêtre hors écran (`BrowserWindow`, `offscreen: true`, jamais montrée, 60 images/s), avec le même preload et la même partition, en mode visiteur, sans outils d'édition. La sonde (`spikes/looks/REPORT.md`) l'a préférée à une vue garée : une vue garée tombe à 4–6 images/s dès que ta fenêtre est cachée ou réduite (18 à 104 s par coup d'œil), la fenêtre hors écran garde 60 images/s dans tous les cas.
- Les images viennent de `Page.captureScreenshot` (`capturePage` ne marche pas hors écran).
- Une partie est atteinte en sautant à un écran au-dessus, puis en faisant le dernier écran à la molette (1,7 à 2,8 s par coup d'œil).
- Elle reçoit ses rendus par le même chemin que l'aperçu et que la vue vivante de la grille. `pushNow` lui envoie le rendu de sa propre route, fondu en place, ce qui garde l'état (Q324). Quand les scripts du site changent, elle recharge la page, comme l'aperçu.
- Elle ne prend jamais le clavier à l'interface : aucun `focus()`. `Emulation.setFocusEmulationEnabled` fait croire à la page qu'elle a le focus, pour Tab et `:focus-visible`.
- Navigation :
  - les liens vers le site sont suivis (Q323) et la route est mise à jour ;
  - tout autre lien, et `window.open`, sont refusés sans rien ouvrir.
- Aucun formulaire n'est envoyé (Q322). Toute requête autre que GET venant de cette vue est refusée au niveau du réseau (`session.webRequest.onBeforeRequest`, filtrée par `webContentsId`). La réponse de l'outil le signale : « a form would be sent here; nothing was sent ».
- Ses propres erreurs de console sont gardées à part de celles de ton aperçu.
- Les écrans :
  - desktop : 1440×900, à l'échelle 1 ;
  - tablette : 820×1180 à l'échelle 1, `mobile: true` (l'échelle 2 donnait une image de 3,9 Mpx, réduite par Claude et 5 à 10 fois plus lente à prendre) ;
  - téléphone : 393×852 à l'échelle 2, `mobile: true`, comme Q110.
  - Une image fait environ 1 500 tokens chez Claude.
- Cycle de vie :
  - ouverte au premier coup d'œil ;
  - marquée « à repartir de zéro » à la fin de chaque tour (Q324) ;
  - fermée après 5 minutes sans usage, ou à la fermeture du site ;
  - 230 à 320 Mo tant qu'elle est ouverte (mesuré par la sonde sur Pocket, Reel et Ember).
- Ton aperçu n'est plus déplacé par l'agent (Q314). Ce que l'adaptation entend de la page que tu regardes (Q303) n'est donc plus brouillé.

**Les étapes**, exécutées par le protocole DevTools (`webContents.debugger`).
- **Désigner un élément (Q321)** :
  - `parts/x.liquid` donne le premier élément dont `data-up-src` commence par ce fichier ;
  - `parts/x.liquid:14` donne le premier élément de cette ligne ;
  - sinon, c'est un sélecteur CSS.
- **Avant d'agir sur un élément**, il est amené à l'écran, puis contrôlé : il existe, il est visible, il n'est pas désactivé, et il n'est pas couvert (`elementFromPoint` au centre). Si un contrôle échoue, la suite s'arrête et la réponse dit pourquoi.
- **Les actions** :
  - `hover` : `Input.dispatchMouseEvent mouseMoved` ;
  - `click` : `mousePressed` et `mouseReleased` ;
  - `scroll` : `mouseWheel`, jusqu'à la partie (que Lenis et les sections épinglées suivent), ou d'un écran vers le haut ou le bas ;
  - `press` : `Input.dispatchKeyEvent`, pour Tab, Shift+Tab, Escape, Enter et les flèches ;
  - `type` : un clic dans le champ, puis `Input.insertText`.
- **Attendre que la page se pose**, après chaque étape et avant l'image : deux frames, puis le défilement stable pendant 200 ms, plus aucune animation finie en cours (`document.getAnimations`, hors animations liées au défilement) et aucun attribut `style` ou `class` changé depuis 150 ms (les animations JavaScript de Motion), avec un maximum de 2 s. Les animations sans fin (la lueur de Pocket, la lumière d'Ember) ne bloquent pas : la sonde l'a vérifié.

**La réponse**, en plus de l'image :
- la page, l'écran, « screen n of m » ;
- les parties présentes à l'écran (fichiers de `data-up-src` des sections visibles) ;
- les étapes faites ;
- les erreurs de la page, les notes de rendu, les problèmes mesurés.

**Les mesures (Q318)**, sur l'écran regardé seulement. Un script lancé dans la page une fois qu'elle s'est posée cherche :
- **un débordement latéral** : `scrollWidth > innerWidth`, et l'élément le plus large qui dépasse ;
- **un texte coupé** : une boîte en `overflow: hidden` ou `clip` dont le contenu dépasse. Les `line-clamp` et `text-overflow: ellipsis` voulus sont exclus ;
- **des éléments visibles à l'écran mais restés cachés** : opacité nulle ou `visibility: hidden` héritée, alors qu'ils ont du texte ou une image. Sont exclus `<details>` fermés, `[hidden]`, `aria-hidden`, et ce qui ne s'affiche qu'au survol ;
- **des images non chargées** ;
- **des liens vers une adresse sans page**, vérifiés par `runtime.resolve` côté main.

Chaque problème vient avec son fichier et sa ligne (le `data-up-src` le plus proche). Le bruit se règle sur les huit templates (tranche 3).

**L'outil** `look_at_preview` garde son nom. Ses entrées :
- `route` ;
- `screen` (`desktop` par défaut) ;
- `steps` : une liste de `{ hover | click | scroll | press | type }` ;
- `at` : une partie ou un sélecteur où finir, raccourci d'un `scroll` final ;
- `fresh`.

Un seul appel exécute les étapes dans l'ordre et répond par une seule image. L'outil reste en lecture seule, y compris en mode plan : il n'écrit ni fichier ni enregistrement.

## Tranches

### 0. Sonde (`spikes/looks/`, avec un `REPORT.md`)
- **Deux vues comparées** : une `WebContentsView` garée et une fenêtre `offscreen`. Pour chacune, on vérifie :
  - que Motion, Lenis et les timelines de défilement tournent ;
  - que `Page.captureScreenshot` rend la bonne image ;
  - que la molette simulée fait avancer l'histoire épinglée de Pocket et le reel de Reel ;
  - que `setFocusEmulationEnabled` donne Tab et `:focus-visible` sans prendre le focus à la fenêtre.
- **Les temps** : chargement, défilement, attente, image, aux trois écrans.
- **Mémoire** : ce que coûte la vue.
- **Le choix de la vue** est noté dans le rapport. S'il faut trancher une question de produit, je te la pose (Q325).

### 1. La vue de l'agent
- **`agent-view.ts`** :
  - les écrans ;
  - les rendus fondus en place ;
  - les liens du site suivis, les autres refusés ;
  - les requêtes autres que GET refusées ;
  - les erreurs à part ;
  - le focus jamais pris ;
  - la remise à zéro en fin de tour et la fermeture sans usage.
- **`Preview.look`** passe par elle. Ton aperçu ne bouge plus.
- **`index.ts`** branche la fin de tour.
- **e2e `preview.e2e.ts`**, réécrit : un coup d'œil sur `/menu` laisse ton aperçu où il était ; un coup d'œil sur téléphone donne une image de 786 px de large.

### 2. Les étapes et la réponse
- **L'exécution** : la désignation (partie, ligne ou sélecteur), les contrôles, les cinq actions, l'attente et `at`.
- **L'état gardé** : il dure jusqu'à la fin du tour et survit à un fichier écrit, qui est fondu en place. Une autre route ou `fresh` repart d'une page neuve.
- **La réponse** : « screen n of m », les parties à l'écran, les étapes faites, l'arrêt sur une étape impossible.
- **Tests unitaires** : la désignation, la lecture des étapes, le texte de la réponse.

### 3. Les mesures
- **Le script de mesure et ses exclusions**, et les liens vérifiés côté main.
- **Une page de fixtures** avec un problème de chaque sorte.
- **Les huit templates**, chaque page à chacun des trois écrans, doivent donner zéro problème mesuré. Un vrai défaut se corrige dans le template, puis une release v6 à ton OK. Un faux positif se corrige dans le script.

### 4. L'outil et les deux agents
- **`look_at_preview`** : le nouveau schéma et sa description pour l'agent, qui décrit les écrans, les étapes, `at` et les mesures. Rien ne dit quand regarder le téléphone (Q319).
- **Pi** : le même outil, et sa liste d'outils dans `pi/tools.test.ts`.
- **La ligne d'activité (Q320)** : « Looking at Menu on a phone », « … after opening the menu ». Le nom de la page vient du titre de la page, et l'action du dernier `click` ou `hover`. Les libellés vont dans `en.ts`.
- **Les consignes** :
  - `adapt.ts` dit de regarder chaque page jusqu'en bas avec `at`, au lieu du seul premier écran ;
  - `site-scripts/SKILL.md` décrit les erreurs et les étapes pour les animations.
- **Les rejeux** (Claude et Pi) exécutent l'outil pour de vrai. Un enregistrement inventé couvre un coup d'œil avec étapes.

### 5. Vérifications
- **Un e2e `looks.e2e.ts`** sur un site de fixtures. On y vérifie :
  - le menu burger ouvert sur téléphone ;
  - un `<details>` ouvert ;
  - un lien suivi ;
  - un formulaire rempli mais pas envoyé (aucun enregistrement de test) ;
  - un élément resté caché et un débordement, mesurés avec fichier:ligne ;
  - l'état gardé à travers un fichier écrit ;
  - la remise à zéro en fin de tour ;
  - ton aperçu immobile, et aucun focus pris.
- **Tests, lint, tous les e2e, réempaquetage.**
- **La vérification avec l'agent réel** (Claude empaqueté, et Pi Gemini) :
  - le site de fixtures a un header qui déborde sur téléphone et un menu qui ne s'ouvre pas ;
  - le message est « Check the website on a phone and fix what is wrong » ;
  - on vérifie que l'agent regarde sur téléphone, ouvre le menu, trouve les deux problèmes par leur fichier et ligne, les corrige, puis regarde à nouveau ;
  - on mesure le temps de chaque coup d'œil.
- **Puis je te propose de l'essayer** dans la fenêtre de dev.

## Fichiers principaux
- `apps/desktop/src/main/preview/agent-view.ts` (nouveau), `preview.ts`, `server.ts` si besoin.
- `apps/desktop/src/main/agent/upstart-tools.ts`, `activity.ts`, `pi/tools.ts`, `index.ts`.
- `apps/desktop/src/shared/strings/en.ts`.
- `apps/desktop/src/main/templates/adapt.ts`, `apps/desktop/skills/site-scripts/SKILL.md`.
- `e2e/preview.e2e.ts`, `e2e/looks.e2e.ts` (nouveau), `e2e/fixtures/looks/` (nouveau).
- `spikes/looks/` (nouveau).

## Vérification d'ensemble
- **Tests unitaires** : désignation, étapes, réponse, ligne d'activité.
- **e2e en arrière-plan** : `preview.e2e.ts` et `looks.e2e.ts` ; les huit templates à zéro problème aux trois écrans.
- **L'agent réel**, avec Claude et Pi, sur le cas du header cassé sur téléphone.
- **Les temps** : un coup d'œil après le premier chargement visé sous 3 s. C'est mesuré à la tranche 0, et revu avec toi si on en est loin.
