---
name: making-templates
description: How to make one of Spaka's templates in this repository — study current trends, write a design brief the author approves, build the template in apps/desktop/templates/<id>/, add its images with their credits, then check and photograph it. Use when asked to make, redo or correct a template.
---

# Making a template

A template is a whole website that a maker starts from: Spaka's agent rewrites its texts and replaces its images for their business, and keeps its design. So the design is the product: it must look made by a studio this year, and stay editable in Spaka by someone who cannot code.

`apps/desktop/templates` is a git submodule, the public repository get-spaka/templates: the templates' only source. In a fresh checkout or a new worktree, fill it first with `git submodule update --init`. A template's files are committed there, on a branch of that repository; this repository records only which commit of it it uses.

Read first, and keep open while building:

- `apps/desktop/templates/FORMAT.md`: the format and the rules `pnpm template:check` applies. It is the source of truth; this skill does not repeat it.
- `apps/desktop/src/main/agent/instructions.ts` (`SPAKA_INSTRUCTIONS`): what a project is made of, the theme's variables, the classes to use.
- `apps/desktop/skills/web-design/SKILL.md`: the design rules every Spaka site keeps, a template's first. This skill adds only what is a template's own.
- `apps/desktop/skills/site-scripts/SKILL.md`, before any script or stylesheet.
- `apps/desktop/skills/datasources/SKILL.md` and `apps/desktop/gallery/README.md`, for lists and blocks.
- `e2e/fixtures/templates/atelier/`: a small finished template, for the shape of each file.

Work through the steps in order. Each ends on a condition; move on only once it holds.

## 1. Study what well-made sites do now

Search the web (Awwwards, Siteinspire, Land-book, Godly, Lapa Ninja, One Page Love, and the studios they feature) for sites of the template's category from the past year or two. Open at least eight with WebFetch or the browser and note, for each, what makes it feel current: the type, the layout, the color, the movement, the pacing of sections.

These are **inspiration**: you take ideas that many sites share (a trend), never one site's layout, texts, images, logo or code. A template that someone could set beside its source and recognize is a copy.

**Done when** you have a list of three to six trends, each seen on at least two of the sites, each with the addresses where you saw it.

## 2. Write the brief, and have it approved

The brief is a page, in the author's language:

- **Concept**: one sentence, and the fictional business its texts are written for (a believable name, place and offer).
- **Category** (`business`, `portfolio`, `blog`, `launch`, `event`, `app`).
- **Trends** it draws on, from step 1, and its direction and one strong move (the web-design skill): what makes it its own.
- **Type**: the heading and body fonts (Google Fonts, under the OFL), and the scale.
- **Palette**: the theme's values (`--theme-color-*` in oklch) and what each is used for.
- **Motion**: its movement level, by the business's character: the web-design skill's still, gentle, expressive or orchestrated, or, for a template alone, immersive, the whole page a story told as it scrolls (a sideways scroll, transitions between pages, a WebGL scene across the page), where the web-design skill's "one orchestrated moment a page" does not hold, yet every page still reads on a phone and is complete under reduced motion and in edit mode. A wave holds at least three levels, at least two templates expressive or beyond, and at least one immersive; its signature effect, the movement that is this template's alone; what moves, when, with which library or CSS; what the page shows under reduced motion and in edit mode, where nothing runs.
- **Page types**: the pages that share a first folder of `pages/` (the home page alone; a list and its record pages together), in the order the agent adapts them, home first; each with its sections in order, which come from the gallery (`apps/desktop/gallery/<kind>/<id>`) and which are the template's own; its datasources.
- **Its own blocks**: the sections a maker will want to add again elsewhere, which go into `blocks/`.
- **What varies**, page type by page type: the choices that really vary in the design and cost the agent work to change (how a visitor books, orders or signs up, what is sold and how), each with 2 to 4 options, the first the one recommended, most often the template as built; a choice for the whole website goes with the home page. Whether a page exists is not a choice: say what goes with each page type when the maker leaves it out. Never a fact the agent asks after (the hours, the prices).

