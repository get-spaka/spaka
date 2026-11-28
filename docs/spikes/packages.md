# Spike: pnpm, Vite, wrangler and Node under permissions

Ran on 2026-11-27, on macOS (Apple silicon), with Electron 45's Node 24.22.2.

## What we learned

- **pnpm 12.23.0 stays apart from the maker's pnpm and npm** with the flags of the plan. The checks:
  - A home holding traps in `~/.npmrc` and in both global `config.yaml` locations changed nothing.
  - A project holding traps in its own `pnpm-workspace.yaml`, in one above it, in a `.pnpmfile.cjs` and in the `pnpm` field of its `package.json` changed nothing either. Its `packageManager` field asked for pnpm 9, and pnpm went on.
  - pnpm wrote nothing in the home. Its store, cache and locks went to Spaka's folders.
- **The flags are needed, and so is removing the project's `.npmrc`:**
  - Without `--npmrc-auth-file`, the home's `~/.npmrc` sets the registry.
  - With it, a token in the project's `.npmrc` is still sent: a local listener received `Bearer FAKE-PROJECT-TOKEN`, and nothing once the file was gone.
- **`devEngines` in `package.json` reaches past `runtime=false`.** pnpm still resolves the Node it names: it fetches Node's checksums, writes a `node@runtime:18.0.0` entry in the lockfile and checks the packages' engines against that version. It downloads no Node. Spaka removes the field before installing.
- **The minimum release age** of 7 days holds in strict mode, with no terminal:
  - Asked for a package by name whose latest version was a day old, pnpm took the newest version old enough (`@types/node` 26.6.6 rather than 26.6.11).
  - Asked for that young version itself, it refused. Its message says that with a terminal it would have asked instead.
  - The dependencies followed the same rule: Vite came at 8.3.8 rather than 8.4.0, and wrangler at 4.165.0 rather than 4.168.0.
- **Installs are quick:**
  - one small package: 1.2 s;
  - Vite: 2.1 s, 16 packages;
  - wrangler: 3.8 s, 77 more;
  - with a warm store: under 0.6 s.
  - pnpm is a 24.8 MB download, a 55 MB program. Its sha512 matched the registry's. It is signed ad hoc, and curl's download carried no quarantine.
- **Vite runs on Electron's Node**, from Spaka's tools, on a project folder:
  - Its server build bundled a TypeScript module with `ical-generator` into one 44 KB file, in 37 ms, and that file ran.
  - Its library build made embla-carousel into one ES module in 52 ms. Two things it does not do on its own:
    - `export *` leaves out a default export, so the entry must re-export it;
    - `build.license` lists each package's licence in `.vite/license.md` without its text, so Spaka adds the notice itself.
- **Wrangler cannot run without workerd.** Miniflare loads workerd's binary as wrangler starts, even for `deploy --dry-run`. Its 145 MB binary is needed, while sharp (17 MB) is not. Wrangler and Vite together take 300 MB.
- **Wrangler needs one line to run on Electron as Node.** Its argument parser, yargs, takes Electron for a packaged app and reads the script's path as a command. A preload that sets `process.defaultApp = true` fixes it.
  - `wrangler deploy --dry-run --outdir` then packaged a TypeScript Worker that imports a package and `node:crypto` into a 0.9 KB upload.
  - Wrangler writes its logs and metrics under `XDG_CONFIG_HOME`.
- **A server module ran from its TypeScript source under `--permission`.** It had an `enum` and imported a package through pnpm's links in the project, all of which stay inside the project.
  - Refused: the home, writing in the project, `child_process`.
  - Allowed: writing in its own folder and the network.
  - The environment held only what was passed, plus macOS's `__CF_USER_TEXT_ENCODING`.
  - Without `"type": "module"` in `package.json`, Node warns and parses each module twice.
- **The server process runs in a Seatbelt profile like the Pi shell's.** Spaka's own profile is in `agent/pi/shell.ts`; `agent/confinement.ts` only sets the agent binary's sandbox. Spaka starts the server process through `sandbox-exec`, with a profile that:
  - denies reading `/Users` and `/Volumes`, then allows the app bundle, the project and the module's folder;
  - denies writing except in that folder;
  - denies running anything but Electron.

  Inside it, the symbolic link to the home that `--permission` let through was refused (`EPERM`). Without `--permission`, the profile alone also refused `child_process` and the home.
- **Electron dies in such a profile when the app sits under `/Users`.** That is the case in a development checkout, or for an app installed in `~/Applications`. It dies at start (SIGTRAP, exit 133), unless the profile lets it read the metadata of the folders on its path. It also needs its real path, not one through a symbolic link.
  - The Pi shell's `node` dies the same way today: exit 133 in that shell's exact profile, run from this repository's Electron. It exits 0 with the app copied outside `/Users`, as in `/Applications`.
