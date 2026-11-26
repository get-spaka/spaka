# Spaka v2 : plan de construction des questions de l'agent et du mode plan (Q281-Q296)

## État (2026-11-22) : terminé

| Tranche | Fait | Commits |
|---|---|---|
| 0. La sonde et le modèle partagé | ✅ | 96831ba |
| 1. Les questions avec Claude | ✅ | bdfa3fc |
| 2. Les questions avec le harness Pi | ✅ | d575f10 |
| 3. La carte dans la conversation | ✅ | 4f3774a |
| 4. Le mode plan | ✅ | 4f3774a |
| 5. Les règles de l'agent | ✅ | 0fdd984 |
| 6. Les questions des templates | ✅, puis remplacé | 47aaad9 ; remplacé par le guide `TEMPLATE.md` (Q297-Q301, plan [template-guide](template-guide.md)) |
| 7. Vérifications avec les vrais agents | ✅ | 67b0bb9 |

Ensuite : les cartes de plusieurs questions s'affichent une à une, comme dans Claude Desktop (Q387-Q390, 9f3339f).

## Contexte

Vous avez choisi de construire maintenant les questions de l'agent (Q281). La conception est faite : Q282 à Q296, dans `docs/v2.0-decisions.md`, section « The agent asks the maker ». Le glossaire a trois nouveaux termes : Question, Plan mode et Template question. Le commit est `e4cf933`.

Le but :
- l'agent pose des questions dans des cartes de la conversation, et attend la réponse ;
- un mode plan, à tout moment ;
- des questions de template sur l'écran de départ ;
- le tout pour Claude et pour le harness Pi.

## Ce que le SDK de Claude apporte (0.3.321, d'après sa documentation)

**AskUserQuestion**
- C'est un outil du binaire, à ajouter à `tools`.
- Chaque appel arrive dans `canUseTool`, quel que soit le mode, même `acceptEdits`, et y reste en attente sans limite.
- L'app répond `{ behavior: "allow", updatedInput: { questions, answers } }`. `answers` associe le texte d'une question au libellé choisi, ou au texte du créateur. On peut aussi répondre par `response`, une réponse libre (« The user responded: … »).
- Une réponse peut dire qu'une question a été passée, si le binaire annonce la capacité `ask_user_question_unanswered_v1`.
- Le réglage `dialogExpiry` vaut 5 min par défaut pour un dialogue « transmis à un client distant ». Je le mets à `never`, au cas où.
- `toolConfig.askUserQuestion.previewFormat` ajoute un champ `preview` à chaque choix.

**Mode plan**
- `permissionMode: "plan"`, changé en cours de session par `setPermissionMode()`.
- `planModeInstructions` remplace le déroulé du binaire, pensé pour du code, par celui de Spaka.
- Le plan est rendu par ExitPlanMode.
- Le réglage `useAutoModeDuringPlan: false` envoie à notre `canUseTool`, au lieu du classifieur, les commandes qui ne sont pas en lecture seule.

**À vérifier par une sonde (tranche 0) :**
- ce que reçoit `canUseTool` pour ExitPlanMode (le texte du plan) ;
- où le binaire écrit son fichier de plan ;
- les outils MCP de Spaka en mode plan ;
- le retour à `acceptEdits` dans le même tour après « Build » ;
- une attente de plus de 5 minutes ;
- la reprise après une app quittée pendant une question.

## Choix techniques (sans nouvelle décision de produit)

**Une question dans le modèle de la conversation**
- `shared/conversation.ts` gagne une partie `question` dans un tour de l'agent : `{ id, questions, state: "waiting" | "answered" | "skipped" | "unanswered", answers? }`.
- Il gagne aussi une partie `plan` : `{ id, text, state: "proposed" | "approved" | "replaced" | "unanswered" }`.
- Les nouveaux événements sont `question`, `question-settled`, `plan` et `plan-settled`.
- `isWaiting(items)` dit qu'un tour attend le créateur.
- Le réducteur reste partagé entre le processus principal et l'interface, comme aujourd'hui.