Before writing it, read `docs/template-briefs/inventory.md`, a row per template already made: the brief takes no font it lists, no move or signature effect another template of its wave has, and no color another template owns.

Show it to the author and ask for their approval; build nothing before it.

**Done when** the author has approved the brief, with their corrections written into it.

## 3. Build it

In `apps/desktop/templates/<id>/`, a project folder as `FORMAT.md` describes: `template.json`, `TEMPLATE.md`, `theme.css`, `pages/`, `parts/`, `data/`, `scripts/` and `styles/` if it moves, `blocks/`, and its design notes in `.spaka/skills/<id>-design/SKILL.md`.

- **Sections from the gallery**: copy the block's `block.liquid` into `parts/<id>.liquid` and render it, and its `data/` into the project's, as the gallery's README says a drop does; then restyle it to the brief.
- **Texts**: the fictional business's, as a copywriter would write them, in English with American spelling. Makers write in other languages: the header's links and the buttons hold labels a third longer, as in French or German, on one line (`whitespace-nowrap`), the menu button taking over below the width where they all fit. Every list a datasource with three to six believable records; `navigation` holds the header's and footer's links.
- **Movement** as much as the template's character calls for, by the web-design skill's table, and written by the site-scripts skill's rules: the page complete with no script, the hidden state set by the script itself, reduced motion respected. Its libraries are packages: list each in `package.json` at its exact version (`"motion": "14.9.0"`), run `pnpm template:install apps/desktop/templates/<id>`, which installs them with Spaka's pnpm and writes `pnpm-lock.yaml`, and import them by their names in the modules. Again after each change to `package.json`.
- **The guide**, `TEMPLATE.md`, tells the agent that adapts it what matters only then, in the outline `FORMAT.md` shows: what it is and whom it suits, how it is made, when adapting (where the name and the address appear, what to leave out rather than guess), and `## Pages`, a `### Name (`/route`)` section per page type of the brief, home first: what the page shows in one line, its choices as `####` questions, each option with what it means for the maker and the files to change, and a `When removed:` line on what to delete with it and where to point what led to it.
- **The design notes** stay with the website for the agent's later turns: the spirit in two or three sentences, the type, the colors and shapes, each effect and the attribute or class that turns it on (so a new section gets it too), how the lists work, and the rules that hold for the website's whole life. They are a skill; write its description as a pointer the agent will follow: "The <name> template's design notes — read before changing its pages, sections or styles." A line goes in one of the two documents, never both.

Run `pnpm template:check apps/desktop/templates/<id>` as you go.

**Done when** every page of the brief is there and the check reports no error.

## 4. Its images

```bash
pnpm template:image find <what the image shows, in English>
```

```bash
pnpm template:image use apps/desktop/templates/<id> <id from the search> <short file name> "<alternative text>"
```

```bash
pnpm template:image use apps/desktop/templates/<id> <list file>
```

```bash
pnpm template:image generate apps/desktop/templates/<id> <short file name> "<prompt, in English>" "<alternative text>" --aspect 16:9
```

`find` lists free images (CC0, public domain, CC BY, CC BY-SA) and saves a small copy of each in `e2e/.runs/template-images/`: look at them with Read and choose for the brief's palette and mood, not the first one. `use` adds it to `media/` with its credits and alternative text. Once all are chosen, add them in one go: a list file in the scratchpad, one image a line, `<id> <short file name> <alternative text>`. Downloads go one at a time and wait while Wikimedia says it is busy; an image still refused is marked FAIL, and running the same list again adds only those (the others are already there). Every image of the template comes this way. `generate` makes an image where it serves the brief's style better than any free photo (an illustration, a texture, a background, a scene of mood), with GEMINI_API_KEY or OPENAI_API_KEY set in the author's terminal or in the repository's `.env` (see `.env.example`): it is paid by that key, so generate only what the brief calls for, and give the previous images with `--ref` to keep one style. A generated image never shows the business's team or any real person, a logo or text; it makes the template need `"app": "0.2.0"`. A photo of a recognizable person goes only where the fictional business would show its own people.

