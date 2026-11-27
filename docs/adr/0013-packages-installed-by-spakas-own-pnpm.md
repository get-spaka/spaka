---
status: accepted (2026-11-27, Q490-Q509, Q512, Q520-Q522); replaces the libraries of ADR 0011, given by an address or copied into scripts/lib/
---

# Projects use npm packages, checked and installed by a pnpm of Spaka's own

A project may use packages from npm, in its pages and on its server ([ADR 0014](0014-server-modules-run-by-spakas-node.md)). The agent adds one through a tool of Spaka's, `add_package`, never through a shell command: Spaka picks the newest version its rules allow, checks the package, installs it and writes `package.json`, and the agent gets the answer at once (the version, the licence, or the refusal and its reason). A `package.json` the maker changes by hand is installed too.

Until then a site could only load a library from a CDN address pinned in `scripts/libraries.json`, or from a copy in `scripts/lib/`, and in the browser only. Spaka shipped no npm, and the agent's shell has Spaka's Node without it.

- **The installer** is pnpm 12, a native program of about 55 MB per platform, downloaded the first time a project adds a package, at a version and sha256 fixed by Spaka's release (Q506). It never meets a pnpm or npm of the maker's: its store, cache, state and configuration are folders of Spaka's own, the project's `pnpm-workspace.yaml` is ignored and its `.npmrc` removed, no package's install script and no pnpmfile runs, and it downloads no other pnpm and no Node.
- **The packages** go into the project's own `node_modules`, from pnpm's store in Spaka's data: one `package.json` at the project's root for both sides, with `pnpm-lock.yaml` (Q492, Q508). pnpm's isolated layout keeps its relative links inside the project, and its files are cloned from the store on macOS, copied elsewhere (Q509).
- **The rules** use free public signals: the registry, deps.dev and OSV, Sigstore provenance. A known flaw, or a package that needs its install script to work, is refused. A package younger than 90 days, downloaded fewer than 1,000 times a week, named like a well-known package, or with no repository linked, is put to the maker in a question card. Every version installed, dependencies included, is at least 7 days old (Q493, Q500). Licences are not restricted (Q499). The maker sees the site's packages in its settings, with their licence, source, side and weight, and can remove one (Q520).
- **In the browser** a site's module imports a package by its name. The page's import map points to one ES module per package, made by Vite with the package's licence notice kept (Q494, Q512, Q526). The site's own modules are still loaded as they are written (ADR 0011).
- **`scripts/libraries.json` and `scripts/lib/` are no longer read**, with no compatibility code (Q498, as Q484): the 37 templates move to packages (Q495).

## Considered options

- **The agent writes `package.json`, or runs `pnpm add` in its shell.** Familiar to the models, but the versions come from their memory, a refusal arrives a turn later, and the shell is confined differently on each system.
- **npm**, 12.5 MB of JavaScript that runs on Spaka's Node. pnpm was chosen for its minimum release age, its refusal of a version that lost its provenance, its blocking of exotic sub-dependencies, and a store shared by every project.
- **pnpm 11**, the last pnpm in JavaScript (23.6 MB): nothing to sign, but the line before the maintained one.
- **pnpm 12 inside the app**: works offline from the start, at 55 MB more per installer.
- **The packages in Spaka's data, the project holding only its lockfile**: a lighter project, but not the layout Node, the tools and the maker expect.
- **Keeping CDN libraries beside packages**: two ways to do one thing.

## Consequences

- `node_modules` is left out of the history's snapshots, the exports, the templates' archives and the agent's Glob and Grep; the agent's file tools refuse to write in it.
- A first package needs the network, for pnpm and then for the package; later installs come from the store.
- A flaw published later for an installed version gives a card when the site opens, and a warning at each export (Q521).
- Packages from a private registry, its token kept in Spaka's Accounts, or from a git repository at a fixed commit, come last (Q502); the registry's rules do not apply to them.
- The templates' format, `template:check` and the site-scripts skill change with the move to packages; a template that uses packages needs an app that knows them.
- Vite runs as WebAssembly. The signed app's hardened runtime refuses a native library signed by anyone else, so Spaka's Vite is installed without its optional native programs, with rolldown's WebAssembly build, and its builds run under Node's permissions, which refuse native code on every system. A package's module takes up to half a second to make instead of a tenth, once: it is kept (the packages plan, slice 3).
