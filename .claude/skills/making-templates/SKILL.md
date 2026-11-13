---
name: making-templates
description: How to make one of Upstart's templates in this repository — study current trends, write a design brief the author approves, build the template in apps/desktop/templates/<id>/, add its images with their credits, then check and photograph it. Use when asked to make, redo or correct a template.
---

# Making a template

A template is a whole website that a maker starts from: Upstart's agent rewrites its texts and replaces its images for their business, and keeps its design. So the design is the product: it must look made by a studio this year, and stay editable in Upstart by someone who cannot code.

`apps/desktop/templates` is a git submodule, the public repository upstart-gg/upstart-templates (never upstart-gg/templates, the old Upstart's): the templates' only source. In a fresh checkout or a new worktree, fill it first with `git submodule update --init`. A template's files are committed there, on a branch of that repository; this repository records only which commit of it it uses.

Read first, and keep open while building:

- `apps/desktop/templates/FORMAT.md`: the format and the rules `pnpm template:check` applies. It is the source of truth; this skill does not repeat it.
- `apps/desktop/src/main/agent/instructions.ts` (`UPSTART_INSTRUCTIONS`): what a project is made of, the theme's variables, the classes to use.
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
- **Category** (`business`, `portfolio`, `blog`, `launch`, `event`, `app`) and whether it is one of the **original**, animated designs.
- **Trends** it draws on, from step 1, and what makes it its own.
- **Type**: the heading and body fonts (Google Fonts, under the OFL), and the scale.
- **Palette**: the theme's values (`--theme-color-*` in oklch) and what each is used for.
- **Motion**: what moves, when, with which library or CSS; what the page shows under reduced motion and in edit mode, where nothing runs.
- **Pages**: each page with its sections in order, which come from the gallery (`apps/desktop/gallery/<kind>/<id>`) and which are the template's own; its datasources.
- **Its own blocks**: the sections a maker will want to add again elsewhere, which go into `blocks/`.

Show it to the author and ask for their approval; build nothing before it.

**Done when** the author has approved the brief, with their corrections written into it.

## 3. Build it

In `apps/desktop/templates/<id>/`, a project folder as `FORMAT.md` describes: `template.json`, `theme.css`, `pages/`, `parts/`, `data/`, `scripts/` and `styles/` if it moves, `blocks/`, and its design notes in `.upstart/skills/<id>-design/SKILL.md`.

- **Sections from the gallery**: copy the block's `block.liquid` into `parts/<id>.liquid` and render it, and its `data/` into the project's, as the gallery's README says a drop does; then restyle it to the brief.
- **Texts**: the fictional business's, as a copywriter would write them, in English with American spelling. Makers write in other languages: the header's links and the buttons hold labels a third longer, as in French or German, on one line (`whitespace-nowrap`), the menu button taking over below the width where they all fit. Every list a datasource with three to six believable records; `navigation` holds the header's and footer's links.
- **Movement** follows the site-scripts skill: the page complete with no script, the hidden state set by the script itself, reduced motion respected.
- **The design notes** tell the agent that adapts it: the spirit in two or three sentences, each effect and the attribute or class that turns it on (so a new section gets it too), and what not to break. They are a skill; write its description as a pointer the agent will follow: "The <name> template's design notes — read before changing its pages, sections or styles."

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

`find` lists free images (CC0, public domain, CC BY, CC BY-SA) and saves a small copy of each in `e2e/.runs/template-images/`: look at them with Read and choose for the brief's palette and mood, not the first one. `use` adds it to `media/` with its credits and alternative text. Once all are chosen, add them in one go: a list file in the scratchpad, one image a line, `<id> <short file name> <alternative text>`. Downloads go one at a time and wait while Wikimedia says it is busy; an image still refused is marked FAIL, and running the same list again adds only those (the others are already there). Every image of the template comes this way; a photo of a recognizable person goes only where the fictional business would show its own people.

**Done when** each image the brief calls for is in a page or a record, and the check still reports no error.

## 5. Check it, photograph it, look at it

```bash
pnpm template:check apps/desktop/templates/<id>
```

```bash
pnpm template:shoot apps/desktop/templates/<id>
```

The shoot runs the app in the background and writes `pictures/` and a review sheet, `e2e/.runs/template-sheets/<id>.png`. Look at the sheet and at each picture, page by page, at both widths, and fix what is wrong: a section still hidden or half-risen, text over an image that cannot be read, something wider than the phone, an empty space where an image failed, a section that looks like any template rather than this one. Shoot again after each fix (`--no-build` when only the template changed).

Then `pnpm template:check apps/desktop/templates/<id> --finished` and `npx vitest run apps/desktop/src/main/templates`.

**Done when** both pass, you have looked at every picture of the latest shoot and found nothing to fix, and the sheet has been sent to the author.

## 6. Release it, once the author says so

The template is committed in the submodule, on a branch of upstart-gg/upstart-templates, and reviewed there. With the author's go-ahead, it goes into that repository's main, which is pushed, then the next `v<n>` is tagged and pushed: its CI checks every template as finished and attaches the release the app reads. Here, commit the submodule's new commit (`git add apps/desktop/templates`) so that the tests and development use it too.

`pnpm template:release <out folder> <tag>` builds the same release here first, to see it fail before the CI does. The `version` in `template.json` goes up whenever a published template changes, so that the app downloads it again. After a change to the checks in `apps/desktop/src/main/templates/`, `pnpm template:release-script` rebuilds the script the CI runs, committed in the submodule.

**Done when** the tag's release on GitHub lists the template's `.zip` and pictures in its `catalogue.json`, and this repository points at the tagged commit.
