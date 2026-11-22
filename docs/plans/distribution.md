# Upstart v2 : plan de la diffusion (0.2.0, macOS et bêta Windows)

## État (2026-11-22) : tranches 0 à 5 faites, la 6 est mise de côté

| Tranche | Fait | Commits |
|---|---|---|
| 0. Le dépôt prêt à être public | ✅ | d4547c8 (licence MIT « Upstart contributors », Q377 ; README ; `.gitattributes`). Un nouveau scan gitleaks, le 2026-11-21, n'a rien trouvé. Le message à Anthropic est rédigé ([anthropic-message](anthropic-message.md)), pas encore envoyé |
| 1. La version minimale d'app par template (Q368, Q380) | ✅ | 7fc79ee, fusionnée en 6945e4a ; app en 0.2.0 ; templates v10 |
| 2. La mise à jour automatique (Q367, Q378) | ✅ | 8429342 |
| 3. macOS signé et notarisé (Q369, Q379) | ✅ en configuration | 533853e. Aucune app n'a encore été signée ni notarisée avec les vrais secrets : cela se vérifie en tranche 6 |
| 4. Windows (Q361, Q365, Q372, Q375) | ✅ | b76dc9e ; ensuite, Git Bash sous garde pour le harnais Pi (Q381-Q382, 9570e76) |
| 5. La CI et la release | ✅ | 5f0b674, ae60798, 5106e96 ; CI verte sur macOS et Windows depuis 16741fb. `release.yml`, `docs/releasing.md` et `docs/releases/0.2.0.md` sont écrits |
| 6. Les candidates et la 0.2.0 | ⏸ mise de côté le 2026-11-21 | Le nom du projet peut encore changer |

Reste, pour la tranche 6 : Matt rend le dépôt public (les commits portent son e-mail de commit) et crée les secrets de signature ; il envoie le message à Anthropic ; puis `v0.2.0-rc.1`, `v0.2.0-rc.2` (mise à jour depuis la rc.1) et `v0.2.0`, avec l'essai de Matt sous Windows.

## Contexte

Vous avez choisi de préparer la diffusion de l'app. La conception est faite : Q361 à Q375, section « Distributing the app » de `docs/v2.0-decisions.md` (commits 2a0e5e8 et 2d0e2b7).

Ce qui est décidé :
- **0.2.0**, pour macOS sur Apple Silicon (signée et notarisée avec votre compte Apple Developer) et une bêta Windows x64 non signée, avec un installeur NSIS par utilisateur.
- **Le dépôt de l'éditeur devient public**, avec tout son historique, après un scan des secrets. C'est vous qui le rendez public.
- **Les releases** sont construites par GitHub Actions sur un tag `vX.Y.Z`. Leur page GitHub sert au téléchargement et alimente les mises à jour.
- **Les mises à jour** sont téléchargées en fond, avec la note « Update ready — Restart », ou installées en quittant.
- **Chaque template indique la version d'app minimale** qu'il demande.
- **Sous Windows, Git for Windows est exigé**, pour que le shell de Claude soit Git Bash. Le harness Pi n'y a pas de shell.
- **Je rédige le message à Anthropic**, et vous l'envoyez avant la 0.2.0.
- **Windows passe par la CI**, puis par votre essai sur un PC ou une VM.
- **Le site public** vient en dernier, conçu à part.

### Ce qui existe aujourd'hui

**Le paquet**
- `apps/desktop/package.json` contient `package` : `electron-builder --mac --arm64 --publish never`.
- La cible est `dir`, avec `mac.identity: null`, donc l'app n'est ni signée ni notarisée.
- La version est 0.1.0.

**Ce qui manque**
- Aucune mise à jour automatique : pas d'electron-updater ni de config `publish`.
- Aucun workflow à la racine (`.github/` absent). Pas de `LICENSE`, de `README.md` ni de `.gitattributes` à la racine.

**Les templates**
- `main/templates/library.ts` lit `<releases>/latest/download/catalogue.json` sans regarder la version de l'app.
- `release.ts` construit le catalogue (`CatalogueEntry` = manifeste, zip, images).

**Ce qui bloquerait sous Windows** (inventaire fait par un sous-agent, en lecture seule)
- `confinement.ts` :
  - le binaire `…/claude` au lieu de `claude.exe` (:117) ;
  - la sandbox avec `failIfUnavailable: true` (:75-85) ;
  - des règles en chemins POSIX ;
  - le lanceur `node` en `#!/bin/sh` (:127).