**`AgentRunner` gagne :**
- `answer(id, réponse)`, où la réponse est soit des choix, soit des mots à soi, soit « Skip » ;
- `approvePlan(id)` ;
- `setMode("build" | "plan")`.
- Les deux adaptateurs les implémentent. Un message envoyé pendant une attente devient la réponse avec ses propres mots (`response`), jamais un nouveau tour.

**Les aperçus (Q291)**
- `previewFormat: "markdown"`, et les instructions disent qu'un aperçu est seulement `block:<id>` ou le chemin d'une image du site.
- La carte dessine le premier avec la vignette du bloc, rendue avec le thème du site par `thumbnails.ts`, et le second avec l'image du site. Tout autre aperçu est ignoré.
- Le harness Pi a le même champ, sous le même nom.

**Ce que le créateur a changé pendant l'attente (Q294)**
- Le hook PostToolUse d'AskUserQuestion (`TurnChecks.afterTool`) ajoute la note des changements faits à la main. C'est la note qu'un message suivant porte déjà.
- Côté Pi, c'est `afterToolCall`.

**L'app quittée ou le site fermé pendant une question**
- Le tour se termine, et la carte garde « Not answered ».
- Pour Pi, un résultat « The maker did not answer: Spaka was closed » ferme l'appel en attente dans la mémoire.
- Pour Claude, ce qu'il faut faire dépend de la sonde.

**Le mode plan côté Claude**
- `setPermissionMode("plan")`, puis, sur « Build », le retour au mode de construction de `confinement()`.
- ExitPlanMode est ajouté à `tools`, comme AskUserQuestion.
- En mode plan, les outils de Spaka arrivent dans `canUseTool` même quand ils sont autorisés (vu par la sonde). `canUseTool` laisse passer ceux qui ne font que lire et refuse use_block et use_image. Il n'y a donc pas de hook PreToolUse.
- Changer le plan avec ses mots devient un refus d'ExitPlanMode qui porte ces mots. L'agent rend alors un nouveau plan, et l'ancienne carte passe à « Replaced ».

**Le mode plan côté Pi**
- Les outils de lecture seulement (Read, Glob, Grep, WebSearch, WebFetch, find_blocks, find_images, look_at_preview), plus AskUserQuestion et un outil ExitPlanMode (`plan`).
- Les instructions du mode plan sont les mêmes que pour Claude.
- Sur « Build », l'outil répond « The maker approved the plan: build it now », et les outils complets reviennent pour la suite du tour.

**Le sélecteur Build / Plan**
- `ProjectInfo.mode` est gardé dans project.json, comme l'effort (Q296).
- Il est désactivé pendant que l'agent travaille ou attend, et s'applique au message suivant.

## Tranches

### 0. La sonde et le modèle partagé (aucun changement de comportement)
- La sonde, avec le vrai binaire et la connexion Claude de Spaka, en arrière-plan : tous les points « à vérifier » ci-dessus. Je vous en rends compte, et je vous pose une question si elle révèle un écart avec la conception.
- `conversation.ts` : les parties, les événements et `isWaiting`, avec leurs tests.
- `runner.ts` : `answer`, `approvePlan` et `setMode`.

### 1. Les questions avec Claude
- `session.ts` :
  - AskUserQuestion dans `tools`, et `canUseTool` qui attend la réponse (une promesse par question) ;
  - Stop interrompt l'attente ;
  - `dialogExpiry: "never"` et `previewFormat: "markdown"`.
- `stream.ts` : l'appel d'AskUserQuestion ne fait pas de ligne d'activité, puisque la carte la remplace.
- La note des changements ajoutée par le hook PostToolUse.
- L'enregistrement et le rejeu (`replay.ts`) gardent les questions et les réponses. Au rejeu, `canUseTool` est rappelé avec la question enregistrée et attend la réponse.
- Tests unitaires : une réponse par un choix, par ses mots, Skip, et Stop pendant l'attente.

### 2. Les questions avec le harness Pi
- `pi/tools.ts` : un outil AskUserQuestion au schéma de Claude, aperçu compris, qui attend la réponse. Il renvoie le même texte de résultat que Claude.
- `pi/session.ts` : Stop et l'appel resté ouvert quand l'app a été quittée. `pi/replay.ts` garde les réponses.
- Tests sur le fournisseur faux de pi-ai.