**Done when** each image the brief calls for is in a page or a record, and the check still reports no error.

## 5. Check it, photograph it, look at it

```bash
pnpm template:check apps/desktop/templates/<id>
```

```bash
pnpm template:shoot apps/desktop/templates/<id>
```

The shoot runs the app in the background and writes `pictures/` and a review sheet, `e2e/.runs/template-sheets/<id>.png`. It then renders each page again in the preview, twice, as after an edit, at desktop and phone width: its scripts are stopped and started again on the same elements, and nothing that was shown may stay hidden, nor any error be raised (`e2e/.runs/templates-again-<id>.json` lists what went wrong). The site-scripts skill says how a script survives it: animations that say where they start from (`opacity: [0, 1]`), and a stop that keeps what start needs again. Look at the sheet and at each picture, page by page, at both widths, and fix what is wrong: a section still hidden or half-risen, text over an image that cannot be read, something wider than the phone, an empty space where an image failed, a section that looks like any template rather than this one. Shoot again after each fix (`--no-build` when only the template changed). A template whose look follows the time of day (open or closed, the service of the hour) is photographed at the clock its `template.json` sets in `shoot.clock` (FORMAT.md), so its cover shows it at its best whatever the day of the shoot; `--clock <instant>` tries another hour once. A page's whole picture is taken with the page held still, so neither a slice's seam nor `loading="lazy"` calls for a workaround in the template: every image loads at once, scroll-driven animations are held (an element's `view()` as with it in the middle of the screen, `scroll()` as at the page's top), every reveal on view plays as the page opens, and what floats (`position: fixed`) is shown once, where it stands on the first screen.

Then measure what the agent's looks measure (Q318), on every page at the three screens, screen after screen: the page wider than the screen, text cut off, elements still hidden once the page has settled, images that did not load, links to an address no page has. The app must be built (the shoot builds it):

```bash
SPAKA_LOOKS_TEMPLATES=<id> npx vitest run --config e2e/vitest.config.ts e2e/looks-templates.e2e.ts
```

Each problem left is a fault of the template, to fix, or a false alarm of the measure, to tell the author about (`e2e/.runs/looks-templates-<id>.json` lists them).

Then `pnpm template:check apps/desktop/templates/<id> --finished` and `npx vitest run apps/desktop/src/main/templates`.

**Done when** the looks measure no problem, both commands pass, you have looked at every picture of the latest shoot and found nothing to fix, and the sheet has been sent to the author.

## 6. Release it, once the author says so

The template is committed in the submodule, on a branch of get-spaka/templates, and reviewed there. With the author's go-ahead, it goes into that repository's main, which is pushed, then the next `v<n>` is tagged and pushed: its CI checks every template as finished and attaches the release the app reads. Here, commit the submodule's new commit (`git add apps/desktop/templates`) so that the tests and development use it too, with the template's row added to `docs/template-briefs/inventory.md`.

`pnpm template:release <out folder> <tag> [previous catalogue.json]` builds the same release here first, to see it fail before the CI does; given the latest release's catalogue, as the CI gives it, it keeps the earlier versions older apps still need. The `version` in `template.json` goes up whenever a published template changes, so that the app downloads it again. A template that uses something an older app reads otherwise (the `images` field kind, a generated image) says the oldest app version it needs, `"app": "0.2.0"`; the checks ask for it (Q368). After a change to the checks in `apps/desktop/src/main/templates/`, `pnpm template:release-script` rebuilds the script the CI runs, committed in the submodule.

**Done when** the tag's release on GitHub lists the template's `.zip` and pictures in its `catalogue.json`, and this repository points at the tagged commit.