- `index.ts:368` sépare le PATH par `:` et garde des clés `Path` et `PATH` en double.
- Chrome de fenêtre : `titleBarStyle: hiddenInset` et les feux tricolores (`index.ts:177`), ce qui ne laisse aucun bouton de fenêtre sous Windows. Le rendu réserve un espace à gauche (`pl-20`).
- `agent/replay.ts:118` remplace les chemins dans du JSON sans échapper les `\`.
- `scripts/template.mjs` lance `pnpm` et `npx` sans `shell`. `dev:live` fixe une variable d'environnement à la manière de bash.
- `scripts/icon.mjs` ne fait qu'un `.icns`.
- Les écritures atomiques par `renameSync` lèvent EPERM sous Windows.
- `connectors.ts:319` (`splitCommand`) mange les `\`. `npx` est lancé sans `cmd /c` pour Claude.
- Mineurs :
  - le menu de l'app est propre à macOS ;
  - les raccourcis s'affichent en ⌘ ;
  - le texte dit « Show in Finder » ;
  - `Documents` est pris par `homedir()` ;
  - pas de `setAppUserModelId` ;
  - pas de gestion de `second-instance`.
- e2e : `scripts/background-electron.ts` ne connaît que `dist/mac-arm64/Upstart.app`, et quelques tests sont propres à macOS.

## Règles de travail (inchangées)

- Lancements en arrière-plan (`UPSTART_BACKGROUND=1`). `dev:live` est arrêté pendant les builds.
- Un commit sur `main` par tranche qui fonctionne, puis un push.
- `git add` par chemins explicites, après un scan des clés. Jamais `homes/keys.env`, `auth.json` ni aucune clé.
- **Les secrets de signature** (certificat .p12 et son mot de passe, clé API App Store Connect) :
  - c'est vous qui les créez et les saisissez dans les secrets du dépôt ;
  - je ne les lis, ne les tape et ne les affiche jamais ;
  - je vous donne seulement leurs noms et la marche à suivre.
- Toute nouvelle question de conception vous est posée, à partir de Q376.

## Tranches

### 0. Le dépôt prêt à être public
- **Le scan des secrets** : `gitleaks` (installé par Homebrew) passe sur tout l'historique (`gitleaks git --log-opts=--all`), avec en plus une recherche ciblée de `keys.env`, `auth.json`, `sk-`, `AIza` et de l'e-mail dans tous les commits. Je vous montre le rapport.
  - **Si un secret apparaît** : je vous le dis, sans afficher sa valeur. Vous décidez : révoquer la clé, réécrire l'historique (Q376), ou les deux.
- **`LICENSE`** : MIT, au nom que vous me donnerez.
- **`README.md`** :
  - ce qu'est Upstart ;
  - le téléchargement (dernière release) ;
  - Windows en bêta, avec l'avertissement SmartScreen et Git for Windows ;
  - la construction depuis les sources.
- **`.gitattributes`** : `* text=auto eol=lf`, pour que la CI Windows ne voie pas tous les fichiers changés.
- **Les fichiers ignorés** : je vérifie `.gitignore` (`homes/`, `e2e/.runs`, `dist`, `out`).
- **Le message à Anthropic** (ADR 0002) : rédigé en anglais dans [`anthropic-message.md`](anthropic-message.md), pour que vous l'envoyiez.

### 1. La version minimale d'app par template (Q368)
- **`manifest.ts`** : `app`, facultatif, une version minimale `x.y.z`. `template:check` vérifie qu'un template qui utilise le champ `images` déclare `app` ≥ 0.2.0.
- **`release.ts`** :
  - chaque entrée du catalogue garde `app` ;
  - le catalogue gagne `earlier`, les versions précédentes de chaque template qui demandent une app plus ancienne, avec le tag de leur release.
  - Le script de release lit le catalogue de la release précédente pour reporter ces entrées.
- **`library.ts`** compare `app.getVersion()` :
  - il prend la dernière entrée compatible, téléchargée par le tag de sa release ;
  - s'il n'y en a aucune, le template n'est pas montré.
- **Tests** : `release.test.ts` et `library.test.ts`, avec Aspect 1.1.0 (`app: 0.2.0`) et Aspect 1.0.0 en v8.
- **Côté templates** : Aspect 1.1.1 déclare `app: "0.2.0"`. Le script de release est régénéré. La release v10 se fait après votre accord.

### 2. La mise à jour automatique (Q367)
- **Dépendance** : `electron-updater`, avec le fournisseur GitHub (`upstart-gg/upstart-editor`) dans `build.publish`.
- **Nouveau `main/update.ts`** :
  - une vérification au lancement, puis toutes les 4 h ;
  - `autoDownload` et `autoInstallOnAppQuit` ;
  - à `update-downloaded`, un événement vers le rendu.
  - Il est éteint hors de l'app empaquetée, en e2e et quand `UPSTART_BACKGROUND` est posé.
- **Le rendu** : une note discrète « Update ready — Restart », qui appelle `quitAndInstall`. Les textes vont dans `en.ts`.
- **Statistiques** : un événement `update_installed` (Aptabase), avec la version seule.
- **Tests** : unitaires avec un faux updater (calendrier, événements, rien hors paquet). La vérification réelle se fait en tranche 6.

### 3. macOS signé et notarisé
- **`build.mac`** :
  - cibles `dmg` et `zip` (le zip sert au updater), arm64 seul ;
  - `hardenedRuntime`, des `entitlements` (JIT et mémoire exécutable d'Electron) ;
  - `notarize: true`, par l'API App Store Connect.
- **Le binaire officiel de Claude reste tel que publié** (ADR 0002). Il est exclu de la signature (`signIgnore`), puisque son code est déjà signé et notarisé par Anthropic.
  - Je vérifie que la notarisation l'accepte ainsi. Sinon, je vous pose la question (Q377).
- **sharp, libvips et les hôtes** sont signés avec votre identité.
- **Un premier essai local** : `pnpm package:mac` signe avec le certificat Developer ID de votre trousseau (codesign le lit lui-même, je n'y touche pas), puis notarise si les variables sont posées dans votre terminal.
  - On vérifie avec `codesign --verify --deep --strict`, `spctl -a -vv` et `xcrun stapler validate`.
- **« L'agent dans une app signée et notarisée »** (dans « Not verified yet ») : `e2e/agent-sandbox.e2e.ts` et un tour réel de l'agent tournent sur l'app signée, l'app étant lancée hors champ.

### 4. Windows
- **Agent (`confinement.ts`)** :
  - `claude.exe` sous win32 ;
  - la sandbox éteinte sous Windows, en mode `auto` (ADR 0007) ;
  - `CLAUDE_CODE_GIT_BASH_PATH` vers le bash trouvé, et `CLAUDE_CODE_USE_POWERSHELL_TOOL=0` pour n'avoir qu'un shell ;
  - les règles `Edit()` et `denyRead` en chemins Windows ;
  - le lanceur `node` en `.cmd`.
- **Git for Windows (Q375)** :
  - nouveau `main/agent/git-bash.ts` : il cherche bash dans les emplacements habituels, puis `where git` ;
  - s'il n'est pas trouvé, le panneau de connexion montre « Upstart needs Git for Windows », avec le lien de téléchargement et « Check again » ;
  - l'agent ne démarre pas sans lui.
- **`index.ts`** :
  - `path.delimiter` et une seule clé `PATH` ;
  - `app.getPath("documents")` ;
  - `setAppUserModelId` ;
  - `second-instance`, qui ramène la fenêtre ;
  - la fenêtre en `titleBarStyle: "hidden"` avec `titleBarOverlay` (les boutons de Windows, aux couleurs du thème clair ou sombre). Le rendu réserve l'espace à droite au lieu de la gauche (classe `platform-win` sur `html`).
- **Menu et raccourcis** :
  - le menu de Windows : File, Edit, View, Help, avec Settings dans File, caché et accessible par Alt ;
  - `keysOf` affiche Ctrl, Alt et Shift ;
  - « Show in Explorer ».
- **Fichiers** : une fonction `replaceFile(tmp, file)` partagée, qui réessaie sur EPERM et EBUSY, remplace les `renameSync` des écritures atomiques.
- **Connecteurs** :
  - `splitCommand` ne traite plus `\` comme un échappement sous Windows ;
  - pour Claude, `npx` et les `.cmd` passent par `cmd /c`.
- **`replay.ts`** : il remplace sur les objets, pas dans le texte JSON.
- **Scripts** :
  - `cross-env` dans `dev:live` ;
  - `shell: true` pour pnpm et npx sous win32 dans `template.mjs` ;
  - `icon.mjs` produit aussi `build/icon.ico` (16 à 256 px, l'art sans l'ombre de macOS) ;
  - `build.win` en NSIS par utilisateur (`oneClick`, `perMachine: false`), x64.
- **e2e** :
  - `background-electron.ts` connaît `dist/win-unpacked/Upstart.exe` ;
  - les tests propres à macOS sont marqués ;
  - le fixture rejoué fonctionne avec des chemins Windows.

### 5. La CI et la release
- **`.github/workflows/ci.yml`**, sur push et PR, sur macOS et Windows :
  - checkout avec le sous-module, pnpm avec cache ;
  - lint, typecheck, `vitest run` ;
  - empaquetage sans signature, puis les e2e rejoués sur l'app empaquetée.
- **`.github/workflows/release.yml`**, sur un tag `v*` :
  - un job macOS, qui construit, signe, notarise et envoie à une release brouillon ;
  - un job Windows, qui construit le NSIS et l'ajoute à la même release ;
  - quand les deux réussissent, la release est publiée avec les notes que j'écris, `latest-mac.yml` et `latest.yml` compris.
- **Les secrets à créer** : `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. Je vous donne la marche à suivre ; vous les saisissez vous-même.

