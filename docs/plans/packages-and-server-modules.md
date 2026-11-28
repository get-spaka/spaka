# Spaka v2 : plan de construction des paquets et des modules serveur (Q490-Q535)

## État (2026-11-28) : la sonde et les tranches 1 à 7 faites

| Tranche | Fait | Commits |
|---|---|---|
| 0. La sonde : pnpm 12, Vite, wrangler et Node sous permissions | ✅ | e762c96 (résultats dans [`docs/spikes/packages.md`](../spikes/packages.md)) ; correctif trouvé en passant, le `node` du shell Pi sous `/Users` : get-spaka/spaka#4 |
| 1. Le pnpm de Spaka et le `node_modules` du projet | ✅ | 999d123 |
| 2. `add_package`, ses règles et la section Paquets | ✅ | 0cc63a3 |
| 3. Les paquets dans le navigateur | ✅ | 7936aee ; sous Windows, Rolldown seul (Q557) ec86e33 |
| 4. Les 37 templates passent aux paquets | ✅ | aed0742 ; get-spaka/templates 6fa8752 (branche `template/packages`) |
| 5. Les modules serveur dans l'aperçu | ✅ | 57c1276 |
| 6. Les secrets | ✅ | 3ea6df4 |
| 7. Les exports statique, Node et Cloudflare | | |
| 8. Le déploiement sur Cloudflare depuis Spaka | | |
| 9. Le template de l'école de surf | | |
| 10. Registres privés et dépôts git | | |
| 11. Vérifications avec les vrais agents | | |

## Contexte

Tu as constaté qu'un site ne pouvait installer aucun paquet ni faire tourner son propre code serveur, et tu as demandé un plan (Q490). La conception est faite : Q490 à Q535, dans `docs/v2.0-decisions.md`, section « Packages and server modules ». Elle est complétée par trois ADR :
- [0013](../adr/0013-packages-installed-by-spakas-own-pnpm.md) : les paquets ;
- [0014](../adr/0014-server-modules-run-by-spakas-node.md) : les modules serveur ;
- [0015](../adr/0015-the-cloudflare-builder-deploys-with-spakas-wrangler.md) : le déploiement sur Cloudflare.

Le glossaire gagne Package, Server module et Secret ; Builder et Published site sont revus.

L'ordre suit Q490 : d'abord le côté navigateur (tranches 1 à 4), qui pose l'installation, puis le serveur (5 à 8), qui la réutilise. Viennent ensuite le template qui prouve le tout (9), les autres sources de paquets (10) et les vérifications de bout en bout (11).

## Ce que la recherche a établi (2026-11-27)

**pnpm 12**
- C'est un exécutable natif en Rust (`@pnpm/exe.<plateforme>`, environ 55 Mo). Le paquet npm `pnpm` ne contient qu'un lanceur, qui télécharge ce binaire s'il manque. Spaka lance donc le binaire lui-même, par son chemin absolu.
- La dernière version en JavaScript est pnpm 11.29.
- `.npmrc` ne sert plus qu'aux registres, aux jetons, au TLS et aux proxys ; tous les autres réglages vivent dans `pnpm-workspace.yaml` ou dans un `config.yaml` global.
- `--ignore-workspace` écarte tout `pnpm-workspace.yaml`. Rien ne permet d'ignorer le `.npmrc` du projet : Spaka le supprime lui-même.
- `minimumReleaseAge` se compte en minutes et s'applique à toutes les dépendances. Quand la dernière version est trop jeune, pnpm prend la plus récente qui a l'âge, et `--config.minimum-release-age-strict=true` le rend strict.
- `trustPolicy=no-downgrade` refuse une version qui a perdu la provenance des précédentes, et `blockExoticSubdeps` (activé par défaut) bloque les sous-dépendances venues de git ou d'une URL.
- Le rangement isolated pose des liens relatifs qui restent dans le projet. `clone-or-copy` clone les fichiers sur macOS et les copie sous Windows ; une écriture dans `node_modules` ne touche jamais le store.
- `--reporter=ndjson` donne la version choisie (`pnpm:root.added.version`).
- pnpm 12 lance une fois `node --version` depuis le PATH : il lui faut un PATH sans les gestionnaires de Node du maker.
- La sonde l'a vérifié (2026-11-27, [le rapport](../spikes/packages.md)) : les pièges posés dans le dossier personnel et dans le projet n'ont rien changé, mais le jeton d'un `.npmrc` du projet part bien vers le registre. Il faut donc le supprimer.

**Node d'Electron 45 (Node 24.22.2), mesuré**
- Avec `--permission` et la lecture et l'écriture limitées au projet, sont refusés : le dossier personnel, `child_process`, les workers, `process.binding`, les addons et un `import()` venu d'ailleurs.
- Restent ouverts : le réseau, les variables d'environnement, et un lien symbolique posé dans le projet qui pointe ailleurs (une limite documentée).
- `--allow-net` n'arrive qu'avec Node 25.
- Le TypeScript « effaçable » passe sans drapeau. `enum` et les propriétés de constructeur demandent `--experimental-transform-types`, et passent avec. Les imports écrivent `.ts`.

**Signaux publics**
- Le score de recherche de npm vaut 1 pour tous les paquets : il ne sert plus.
- Les signaux utiles : les téléchargements, les dates du registre (`time.created` pour le paquet, `time[version]` pour la version), les attestations Sigstore (`dist.attestations`), deps.dev (failles, licence, dépôt, OpenSSF Scorecard) et OSV.

## Choix techniques (sans nouvelle décision de produit)

