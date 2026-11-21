# Upstart

Build websites by talking to an agent, on your own computer. Upstart is a desktop app: you describe the website, or pick a template, the agent writes it, and you watch the page take shape as it writes. MIT licensed, free, no account.

A website is a folder of plain files (Liquid templates, records in Markdown and YAML, a theme, Tailwind and daisyUI classes, htmx 4) that Upstart serves in a live preview and exports as a static site, a Node app or a Cloudflare Worker.

## Download

Get the latest version from the [releases page](https://github.com/upstart-gg/upstart-editor/releases/latest):

- **macOS**, Apple silicon: the `.dmg`, signed and notarized.
- **Windows**, x64, beta: the `.exe` installer. It is not signed yet, so Windows SmartScreen warns of an unknown publisher at the first launch: choose "More info", then "Run anyway". Upstart needs [Git for Windows](https://git-scm.com/downloads/win), which gives the agent its shell; it asks for it at the first launch.

The app updates itself.

## What it does

- A conversation with the agent: Claude, through the official Claude binary, signed in with a Claude subscription through its own sign-in or with an API key; or other models (ChatGPT, OpenAI, Gemini, Vertex AI) through a harness of Upstart's own. The agent can ask you questions and propose a plan, and looks at the pages it builds.
- A live preview that follows the file being written, before it is saved, and a history of every version, with undo.
- Templates to start from, adapted to your business page by page, and a gallery of nearly two hundred ready-made sections.
- Editing by hand in the preview: texts, links, images, sections, with a visitor's view and phone and tablet widths. Comments on the page's elements, sent to the agent together.
- Content: collections and lists of records, edited in a Content tab or in place in the page; a media library; forms whose answers are kept in the website.
- A Theme tab: palettes with contrast warnings, corner radius, open fonts copied into the website.
- Export as a static site, a Node app or a Cloudflare Worker, each with a guide to putting it online.
- Skills and connectors to extend the agent.

On macOS the agent runs its shell inside the operating system's sandbox: it writes only in the website's folder and the system's temporary folder, and never asks for permissions, since what it may not do is refused. On Windows, which has no such sandbox, Claude runs in its auto mode, which judges each risky command; with the other models, plain file commands on the website's files (deleting, moving, copying) run at once, and any other command is asked of you on a card first.

## Working on it

Requires Node 24 and pnpm 10, on macOS (Apple silicon) or Windows.

```bash
pnpm install
```

```bash
pnpm --filter @upstart/desktop dev
```

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests |
| `pnpm lint` | Biome, here and in the templates' submodule (each with its own `biome.json`) |
| `pnpm format` | Biome's fixes, here and in the templates |
| `pnpm typecheck` | TypeScript, every package |
| `pnpm e2e` | Builds the app and checks it whole, launched in the background (no window, never takes the focus), with a recorded agent |
| `pnpm --filter @upstart/desktop package` | The packaged app in `apps/desktop/dist` |

`pnpm install` also turns on the pre-commit hooks in `.githooks`, here and in the templates' submodule once it is checked out (run `pnpm install` again after `git submodule update --init`): a commit runs the lint the CI runs on its staged files, and on the templates when it moves the submodule. `git commit --no-verify` skips it once.

Checks with the real agent spend a little of a Claude subscription, so they run only when asked: sign in once with `CLAUDE_CONFIG_DIR=.cache/agent-config` and the agent binary's `auth login`, then run the e2e checks with `UPSTART_REAL_AGENT=1`.

The templates live in their own repository, [upstart-gg/upstart-templates](https://github.com/upstart-gg/upstart-templates), checked out at `apps/desktop/templates` (`git submodule update --init`).

## Layout

```
apps/desktop/       the Electron app: main process, interface, shipped skills, gallery
packages/runtime/   renders a project: pages, shared parts, fragments, records, theme
packages/builder/   exports a project as a static site, a Node app or a Cloudflare Worker
e2e/                checks of the whole app
docs/               decisions (v2.0-decisions.md) and ADRs
```

The words used across the code and the docs are defined in [GLOSSARY.md](GLOSSARY.md); what was decided, and what has not been verified yet, is in [docs/v2.0-decisions.md](docs/v2.0-decisions.md).

## License

[MIT](LICENSE).
