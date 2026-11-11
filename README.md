# Upstart

Build websites by talking to an agent, on your own computer. Upstart is a desktop app: you describe the website, the agent writes it, and you watch the page take shape as it writes. MIT licensed, free, no account.

A website is a folder of plain files (Liquid templates, a theme, Tailwind and daisyUI classes, htmx 4) that Upstart serves in a live preview and exports as a static site any web host can serve.

## What it does today (build steps 1 and 2)

- A conversation with the agent, which runs the official Claude binary, signed in with a Claude subscription through its own sign-in or with an API key. Model and effort can change at any time, per website.
- A live preview that follows the file being written, before it is saved.
- A history of every version, with undo.
- Static export, with a guide to putting the folder online for free.
- Skills (shipped with Upstart, yours, or the website's) and connectors (remote, or programs on your computer, which stay off in a received website until you turn them on). A remote connector that asks you to sign in does so in your browser, through the agent's own sign-in.
- Editing by hand in the preview: select an element, change a text in place or a link, duplicate, delete or reorder sections, with a visitor's view and phone and tablet widths. Every change is a version you can undo.
- Comments on the page's elements, sent to the agent together as one message.
- A gallery of thirty ready-made sections, dragged into a page; the agent starts new pages from it too.
- A Theme tab: twelve palettes, each colour with a warning when text would be hard to read, the corner radius, and twenty open fonts copied into the website.

The agent starts with nothing of your own Claude setup, writes only in the website's folder and the system's temporary folder, and runs its shell inside the operating system's sandbox. It never asks for permissions: what it may not do is refused.

## Working on it

Requires macOS on Apple silicon (for now), Node 24 and pnpm 10.

```bash
pnpm install
```

```bash
pnpm --filter @upstart/desktop dev
```

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests |
| `pnpm lint` | Biome |
| `pnpm typecheck` | TypeScript, every package |
| `pnpm e2e` | Builds the app and checks it whole, launched in the background (no window, never takes the focus), with a recorded agent |
| `pnpm --filter @upstart/desktop package` | An unsigned macOS app in `apps/desktop/dist` |

Checks with the real agent spend a little of a Claude subscription, so they run only when asked: sign in once with `CLAUDE_CONFIG_DIR=.cache/agent-config` and the agent binary's `auth login`, then run the e2e checks with `UPSTART_REAL_AGENT=1`.

## Layout

```
apps/desktop/       the Electron app: main process, interface, shipped skills
packages/runtime/   renders a project: pages, shared parts, fragments, theme
packages/builder/   exports a project as a static website
e2e/                checks of the whole app
docs/               decisions (v2.0-decisions.md) and ADRs
spikes/             the two spikes the design rests on
```

The words used across the code and the docs are defined in [GLOSSARY.md](GLOSSARY.md); what was decided, and what has not been verified yet, is in [docs/v2.0-decisions.md](docs/v2.0-decisions.md).
