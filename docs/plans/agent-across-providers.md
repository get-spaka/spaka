# Upstart v2 : plan de l'agent, pareil d'un fournisseur à l'autre

## État (2026-11-23) : terminé, vérifié avec les vrais comptes

| Tranche | Fait | Commits |
|---|---|---|
| 1. Pi 1.6.0 | ✅ | 175c546 |
| 2. La recherche, portable et dans les règles (et Q437) | ✅ | 2ef9036, 830400a |
| 3. Les outils de Pi, au niveau de Claude (Q433) | ✅ | 7c5fd89 |
| 4. Les tours de Pi : compactage et nouveaux essais (Q434, Q435) | ✅ | cc337a4 |
| 5. Le mode Plan, pareil des deux côtés (Q436) | ✅ | 9f427af |
| 6. generate_image | ✅ | d5d90ee |
| 7. Le skill web-design | ✅ | 5b76f4e ; banc avant/après avec Claude (`e2e/agent-design.e2e.ts`) |
| 8. Images générées dans les templates (Q432) | ✅ | 38f9647 (templates b283147) |

Vérifié le 2026-11-23 avec les clés de Matt, lues dans le `.env` du dépôt (Q438) : `generate.real.test.ts` avec Gemini et OpenAI ; la recherche Google de Pi ; `agent-pi.e2e.ts` en entier (6/6) avec Gemini 4 Hydrogen, par une clé AI Studio et sur Vertex AI ; le banc web-design avec Gemini (pâtisserie 266 s, studio 188 s, contre 448 s et 373 s pour Claude). `agent-pi.e2e.ts` répond désormais aux cartes de questions, et retouche le fichier qui porte le titre, une partie quand la page est faite de blocs. Pas encore essayé : generate_image sur Vertex.

## Contexte

Tu as posé quatre questions après avoir lu le prompt système :
- la recherche web marche-t-elle quel que soit le modèle ;
- un outil qui génère des images ;
- Claude passé par Pi ;
- un prompt qui pousse au design moderne et à l'animation.

La conception a été arbitrée le 2026-11-21, de Q417 à Q436. Elle est consignée dans la section « The agent across providers » de `docs/v2.0-decisions.md`.

Trois recherches l'ont nourrie :
- la recherche web et la génération d'images chez chaque fournisseur ;
- les extensions Pi réutilisables ;
- un audit, en lecture seule, des écarts entre le harness de Claude et celui de Pi.

### Ce qui est décidé

**La recherche web (Q417, Q424)**
- Elle reste native de chaque côté.
- Si un fournisseur n'a pas de recherche, les consignes ne nomment que WebFetch.
- Pour Gemini et Vertex, l'activité montre les « Search Suggestions » de Google, comme leurs conditions l'exigent.

**Le design (Q418 à Q421, Q430, Q431)**
- Le mouvement suit le caractère du site.
- Les règles vont dans un skill intégré, `web-design`, avec cinq ou six lignes essentielles dans les consignes.
- Les règles sont dites en positif, avec une courte liste de clichés nommés.
- Pas d'étude des tendances avant de construire.
- `making-templates` renvoie à ce skill.

**Claude reste sur l'Agent SDK (Q422)**
- On aligne les deux côtés, en prenant Claude comme référence :
  - les outils de Pi (Q433) ;
  - le compactage (Q434) ;
  - les nouveaux essais (Q435) ;
  - le mode Plan (Q436).

**`generate_image` (Q423, Q425 à Q429)**
- Il est là dès qu'un compte Gemini, Vertex ou OpenAI (par clé) est connecté, quel que soit le modèle du site.
- L'agent choisit selon le style du site.
- Ce qui est interdit : l'équipe, des personnes réelles, un logo, du texte dans l'image.
- Il génère sans demander, en 2K au plus et 8 images par tour au plus.
- Un réglage « Model for images » est sur Automatique par défaut.
- Le prompt et le modèle sont gardés dans `media/*.json`, avec la marque « Generated ».
- Jusqu'à 4 images de référence ou à retoucher.

**Les templates (Q432)**
- Ils peuvent mêler des images générées aux photos libres, avec `pnpm template:image generate`.

### Ce que la recherche a écarté

**`pi-claude-agent-sdk`**
- Il se connecte avec le jeton OAuth de Pi, ce que les conditions d'Anthropic et l'ADR 0002 interdisent.

**`pi-claude-bridge`**
- Il lance le binaire avec `tools: []`. Claude perdrait alors sa recherche et sa sandbox.

