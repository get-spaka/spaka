# Spaka v2 : plan de construction du harnais Pi (ADR 0012, Q268-Q279)

## État (2026-11-22) : terminé

| Tranche | Fait | Commits |
|---|---|---|
| 0. Une interface, des outils et des contrôles partagés | ✅ | 4b4c5b2 |
| 1. La session Pi avec une clé Gemini ou OpenAI | ✅ | a277fce |
| 2. Les comptes | ✅ | a277fce |
| 3. Le shell sous sandbox, le web, les connecteurs, les compétences | ✅ | 13e7f8b |
| 4. Vertex AI (Q280) | ✅ | ec2740c |
| 5. Vérification | ✅ | 13e7f8b (Pi rejoué en e2e), bbb35ad (ChatGPT réel) |

`agent-pi.e2e.ts` (`SPAKA_REAL_PI=1`) a tourné en entier le 2026-11-23 avec Gemini, par une clé AI Studio et sur Vertex AI. Pas encore essayé : un tour sur une clé OpenAI. Le harnais a été aligné ensuite sur Claude par le plan [agent-across-providers](agent-across-providers.md).

## Contexte

Vous avez décidé (Q268) d'avoir une seule interface d'agent et deux adaptateurs :
- Claude, par l'Agent SDK, comme aujourd'hui ;
- un harnais propre à Spaka, sur les bibliothèques de Pi (`@earendil-works/pi-ai` et `pi-agent-core` 1.5.2, MIT).

La conception est faite : Q269 à Q279, dans `docs/v2.0-decisions.md`, section « Other models, in Spaka's own harness ».

Vous avez dit de commencer l'implémentation. La clé Vertex viendra plus tard, pour valider le flux Vertex.

## Ce que Pi apporte, et ce qu'il manque