- **Rendering asynchronously costs little:**
  - The same pages took 3 to 6% longer async than sync (Beacon 8.3 → 8.7 ms, Overhead 58.9 → 61.2 ms, Kindly 4.0 → 4.3 ms), and gave the same HTML.
  - A `{% load %}` tag answered by a child process over IPC added 0.1 to 0.2 ms each.
  - `runtime.fetch` is already async. Its direct render calls are not: about 13 outside the runtime, and 6 test files.
  - The notes and datasources a render collects sit on the runtime itself, which is safe only while renders cannot interleave. They move into the render.

## What changes

- [ADR 0014](../adr/0014-server-modules-run-by-spakas-node.md) names the profile: one of Spaka's own, as the Pi harness's shell has.
- [ADR 0015](../adr/0015-the-cloudflare-builder-deploys-with-spakas-wrangler.md): workerd is needed. The Cloudflare builder's first export downloads about 300 MB into Spaka's tools, sharp left out.
- [The plan](../plans/packages-and-server-modules.md): changes to slices 1, 3, 5 and 7:
  - the pnpm command as it ran;
  - `package.json` cleaned before an install: `devEngines` removed, `"type": "module"` set;
  - the `gh:` and `crate:` prefixes;
  - the browser module's entry and notice;
  - wrangler's preload;
  - the server's Seatbelt profile, made from the Pi shell's, with the metadata of the app's path allowed;
  - the render made async with its notes kept per render.

Nothing here asked for a new product decision. The Pi shell's `node` under `/Users` is a fix of its own, apart from this plan.

## How it ran

Everything ran in a scratch folder, outside the repository, with a stand-in for each of Spaka's folders:

- `tools/` held pnpm and the `node_modules` of Vite and wrangler;
- `pnpm/` held pnpm's home, configuration, store, cache, state and locks, and an empty `npmrc`;
- `server-files/<id>/` was the module's writable folder;
- a fake home held the traps.

pnpm ran with an emptied environment, `env -i`. It got:

- `HOME`, the fake one;
- `PNPM_HOME`, `PNPM_CONFIG_HOME` and `XDG_RUNTIME_DIR`, in Spaka's folders;
- a `PATH` of the system's folders and a `node` script that runs Electron as Node.

It also ran once with no `node` at all, and still installed. The command:

```
pnpm <add|install> … --dir <project> --ignore-workspace
  --store-dir <store> --config.cache-dir=<cache> --state-dir <state>
  --npmrc-auth-file <empty npmrc> --registry=https://registry.npmjs.org/ --config.strict-ssl=true
  --ignore-scripts --ignore-pnpmfile --config.pm-on-fail=ignore --config.runtime=false
  --config.minimum-release-age=10080 --config.minimum-release-age-strict=true
  --config.minimum-release-age-ignore-missing-time=false
  --config.trust-policy=no-downgrade --config.trust-lockfile=false
  --config.node-linker=isolated --config.virtual-store-type=project
  --config.package-import-method=clone-or-copy --config.update-notifier=false
  [--save-exact] [--reporter=ndjson]   < /dev/null
```

What the checks read:

- **The configuration:** `pnpm config list --json` showed every value above, and none of the traps'.
- **The ndjson report:** the version chosen is in `pnpm:root` (`added.version`). Its warnings name the setting that was ignored.
- **The registries:** pnpm 12 knows two besides npm's, jsr through `@jsr/` and GitHub's through the `gh:` prefix. It also installs Rust crates, named `crate:`.

The other checks:

- **Wrangler** ran as `ELECTRON_RUN_AS_NODE=1 Electron --require as-node.cjs wrangler/bin/wrangler.js`, with `WRANGLER_SEND_METRICS=false` and `XDG_CONFIG_HOME` in Spaka's wrangler folder. Its launcher starts the CLI with the same executable and the same preload. Removing workerd's binary package made the run fail at start. Removing sharp's binaries did not.
- **The server host**, a 15-line module, imported `server/calendar.ts` and called its `route`. It then tried:
  - the home;
  - a write in the project;
  - a write in its own folder;
  - `child_process`;
  - the environment;
  - `fetch` of Open-Meteo.

  It ran with `--permission --allow-fs-read=<project> --allow-fs-read=<host> --allow-fs-write=<its folder> --experimental-transform-types`, without the sandbox and then with it.
- **The render** was timed over 200 renders of each template's home page, after 20 warm-up renders, through the runtime's own Liquid instance and `prepare`. The `load` tag was registered for the probe: it reads a name and arguments, sends them to a forked child and sets the answer under that name.

Not covered here: Windows and Linux, a signed and packaged app's download of pnpm, a real Cloudflare deployment, and the agents themselves. Slices 8 and 11 cover them.