**Les dossiers de Spaka** (`<userData>` est le dossier de données de l'app)
- `tools/pnpm-<version>/pnpm`, plus `tools/vite/` pour Vite (et un dossier à lui pour wrangler), installés par ce pnpm depuis un `package.json` et un lockfile livrés avec l'app.
  - Vite pèse 20 Mo sans ses programmes natifs (tranche 3), et vient avec le premier paquet.
  - Wrangler ne démarre pas sans workerd : avec lui, l'ensemble pèse environ 300 Mo, téléchargés au premier export pour Cloudflare. sharp (17 Mo) n'est pas nécessaire ; la façon de le laisser de côté se règle dans la tranche 7.
- `pnpm/home`, `pnpm/config` (un `config.yaml` de Spaka, sans `auth.ini`), `pnpm/store`, `pnpm/cache`, `pnpm/state`, `pnpm/run` et un `npmrc` vide.
- `server-files/<id du projet>/` : le dossier inscriptible des modules serveur dans l'aperçu (Q528).
- Les secrets, à côté des comptes, chiffrés par `safeStorage` (comme `agent/auth.ts`).

**L'appel à pnpm**
- L'environnement est une copie nettoyée : sans `npm_config_*`, `pnpm_config_*`, `PNPM_HOME`, `PNPM_CONFIG_HOME`, `XDG_*`, `CI`, `COREPACK_*` ni `NODE_OPTIONS`. Puis `PNPM_HOME`, `PNPM_CONFIG_HOME` et `XDG_RUNTIME_DIR` pointent vers les dossiers de Spaka, et le PATH ne contient que les dossiers du système et le `node` de Spaka.
- La commande, telle que la sonde l'a lancée (les réglages que `pnpm add` n'a pas en drapeau passent par `--config.<nom>`) :

  ```
  pnpm add <nom> --save-exact --dir <projet> --ignore-workspace
    --store-dir … --config.cache-dir=… --state-dir … --npmrc-auth-file <npmrc vide>
    --registry=https://registry.npmjs.org/ --config.strict-ssl=true
    --ignore-scripts --ignore-pnpmfile --config.pm-on-fail=ignore --config.runtime=false
    --config.minimum-release-age=10080 --config.minimum-release-age-strict=true
    --config.minimum-release-age-ignore-missing-time=false
    --config.trust-policy=no-downgrade --config.trust-lockfile=false
    --config.node-linker=isolated --config.virtual-store-type=project
    --config.package-import-method=clone-or-copy
    --config.update-notifier=false --reporter=ndjson   < /dev/null
  ```

- `pnpm install` prend les mêmes drapeaux. Sans terminal, une version trop jeune demandée nommément est refusée au lieu d'être proposée ; sans version, pnpm prend la plus récente qui a l'âge.
- Avant chaque installation, Spaka nettoie `package.json` :
  - il retire `devEngines`, qui fait encore résoudre un Node par pnpm malgré `runtime=false` ;
  - il pose `"type": "module"`, sans lequel Node lit chaque module serveur deux fois.

  L'agent est prévenu, comme pour le `.npmrc`.
- Spaka valide d'abord le nom et la version : `npm`, `node`, `yarn`, `bun` et `deno` ont un sens spécial pour pnpm 12, comme les préfixes `jsr:`, `gh:`, `crate:`, `pypi:` et les autres.

**Les outils de l'agent**
- `add_package(name)`, `remove_package(name)` et `ask_secret(name, purpose, where_to_find)`, pour Claude (`spaka-tools.ts`) et pour le harness Pi (`pi/tools.ts`), comme `find_images`.
- La carte de la zone grise et celle du secret sont des cartes de question (Q283), avec un champ masqué pour le secret.

**Le process serveur de l'aperçu**
- Un process par site ouvert : `ELECTRON_RUN_AS_NODE=1 <Electron> --permission --allow-fs-read=<projet> --allow-fs-write=<server-files> --experimental-transform-types <hôte>`.
- L'hôte est un petit module de Spaka qui charge `server/*.ts|js` et parle au runtime du processus principal par un canal local (des requêtes `load`, `action` et `route`, et des réponses JSON ou des `Response`).
- Sur macOS, le tout tourne sous `sandbox-exec`, dans un profil tiré de celui du shell du harness Pi (`agent/pi/shell.ts`). Il écrit seulement dans `server-files/<id>/`, et ne lance rien d'autre qu'Electron.
  - Il permet de lire les métadonnées des dossiers du chemin de l'app, sans quoi Electron meurt au démarrage quand l'app est sous `/Users` (un checkout de développement, ou une app dans `~/Applications`).
  - Il donne à Electron son vrai chemin, et non un chemin qui passe par un lien symbolique.
- L'hôte doit être lisible sous `--permission` : `--allow-fs-read` le permet, ou il est lu hors de l'archive (`app.asar.unpacked`).
- Il redémarre quand un fichier de `server/`, `package.json` ou le lockfile changent.
- Ses erreurs et son `console` arrivent parmi les erreurs de la page (`look_at_preview`, les vérifications de fin de tour).

**Dans le runtime**
- La balise `{% load nom … %}` attend la réponse du process, et le rendu devient asynchrone partout (`parseAndRender`).
  - La sonde l'a mesuré : 3 à 6 % plus lent, le même HTML, et 0,1 à 0,2 ms par `load` jusqu'à un process enfant.
  - `runtime.fetch` est déjà asynchrone. Environ 13 appels directs au rendu suivent, avec 6 fichiers de tests.
  - Les notes et les datasources lues passent de l'instance du runtime au rendu lui-même, puisque deux rendus peuvent alors s'entrelacer.
- `/_server/<nom>` (action et route) passe par le champ piège et la limite par visiteur de `collected.ts`.
- L'API `data` réutilise `Datasources` et la validation des formulaires.

## Les tranches

### 0. La sonde

