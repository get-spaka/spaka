---
status: accepted (2026-11-27, Q496-Q519, Q523-Q529, Q532); amends ADR 0003, under which the agent wrote no server code
---

# A site may have server modules, run in the preview by Spaka's Node under its permission model

A project may have server modules, files of its own code in `server/`, in JavaScript or TypeScript (Q504). A module may export three functions:

- **`load`** gives data to a page or a fragment, which asks for it with a Liquid tag, `{% load weather city: params.city %}`, and shows it in its template (Q505). The pages' HTML stays in Liquid, so the visual editor still traces each element.
- **`action`** answers a form htmx posts to `/_server/<name>`, with an `answer` fragment, as `/_data/<name>` does. It gets the same trap field and limit per visitor (Q532).
- **`route`** answers another service's call, a payment confirmation for instance, with whatever response it needs (Q497).

ADR 0003 had kept the agent from writing server code in v2.0 and named "custom TypeScript handlers" as the planned way out. Sites need more than templates and datasources: a payment, an e-mail, a service's data behind a key, the packages of [ADR 0013](0013-packages-installed-by-spakas-own-pnpm.md).

- **Data:** a module reads and adds records through Spaka's `data` API, validated as a form is. It may also run SQL on the site's own database, the `records` table included, without control, its tables created by migrations in `server/migrations/`, which Spaka applies in the preview, the Node server at its start, and wrangler on Cloudflare (Q513-Q515, Q518).
- **Secrets**, such as a payment service's key, are kept by Spaka for each site, encrypted by the system's keychain, never in the project. The agent asks for one with a card (`ask_secret`), knows only its name, and never sees its value. The preview's server gets them in its environment, and the exports in their `.env` or as the Worker's secrets (Q501, Q516).
- **Cache:** a module that says so (`export const cache = "10m"`) has its `load` results kept for that long, by arguments, in the preview and once published (Q519).
- **Files:** a module may write in one folder outside the project. In the preview it is in Spaka's data for that site; on Node it sits next to `data.sqlite`, in the volume kept between deployments. Workers has none, and the Cloudflare builder says so (Q524, Q528).
- **In the preview**, a Node process of its own runs the site's modules: Spaka's Node 24, Electron run as Node (Q496).
  - It runs with `--permission`, reading the project and writing only the module's folder, with no child process, worker or native addon.
  - It runs with `--experimental-transform-types`, so TypeScript's `enum` and constructor properties work (Q507).
  - Its environment is emptied but for the site's secrets.
  - On macOS it also runs inside a sandbox profile of Spaka's own, given to `sandbox-exec`, as the Pi harness's shell does. On Windows and Linux the permission model is the only guard (Q510).
  - Measured on 2026-11-27 with Electron 45's Node 24.22.2, under `--permission`: the maker's home folder, `child_process`, workers, `process.binding`, native addons and an `import()` from outside the project were refused. The network, the environment's variables and a symbolic link placed in the project pointing outside it were not. Inside the sandbox profile that link was refused too ([the probe](../spikes/packages.md)).
- **Exports:**
  - The static export runs each `load` when it exports, and refuses `action` and `route`, saying so (Q503).
  - The Node export bundles the modules and their packages with Spaka's Rolldown, as WebAssembly, the way the browser's packages are made (Q526, Q557; Vite's SSR build was planned first). They land beside `server.mjs`, in `modules.mjs`, which imports each module when it is first called.
  - The Cloudflare export bundles them the same way, resolving packages as workerd does, and has wrangler package the Worker with them ([ADR 0015](0015-the-cloudflare-builder-deploys-with-spakas-wrangler.md)).

## Considered options

- **workerd in the preview**, Cloudflare's runtime. It is faithful to Workers and stricter (no files, a network that can be filtered by host). But it weighs 142 MB, needs a bundle before each run, and gives Node's APIs only through its compatibility layer.
- **A Web Worker in a sandboxed Electron renderer.** Chromium's hardened sandbox on every system, at no extra size, but no `node:` module works.
- **Spaka's main process.** No isolation at all: the agent's code and npm's would reach the whole machine.
- **Routes that return HTML.** The most freedom, but the visual editor would lose the elements written in code.
- **A database apart for the modules' SQL.** It would keep `records` out of reach; Matt chose the site's own database (Q514).

## Consequences

- Node's documentation says its permission model "does not protect against malicious code". On Windows and Linux, the rules of ADR 0013 are what stands between a hostile package and the maker. On macOS, the sandbox stands there too.
- Rendering becomes asynchronous, for `{% load %}` to wait for the server: 3 to 6% slower, and 0.1 to 0.2 ms more for each `load` ([the probe](../spikes/packages.md)).
- The network stays open to the modules, and Node 24 has no `--allow-net`. A hostile package could send a site's secrets elsewhere, as it could at any host.
- The preview runs Node and Cloudflare runs workerd: wrangler's packaging at export shows what does not run there. ADR 0003's promise, that the preview and the published site behave the same, holds for server modules as far as Node and Workers agree.
- A module's SQL may change or delete the records visitors sent, outside the status and validation Spaka gives them.
- A module's errors and logs reach the agent as a page's errors do.
- A template may have server modules (Q511). Its guide says which secrets it needs, and a template of a surf school shows the whole: Open-Meteo's conditions without a key, bookings in SQL, a calendar served by a route (Q517, Q525, Q529).