**Les extensions d'images**
- Ce sont `@amaster.ai/pi-image-gen`, `@abhishek944/pi-image-gen` et `pi-codex-image-gen`.
- Elles servent de référence, pas de dépendance.
- On reprend la forme `images` de pi-ai (`createProvider({ images })`), pour que Pi et le serveur MCP de Claude appellent le même code.

**ChatGPT par l'abonnement**
- Rien ne confirme qu'une app tierce y ait droit à la génération d'images. Il reste hors du plan.

**GSAP**
- Sa licence exclut les outils « qui permettent de construire des animations visuelles sans code ». La règle « jamais GSAP » reste.

## Règles de travail (inchangées)

**Lancements et commits**
- L'app est lancée en arrière-plan (`UPSTART_BACKGROUND=1`), et `dev:live` est arrêté pendant les builds.
- Un commit sur `main` par tranche qui marche, puis un push.
- `git add` par chemins explicites, après un scan des clés.

**Les clés**
- Jamais de clé dans un fichier.
- Les vérifications réelles lisent `GEMINI_API_KEY` ou `OPENAI_API_KEY` depuis ton terminal.

**Les questions**
- Toute nouvelle question de conception t'est posée, à partir de Q437.

## Tranches

### 1. Pi 1.6.0

**La montée de version**
- `@earendil-works/pi-ai` et `pi-mcp` passent de 1.5.2 à 1.6.0 (sortie le 2026-11-20, avec GPT-6.2 au catalogue).

**À vérifier ensuite**
- `pi/vertex.ts` : arguments en flux.
- `pi/session.ts` : la boucle.
- `models.json` : les modèles « déclarés comme un autre », peut-être maintenant au catalogue.

**Fait quand**
- `vitest` est vert sur `src/main/agent`.
- L'e2e Pi rejoué passe.

### 2. La recherche, portable et dans les règles

**`pi/web-search.ts`**
- Pour Google, il garde `groundingMetadata.searchEntryPoint.renderedContent` à côté des sources.

**L'activité « Searching the web »**
- Elle montre ce bloc dans un `iframe` isolé (`sandbox`, sans script ni accès à la page), sous les sources.
- Le HTML vient de Google ; il n'est jamais injecté dans le rendu.

**`instructions.ts`**
- La ligne « The web » nomme WebSearch seulement si le modèle en dispose (`canSearch`). Sinon, elle dit que seul WebFetch lit le web.
- La consigne « des faits, jamais les textes » est gardée.

**Tests**
- Unitaires : le bloc gardé pour Google, absent pour OpenAI.
- Les consignes, avec et sans recherche.
- e2e rejoué : l'activité montre les suggestions.

**À relire**
- Les conditions exactes de Google, avec toi, avant de fermer la tranche (Q424).

### 3. Les outils de Pi, au niveau de Claude (Q433)

Dans `pi/tools.ts`, chaque outil suit le binaire, paramètre par paramètre.

**Read**
- Numérotation `cat -n`, `offset` et `limit`, 2 000 lignes par défaut.
- Les lignes trop longues sont coupées.
- Les images sont réduites (sharp, déjà là) sous la limite du fournisseur.
- Les PDF sont lus en texte, page par page (`pages`).

**Lecture avant écriture**
- Un fichier existant doit avoir été lu dans la session avant Edit ou Write.
- S'il a changé sur le disque depuis sa lecture (une retouche du maker, Q294), l'outil le dit et demande de le relire.

**Glob**
- Il voit `.upstart/` mais pas `.git` ni `node_modules`.
- Il trie par date de modification et plafonne à 100.

**Grep**
- `output_mode` : `files_with_matches` par défaut, `content` ou `count`.
- Aussi `-i`, `-n`, `-A`, `-B`, `-C`, `type`, `multiline` et `head_limit`.

**Bash**
- `timeout`, jusqu'à 600 000 ms.

**WebFetch**
- Il prend `url` et `prompt`, passe en https, met en cache 15 minutes et signale les redirections vers un autre hôte.
- La page est convertie en Markdown, puis résumée selon le `prompt` par le petit modèle du compte (celui de `naming.ts`).

**Un contrat commun**
- `agent/tool-contract.test.ts` décrit chaque outil : entrées, sorties, erreurs.
- Il tourne sur les outils de Pi.
- Pour Claude, une vérification réelle (`UPSTART_REAL_CLAUDE=1`) prend les mêmes cas, quand le binaire les expose.

**Les petits écarts relevés**
- `readSkill` qui échoue est signalé dans `problems` au lieu d'être tu.

**Fait quand**
- Le contrat est vert.
- L'e2e Pi rejoué passe.
- Un vrai tour Gemini (`GEMINI_API_KEY`) édite une page retouchée à la main, et voit l'alerte.