But : vérifier avant de construire ce qui n'a été que lu.
- Télécharger pnpm 12 (le binaire de la plateforme, son sha256) et lancer l'appel ci-dessus sur un projet jetable. Lire la configuration effective (`pnpm config list --json`), et voir une installation strict sans TTY, une version trop jeune et un `.npmrc` piégé.
- Installer Vite et wrangler avec ce pnpm. Lancer Vite (build SSR et build d'un paquet pour le navigateur) et `wrangler deploy --dry-run --outdir`, avec le Node d'Electron. Essayer wrangler sans ses dépendances optionnelles (sans workerd).
- Lancer un module serveur qui importe un paquet installé (les liens isolated), sous `--permission`, dans le sandbox macOS.
- Mesurer ce que coûte un rendu asynchrone pour `{% load %}` dans LiquidJS.
- Rapport dans `docs/spikes/` si quelque chose change le plan.

### 1. Le pnpm de Spaka et le `node_modules` du projet

- `main/packages/pnpm.ts` : téléchargement à la première demande (version et sha256 dans un fichier épinglé de l'app), environnement nettoyé, appel, lecture du ndjson.
- `node_modules` est exclu des exports, des archives de templates et du Glob et du Grep des deux agents. L'historique l'exclut déjà ([history.ts:33](../../apps/desktop/src/main/history/history.ts)), et l'aperçu l'ignore déjà.
- Les outils de fichiers des deux agents refusent d'écrire dans `node_modules`.
- Un `.npmrc` du projet est supprimé avant chaque installation, et l'agent est prévenu.
- Tests unitaires : l'environnement, les drapeaux, l'analyse du ndjson, les exclusions.

Fait le 2026-11-27 :
- **`main/packages/pnpm.ts`** :
  - Le téléchargement vérifie l'intégrité sha512 que donne le registre, plutôt qu'un sha256 : `pnpm.json` l'épingle pour six systèmes, avec la version 12.23.0.
  - Le programme est lu dans le `.tgz` par un petit lecteur tar, puis écrit dans `tools/pnpm-<version>/` d'un seul coup. Un seul téléchargement sert tous les appels simultanés.
  - L'environnement est nettoyé, les réglages passent tous par `--config.<nom>` (ils valent pour `add`, `remove` et `install`), et l'appel se fait sans terminal.
  - `packageSpec` n'accepte qu'un nom du registre npm, avec une version exacte ou sans version.
  - `readReport` lit le ndjson : les paquets ajoutés et retirés, les avertissements (y compris ceux en texte brut) et les erreurs avec leur code.
- **`main/packages/project.ts`**, avant chaque appel :
  - le `.npmrc` est supprimé, `devEngines` retiré et `"type": "module"` posé, et l'agent reçoit une phrase pour chaque changement ;
  - un `.ignore` liste `node_modules/`. Fichier caché, il n'entre ni dans l'historique ni dans les exports.
- **L'exclusion de `node_modules`** :
  - Les exports (par `published`), les archives de templates, l'adaptation et le Glob et le Grep du harness Pi l'excluaient déjà.
  - Le Grep de Claude lit le `.ignore`. Son Glob le lit aussi une fois `CLAUDE_CODE_GLOB_NO_IGNORE=false` posé dans l'environnement de l'agent.
  - Une limite, vue avec ripgrep sur les arguments mêmes du binaire : un motif qui désigne le dossier lui-même, comme `**/*`, y entre encore, car un `--glob` de ripgrep passe devant les fichiers d'ignore.
- **Les écritures** dans `node_modules` sont refusées :
  - pour Claude, par une règle `Edit(<projet>/node_modules/**)` ;
  - pour le harness Pi, dans ses `Write`, `Edit` et `Append`.

  La lecture reste permise : un README ou des types aident l'agent.
- **Vérifié** : les tests unitaires, et `pnpm.real.test.ts` (`SPAKA_REAL_PNPM=1`). Ce dernier télécharge pnpm, l'ajoute à un projet piégé (un `.npmrc` à jeton, un `pnpm-workspace.yaml`, un `.pnpmfile.cjs`, `devEngines`), puis le retire, en 4,5 s.

### 2. `add_package`, ses règles et la section Paquets

- `main/packages/rules.ts` lit les signaux : les téléchargements (l'API de téléchargements de npm), `time` et `dist.attestations` (le registre), la présence d'un script d'installation, deps.dev et OSV, le dépôt lié. Il compare aussi le nom aux paquets les plus téléchargés.
- Le résultat est « accepté », « refusé » (une faille, ou un script d'installation nécessaire) ou « à demander » (moins de 90 jours, moins de 1 000 téléchargements par semaine, un nom proche d'un paquet connu, pas de dépôt).
- `add_package` et `remove_package` pour les deux agents, et la carte au maker pour la zone grise.
- Un `package.json` changé à la main est installé, avec les mêmes règles.
- Dans les réglages du site, une section Paquets : nom, version, licence, source, côté, poids servi aux visiteurs, et un bouton Retirer.
- Les failles : à l'ouverture d'un site et avant un export, les versions installées sont comparées à OSV. Une faille donne une carte qui propose une mise à jour à l'agent, et l'export l'avertit.
- Tests unitaires des règles sur des réponses enregistrées ; vérification e2e de la carte.

Décidé en route (Q536 à Q540, dans `docs/v2.0-decisions.md`) :
- Ce que l'agent écrit lui-même dans les dépendances de `package.json` est remis comme installé, et l'agent est renvoyé à `add_package` ; ce que le maker écrit à la main hors d'un tour est installé, la zone grise avec une notice (Q536).
- La faille à l'ouverture est une notice avec un bouton « Ask for the update » (Q538).
- Seul un paquet qui compile du code natif à l'installation est refusé ; les autres scripts ne tournent pas, et l'agent le sait (Q539).
- Une ligne refusée est retirée de `package.json` avant d'installer le reste, avec une notice (Q540).

Fait le 2026-11-27 :
- **`main/packages/rules.ts`** :
  - La version : la plus récente dans la plage demandée (une version, une plage ou un tag), sinon pas plus récente que `latest`, ni pré-version ni dépréciée, publiée il y a au moins 7 jours.
  - Les signaux de cette version : le document complet du registre (l'abrégé n'a pas `time`), les téléchargements, OSV, et deps.dev pour la licence et le dépôt, que deps.dev vérifie par la provenance. deps.dev est facultatif ; le registre, les téléchargements et OSV hors d'atteinte font répondre à l'agent qu'il réessaie.
  - Le verdict suit Q500 et Q539. `node-gyp-build` compte parmi les compilateurs : son script compile quand aucun binaire préparé ne convient.
- **`main/packages/osv.ts`** : les failles d'un paquet, lues une fois avec toutes les versions qu'elles touchent (les intervalles d'OSV), d'où la version qui corrige ; et le lot des versions installées (`querybatch`, puis chaque faille lue une fois).
- **`main/packages/names.ts`** : un nom à une lettre près (ajoutée, ôtée, changée, deux voisines inversées) d'un des 15 913 paquets les plus téléchargés (`well-known.json`, tiré de npm-high-impact 1.13.0, MIT), dès 5 caractères, ou le même nom sans ses tirets, points ni portée. Aucune des 100 bibliothèques web courantes essayées n'est prise pour un typosquat.
- **`main/packages/lockfile.ts`** lit `pnpm-lock.yaml` : les paquets du projet avec leur plage, et chaque paquet installé avec ceux du projet qui l'amènent. `node_modules/.pnpm/lock.yaml` dit si `node_modules` est à jour (un dossier copié sans lui est réinstallé).
- **`main/packages/packages.ts`** : `add`, `remove`, la remise en place après l'agent, la synchronisation d'un `package.json` changé à la main, la liste des réglages et les failles. Une installation à la fois par projet. Un site sans paquet ne lance jamais pnpm ni ne télécharge rien.
- **Les agents** : `add_package` et `remove_package` dans `spaka-tools.ts`, pour Claude et pour le harness Pi, refusés en mode plan. La carte est une carte de question de Spaka (`agent.askQuestions`, qui partage l'attente de la carte des pages), sans choix recommandé ; l'agent rejoué fait tourner ces deux outils pour de vrai.
- **L'interface** : la section Packages des réglages du site (nom, version, licence, source, côté, Remove avec confirmation), les notices après un changement à la main, la notice d'une faille avec son bouton, une notice dite une seule fois, et les avertissements de l'export.
- **Vérifié** :
  - 27 tests unitaires, sur des réponses enregistrées (nanoid, lodash, sqlite3, core-js) et un vrai lockfile (Vite et wrangler), dont celui des vérifications de fin d'outil ;
  - `rules.real.test.ts` (`SPAKA_REAL_PACKAGES=1`) contre les vrais services, en 2 s ;
  - `e2e/packages.e2e.ts` : la carte, refusée puis acceptée, la section, la faille à la réouverture et son bouton, Remove, avec un pnpm qui n'installe rien (pas sous Windows pour l'installation, où pnpm est un programme).
- **Laissé à la tranche 3** : le poids servi aux visiteurs (la section l'affiche dès qu'il est connu), et la description de `add_package` et le skill site-scripts qui disent comment importer un paquet. Les modules de `scripts/` ne peuvent pas encore l'importer dans le navigateur.
- **Une limite** : mettre à jour un paquet du projet ne met pas à jour une dépendance déjà résolue dans le lockfile. La notice d'une faille amenée par un autre paquet demande la mise à jour de celui-ci, mais l'agent peut devoir le retirer et l'ajouter de nouveau.

### 3. Les paquets dans le navigateur

- Pour chaque paquet importé par `scripts/*.js` (lu dans les imports), Vite fait un module ES servi à `/_spaka/packages/<nom>@<version>.js`, avec sa notice de licence, gardé en cache par version.
- L'entrée de Vite réexporte aussi l'export par défaut (`export *` le laisse de côté). Spaka ajoute lui-même la notice de licence en tête du module : `build.license` de Vite ne fait que lister les licences dans `.vite/license.md`.
- La page reçoit une import map, dans l'aperçu (`preview/server.ts`) comme dans les trois exports.
- `scripts/libraries.json` et `scripts/lib/` ne sont plus lus (`runtime/scripts.ts`, `head.ts`). `template:check` les refuse.
- Le skill site-scripts est réécrit : les paquets à la place des librairies, et les imports à la place des globales (`import { animate } from "motion"`).
- Vérification : un site qui ajoute embla-carousel, dans l'aperçu et dans un export statique servi hors ligne.

Décidé en route (des choix techniques, sans nouvelle question) :
- **Rolldown en WebAssembly.** L'app publiée est signée avec le runtime renforcé de macOS, qui refuse de charger une bibliothèque native signée par un autre : le binding natif de rolldown, téléchargé par pnpm, ne se chargerait pas. Plutôt que d'ôter cette protection (`disable-library-validation`), Vite s'installe sans ses paquets optionnels, avec `@rolldown/binding-wasm32-wasi`, et l'hôte de build tourne sous les permissions de Node, qui refusent tout code natif. Mesuré : deux à six fois plus lent qu'en natif, mais sous la seconde (three.js en 0,3 à 0,5 s, Motion en 0,2 à 0,4 s), et gardé en cache. Le même chemin vaut sur chaque système et en développement.
- **L'adresse** est `/assets/packages/<nom>@<version>[/<chemin>].js` plutôt que `/_spaka/packages/` : `/_spaka/` est la route de gestion des sites publiés, où le Worker de Cloudflare passe en premier.
- **L'entrée de Vite est le nom importé lui-même**, résolu comme un navigateur le résout, avec `preserveEntrySignatures: "strict"` : le module exporte ce que le paquet exporte, son export par défaut compris, sans fichier d'entrée à écrire. Un paquet CommonJS n'a que son export par défaut.
- **`scripts/libraries.json` et `scripts/lib/` restent lus jusqu'à la tranche 4**, et `template:check` ne les refuse pas encore : les 37 templates s'en servent, et la vérification des templates de la CI échouerait. Le skill et les instructions ne parlent plus que des paquets ; un site qui en a encore les garde.

Fait le 2026-11-27 :
- **`main/packages/vite.ts`** : le pnpm de Spaka installe Vite 8.3.8 dans `tools/vite/` depuis `vite/package.json` et `vite/pnpm-lock.yaml` (faits avec les drapeaux de Spaka, donc sans version de moins de 7 jours), en lockfile figé et sans paquets optionnels (`pnpmFlags(…, { tools: true })`). L'installation se fait en place, car sous Windows les jonctions de pnpm gardent des chemins absolus qu'un dossier déplacé casserait ; une marque écrite après pnpm (`installed.txt`, le hachage du lockfile) dit qu'elle est allée au bout, et une installation interrompue est refaite. La copie du lockfile que pnpm garde dans `node_modules` ne peut pas servir : elle omet les paquets optionnels laissés de côté. Une seule installation sert tous les appels.
- **`main/packages/build-host.mjs`**, lancé par le Node de Spaka avec `--permission --allow-fs-read=* --allow-wasi --allow-worker` : il lit, mais n'écrit rien, ne lance aucun programme et ne charge aucun code natif. Il reçoit la liste des modules sur stdin et rend leur code sur stdout, et une erreur de rolldown en une ligne, sans le dossier du projet.
- **`main/packages/modules.ts`** : un module par nom ou chemin importé, fait par lots (un seul hôte pour tous ceux qui manquent).
  - Le reste de l'import map lui est laissé en externe, sauf un paquet dont il amène une autre version : `three/addons/…` importe le `three` de la page.
  - En tête, une notice par paquet empaqueté (trouvé par les fichiers que rolldown a lus) : nom, version, licence, et le texte du fichier de licence quand le paquet en livre un (embla-carousel et ogl n'en livrent pas).
  - Gardé dans `package-modules/` pour tous les sites, sous un hachage de ce dont il est fait : le nom importé, la version du paquet et de tout ce qu'il amène (le lockfile), ce qu'il laisse en externe, et les outils de cette version de Spaka. Une erreur n'est jamais gardée.
- **`runtime/scripts.ts`** : `packageImports` lit les imports de `scripts/**/*.js` (sauf `scripts/lib/`) et la version installée dans `node_modules`, d'où les entrées de l'import map (`SiteAssets.packages`). Un paquet importé mais pas installé, ou un nom qui n'en est pas un, est une note. L'import map passe dans la tête avant le script de démarrage, dans l'aperçu comme une fois exporté, et dans `site.json`.
- **L'aperçu** sert les modules à leur adresse, fait le premier demandé avec tous ceux qui manquent, et un module que Spaka n'a pas pu faire lève une erreur que l'aperçu lit dans la console. Il ne sert plus `node_modules`, `package.json` ni le lockfile, comme un export. La page se recharge quand l'import map change. Les modules d'un site sont faits d'avance après chaque installation, et Vite s'installe avec le premier paquet.
- **Les exports** reçoivent les modules de l'app (`BuildOptions.packageModules`), les écrivent dans `assets/packages/`, et avertissent pour un module manquant. `package.json`, le lockfile et `node_modules` n'y entrent jamais.
- **L'agent** : une note dès qu'un script qu'il écrit importe un paquet pas installé ; la description de `add_package` dit comment l'importer ; le skill site-scripts et les instructions parlent des paquets et des imports.
- **Les réglages** : le poids servi aux visiteurs, compressé, pour chaque paquet dont les modules sont faits.
- **Vérifié** :
  - les tests unitaires : les imports et l'import map, les modules faits avec le Vite du dépôt (la notice, l'export par défaut, le chemin qui partage son paquet, CommonJS, le cache, les erreurs), la route de l'aperçu, les exports, la note à l'agent ;
  - `e2e/browser-packages.e2e.ts` (il remplace `libraries.e2e.ts`, et demande le réseau) : les cinq paquets du skill écrits dans `package.json`, installés par le vrai pnpm sous les règles, faits par le vrai Vite sous les permissions de Node, chacun à l'œuvre en mode visiteur sans erreur, le module d'exemple du skill compris ; puis l'export statique, servi avec toute autre adresse refusée, où ils marchent pareil. En 10 s, téléchargements compris.
- **Limites** : la feuille de style d'un paquet n'est pas importée (l'agent copie ce qu'il faut dans `styles/`, le skill le dit) ; le module d'un paquet en contient tout, quoi qu'on en importe.

Repris le 2026-11-28 (Q557) : sous Windows, aucun paquet n'avait de module. Vite donnait au Rolldown en WebAssembly des chemins `D:/…`, qu'il prend pour relatifs et ne lit jamais (« Cannot resolve entry module »), et le Rolldown natif, qui les lit, est bloqué par Smart App Control (rolldown/rolldown#10801).
- **`build-host.mjs`** appelle Rolldown lui-même, sans Vite : `platform: "browser"`, les conditions et les champs que Vite prend pour un navigateur en production, `process.env.NODE_ENV` remplacé, `es2022`, minifié, les commentaires légaux gardés, et la feuille de style d'un paquet laissée de côté par un plugin.
- **`wasi-drives.mjs`**, chargé avant lui dans chacun de ses threads (`--import`) : sous Windows, chaque lecteur est ouvert dans le WASI comme `/c`, `/d`…, et la cible d'un lien est rendue sous cette forme : celle d'une jonction (un chemin Windows absolu) comme celle d'un lien symbolique relatif, que le pnpm 12 de Spaka fait quand Windows le permet (avec des `\`) ; ailleurs il ne fait rien. La traduction ne vaut que pour Rolldown en WebAssembly : les tests unitaires prennent le Rolldown natif du dépôt, qui lit les chemins Windows.
- **`main/packages/rolldown.ts`** (qui remplace `vite.ts`) : le pnpm de Spaka installe Rolldown 1.2.19 et son build WebAssembly dans `tools/rolldown/`, depuis `rolldown/package.json` et `rolldown/pnpm-lock.yaml` (mêmes paquets rolldown qu'avant, sans Vite ni ses dépendances).
- **Vérifié** : les tests unitaires (le message d'un chemin non exporté vient maintenant de Rolldown), et `e2e/browser-packages.e2e.ts` sur macOS et Windows ; ce test s'arrête maintenant aux erreurs de la page et les montre.

### 4. Les 37 templates passent aux paquets

- Repris de la tranche 3 : `scripts/libraries.json` et `scripts/lib/` ne sont plus lus (`runtime/scripts.ts`, `head.ts`, `START_JS`), et `template:check` les refuse.
- **Le template montré en grand montre ses images, plus le site qui tourne (Q541, Q544)** : l'image pleine longueur de chaque page, celle de bureau, avec un choix Bureau / Téléphone pour celle du téléphone, et la liste des pages comme avant. Les cartes gardent leur couverture et leur survol. La vue d'un template (`templates/viewer.ts`) et sa `WebContentsView` disparaissent : un template n'a pas de `node_modules`, et ses paquets ne s'installent qu'une fois un site fait à partir de lui.
- **Les images des pages entrent dans le .zip du template (Q545)**, téléchargé quand le template est montré en grand.
- **`template:check` accepte tout paquet npm sous les règles de Spaka (Q542, Q546)** : aucune faille, aucune compilation native, pas de zone grise ; une version exacte, une licence ouverte, jamais GSAP ; un lockfile et pas de `node_modules`. Les imports sont des noms listés dans `package.json` ou des chemins relatifs, jamais une adresse. La vérification demande le réseau.
- **Les templates à paquets déclarent `"app": "0.2.0"` (Q543)**, et l'app reste en 0.2.0 : aucune app Spaka n'a encore été publiée.
- Un site fait à partir d'un template installe ses paquets avant que l'agent ne le regarde.

- Dans get-spaka/templates : chaque template remplace `libraries.json` par des paquets (Motion, Lenis, Splitting, Embla, OGL) et ses modules par des imports, avec son lockfile.
- `FORMAT.md` est mis à jour.
- `template:shoot` et `templates-again.e2e.ts` vérifient que rien ne bouge (les images ne devraient pas changer).
- Une release des templates, publiée avec une app qui connaît les paquets.

Décidé en route (Q541 à Q546 dans `docs/v2.0-decisions.md`, et des choix techniques sans nouvelle question) :
- **`scripts/lib/` devient un dossier comme un autre**, des fichiers du site que ses modules importent par un chemin relatif : aucun template ne s'en servait. Un site qui a encore `scripts/libraries.json` reçoit une note qui dit à l'agent comment passer aux paquets ; rien n'en est chargé.
- **`pnpm template:install <dossier>`** installe les paquets d'un template avec le pnpm et les réglages de Spaka, et écrit le lockfile qu'il livre. Son `node_modules` ne sert qu'à l'auteur : `.gitignore` le laisse de côté, comme le `.ignore` que pnpm écrit.
- **La vérification en ligne** est dans `templates/check-packages.ts`, appelée par `template:check` et par la release ; `checkTemplate` reste hors ligne (les versions exactes, le lockfile, les imports) pour les tests. Chaque version n'est jugée qu'une fois par passage, et `template:check` prend plusieurs dossiers d'un coup : les 37 templates partagent cinq paquets, et les comptes de téléchargement de npm répondent 429 au-delà de quelques questions par minute. Une réponse 429 est reposée après l'attente qu'elle demande, deux fois au plus, pour l'app aussi. `template:release --offline` saute cette vérification, pour les vérifications de Spaka seulement (`templates-download.e2e.ts`), jamais pour une release publiée.
- **Les paquets d'un template s'installent avant que le site ne s'ouvre**, l'écran de départ restant sur son envoi en cours : ses pages se chargent avec eux, sans erreur d'import au premier chargement, et l'agent les trouve.
- **La lecture des imports ne prend que les instructions `import` et `export`** : le `"lunch-from"` de Saucer passait pour un import.
- **La migration** : les membres de `Motion` utilisés, importés par leur nom (`import { animate, inView } from "motion";`), sous un autre nom là où le module a déjà le sien (le `animate` de Covered devient `motionAnimate`) ; Lenis, Splitting et Embla par leur export par défaut ; OGL par `"ogl"` au lieu de son adresse jsDelivr. Les gardes sur les globales tombent (Chalk, Earshot, Taper, Transfer). Chaque template monte d'une version mineure.

Fait le 2026-11-27 :
- **`runtime/scripts.ts`** : `moduleSpecifiers` lit les imports des instructions `import` et `export` (et `import()`), `specifierPackage` en tire le paquet et son chemin. Sans module, aucune balise ; sinon l'import map, puis le script de démarrage, qui ne charge plus de librairie.
- **`templates/check.ts`** : la section des paquets. `package.json` n'a que `name`, `private`, `type` et `dependencies`, en versions exactes, sans GSAP ; le lockfile, au format 9, correspond à `package.json` (`lockfileOf`) ; les modules n'importent que ce qu'il liste, et jamais une adresse ; un template à paquets déclare `"app": "0.2.0"`.
- **`templates/check-packages.ts`** : chaque paquet jugé comme `add_package` le juge (`readSignals`, `judge`), une question au créateur devenant une erreur ; une licence ouverte, seule ou parmi les choix d'une expression SPDX ; puis OSV pour ce que le lockfile amène, en nommant le paquet qui l'amène.
- **`pnpm template:install <dossier>`** et **`template:check`** sur plusieurs dossiers (`templates/cli.ts`) ; la release (`release.ts`, `scripts/release.mjs` dans get-spaka/templates) vérifie en ligne et met `pictures/pages/` dans le .zip.
- **L'écran de départ** : `templates/large.ts` donne les pages montrées et l'image de chacune (`templates:pages`, `templates:page-picture`), `StartPanel.tsx` les montre avec le choix Bureau / Téléphone ; `templates/viewer.ts` et ses canaux disparaissent.
- **Dans get-spaka/templates** (branche `template/packages`, 6fa8752) : 36 templates passent aux paquets (Ruled n'a pas de script), mêmes versions qu'avant (motion 14.9.0, lenis 1.3.27, splitting 1.1.0, embla-carousel 8.6.0, ogl 1.0.11) ; `FORMAT.md`, le README, `.gitignore`.
- **Vérifié** :
  - `pnpm template:check apps/desktop/templates/*/ --finished` : 37 templates, aucune erreur, aucun avertissement, les paquets vérifiés en ligne en 17 s ; sur une copie avec `lodash 4.17.20` et `left-pad 1.3.0`, les quatre failles de lodash et l'abandon de left-pad ;
  - une release à blanc avec le `release.mjs` refait : les 37 en 24 s, des .zip jusqu'à 21 Mo ;
  - `templates-again.e2e.ts` : les 37 copiés passent la vérification d'après modification, avec leurs paquets installés ;
  - `template:shoot` d'Ember (quatre paquets, OGL compris) et d'Overhead (Embla) : les 14 images des pages d'Overhead identiques au pixel près ; celles d'Ember ne diffèrent que par le parallaxe lié au défilement (jusqu'à 4 % des pixels) et une étiquette de formulaire sur deux lignes au lieu de trois. Les images en place sont gardées ;
  - `start.e2e.ts`, `templates-download.e2e.ts`, `scripts.e2e.ts`, `browser-packages.e2e.ts` ;
  - les tests unitaires : la vérification en ligne sur des réponses écrites, le 429 reposé, les règles de `package.json`, du lockfile et des imports, les images des pages dans le .zip, une release arrêtée par un paquet refusé, les pages montrées en grand.
- **Pas encore** : la release des templates (v17), qui attend une app qui connaît les paquets.

### 5. Les modules serveur dans l'aperçu

- Le process serveur (choix techniques ci-dessus), avec la balise `{% load %}`, `/_server/<nom>` pour `action` et `route`, et `export const cache`.
- L'API `data`, le SQL sur la base du site (`node:sqlite` dans l'aperçu), et les migrations de `server/migrations/`, appliquées dans l'ordre et notées dans une table de Spaka.
- Le dossier inscriptible hors du projet.
- Un nouveau skill, `server-modules`, avec la règle TypeScript, les trois fonctions, les secrets, le SQL et le cache. Un mot dans les instructions des deux agents.
- Vérification e2e : un `load` qui appelle une API, une `action` avec son champ piège, une `route`, une migration, et une erreur qui arrive à l'agent.

Décidé en route (des choix techniques, sans nouvelle question) :
- **L'hôte est empaqueté avec les deux serveurs publiés** (`scripts/bundle-hosts.mjs` → `out/hosts/modules.mjs`, livré dans les ressources de l'app) : il est lisible sous `--permission` et dans le sandbox sans être écrit nulle part, et il réutilise le code du runtime (`moduleHost`, les migrations), que l'export Node reprendra.
- **Le canal est celui d'IPC de Node** (`stdio: "ipc"`), qui marche sous `--permission` ; `console` est renvoyé par ce canal, et la sortie standard d'un module y est lue aussi.
- **La base de l'aperçu** est `<userData>/server-db/<id>/data.sqlite`, à côté du dossier inscriptible `server-files/<id>/`. Elle a la table `records`, vide : dans l'aperçu, ce que les visiteurs envoient reste des fiches de test, que l'API `data` lit et que le SQL ne voit pas. Le skill le dit.
- **Le process ne démarre qu'au premier `load`, `action` ou `route`** qui nomme un module existant : un site sans `server/` n'en lance jamais.
- **Une erreur de `load` est une note de la page** (`load weather: … (server/weather.ts:12)`), comme une balise qui échoue ; une erreur d'`action` ou de `route`, ce que les modules affichent et une migration qui échoue sont des erreurs de la page dans `look_at_preview` (`server/book: …`, `server console: …`). Une migration qui échoue est redite à chaque regard jusqu'à ce qu'elle change.
- **Un appel qui dure plus de 30 s** arrête le process (une boucle infinie le bloquerait tout entier), qui redémarre au suivant.
- **L'aperçu ne limite pas le maker** : il ne passe pas d'adresse de visiteur, comme pour `/_data/`, et la limite par visiteur ne vaut qu'une fois publié.
- **Le Node 26 du système n'a plus `--experimental-transform-types`** : les tests prennent l'Electron du dépôt (Node 24), comme l'app.

Fait le 2026-11-28 :
- **`runtime/server.ts`** : les types des modules, `moduleHost` (l'import paresseux, refait après un échec ; le cache par arguments, 500 entrées au plus ; les données rendues simples, une date en texte ISO), `durationMs` et `VisitorLimiter`.
- **`runtime/runtime.ts`** : le rendu devient asynchrone, chaque rendu avec son état (fichier, notes, datasources lues) et son instance de Liquid (0,02 ms) ; la balise `{% load nom arg: valeur %}` ; `/_server/<nom>` (l'action par htmx, avec le champ piège et la limite par visiteur, son fragment `answer` ; la route sinon) ; l'API `data` (`list`, et `add` validé comme un formulaire). Tout ce qui rendait dans l'app, le builder et les tests attend maintenant le rendu.
- **`runtime/hosts/modules.ts`** (les modules de `server/`, les migrations de `server/migrations/` dans la table `spaka_migrations`, une par transaction, arrêtées à la première qui échoue ; le SQL sur `node:sqlite`) et **`hosts/modules-main.ts`**, l'hôte, avec **`modules-protocol.ts`** pour les messages.
- **`preview/server-process.ts`** : un process par site, lancé par `sandbox-exec` sur macOS avec un profil tiré de celui du shell Pi (`confinedProfile` dans `agent/pi/shell.ts` : lecture du projet, de l'hôte et du bundle de l'app, écriture dans les deux dossiers du site, aucun autre programme), sous `--permission` partout ; l'environnement ne tient que les secrets du site (vides jusqu'à la tranche 6) ; redémarré quand `server/`, `package.json` ou le lockfile changent.
- **L'agent** : le skill `server-modules` (les trois fonctions, le contexte, la balise, le formulaire, la base et ses migrations, la règle TypeScript, les paquets, ce qu'un module ne peut pas faire) ; les instructions et le skill htmx-patterns en parlent.
- **Vérifié** :
  - les tests unitaires : 8 pour la balise, le cache, `/_server/` et l'API `data` ; 4 pour le process réel (TypeScript, migrations, permissions et sandbox, erreurs situées, `console`, redémarrage après un module bloqué) ;
  - `e2e/server-modules.e2e.ts` : un `load` qui appelle une API locale, gardé en cache ; une réservation par `action` jusqu'à « complet », le robot ignoré ; un calendrier par `route` ; l'erreur d'écriture dans le projet et le `console.log` dans le regard de l'agent ; une migration qui échoue ; un module changé relancé.

### 6. Les secrets

- Un magasin par site, chiffré par `safeStorage`, et une section Secrets dans les réglages du site.
- `ask_secret` : une carte avec un champ masqué. L'agent apprend seulement « fourni » ou « refusé ».
- Le process serveur reçoit les secrets du site, et rien d'autre, dans son environnement. Un secret manquant donne une erreur claire.
- Vérification : la valeur n'apparaît jamais dans la conversation, les fichiers, les journaux ni l'historique.

Décidé en route (Q558 et Q559, sur des propositions visuelles, et des choix techniques sans nouvelle question) :
- **La section Secrets ne réaffiche jamais une valeur** (Q558) : un secret se remplace ou se retire ; ceux que les modules lisent sans valeur sont « Missing », avec leur champ en place. Spaka les trouve en lisant `server/` (`env.NOM`, `env["NOM"]`, et les noms tirés de `env` par déstructuration).
- **La carte d'`ask_secret` est une carte de question avec un champ masqué** (Q559). La valeur part par son propre canal (`secrets:provide`) ; la conversation n'en garde que « donné ». Des mots tapés dans la zone de message pendant qu'elle attend y restent : ils pourraient être la clé.
- **Un secret lu sans valeur lève une erreur claire** dans le module (un `Proxy` sur `env`), qui arrive à l'agent avec les notes de la page.
- **Le process serveur redémarre** quand un secret change, avec les nouvelles valeurs.
- **`ask_secret` est refusé en mode plan**, comme `add_package`. Un secret déjà donné n'est pas redemandé : l'agent apprend qu'il existe.

Fait le 2026-11-28 :
- **`main/secrets/site-secrets.ts`** : un fichier `site-secrets.bin` chiffré par le coffre (`safeStorage`, ou le faux coffre des vérifications), par site : valeur, à quoi il sert, où le trouver, date ; et les secrets lus par les modules.
- **L'agent** : `ask_secret(name, purpose, where_to_find)` pour Claude et le harness Pi ; la carte de Spaka (`agent.askSecret`) ; la réponse dit « donné » ou « pas donné », jamais la valeur ; le skill `server-modules` a une section Secrets.
- **L'interface** : `SecretCard.tsx` et la section Secrets de `SiteSettings.tsx`.
- **Vérifié** : les tests unitaires (le magasin, les secrets lus par les modules, la carte dans la conversation, l'erreur d'un secret manquant dans le vrai process) ; `e2e/secrets.e2e.ts` sur un enregistrement rejoué (`fixtures/secrets-recording.ts`) dont `ask_secret` tourne pour de vrai : l'erreur avant, la carte, les mots gardés dans la zone, « donné » pour l'agent, le module qui lit la clé ; le refus ; la section (manquant donné en place, remplacé, retiré) ; et la valeur absente de tout le dossier de données de Spaka et du projet (hors `site-secrets.bin`), comme de la conversation affichée.

### 7. Les exports statique, Node et Cloudflare

- **Statique** : chaque `load` tourne à l'export (par le process serveur). `action` et `route` sont refusées, avec le message de l'export.
- **Node** : le Rolldown de Spaka (`platform: "node"`, comme pour le navigateur depuis Q557, plutôt que le build SSR de Vite) empaquette `server/` et ses paquets à côté de `server.mjs`. Le serveur applique les migrations à son démarrage, et le dossier inscriptible vit à côté de `data.sqlite`. L'export avertit pour un paquet qui ne s'empaquette pas.
- **Cloudflare** : wrangler empaquette le Worker à l'export, avec les migrations D1 de `server/migrations/`, les secrets en `.env` pour `wrangler secret`, et l'avertissement pour le dossier inscriptible absent.
  - Wrangler tourne avec un préchargement qui pose `process.defaultApp = true` : sans lui, yargs prend Electron lancé comme Node pour une app empaquetée et lit le chemin du script comme une commande.
  - `WRANGLER_SEND_METRICS=false`, et `XDG_CONFIG_HOME` dans le dossier wrangler de Spaka, où vont ses journaux.
- Vérification : les trois exports du site de la tranche 5, Node lancé et Cloudflare avec `wrangler dev`.

Décidé en route (des choix techniques, sans nouvelle question) :
- **Le Rolldown de Spaka empaquette `server/` pour Node comme pour Cloudflare**, dans l'hôte de build de la tranche 3 (un mode « serveur », toujours sous les permissions de Node, en WebAssembly). Il sort `modules.mjs`, qui importe chaque module à son premier appel, et leurs morceaux dans `server/`, paquets compris. Pour Cloudflare il résout les paquets comme workerd (`workerd`, `worker`, `browser`), laisse les modules de Node à la compatibilité Node.js du Worker, et wrangler emballe le tout au déploiement.
- **Rolldown part du vrai chemin du projet** : le code empaqueté nomme chaque fichier `server/book.ts`, et rien des dossiers de la machine.
- **Un empaquetage qui échoue arrête l'export**, avec la raison de Rolldown (un paquet au code natif, un fichier manquant) : un site publié sans ses modules casserait en silence. Ses avertissements arrivent avec ceux de l'export.
- **Statique** : les `load` tournent par le process serveur de l'aperçu, avec ses données. Un module qui a une `action` ou une `route` ne bloque pas l'export : l'export dit qu'elle n'a pas de serveur là (Q503), comme il le dit d'un formulaire sans service. `server/` n'est jamais copié dans les fichiers publiés.
- **`site.json` gagne `server`** : les noms des modules, ceux des secrets, et les migrations. Le serveur Node applique les migrations à son démarrage ; le Worker reçoit celles de `server/migrations/` à la suite de `0001_records.sql` (`0002_places.sql`…), que `wrangler d1 migrations apply` applique une fois chacune.
- **Les secrets dans `.env`** : ceux que Spaka garde remplacent ceux d'un export précédent ; ceux que les modules lisent sans valeur y sont en commentaire, à donner là. Pour Cloudflare, ils sont aussi dans `.dev.vars` (pour `wrangler dev`) et dans `secrets.required`. Un secret vide compte comme absent.
- **Le dossier de fichiers** : `data/files` sur Node (à côté de `data.sqlite`, dans le volume `/data` avec Docker). Pour Cloudflare, l'export avertit quand un module prend `files`.
- **Un `load` coupé par un redémarrage du process de l'aperçu** (un module changé, un secret donné) est refait une fois sur le nouveau process ; une `action` ou une `route` jamais, elle a pu écrire.
- **Reporté à la tranche 8** : le préchargement de wrangler et ses variables, qui ne servent qu'à faire tourner le wrangler de Spaka ; et le mot « table » au singulier de l'étape de la base dans le guide de Publish, qui change avec le déploiement depuis Spaka (proposition visuelle).

Fait le 2026-11-28 :
- **Le runtime** : `hosts/node.ts` (les migrations au démarrage, `data/files`, les secrets lus dans l'environnement) et `hosts/worker.ts` (SQL sur D1, les secrets des bindings) font tourner `modules.mjs` ; `secretsEnv` et `modulesAmong` sont partagés avec l'aperçu.
- **Les constructeurs** : `BuildOptions.server` (le process de l'aperçu, l'empaquetage, les secrets) ; `writeServerModules` et les lignes de `.env` dans `shared.ts` ; les guides Node et Cloudflare en parlent ; le skill `server-modules` a une section « Once published ».
- **L'app** : `PackageModules.server` et le mode serveur de `build-host.mjs` ; `export:run` leur passe le process de l'aperçu, l'empaquetage et les secrets.
- **Vérifié** : les tests unitaires (le runtime publié sur Node et sur un faux D1 ; l'empaquetage réel pour Node, exécuté, et pour un Worker ; les trois constructeurs, `.env` stable d'un export à l'autre ; un `load` qui survit à un redémarrage) ; `e2e/server-exports.e2e.ts` : l'export statique avec la réponse du `load` dans la page et l'avertissement de l'`action` ; le serveur Node lancé (migrations, secret de `.env`, réservation, calendrier, `data/files`) ; le Worker sous `wrangler dev` sur un D1 local ; et `servers`, `export`, `server-modules`, `secrets` toujours verts.

### 8. Le déploiement sur Cloudflare depuis Spaka

- Le compte Cloudflare se connecte par le navigateur, comme `wrangler login`, avec le dossier de wrangler propre à Spaka.
- Publier pour Cloudflare : création de la D1, migrations, envoi des secrets, déploiement. L'adresse que donne wrangler devient celle du site publié.
- Le dialogue de publication (Q392) propose le déploiement et garde l'export en dossier pour chaque builder.
- Vérification : un vrai déploiement sur ton compte, puis un second déploiement du même site.

### 9. Le template de l'école de surf

- Avec le skill making-templates : un brief que tu approuves d'abord. Puis la houle et le vent d'Open-Meteo en `load` avec cache, la réservation d'un cours en `action` avec des places limitées en SQL, le calendrier des cours en `.ics` par une `route` (paquet ical-generator), et un paquet côté navigateur si le design le demande.
- Son guide (`TEMPLATE.md`) dit ce que le template fait côté serveur ; il n'a besoin d'aucun secret.

### 10. Registres privés et dépôts git

- Un registre privé ou un scope (`@acme/*`), avec son jeton dans les Comptes, donné à pnpm par le `npmrc` de Spaka.
- Un dépôt git, à un commit fixé.
- Ces paquets échappent aux règles du registre public et sont marqués comme tels dans la section Paquets.

### 11. Vérifications avec les vrais agents

- Claude et le harness Pi (GPT-6.2 Sol, Gemini sur Vertex) : ajouter un paquet côté navigateur, écrire un module serveur qui appelle une API ouverte, demander un secret, exporter.
- Sous Windows, ton essai : pnpm, le process serveur sous `--permission` seul, le déploiement.

## À vérifier, ou risques

- **Le poids de wrangler** : environ 300 Mo au premier export pour Cloudflare, workerd compris (tranche 0).
- **La signature** sur macOS : un binaire téléchargé par l'app n'est pas mis en quarantaine, mais il faut le vérifier dans une app empaquetée.
- **Le store et le projet sur deux volumes différents** : pnpm copie au lieu de cloner (plus de disque).
- **Le réseau ouvert** aux modules serveur, et l'environnement qui peut contenir des secrets (ADR 0014).
- **Le SQL des modules peut modifier `records`** (Q518) : les vérifications de Spaka doivent tolérer une table changée à son insu.
