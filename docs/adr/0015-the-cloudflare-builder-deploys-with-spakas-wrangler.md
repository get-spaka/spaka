---
status: accepted (2026-11-27, Q523, Q527, Q530, Q531, Q533, Q534)
---

# The Cloudflare builder deploys with a wrangler of Spaka's own

Spaka's pnpm ([ADR 0013](0013-packages-installed-by-spakas-own-pnpm.md)) installs wrangler, at the version Spaka is tested with. Wrangler packages the site's Worker, so what is exported is what runs on Cloudflare (Q523). Spaka then deploys it to the maker's Cloudflare account (Q527):

- the account is connected through the browser, as `wrangler login` does, its token kept in a wrangler folder of Spaka's own, never the maker's (Q530);
- Spaka creates the D1 database, applies the migrations, sends the secrets ([ADR 0014](0014-server-modules-run-by-spakas-node.md)) and deploys.

Until then the Cloudflare export was a folder the maker deployed with `npm run deploy`, which needed their own Node and npm.

Every builder still exports a folder the maker deploys themselves (Q531). A builder thus keeps both roles, making the output and, where the app can reach the hosting itself, putting it there: no separate term for where a site goes (Q534). Hosting of Spaka's own, on a server or on Cloudflare, may later be one more place a builder deploys to; it is not part of this decision (Q533).

## Considered options

- **The maker deploys the exported folder, as today.** Nothing new to keep, but publishing on Cloudflare needs Node and npm on the maker's machine.
- **A Cloudflare API token pasted into Spaka's Accounts.** More control and encrypted storage, but more steps for someone who is not a developer.
- **A "destination" beside the builder** (a folder, the maker's Cloudflare account, Spaka's hosting). Matt kept the builder alone (Q534).

## Consequences

- Spaka holds a token for the maker's Cloudflare account, in wrangler's own format, in its data folder.
- Wrangler cannot run without workerd: miniflare loads its binary (145 MB) as wrangler starts, even to package a Worker. With sharp left out, wrangler and Vite take about 300 MB in Spaka's tools, downloaded at the first export for Cloudflare ([the probe](../spikes/packages.md), 2026-11-27).
- Wrangler run by Electron as Node needs a preload that sets `process.defaultApp`, or its argument parser takes the script's path for a command.
- A site's address on Cloudflare is the one wrangler reports, and the app knows it as the published site's.