### 3. La carte dans la conversation
- `QuestionCard` dans le tour de l'agent :
  - les puces d'en-tête ;
  - les choix en boutons, le recommandé en premier et marqué « Recommended » (un « (Recommended) » écrit par le modèle est retiré du libellé) ;
  - les aperçus ;
  - « Skip ».
- Une seule question à choix unique se répond d'un clic. Sinon, on choisit puis on clique « Answer ».
- Une fois réglée, la carte est repliée : la question et sa réponse, ou « Skipped », ou « Not answered ».
- La zone de message, pendant une attente, porte le texte « Answer in your own words… ».
- L'édition à la main revient pendant l'attente (Q294) : la pause de Q91 regarde « travaille et n'attend pas ».
- Q292 :
  - une notification « The agent has a question », sous le réglage `notifyDone` ;
  - un statut `waiting` par site, et une marque dans la barre latérale.
- Les textes dans `en.ts`.
- e2e `questions.e2e.ts`, en arrière-plan, sur les rejeux de Claude et de Pi :
  - répondre par un choix, par ses mots, Skip ;
  - modifier un texte pendant l'attente ;
  - la notification ;
  - la marque dans la barre latérale.

### 4. Le mode plan
- Le sélecteur Build / Plan dans la conversation et sur l'écran de départ, gardé par site.
- Claude : le mode, les instructions du plan, le hook, ExitPlanMode, puis « Build » et le retour au mode de construction.
- Pi : les outils de lecture, l'outil ExitPlanMode, puis « Build ».
- `PlanCard` : le plan en texte mis en forme, avec le bouton « Build ». Pour le changer, on répond avec ses mots, et la carte devient « Replaced ». Une fois approuvé, le plan est replié.
- Un premier message en mode plan, depuis l'écran de départ, avec ou sans template.
- e2e `plan.e2e.ts` sur les rejeux : un plan, un changement, Build, puis la construction ; le sélecteur revenu à Build ; le mode gardé à la réouverture.

### 5. Les règles de l'agent
- Une section « Questions » dans `instructions.ts`, pour Claude et les familles de Pi :
  - quand demander de lui-même (Q289) ;
  - la carte à la fin du premier site, sur ce qu'il a deviné et qui compte, et rien sinon (Q288) ;
  - le choix recommandé en premier ;
  - les aperçus `block:<id>` ou l'image ;
  - ce que signifient Skip et une réponse avec ses mots ;
  - toujours dans la langue du créateur.
- `adaptMessage` : la même carte à la fin de l'adaptation d'un template.

### 6. Les questions des templates
- Le format :
  - `questions` dans template.json (de 1 à 4, au format AskUserQuestion, le premier choix étant le recommandé) ;
  - vérifié par `template:check` ;
  - documenté dans `FORMAT.md` du dépôt spaka-templates : les notes de design disent ce que change chaque réponse.
- Le catalogue porte les questions, pour que l'écran de départ les montre avant tout téléchargement.
- `StartPanel` : quand un template est choisi, ses questions s'affichent sous la zone de message, en choix préréglés sur la réponse recommandée.
- `adaptMessage` reçoit les réponses, chacune marquée « choisie par le créateur » ou « laissée sur la recommandée ». Le message l'emporte sur une réponse laissée telle quelle.
- La vague 1 :
  - 1 à 3 questions pour chacun des huit templates, avec leurs notes de design ;
  - je vous les montre ensemble avant la release v5 ;
  - la compétence making-templates les demande pour les suivants.
- e2e `start.e2e.ts`, étendu.

### 7. Vérifications avec les vrais agents, app empaquetée, en arrière-plan
- **Claude (Sonnet 5.5)**, trois cas :
  - un site depuis un message court, puis la carte de fin de premier site : on répond, et l'agent applique la réponse ;
  - un site plus grand en mode plan : les questions, le plan, Build, puis la construction suivant le plan ;
  - Ember avec ses questions répondues sur l'écran de départ.
- **Le harness Pi** (Gemini 4 Hydrogen avec la clé AI Studio, ou GPT-6.1 Terra avec ChatGPT) : une question et un plan.
- Puis je vous propose de l'essayer dans la fenêtre de dev.

