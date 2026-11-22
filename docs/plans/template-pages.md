# Upstart v2 : l'adaptation d'un template page par page (Q302 à Q313)

## État (2026-11-22) : terminé

| Tranche | Fait | Commits |
|---|---|---|
| 0. Les décisions | ✅ | 27c060c |
| 1. L'état de l'adaptation et le format | ✅ | 6ffc7cb |
| 2. La carte des pages | ✅ | 6ffc7cb |
| 3. Les tours d'adaptation | ✅ | 6ffc7cb |
| 4. Ailleurs dans l'app | ✅ | d62d9ab |
| 5. Les huit templates | ✅ | b7962ed (templates 12ccfef) |
| 6. Vérification | ✅ | 31c3776, 76ff8b3 (la langue du message du créateur) |

## Contexte

Avec le guide, l'adaptation d'un template se fait en un seul tour : Claude a mis 550 s sur Ember avant que le créateur voie quoi que ce soit, et tout le site est traité d'un coup. La conception est refaite en Q302 à Q313 (`docs/v2.0-decisions.md`, section « Adapting a template, page by page », commit 27c060c). Le glossaire gagne Adaptation et Page type.

Ce qui change :
- **Le site parti d'un template est adapté type de page par type de page**, l'accueil d'abord. Un type de page regroupe les pages d'un même premier dossier de `pages/`, avec leurs enregistrements.
- **Le premier tour commence par deux cartes** :
  - la carte des pages : chaque type de page avec sa vignette, coché ou non selon le message, l'accueil toujours gardé, les pages nouvelles marquées ;
  - puis, s'il en reste, les choix ouverts pour l'accueil et pour tout le site.
- **L'accueil se fait d'abord, avec tout ce que les pages partagent** : header, footer, navigation et nom du site. Les types de page non gardés sont supprimés au même moment.
- **Après chaque type de page, l'agent s'arrête** sur une ou deux phrases qui disent ce qu'il a inventé. Upstart montre alors la liste et le bouton « Continuer : <page> ». Un clic sur une page à faire en fait la suivante.
- **Les pages à faire gardent le contenu du template**, marquées « à adapter ». Le contrôle des textes du template ne regarde que les pages faites et les parties communes.
- **L'adaptation reprend quand le site est rouvert**, et finit avec la dernière page. Publier pendant l'adaptation déclenche un avertissement.
- **Pas de mode Plan avec un template.**
- **Le guide est rangé par type de page.** Pendant l'adaptation, il est gardé dans `.upstart/`. À chaque type de page, l'agent reçoit la partie générale du guide et la section de ce type.

## Règles de travail (inchangées)

- Les lancements de l'app se font en arrière-plan (`UPSTART_BACKGROUND=1`). La fenêtre de dev de l'onglet « dev window » est arrêtée pendant les builds, puis relancée pour vous.
- Un commit par tranche sur `main`, sans attribution, poussé ensuite. Le sous-module des templates est poussé sur son `main`, sans tag ni release.
- Avant de stager, je fais un scan des clés, puis j'ajoute les fichiers par chemins explicites. `keys.env` et les fichiers `auth.json` ne sont jamais ajoutés.
- `pnpm lint` reste propre.

## Le format du guide

```
# Ember
Ce qu'est le template, à qui il convient.
## How it is made        les parties communes, le thème, les listes
## When adapting         les règles valables pour tout le site
## Pages
### Home (`/`)
Ce que la page montre.
#### <un choix pour l'accueil ou pour tout le site>
- **Option** (as built): ce qu'elle veut dire. Ce qu'il faut changer.
### Menu (`/menu`)
Ce que la page montre.
#### <un choix pour cette page>
### Private dining (`/private-dining`)
Ce que la page montre.
When removed: ce qu'il faut changer ailleurs (les liens qui y menaient, ses sources).
```

- **L'ordre des sections est l'ordre de l'adaptation.** L'accueil vient en premier.
- **`template:check`** :
  - avertit quand un type de page n'a pas sa section, ou quand une section ne correspond à aucun type ;
  - avertit quand l'accueil n'est pas en premier ;
  - avertit quand il manque `## Pages`.
- **Disparaissent** :
  - `## Before building` ;
  - les choix qui décident si une page existe (« Private dining and events? »). La carte des pages les remplace, et la ligne `When removed:` de chaque section dit quoi changer.

## Tranches

### 0. Les décisions (fait : 27c060c, poussé)

### 1. L'état de l'adaptation et le format