### 4. Les tours de Pi : compactage et nouveaux essais (Q434, Q435)

**Les captures**
- Une image de `look_at_preview`, une fois la réponse suivante reçue, est remplacée dans l'historique envoyé par une ligne : « picture of /about, phone, taken at turn 3 ».
- L'historique affiché et enregistré pour le maker reste entier.

**Le compactage**
- `models.json` gagne `context` (la fenêtre de chaque modèle).
- Au-delà de 75 % de la fenêtre, les plus vieux tours sont résumés par le modèle lui-même : ce qui a été fait, les décisions du maker, les fichiers touchés.
- Ce résumé remplace ces tours dans ce qui est envoyé.
- La conversation montrée ne change pas. Une ligne discrète dit « Earlier turns summarized ».

**Les nouveaux essais**
- Sur une erreur 429, 5xx ou réseau : jusqu'à 3 essais, espacés de 2, 8 puis 20 s, en respectant `retry-after`.
- La conversation montre « Retrying… (2/3) ».

**Arrêt « length »**
- Le tour reprend avec un message « continue where you stopped ».
- Si l'arrêt tombe au milieu d'un appel d'outil, l'appel est rejoué.

**Tests**
- Unitaires avec un faux flux : remplacement des captures, seuil, résumé, essais, reprise.
- Un rejeu e2e d'un tour coupé.

### 5. Le mode Plan, pareil des deux côtés (Q436)

**Côté Claude (`session.ts`)**
- Un changement de mode fait pendant un tour est gardé en attente.
- Il est appliqué par `setPermissionMode` à la fin du tour, avant le message suivant.

**Côté Pi (`pi/session.ts`)**
- Même chose : il n'est plus appliqué au milieu du tour.

**Le sélecteur de mode**
- Il montre le mode en attente (« Plan after this turn »).

**choose_pages**
- Il est refusé en Plan des deux côtés (`PLAN_WRITERS`).
- Je vérifie dans le vrai test que `use_block` et `use_image` passent bien par `canUseTool` en Plan, comme le test réel de 3db6681 le montre pour `use_block`.

**Tests**
- Unitaires des deux sessions.
- Une vérification réelle avec le binaire : Build → Plan pendant un tour, puis une écriture refusée au tour suivant.

### 6. generate_image (Q423, Q425 à Q429)

**Les modèles**
- Nouveau `agent/image-models.json`, listé à la main :
  - Gemini et Vertex : `gemini-nano-banana-2.1` par défaut, `gemini-3.1-flash-image` ;
  - OpenAI : `gpt-image-2` par défaut.
- Pour chaque modèle : le compte, les ratios et la taille la plus grande.

**Nouveau `main/images/generate.ts`**
- Un fournisseur par compte, de la forme `images` de pi-ai :
  - Gemini par sa clé, Vertex par sa clé express ou ADC (comme `pi/vertex.ts`) ;
  - OpenAI par sa clé, en qualité `medium`.
- Les entrées : `prompt`, `aspect` (`1:1`, `4:3`, `3:4`, `16:9`, `21:9`, `9:16`), jusqu'à 4 `references` prises dans `media/`.
- 2K au plus.

**L'outil dans `upstart-tools.ts`**
- `generate_image` prend `prompt`, `aspect`, `file` (nom court), `alt`, et `references` (facultatif).
- Il écrit `media/<file>.webp`, au plus 2 400 px comme `use_image`.
- Son `.json` porte `generated: { model, prompt, date, references }`, sans crédits.
- Il répond par l'adresse.
- Il est donné aux deux côtés seulement quand un compte qui génère est connecté.

**Le plafond**
- 8 générations par tour.
- La 9ᵉ est refusée avec un message qui dit de demander au maker.

**Le réglage et l'affichage**
- Le réglage « Model for images » (`imageModel`) va dans `app-settings.ts` et `SettingsPanel.tsx`.
  - Automatique : le compte du site s'il génère, sinon le premier compte connecté qui génère.
- L'activité : « Generating an image », avec le prompt et la miniature une fois prête.
- Le panneau des images marque « Generated ».
- La page de crédits du site laisse ces images de côté.

**Les consignes**
- Quand générer : selon le style du site, en photo libre ou en image générée.
- Ce qui ne se génère jamais.
- Pas de texte dans l'image.
- Un même brief de style d'une image à l'autre, les références pour la cohérence.
- Le texte alternatif.