### 6. Les candidates et la 0.2.0
- **Vous rendez le dépôt public** et créez les secrets.
- **Je pose `v0.2.0-rc.1`** (pre-release). On vérifie :
  - le DMG s'ouvre sans avertissement de Gatekeeper ;
  - l'installeur Windows montre l'avertissement SmartScreen prévu, puis demande Git for Windows. Vous l'essayez sur un PC ou une VM.
- **`v0.2.0-rc.2`** vérifie la mise à jour automatique depuis la rc.1, sur Mac et sur Windows.
- **Puis `v0.2.0`**, après votre accord, avec ses notes et le README à jour.
- **Mises à jour** de « Not verified yet » et de la mémoire.

### Hors de ce plan
- Le site public avec sa page de téléchargement, conçu à part et fait en dernier (Q373).
- Linux.
- La signature Windows.

## Fichiers principaux

**À la racine**
- `.github/workflows/ci.yml` et `release.yml`.
- `LICENSE`, `README.md`, `.gitattributes`.

**App** (`apps/desktop`)
- `package.json` (version, `build.mac`, `build.win`, `build.publish`, scripts).
- `build/entitlements.mac.plist`, `build/icon.ico`.
- `scripts/icon.mjs`, `scripts/template.mjs`.

**Processus principal** (`apps/desktop/src/main`)
- `index.ts`, `menu.ts`, `environment.ts`.
- Nouveaux : `update.ts`, `agent/git-bash.ts`.
- `agent/confinement.ts`, `agent/replay.ts`, `connectors/connectors.ts`.
- `templates/manifest.ts`, `release.ts`, `library.ts`.