**Les types de page** (`main/templates/reader.ts`, nouveau `pages.ts`)
- `pageTypes(files)` : les routes groupées par premier dossier. `index.liquid` donne seul `/`, et `events/[events].liquid` ainsi que `events/index.liquid` donnent `/events`.
- `guideSections(guide)` : la partie générale, puis une section par type, chacune avec sa route.

**L'état** (nouveau `main/templates/adaptation.ts`)
- Il est rangé dans `.upstart/adaptation/` : `state.json` et `TEMPLATE.md`.
- `state.json` contient le template et les étapes `{ type, name, line, status: "todo" | "doing" | "ready" | "done" | "removed", new? }`, où `ready` veut dire « faite, en relecture ».
- Ses fonctions :
  - `startAdaptation(root, manifest, guide, types)` est appelée par `copyTemplate` ;
  - `choosePages(answer)` ;
  - `next()` et `pick(type)` ;
  - `remove(type)` ;
  - `finish()`, qui supprime le dossier.
- Les fichiers d'un type de page se calculent ainsi :
  - ses pages ;
  - les sources que ses pages lisent (le `RenderResult.datasources` de chaque page rendue) ;
  - les parties que seules ses pages rendent ;
  - tout le reste est commun.

**Le contrôle** (`templates/check.ts`)
- Il applique les avertissements du format décrits ci-dessus. `BEFORE_BUILDING` disparaît.

**Les tests unitaires**
- Les types de page des huit templates.
- Les sections du guide.
- Les transitions d'état.
- Les fichiers d'un type de page.
- Les avertissements du contrôle.

### 2. La carte des pages

**L'outil de l'agent `choose_pages`** (`agent/upstart-tools.ts`, pour Claude comme pour le harnais Pi)
- Ce qu'il reçoit : `pages: [{ type, label, line, checked }]` et `new: [{ label, line, route }]`, tout dans la langue du créateur.
- Upstart refuse :
  - un type inconnu ;
  - l'accueil décoché ;
  - un appel hors du premier tour d'une adaptation.
- La carte attend la réponse, comme les questions : la notification, l'édition à la main pendant l'attente (Q294) et Skip, qui garde les coches de l'agent.
- La réponse est enregistrée dans `state.json`.
- L'agent reçoit la liste gardée, dans l'ordre du guide, avec les pages nouvelles à la fin.

**La carte** (nouveau `renderer/components/PagesCard.tsx`)
- Une vignette par type de page, dessinée à partir des pages du projet par le mécanisme des vignettes de blocs, avec le thème du site.
- Les cases à cocher, une ligne de description par page, l'accueil verrouillé, la marque « nouvelle ».
- Les boutons « Garder ces pages » et Skip.
- Dans l'historique, elle reste repliée : « 5 pages gardées ».

**Les tests**
- Unitaires : l'outil et ses refus.
- e2e avec le faux agent : la carte, les coches, la validation, l'état écrit.

### 3. Les tours d'adaptation

**Le premier message** (`adaptMessage`, réécrit)
- Il contient :
  - la partie générale du guide et la liste des types avec leur ligne ;
  - la consigne de montrer `choose_pages` avant tout changement ;
  - puis, s'il en reste, une carte AskUserQuestion avec les choix ouverts de l'accueil et du site.
- Ensuite l'agent adapte seulement l'accueil et les parties communes, et supprime les types non gardés comme le disent leurs lignes `When removed:`.
- Il finit sur une ou deux phrases qui disent ce qu'il a inventé, sans carte.

**Les tours suivants**
- « Continuer » envoie à l'agent un message pour le type suivant :
  - la section de ce type et les règles générales ;
  - la consigne de n'adapter que ce type ;
  - la carte avant de construire, seulement pour les choix que les messages laissent ouverts.
- Dans la conversation, le créateur voit « Continuer : Menu ».
- Une page nouvelle est construite avec les blocs de la galerie, dans le design du template, et reçoit un lien dans la navigation.
- Un type retiré de la liste est supprimé au début du tour suivant, ou tout de suite s'il n'en reste aucun.
- Un message écrit pendant la relecture garde le type en cours : l'agent fait le changement sans passer à la suite.

**La barre d'adaptation** (nouveau `renderer/components/AdaptationBar.tsx`, sous la conversation)
- Elle montre la liste (✓ fait, ● en cours, ○ à faire, barré pour un type retiré) et le bouton « Continuer : <page> ».
- Un clic sur une page à faire en fait la suivante. Un « Retirer » apparaît au survol d'une page à faire.
- Elle est désactivée pendant que l'agent travaille.
- Elle disparaît à la fin, avec un mot : « Votre site est adapté ».
- Elle revient quand un site en cours d'adaptation est rouvert.

