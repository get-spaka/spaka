# Spaka v2 : plan de construction des paquets et des modules serveur (Q490-Q535)

## État (2026-11-27) : conçu, la sonde faite

| Tranche | Fait | Commits |
|---|---|---|
| 0. La sonde : pnpm 12, Vite, wrangler et Node sous permissions | ✅ | (résultats dans [`docs/spikes/packages.md`](../spikes/packages.md)) |
| 1. Le pnpm de Spaka et le `node_modules` du projet | | |
| 2. `add_package`, ses règles et la section Paquets | | |
| 3. Les paquets dans le navigateur | | |
| 4. Les 37 templates passent aux paquets | | |
| 5. Les modules serveur dans l'aperçu | | |
| 6. Les secrets | | |
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
- `tools/pnpm-<version>/pnpm`, plus `tools/node_modules/` pour Vite et wrangler, installés par ce pnpm depuis un `package.json` et un lockfile livrés avec l'app.
  - Vite seul pèse 31 Mo, et vient avec le premier paquet.
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

### 2. `add_package`, ses règles et la section Paquets

- `main/packages/rules.ts` lit les signaux : les téléchargements (l'API de téléchargements de npm), `time` et `dist.attestations` (le registre), la présence d'un script d'installation, deps.dev et OSV, le dépôt lié. Il compare aussi le nom aux paquets les plus téléchargés.
- Le résultat est « accepté », « refusé » (une faille, ou un script d'installation nécessaire) ou « à demander » (moins de 90 jours, moins de 1 000 téléchargements par semaine, un nom proche d'un paquet connu, pas de dépôt).
- `add_package` et `remove_package` pour les deux agents, et la carte au maker pour la zone grise.
- Un `package.json` changé à la main est installé, avec les mêmes règles.
- Dans les réglages du site, une section Paquets : nom, version, licence, source, côté, poids servi aux visiteurs, et un bouton Retirer.
- Les failles : à l'ouverture d'un site et avant un export, les versions installées sont comparées à OSV. Une faille donne une carte qui propose une mise à jour à l'agent, et l'export l'avertit.
- Tests unitaires des règles sur des réponses enregistrées ; vérification e2e de la carte.

### 3. Les paquets dans le navigateur

- Pour chaque paquet importé par `scripts/*.js` (lu dans les imports), Vite fait un module ES servi à `/_spaka/packages/<nom>@<version>.js`, avec sa notice de licence, gardé en cache par version.
- L'entrée de Vite réexporte aussi l'export par défaut (`export *` le laisse de côté). Spaka ajoute lui-même la notice de licence en tête du module : `build.license` de Vite ne fait que lister les licences dans `.vite/license.md`.
- La page reçoit une import map, dans l'aperçu (`preview/server.ts`) comme dans les trois exports.
- `scripts/libraries.json` et `scripts/lib/` ne sont plus lus (`runtime/scripts.ts`, `head.ts`). `template:check` les refuse.
- Le skill site-scripts est réécrit : les paquets à la place des librairies, et les imports à la place des globales (`import { animate } from "motion"`).
- Vérification : un site qui ajoute embla-carousel, dans l'aperçu et dans un export statique servi hors ligne.

### 4. Les 37 templates passent aux paquets

- Dans get-spaka/templates : chaque template remplace `libraries.json` par des paquets (Motion, Lenis, Splitting, Embla, OGL) et ses modules par des imports.
- `FORMAT.md` est mis à jour, avec la version minimale de l'app relevée.
- `template:shoot` et `templates-again.e2e.ts` vérifient que rien ne bouge (les images ne devraient pas changer).
- Une release des templates, publiée avec une app qui connaît les paquets.

### 5. Les modules serveur dans l'aperçu

- Le process serveur (choix techniques ci-dessus), avec la balise `{% load %}`, `/_server/<nom>` pour `action` et `route`, et `export const cache`.
- L'API `data`, le SQL sur la base du site (`node:sqlite` dans l'aperçu), et les migrations de `server/migrations/`, appliquées dans l'ordre et notées dans une table de Spaka.
- Le dossier inscriptible hors du projet.
- Un nouveau skill, `server-modules`, avec la règle TypeScript, les trois fonctions, les secrets, le SQL et le cache. Un mot dans les instructions des deux agents.
- Vérification e2e : un `load` qui appelle une API, une `action` avec son champ piège, une `route`, une migration, et une erreur qui arrive à l'agent.

### 6. Les secrets

- Un magasin par site, chiffré par `safeStorage`, et une section Secrets dans les réglages du site.
- `ask_secret` : une carte avec un champ masqué. L'agent apprend seulement « fourni » ou « refusé ».
- Le process serveur reçoit les secrets du site, et rien d'autre, dans son environnement. Un secret manquant donne une erreur claire.
- Vérification : la valeur n'apparaît jamais dans la conversation, les fichiers, les journaux ni l'historique.

### 7. Les exports statique, Node et Cloudflare

- **Statique** : chaque `load` tourne à l'export (par le process serveur). `action` et `route` sont refusées, avec le message de l'export.
- **Node** : le build SSR de Vite empaquette `server/` et ses paquets à côté de `server.mjs`. Le serveur applique les migrations à son démarrage, et le dossier inscriptible vit à côté de `data.sqlite`. L'export avertit pour un paquet qui ne s'empaquette pas.
- **Cloudflare** : wrangler empaquette le Worker à l'export, avec les migrations D1 de `server/migrations/`, les secrets en `.env` pour `wrangler secret`, et l'avertissement pour le dossier inscriptible absent.
  - Wrangler tourne avec un préchargement qui pose `process.defaultApp = true` : sans lui, yargs prend Electron lancé comme Node pour une app empaquetée et lit le chemin du script comme une commande.
  - `WRANGLER_SEND_METRICS=false`, et `XDG_CONFIG_HOME` dans le dossier wrangler de Spaka, où vont ses journaux.
- Vérification : les trois exports du site de la tranche 5, Node lancé et Cloudflare avec `wrangler dev`.

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
