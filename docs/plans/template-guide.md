# Upstart v2 : le guide d'un template (Q297 à Q301)

## État (2026-11-22) : terminé

| Tranche | Fait | Commits |
|---|---|---|
| 0. Les décisions | ✅ | 5d10f93 |
| 1. L'app | ✅ | 68e9e6a |
| 2. Les templates | ✅ | 68e9e6a (templates af8a934) |
| 3. Vérification avec les vrais agents | ✅ | 2f40abb |

## Contexte

En essayant les questions des templates, vous avez trouvé qu'elles nuisaient à la lisibilité de l'écran de départ. La conception est refaite en Q297 à Q301 (`docs/v2.0-decisions.md`, section « The agent asks the maker »). Le glossaire gagne deux termes, Template guide et Design notes, et perd Template question.

Ce qui change :
- **L'écran de départ** ne montre plus que les templates et la zone de message.
- **Chaque template a un guide**, `TEMPLATE.md`, à sa racine. Il dit ce qu'est le template et à qui il convient, comment il est fait, comment l'adapter, et ce qu'il faut demander avant de construire, dans une section `## Before building`.
- **Le guide est lu une seule fois.** Upstart le met dans le premier message de l'adaptation et ne le copie pas dans le site.
- **Les notes de design** (le skill `<id>-design`) restent dans le site, pour ce qui vaut toute sa vie : la typo, les couleurs, les effets, le fonctionnement des listes.
- **L'agent lit le message d'abord.** Il pose dans une carte, avant de construire, les choix de « Before building » que le message laisse ouverts. Quand le message tranche tout, il construit tout de suite.
- **La carte de fin reste**, comme pour tout nouveau site (Q301). Une adaptation peut donc avoir deux cartes dans son tour.
- **`questions` disparaît de `template.json`.** Aucune release n'a encore publié ce champ, et les templates de la vague 1 sont refaits.

## Règles de travail (inchangées)

- Les lancements de l'app se font en arrière-plan (`UPSTART_BACKGROUND=1`). La fenêtre de dev de l'onglet « dev window » reste ouverte pour vous.
- Un commit par tranche sur `main`, sans attribution, poussé ensuite. Le sous-module des templates est poussé sur son `main`, sans tag ni release.
- Avant de stager, je fais un scan des clés, puis j'ajoute les fichiers par chemins explicites. `keys.env` et les fichiers `auth.json` ne sont jamais ajoutés.
- `pnpm lint` reste propre.

## Tranches

### 0. Les décisions (fait : 5d10f93, poussé)
- `docs/v2.0-decisions.md` : Q297 à Q301. Q287 et Q293 sont marquées comme remplacées.
- `GLOSSARY.md` : les deux termes ajoutés et le terme retiré.

### 1. L'app

**Le format** (`main/templates/`)
- `reader.ts` : `TEMPLATE.md` rejoint `TEMPLATE_ENTRIES`, et `projectFiles` le laisse hors du site, comme le README.
- `manifest.ts` : `TemplateQuestion` et `questions` disparaissent. Un vieux `template.json` qui a encore le champ est lu sans erreur, puisque la clé inconnue est ignorée.

**L'adaptation** (`main/templates/adapt.ts`)
- `copyTemplate` rend aussi le texte du guide.
- `adaptMessage(manifest, message, guide)` met le guide en entier dans le message, sous un titre, avant « Adapt it ». L'agent y reçoit ces consignes :
  - lire le message du créateur au regard de « Before building » ;
  - poser dans une seule carte, avant d'écrire quoi que ce soit, les choix que le message laisse ouverts : dans la langue du créateur, chaque option avec ce qu'elle change, le template tel qu'il est construit en premier et recommandé ;
  - quand le message tranche tout, construire tout de suite ;
  - avec Skip, construire avec les choix recommandés.
- La carte de fin reste, avec une précision : « les choix posés avant de construire sont réglés ».
- Les éléments liés aux réponses de l'écran de départ disparaissent : `TemplateAnswer`, `templateAnswers` et le paragraphe des réponses.
- En mode plan, la carte vient d'abord, puis le plan.

**Les instructions** (`main/agent/instructions.ts`, section « Questions to the maker »)
- Une phrase ajoute l'exception : une adaptation commence par la carte de son guide, qui ne compte pas dans « une carte par tour ».

**L'envoi** (`index.ts`, `shared/ipc.ts`, `templates/library.ts`)
- `answers` disparaît de `conversation:send`, avec `answersOf`.
- `questions` disparaît de `TemplateSummary` et du résumé du catalogue.

**L'écran de départ** (`renderer/components/StartPanel.tsx`, `en.ts`)
- `TemplateQuestions`, l'état `answers`, `labelsOf`, `sentAnswers` et `t.start.questions` disparaissent.
- La zone de message reprend son espacement d'avant.