**Le contrôle des textes du template** (`agent/turn-checks.ts`, `adapt.ts`)
- Il ne porte que sur les types faits et en cours, et sur les fichiers communs.

**Les instructions** (`agent/instructions.ts`)
- La clause sur le template est remplacée par celle de l'adaptation : une carte de pages au premier tour, un type par tour, pas de carte de fin.
- Les autres demandes, faites pendant l'adaptation, sont traitées normalement.

**IPC** (`shared/ipc.ts`)
- `adaptation:state`, `adaptation:continue`, `adaptation:pick` et `adaptation:remove`.
- Un événement qui signale chaque changement d'état.

**Les tests**
- Unitaires : les messages par type, le contrôle limité.
- e2e avec le faux agent :
  - le parcours accueil → Continuer → page suivante ;
  - un clic qui choisit la suivante ;
  - un type retiré ;
  - la reprise après fermeture ;
  - la fin.

### 4. Ailleurs dans l'app

- **L'onglet Pages** (`PagesGrid.tsx`) : la marque « à adapter » sur les pages des types qui restent à faire.
- **La publication** (`publish/`, dialogue) : quand des pages restent à faire, l'avertissement les nomme et propose « Continuer l'adaptation » ou « Publier quand même ».
- **L'écran de départ** (`StartPanel.tsx`) : le choix Construire / Planifier est caché quand un template est choisi.
- **Les e2e** : `start.e2e.ts` (pas de mode Plan avec un template), la publication et les Pages.

### 5. Les huit templates (sous-module `apps/desktop/templates`)

- **Les huit guides passent au format par type de page.** La méthode est celle de la dernière fois :
  - un sous-agent par template, en parallèle, avec `template:check` comme juge ;
  - chaque diff relu, pour qu'aucune consigne ne se perde.
- Les choix qui décidaient si une page existait deviennent des lignes `When removed:`. Exemples :
  - Ember, « Private dining and events? » ;
  - Pocket, la tarification « Free » pour la page de prix.
- `FORMAT.md`, `scripts/release.mjs` (reconstruit) et la fixture `e2e/fixtures/templates/atelier/TEMPLATE.md`.
- **Le skill `making-templates`** : le brief dit les types de page et ce qui varie dans chacun. L'étape de construction écrit le guide par page.

### 6. Vérification

- Tests unitaires, lint et typecheck, puis les e2e.
- `template:check --finished` sur les huit templates.
- **Avec l'agent réel** (`e2e/agent-questions.e2e.ts`, opt-in), le cas Ember : « un bar à vins à Lyon, réservation par téléphone uniquement, des soirées flamenco le jeudi ».
  - **La carte des pages** arrive avant tout changement. Les salons privés y sont décochés ou laissés au choix, et les événements sont cochés.
  - **La carte de l'accueil** ne demande rien sur la réservation.
  - **L'accueil est fait, et le site s'arrête là.** On mesure le délai jusqu'à l'accueil, à comparer aux 550 s d'aujourd'hui.
  - **Après Continuer :**
    - la page Visite a le bouton d'appel ;
    - les autres pages ont encore le contenu du template ;
    - il n'y a pas de carte de fin.
  - Claude dans l'app empaquetée, puis Gemini via Pi.
- Je relance ensuite la fenêtre de dev pour que vous essayiez. La release v5 des templates attend toujours votre accord.

## Avancement

- Tranches 1 à 3 : faites, `6ffc7cb` (poussé).
- Tranche 4 : faite, `d62d9ab` (poussé).
- Tranche 5 : faite, `b7962ed`, templates `12ccfef` (poussés, sans tag).
- Tranche 6 : faite. `31c3776` : `e2e/adaptation.e2e.ts` (enregistrement inventé, la carte des pages jouée pour de vrai) passe ; le cas Ember réel est réécrit. Puis la langue : Claude écrivait la carte en espagnol pour un message en anglais sur un bar de Séville ; `choose_pages` demande d'abord `language`, la langue du message. Cas Ember réel avec Claude (app empaquetée) : accueil 152 s (550 s avant pour tout le site), Visite 64 s, carte en anglais. Pi Gemini, avec `language` : accueil 131 s, Visite 69 s (241 s avant pour tout le site), carte en anglais.