**pi-agent-core**
- `Agent` : la boucle de l'agent, ses événements (`message_update` avec `toolcall_delta`, `tool_execution_*`, `agent_end`), `abort()`, et `state.messages`, sérialisable.
- Des crochets :
  - `beforeToolCall` et `afterToolCall` (après un outil) ;
  - `finishTurn` et `followUp()` (à l'arrêt) ;
  - `prepareRequest`.
- `toolExecution: "sequential"` : indispensable, pour qu'un `Append` suive son `Write`.

**pi-ai**
- `createModels()`, `CredentialStore`.
- `models.login("openai", "oauth", interaction, { agentName: "Spaka", getDeviceId })`. C'est Sign in with ChatGPT sous le nom de Spaka : `agent_name_hint`, avec un identifiant d'installation stable.
- Une clé passée par requête (`apiKey`) l'emporte sur l'identifiant stocké.
- `fauxProvider()` pour les tests : les arguments d'un appel d'outil y arrivent en morceaux.

**Ce qui manque au catalogue de pi-ai 1.5.2**
- Ni Gemini 4 Hydrogen ni Carbon n'y sont. Spaka les déclare lui-même : des objets `Model` sur le modèle d'Argon, `api: "google-generative-ai"`, avec leurs prix mesurés au spike.
- GPT-6.1 Terra et Sol y sont.

## Choix techniques (sans nouvelle décision de produit)

**Une interface `AgentRunner`**
- C'est ce qu'`AgentSession` expose déjà : start, send, stop, setModel, setEffort, startOver, update, close, refreshExtensions, connectorStatus, signInConnector, busy, problems.
- `Agent` choisit l'implémentation selon le compte du modèle du projet.

**L'identifiant d'un modèle porte son compte**
- `chatgpt/gpt-6.1-terra`, `openai/gpt-6.1-terra`, `gemini/gemini-4-hydrogen`.
- Sans préfixe, c'est Claude, comme aujourd'hui : rien ne change pour les projets existants.
- `ModelChoice` gagne `account`.

**Les noms d'outils canoniques sont ceux que l'app lit déjà**
- Read, Write, Edit, Bash, Glob, Grep, avec `file_path`, `content`, `old_string`, `new_string`, `command`.
- S'y ajoute `Append` (`file_path`, `content`), pour Gemini.
- Le harnais Pi donne ces outils au modèle sous ces noms et ces schémas. FileTap, les libellés d'activité et data-check n'ont donc pas de traduction à faire.
- Les outils de Spaka (find_blocks, use_block, find_images, use_image, look_at_preview) sont décrits une seule fois, avec leur schéma zod et leur fonction :
  - l'Agent SDK les reçoit par `createSdkMcpServer`, sous `mcp__spaka__*` ;
  - Pi les reçoit par `z.toJSONSchema`, sous leur nom court.

**Les contrôles de fin d'outil et de fin de tour sont sortis de `index.ts`**
- Ils deviennent un objet neutre, `TurnChecks` : `afterTool(name, input)` → une note, `beforeStop(again)` → des notes.
- Côté Claude, ils sont branchés sur les hooks PostToolUse et Stop.
- Côté Pi, ils sont branchés sur `afterToolCall` (la note s'ajoute au résultat) et sur `finishTurn` avec `followUp`.

**FileTap apprend `Append`**
- La base d'un `Append` est le contenu affiché pour ce fichier : celui d'un `Write` encore en attente, sinon le disque.
- Le résultat d'un appel ne rend la main au disque que si plus aucun appel en attente ne vise ce fichier.

**La mémoire du harnais Pi**
- C'est `state.messages`, écrit dans les données du projet (`pi-session.json`) à chaque fin de tour.
- Elle est reprise au lancement suivant. « Repartir de zéro » l'efface.

**Les outils de fichiers de Pi**
- Ils écrivent dans le projet seul : un chemin hors du projet est refusé.
- Read peut aussi lire les compétences assemblées.

**Le shell**
- `sandbox-exec`, avec un profil propre à Spaka (Q278) :
  - écriture : le projet et les dossiers temporaires ;
  - lecture : le projet, le système, le Node de Spaka et les dossiers lisibles du lanceur ; rien d'autre sous /Users ni /Volumes ;
  - réseau permis, comme le bac à sable de Claude (npm, curl) ;
  - les compétences assemblées, en lecture seule.
- Sous macOS seulement. Ailleurs, pas de shell.

## Tranches

### 0. Une interface, des outils et des contrôles partagés (aucun changement de comportement)
- `agent/runner.ts` : l'interface. `Agent` passe par une fabrique.
- `agent/spaka-tools.ts` : les définitions des outils de Spaka. `preview-tool.ts` les enveloppe pour le SDK.
- `agent/turn-checks.ts` : les contrôles, sortis d'`index.ts`. Les hooks du SDK en sont dérivés.
- FileTap : `Append`, et des appels en attente par fichier.
- Les tests existants passent, et de nouveaux tests couvrent FileTap `Append` et `TurnChecks`.

### 1. La session Pi avec une clé Gemini ou OpenAI
- `agent/pi/models.ts` : les quatre modèles et leurs comptes ; l'effort traduit en niveau de réflexion.
- `agent/pi/tools.ts` : Read, Write, Edit, Append (Gemini), Glob, Grep, Bash sous sandbox, WebFetch, plus les outils de Spaka.
- `agent/pi/session.ts` (`PiSession`, qui implémente `AgentRunner`) :
  - les événements de pi-agent-core traduits en `AgentEvent`, avec l'entrée partielle d'un outil lue par `parsePartialInput` ;
  - la transcription persistée ;
  - les contrôles ;
  - stop par `abort()`.
- `instructions.ts` : un jeu d'instructions par famille, avec les mêmes règles :
  - pour Claude, comme aujourd'hui ;
  - pour Pi : sans MultiEdit ni Skill du SDK ; pour Gemini, une section « Writing long files » (Write puis Append).
- Les tests passent par le fournisseur faux de pi-ai : flux, FileTap, contrôles, reprise.

### 2. Les comptes
- `agent/accounts.ts` :
  - un `CredentialStore` chiffré par le Vault (le jeton de Sign in with ChatGPT) ;
  - les clés OpenAI et Gemini, dans le Vault ;
  - un identifiant d'installation.
- `AgentStatus` gagne des `accounts` (Claude, ChatGPT, clé OpenAI, clé Gemini : branché ou non).
- `models` liste les modèles des comptes branchés.
- L'interface :
  - le panneau de première connexion : Claude, ChatGPT, ou une clé ;
  - la page Agent des réglages devient « Accounts » ;
  - le sélecteur de modèle, groupé par compte, avec « Connect another account… ».
- Le changement de modèle :
  - entre deux modèles Pi, la conversation continue ;
  - entre Claude et Pi, la nouvelle session reçoit un résumé et une note de ce qui a changé (Q274).

### 3. Le shell sous sandbox, le web, les connecteurs, les compétences
- Le profil `sandbox-exec` et ses tests (une écriture hors du projet est refusée).
- La recherche web : `web_search` d'OpenAI et Google Search grounding. Avant cela, je vérifie qu'ils marchent sur un forfait ChatGPT et en même temps que les outils de fonction.
- Le client MCP de Spaka (pi-mcp) pour les connecteurs du créateur, OAuth compris, avec les jetons dans le Vault (Q277).
- Les compétences : leur liste dans les instructions, lues par Read.

### 4. Vertex AI
- Les arguments d'un appel streamés (`streamFunctionCallArguments`), à valider avec votre clé quand vous me la donnerez.

### 5. Vérification
- Les tests, le lint, les e2e en arrière-plan.
- Avec la vraie clé Gemini (`homes/keys.env` du spike, jamais affichée) : un site de bout en bout. La page doit grandir dans la preview par Write puis Append.
- Avec ChatGPT Plus : une fois que vous serez connecté dans l'app.

## Règles de travail
- Lancements en arrière-plan (`SPAKA_BACKGROUND=1`).
- Un commit par tranche qui fonctionne, avec des chemins explicites et un contrôle des clés avant, puis un push.
- Toute question de produit vous est posée, à partir de Q280.

## Avancement (2026-11-14)
- Tranches 0, 1 et 2 : faites (4b4c5b2, a277fce).
- Recherche web : un outil WebSearch qui fait une requête à part, avec la recherche du fournisseur comme seul outil. Google Search à côté des outils de fonction exige des parties « côté serveur » que pi-ai ne garde pas.
- Connecteurs : pi-mcp 1.5.2 (stdio hors bac à sable, Streamable HTTP avec OAuth par retour local, jetons chiffrés par le Vault). SSE n'est pas pris en charge, et le connecteur le dit.
- Rejeu : `SPAKA_PI_REPLAY` / `SPAKA_PI_RECORD`, e2e `agent-pi-replay.e2e.ts`.
- Vertex (Q280) : mesuré par ADC sur un projet Google Cloud de Matt (l'organisation de Matt refuse les clés), puis construit. Un adaptateur (pi/vertex.ts) demande les arguments par morceaux, les assemble avant pi-ai et raconte l'appel au fil de l'eau ; Write.content devient `text` et Edit.new_string `replacement` pour Vertex, qui envoie les arguments par ordre alphabétique. Accounts : clé express mode, ou gcloud et un projet.
- Vérification ChatGPT faite le 2026-11-14 (forfait de Matt, fenêtre de dev) : site en 93 s, `web_search` marche sur le forfait. Le plan du harness Pi est terminé.
