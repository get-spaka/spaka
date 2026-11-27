# Publier : une voie simple, un mode avancé, et le nom de domaine

## État (2026-11-27) : fait, non commité

| Tranche | Fait | Commits |
|---|---|---|
| 1. Les textes, le dialogue, les guides et les README (Q482-Q485) | ✅ | à venir |
| 2. L'export serveur avec `compose.yaml` et Caddy, le domaine dans `.env` (Q486) | ✅ | à venir. Lancé pour de vrai sous Docker le 2026-11-27, en HTTP puis en HTTPS sur un nom `.localhost` |
| 3. Un vrai site mis en ligne chez Netlify, un vrai nom de domaine branché | ❌ | à essayer à la main (« Not verified yet ») |

## Contexte

Le dialogue Publish montrait trois façons à égalité, nommées par leur technique (« Static files », « Node.js server », « Cloudflare Worker »), sans choix par défaut (Q181), puis trois hébergeurs côte à côte. Un maker sans connaissance technique ne pouvait pas choisir, et rien n'expliquait comment brancher un nom de domaine.

## Ce qui est décidé

- Spaka ne vend pas d'hébergement : la mise en ligne passe toujours par un service tiers (Q482, qui remplace la place laissée par Q181).
- La voie simple (Q483) : l'export statique, « With a hosting service », recommandé et choisi au premier export, mis en ligne en glissant le dossier sur Netlify Drop, étape par étape. Cloudflare Pages, GitHub Pages et « tout autre hébergeur » sont repliés sous « Other hosting services ».
- Le mode avancé (Q483, Q484), replié sous « Other ways to publish (advanced) » : « On Cloudflare » d'abord (gratuit pour un petit site, aucun serveur à louer), puis « On a server (Docker or Node.js) ». Il s'ouvre seul quand l'une de ces façons a servi la dernière fois, ou quand la voie simple est refusée.
- Voie simple refusée (une page affiche ce que les visiteurs envoient) : la carte reste, et dit qu'il faut un serveur et quelqu'un d'à l'aise avec un terminal.
- Le statique n'est pas proposé une seconde fois dans l'avancé : c'est le même builder et le même dossier.
- Le nom de domaine (Q485) : une quatrième partie, facultative et repliée, écrite pour la façon choisie, avec un lien vers l'aide de l'hébergeur ; la même section dans les README Node et Cloudflare. On nomme le type d'enregistrement et l'endroit où l'hébergeur affiche la valeur, jamais une adresse d'hébergeur.

## Le compose de l'export serveur (Q486)

- `compose.yaml` lance le site et Caddy ; `Caddyfile` lit `SPAKA_DOMAIN`, que le maker écrit dans `.env`. Vide : HTTP sur le port 80.
- Le port du site n'est pas publié ; `SPAKA_PROXY=1` fait croire au serveur l'adresse du visiteur que donne Caddy (`packages/runtime/src/hosts/node.ts`).
- Un nouvel export garde ce que le maker a écrit dans `.env` : `exportProject` lit l'ancien avant d'effacer, `writeEnv` (`packages/builder/src/shared.ts`) fusionne.

## Ce qui a changé

- `apps/desktop/src/shared/strings/en.ts` (bloc `export`) : tous les textes.
- `apps/desktop/src/renderer/components/ExportDialog.tsx` : la voie simple, « Other ways to publish (advanced) », Cloudflare en tête, les étapes Netlify avec leurs deux boutons, « Other hosting services », la partie « domain ».
- `packages/builder/src/builders/` : les ids des guides (`static` : open, drop, keep, update, forms ; `node` : docker, server, address) et les README Node et Cloudflare. Les exports eux-mêmes ne changent pas.
- `apps/desktop/src/shared/ipc.ts`, `apps/desktop/src/main/index.ts` : `export:open-host` ouvre aussi les pages d'aide « domaine ».
- `apps/desktop/skills/spaka-help/SKILL.md`, `GLOSSARY.md` (Hosting service), `docs/v2.0-decisions.md`.

## Vérification

- `pnpm check`, puis les e2e `export`, `servers` et `published`.
- Les captures `e2e/.runs/export-dialog*.png`, `publish-refused.png`, `publish-node.png`.
- Reste à faire à la main : la tranche 3, et le certificat HTTPS de Caddy pour un vrai nom de domaine.