**Le contrôle** (`templates/check.ts`)
- Il avertit quand `TEMPLATE.md` manque, ou quand il n'a pas de `## Before building`.
- Le contrôle « les notes disent ce que change chaque réponse » disparaît.

**Les tests**
- `adapt.test.ts` :
  - le guide est dans le message, avec la consigne de la carte d'avant la construction ;
  - un template sans guide ne parle ni de carte ni de Before building.
- `templates.test.ts` :
  - `TEMPLATE.md` n'est pas copié dans le site ;
  - le contrôle avertit sans `Before building`.
- `e2e/start.e2e.ts` :
  - le test des questions de Reel est remplacé : aucune question sous la zone de message une fois Reel choisi, et le premier message envoyé contient son guide.

### 2. Les templates (sous-module `apps/desktop/templates`)

**Les huit templates de la vague 1**
- Chacun gagne un `TEMPLATE.md`, avec :
  - ce qu'il est et à qui il convient : le paragraphe « It was written for… it suits… », déplacé des notes ;
  - comment il est fait : ses pages et ce que chacune montre, avec un renvoi aux notes pour les listes ;
  - `## When adapting`, déplacé des notes ;
  - `## Before building` : ses questions d'aujourd'hui (`template.json` et « Template questions »), réécrites en prose, avec chaque option et les fichiers qu'elle change.
- Les notes de design perdent « When adapting » et « Template questions ».
  - Elles gardent les règles qui durent, chacune placée sous son sujet. Par exemple, pour Ember : « quand les horaires changent, changer ensemble les enregistrements `hours`, les lignes open tonight et les heures du formulaire », ou « une seule bande oxblood par page ».
- `questions` disparaît de chaque `template.json`. La version reste 1.1.0, qui n'a jamais été publiée.
- Méthode :
  - un sous-agent par template, en parallèle, avec la même consigne et le contrôle `template:check` comme juge ;
  - je relis chaque diff, pour vérifier que rien n'est perdu entre les deux documents.

**Le reste du dépôt**
- `FORMAT.md` décrit `TEMPLATE.md` (son rôle, `Before building`, ce qui va plutôt dans les notes de design) et retire `questions`.
- `scripts/release.mjs` est reconstruit à partir du code de l'app. Je vérifie que les archives de la release contiennent `TEMPLATE.md`.

**Dans l'app**
- `.claude/skills/making-templates/SKILL.md` :
  - le brief dit « ce qui varie », et non plus « ses questions » ;
  - l'étape de construction écrit `TEMPLATE.md` puis les notes, chacun avec son rôle.

### 3. Vérification
- Tests unitaires, lint, puis les e2e `start`, `plan`, `questions` et `templates`.
- `template:check --finished` sur les huit templates.
- **Avec l'agent réel**, dans `e2e/agent-questions.e2e.ts` (opt-in) :
  - **Claude, cas Ember.** Le message est « un bar à vins à Lyon, réservation par téléphone uniquement ». La première carte ne demande que les salons privés et les événements, sans la réservation. Une fois la carte répondue, le site a le bouton d'appel sans formulaire, puis vient la carte de fin. Avec Skip, le site est construit selon les choix recommandés.
  - **Pi (Gemini), même cas.** C'est ce qui montre si les familles de Pi obéissent à « seulement ce qui reste ouvert ».
- Je relance ensuite la fenêtre de dev pour que vous l'essayiez. La release v5 des templates attend toujours votre accord.

## Avancement

- 2026-11-15, tranches 1 et 2 construites :
  - **L'app** : le guide est lu et mis dans le premier message, n'est pas copié, et est contrôlé. L'écran de départ n'a plus de questions.
  - **Les huit guides** sont écrits par quatre sous-agents, puis relus. Les corrections de relecture :
    - Ember « Events only » renvoie ailleurs les liens vers la page des salons privés ;
    - Beacon : les précommandes gardent les offres ;
    - Corner « No » garde le formulaire pour les messages ;
    - Folio : la ligne de disponibilité est dans le hero ;
    - Marquee nomme où le nombre de jours est écrit ;
    - Margin : la règle `author` reste dans les notes.
  - **La première option est la recommandée**, le plus souvent le template tel qu'il est construit, marqué `(as built)`. Pour Reel, c'est « No open roles » qui est recommandé, car les offres d'emploi inventées ne sont pas celles du créateur.
  - Les huit templates passent `template:check --finished` sans erreur ni avertissement. Lint, typecheck et les tests unitaires (1860) passent.
- 2026-11-15, tranche 3 (vérification avec les vrais agents) : passée.
  - **Claude** (app empaquetée), en 550 s : une carte avant tout changement, sur les salons privés et les événements seulement ; le site est construit selon la réponse ; puis la carte de fin. Claude a mis en premier « Events only », le choix que suggérait le message.
  - **Gemini 4 Hydrogen via Pi**, en 241 s : le même déroulé, avec une carte réduite aux deux choix restés ouverts.
  - Les tests opt-in ont maintenant leur propre délai (40 min). Le plan est terminé.