## Avancement
- Tranche 0, 2026-11-14 (96831ba) : la sonde ([son rapport](../spikes/questions.md)) confirme la conception.
  - Les questions passent par `canUseTool` en `acceptEdits`, et les choix, les mots du créateur et « Skip » arrivent à l'agent comme tels.
  - Les aperçus demandés (`block:` et chemin d'image) reviennent tels quels.
  - ExitPlanMode apporte `plan`, un refus avec les mots du créateur donne un nouveau plan, et `setPermissionMode` repasse en construction dans le même tour.
  - Une question laissée quand l'app se ferme devient « rejetée » à la reprise.
  - Le modèle partagé est fait : `conversation.ts` (cartes, `waitingFor`, `isWaiting`, `answerText`), le résumé de passation, et `answer` / `settlePlan` / `setMode` dans `AgentRunner`.
- Tranche 2, 2026-11-14 (d575f10) : l'outil AskUserQuestion du harness Pi, au texte de résultat de Claude ; fermer Spaka pendant un tour garde maintenant ce qu'il a fait, une question restée ouverte lue comme « non répondue, Spaka fermé ».
- Tranche 1, 2026-11-14 (bdfa3fc) : Claude pose ses questions (`questions.ts`, `canUseTool` dans `session.ts`, la note des modifications à la main par un hook PostToolUse, le rejeu qui demande à l'app).
  - Trouvé avec le vrai binaire sous le confinement de l'app (`session.real.test.ts`) : `denyInsteadOfPrompting` retire AskUserQuestion des outils. Il n'est plus mis ; `canUseTool` refuse tout sauf les questions, et une écriture hors du projet reste refusée d'emblée.
- Tranches 3 et 4, 2026-11-14 (4f3774a), dans un même commit car elles touchent les mêmes fichiers :
  - les cartes de question (`QuestionCard.tsx`), la marque dans la barre latérale, la notification, l'édition à la main pendant l'attente ;
  - le mode plan : le sélecteur Build / Plan gardé par site, `permissionMode: "plan"` avec les consignes de Spaka pour Claude (les hooks de permission s'effacent en Plan), les outils d'écriture bloqués et un outil ExitPlanMode pour Pi, la carte du plan (`PlanCard.tsx`) avec Build ;
  - e2e `questions.e2e.ts` et `plan.e2e.ts` sur des enregistrements fabriqués ; le vrai binaire construit après un plan changé puis approuvé.
- Tranche 5, 2026-11-14 (0fdd984) : la section « Questions to the maker » des consignes, pour Claude et les familles de Pi ; l'adaptation d'un template finit par la même carte.
- Tranche 6, 2026-11-14 (47aaad9, templates 454a6dd) : `questions` dans template.json, vérifié par `template:check`, porté par le catalogue, montré sous la zone de message de l'écran de départ, et transmis à l'agent avec le premier message. Les huit templates de la vague 1 posent 2 questions chacun et passent en 1.1.0, poussés sans release : à montrer à Matt avant la v5.
- Tranche 7, 2026-11-14 (67b0bb9) : `e2e/agent-questions.e2e.ts`, avec les vrais agents.
  - Claude, dans l'app empaquetée : la carte de fin (129 s), le mode plan avec changement puis Build (209 s), et Ember avec ses questions réglées à « By phone » et « Events only », servi depuis une release locale (490 s). Tous passent.
  - Gemini 4 Hydrogen : la carte de fin et le plan passent. Deux corrections : le plan est écrit pour le créateur, sans fichiers, identifiants de blocs ni adresses ; et des coordonnées, horaires ou prix inventés comptent toujours.
  - Le plan est terminé. Restent : montrer à Matt les questions de la vague 1 avant la release v5, et lui proposer d'essayer dans la fenêtre de dev.

## Règles de travail
- Lancements en arrière-plan (`SPAKA_BACKGROUND=1`).
- Un commit par tranche qui fonctionne, avec des chemins explicites et un contrôle des clés avant, puis un push.
- `pnpm lint` reste propre.
- Les questions des templates de la vague 1 vous sont montrées avant toute release.
- Toute question de produit vous est posée, à partir de Q297.