**Partagé et rendu**
- `shared/shortcuts.ts`, `shared/strings/en.ts`.
- Les en-têtes du rendu (`StartPanel.tsx`, `Conversation.tsx`, `Sidebar.tsx`).

**Tests et templates**
- `scripts/background-electron.ts`.
- `apps/desktop/templates/aspect/template.json`, `scripts/release.mjs`.

## Vérification

- **Tests unitaires** :
  - la compatibilité du catalogue (`release.test.ts`, `library.test.ts`) ;
  - `update.ts` avec un faux updater ;
  - `confinement.test.ts` sous win32 (exe, sandbox éteinte, variables de Git Bash) ;
  - `git-bash.test.ts` ;
  - `splitCommand` avec des chemins Windows ;
  - `replay` avec un `cwd` Windows.
- **La CI** est verte sur macOS et Windows : lint, typecheck, vitest, e2e rejoués sur l'app empaquetée.
- **Mac signé** : `codesign`, `spctl`, `stapler`, puis l'agent réel et `agent-sandbox.e2e.ts` sur l'app signée, lancée hors champ.
- **Les rc** : installation propre, mise à jour rc.1 → rc.2 sur Mac et sur Windows, et votre essai Windows avec Git for Windows.
- **Le catalogue** : une app 0.2.0 voit Aspect 1.1.x. Une app plus ancienne (simulée en test) prend Aspect 1.0.0.