**Tests**
- Unitaires avec un faux `fetch` : la route par compte, le plafond, le `.json`, les références.
- e2e rejoué : l'activité, le panneau, la page de crédits.
- Vérification réelle : une image Gemini (`GEMINI_API_KEY`) et une image OpenAI (`OPENAI_API_KEY`), puis une retouche avec une référence.

### 7. Le skill web-design (Q418 à Q421, Q430, Q431)

**Nouveau `apps/desktop/skills/web-design/SKILL.md`**
- Écrit selon writing-for-agents.
- Sa description, en pointeur : « Upstart's rules for a website's design — read before a new page, a change of style, or a script. »
- Son contenu :
  - choisir pour ce commerce ;
  - un pari esthétique fort ;
  - une ou deux polices Google (OFL) et leur échelle ;
  - quatre à six couleurs dans le thème ;
  - la mise en page et le rythme des sections ;
  - le mouvement par caractère, avec une liste courte qui va du calme au vif et un seul moment orchestré, par Motion, Lenis, Splitting, Embla, OGL ou le CSS (scroll-driven, `@starting-style`) ;
  - jamais GSAP ;
  - le mouvement réduit comme plancher ;
  - la courte liste de clichés nommés.

**`instructions.ts`**
- Cinq ou six lignes essentielles et le pointeur vers le skill.
- La phrase « Most sites need none of it » est réécrite selon Q418.

**`skills/site-scripts/SKILL.md`**
- Son ouverture « Most sites need neither » est réécrite de même.
- Il renvoie à `web-design` pour savoir quand bouger.

**`.claude/skills/making-templates/SKILL.md`**
- `web-design` entre dans « Read first ».
- Les règles en double sont retirées.

**Vérification réelle**
- Un même brief sans template (une pâtisserie, puis un studio d'architecture), avec Claude puis Gemini.
- `template:shoot` n'est pas fait pour ça : j'utilise les images de `look_at_preview` et une planche.
- Je te montre la planche avant/après.

### 8. Images générées dans les templates (Q432)

**`pnpm template:image generate`**
- La commande : `pnpm template:image generate <template> <file> "<prompt>" "<alt>" [--aspect 16:9] [--ref media/x.webp]`.
- Elle passe par `main/images/generate.ts`, avec `GEMINI_API_KEY` ou `OPENAI_API_KEY` du terminal.

**`template:check`**
- Il accepte une image `generated` sans crédits, pourvu qu'elle ait son modèle et son prompt.
- Il demande `app` ≥ la version qui sait lire `generated` (Q368).

**La documentation**
- `FORMAT.md` et `making-templates` décrivent la commande.
- Ils disent quand une image générée sert mieux le style qu'une photo libre.

**Le script de release**
- Il est régénéré (`pnpm template:release-script`) dans le sous-module.

## Hors de ce plan

- La génération par l'abonnement ChatGPT : à revoir si OpenAI le permet.
- Une recherche tierce (Brave, Exa) : seulement si la lecture des conditions de Google (tranche 2) l'impose.
- Le Bash en arrière-plan : les outils de sortie du binaire ne sont pas donnés non plus à Claude.

## Fichiers principaux

**L'agent (`apps/desktop/src/main/agent/`)**
- `instructions.ts`, `session.ts`, `questions.ts`, `upstart-tools.ts`.
- `pi/session.ts`, `pi/tools.ts`, `pi/web-search.ts`, `pi/models.json`.
- Nouveaux : `image-models.json`, `tool-contract.test.ts`.

**Le reste du processus principal (`apps/desktop/src/main/`)**
- Nouveau : `images/generate.ts`.
- `app-settings.ts`, `media/library.ts`.

**Partagé, rendu et skills**
- `src/shared/ipc.ts`.
- Rendu : l'activité, le panneau des images, `SettingsPanel.tsx`.
- `apps/desktop/skills/web-design/SKILL.md`, `skills/site-scripts/SKILL.md`, `.claude/skills/making-templates/SKILL.md`.

**Scripts et templates**
- `scripts/template.mjs`.
- `templates/FORMAT.md`.

## Vérification

**Les tests**
- `pnpm lint`, typecheck et `vitest run` à chaque tranche.
- Les e2e rejoués, Pi compris.

**Les vérifications réelles, lancées hors champ**
- Gemini : édition après retouche, recherche avec suggestions, image générée.
- OpenAI : image générée.
- Claude : mode Plan changé en plein tour, contrat des outils.
- Les deux : un site sans template avec le skill `web-design`, dont je te montre la planche.

**Not verified yet**
- Je mets à jour la section « Not verified yet » de `docs/v2.0-decisions.md` et la mémoire.
