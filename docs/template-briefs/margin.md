# Margin: brief

The third of wave 1's four standard templates: the blog (`blog`, not one of the original designs).

## Concept

**Concept.** A small publication that people actually read: one writer, a numbered letter every week, and an article page built for reading, with a serif made for long text, notes in the margin and pull quotes. Every picture on the lists is printed in one green ink, so any photo the maker adds belongs to the set; on a letter's own page, its pictures develop into full color as they come into view. The newsletter is the main call, said plainly and never in a popup.

**The fictional publication** its texts are written for is **The Long Way Round**, a weekly letter and blog by **Nell Ashby**, a writer who walks Providence, Rhode Island, one street at a time. She writes about the parts of the city people pass without looking: public stairs, the rivers that were paved over, old mill buildings, ghost signs, the history behind street names, and the routes she walks each week. She has written it since 2021. It is free, goes out on Sunday mornings, and has reached letter no. 142. (Decision Q259: the blog is about a city rather than a garden, so that it does not overlap with Pocket's plants.)

The same structure suits a food writer, a gardening letter, a design critic, a slow-travel newsletter, a local history society, or a small magazine with several writers (each letter has its author). The agent rewrites the letters, the topics and the about page.

## Trends it draws on

These come from 20 sites opened in November 2026: independent magazines, personal blogs and newsletters' own sites from 2025-2026, found through Siteinspire, Typewolf, Fonts In Use, Awwwards and Gardenista's roundup of garden newsletters. Each trend was seen on at least two of them. WebFetch reads a page's text and structure only, not its styles, so fonts come from the sites' Siteinspire, Typewolf and Fonts In Use entries and from their own colophons. vhbelvadi.com refused WebFetch, so its Fonts In Use entry stands in for it.

1. **A serif text face for reading, with a plain sans or mono for labels.** joost.blog (Domaine Text, Pitch), vhbelvadi.com (Tid, New Transport), robinsloan.com (Filosofia, Trade Gothic), every.to (Signifier, Switzer), therootedjournal.com (Tobias, Matter Mono), thebeautifultruth.org (Heldane Text, GT America).
2. **The issue or the season as the unit, with its contents listed.** digdelve.com ("Autumn issue 2026" and its contents), asteriskmag.com (the issue's table of contents is the home page), worksinprogress.co and therootedjournal.com (issue labels on every piece), kinfolk.com (Issue 61), densediscovery.com ("414 issues since 2018", "next issue in 3 days").
3. **Text-led lists rather than cards.** Each piece is a label, a title, a dek and a byline, with a small picture or none (asteriskmag.com, orionmagazine.org, noemamag.com, pw-magazine.com, craigmod.com/essays, emergencemagazine.org).
4. **Reading furniture around one column:** notes, as endnotes with return arrows (asteriskmag.com, craigmod.com) or as sidenotes beside the text, under the paragraph on a phone (vhbelvadi.com); pull quotes repeating a sentence of the text (noemamag.com, emergencemagazine.org, vhbelvadi.com); contents for long pieces (joost.blog, craigmod.com).
5. **The newsletter as the main call, repeated and specific about when it comes and who reads it.** densediscovery.com (three times on a page, with a reader count), craigmod.com (two letters with checkboxes, after each essay), asteriskmag.com and worksinprogress.co (in the middle of an article and at its end), themarginalian.org (two letters named by their day), emergencemagazine.org ("biweekly, on Sunday mornings").
6. **A person, and a sign of time passing:** a sign-off and a bio at the end of a piece (craigmod.com, worksinprogress.co, asteriskmag.com), a portrait greeting on the home page (awaytogarden.com), "planted", "last tended" and "last updated" dates (maggieappleton.com, robinsloan.com).
7. **Ways into the archive by year, by subject and by chance:** year-grouped lists with topic filters (joost.blog), subjects and "surprise me" (themarginalian.org), a "Lucky Dip" of random stories (wonderground.press), format filters (emergencemagazine.org).

**What makes it its own:**
- the pictures printed in one green ink on every list, developing into color on a letter's page;
- margin notes made in CSS alone from a plain `<aside>` in the letter's text, numbered and set beside their paragraph;
- the header's bottom rule, which fills in green as you read;
- the letter number and the season as the masthead's dateline;
- an "On my walks now" list on the about page, dated like a now page.

**What it leaves out:** smooth scrolling (reading wants the browser's own scroll); page transitions and split text, Folio's; loaders, carousels and infinite scroll; comments, share-button rows and view counts; a newsletter popup; paywalls.

## Type

Both fonts are files of the template under the SIL Open Font License, like Corner's and Folio's: variable files with their italics.

| Role | Font | Setting |
|---|---|---|
| Body | Literata (made for long reading on screens; optical sizes 7 to 72) | 400, 1.1875 rem on a letter's page and 1.0625 rem elsewhere, `leading-[1.65]`, measure `max-w-[66ch]`, `text-pretty`, old-style figures in running text, hyphens on a phone |
| Headings and the masthead | Literata at its display optical size | 500 for titles; the masthead name at `clamp(3rem, 9vw, 7.5rem)`, 400, `tracking-tight`, `leading-[0.95]`; a letter's title at `clamp(2.5rem, 5vw, 4.5rem)`; never italic accents in headings |
| Pull quotes and drop caps | Literata, display size | pull quotes at 300, 2 rem, upright, with a hanging quotation mark in the primary color; the drop cap at 600, three lines tall (`initial-letter`, with a float as fallback), in the primary color |
| Margin notes and captions | Literata | 0.875 rem, `text-base-content/75`, the note's number in Schibsted Grotesk |
| Labels and interface | Schibsted Grotesk (made for a news group's sites) | 500 to 600: the category, the letter number, dates, minutes, the navigation, buttons and form labels; labels uppercase at 0.75 rem with `tracking-[0.08em]`, figures tabular |

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.975 0.007 135) | a near-white with a breath of leaf: the page |
| `--theme-color-surface-alt` | oklch(0.945 0.016 140) | pale sage: the letterbox, the now list, the topic plates' ground |
| `--theme-color-text` | oklch(0.24 0.02 160) | green-black ink |
| `--theme-color-primary` | oklch(0.40 0.075 160) | fir green: links, the drop cap, the reading rule, the pictures' ink, buttons |
| `--theme-color-primary-content` | oklch(0.97 0.012 140) | text on fir |
| `--theme-color-secondary` | oklch(0.48 0.06 130) | moss: the category labels and margin note numbers |
| `--theme-color-secondary-content` | oklch(0.97 0.012 140) | text on moss |
| `--theme-color-accent` | oklch(0.90 0.065 125) | fern: the `<mark>` highlight and the current topic |
| `--theme-color-accent-content` | oklch(0.24 0.02 160) | ink on fern |
| `--theme-color-neutral` | oklch(0.27 0.035 162) | deep forest: the footer |
| `--theme-color-neutral-content` | oklch(0.94 0.015 140) | text on forest |
| `--theme-color-border` | oklch(0.87 0.02 145) | hairlines between rows |

It is one green in several strengths: no warm paper (Corner), no off-white with a hot accent (Folio), no mint pastel (the app showcase).

**Contrast:** every text is at WCAG AA or better on its background: ink on the page about 15:1, fir about 8.5:1, moss about 6:1, text on fern and on forest about 12:1; secondary text never lighter than `text-base-content/65`.

Other settings: `--theme-radius: 0.375rem` (only the letterbox and the plates show it); fields at the default, `calc(var(--theme-radius) * 0.5)`; relief off (`--theme-depth: 0`); density normal (`--theme-size: 0.25rem`), since lists of letters are read at a glance, with generous padding between sections; fine borders (1px).

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves: Spaka's stillness rule stops every CSS animation and transition, no script runs, and every picture, highlight and rule is in its final place.

- **Ink:** a picture in a `data-ink` frame is printed in the green ink, in CSS alone: the image greyscale, multiplied onto the sage, with an overlay of the primary color lightening it, so dark becomes fir and light becomes sage. On a desktop, hovering or focusing its letter's link brings its color back over 0.5 s, only under `html[data-spaka-moving]` and `(hover: hover)`, so it stays inked while editing; under reduced motion the color returns at once. With no script it is inked: that is its final state.
- **Develop:** on a letter's page, its cover and pictures under `data-develop` start inked and develop into full color as they come into view, over 1.2 s (`scripts/develop.js`: Motion's `inView` and `animate` on the image's `filter` and an ink layer's `opacity`). The script sets the inked state itself; with no script, under reduced motion and in edit mode they are in full color.
- **The reading rule:** on a letter's page, the compact header's bottom rule (`data-progress`) fills in fir from left to right as you read. It is CSS only (`animation-timeline: scroll(root)`, in `@supports` and in `prefers-reduced-motion: no-preference`). With no support, under reduced motion and in edit mode, it is a plain full rule.
- **Highlights:** a `<mark>` in a letter's text (`data-highlight` on the text) has its fern highlight swept in from the left as it comes into view. This is CSS only (`animation-timeline: view()`). Its base state is fully highlighted, so with no support, under reduced motion and in edit mode it is simply highlighted.
- **Rows:** the rows of letters on the home and archive pages rise a little (`y: [12, 0]`, opacity) as they come into view, under `data-reveal`, as in the site-scripts skill. With no script they are in place.
- **Lucky dip:** "Read one at random" (`data-lucky-dip`) is a link to a letter chosen by the page, with every letter's address in its `data-posts`. `scripts/lucky-dip.js` sends the reader to one at random. It does not move; with no script and in edit mode the link simply goes to the letter written in it.

Library: Motion, pinned on jsDelivr, under MIT. Everything else is CSS.

## Pages

The posts are the gallery's `blog` collection, so a blog block dropped later lists the same letters. A letter's page is at `/letters/<id>` (`pages/letters/[blog].liquid`).

**Home** (`/`):
- **the masthead (its own, adapted from `apps/desktop/gallery/header/header-centered`):** a dateline in labels ("A weekly walk through one city · Providence, RI" on the left, "No. 142 · Autumn 2026" on the right), "The Long Way Round" at masthead size, and a row with Letters, Topics, About, Newsletter and a "Subscribe" button, folding into a `<details>` menu on a phone;
- **the lead letter (its own, adapted from `apps/desktop/gallery/blog/blog-editorial-columns`):** the latest featured letter, its inked cover (3:2) beside its label ("Essay · No. 142"), title, dek, "Nell Ashby · 8 November 2026 · 9 min" and "Read the letter";
- **this season:** the next five letters as ruled rows, each with its number, title, dek, topics and minutes, and a small inked picture at the row's end on a desktop. This comes from the same block, with the rows adapted from `apps/desktop/gallery/blog/blog-date-list`;
- **the letterbox (its own, adapted from `apps/desktop/gallery/newsletter/newsletter-split-benefits`):** "The letter comes on Sunday mornings", one sentence, first name, email and "Subscribe", and "Read by 6,400 walkers. One letter a week, nothing else.";
- **topics (its own):** the five topics as inked plates cut from old maps and engravings of the city, each with its name and a line, linking to the topic's page;
- **from the archive:** three older letters in text-only columns, then "Read one at random" and "All 142 letters";
- **the writer:** an inked portrait, two sentences in her voice, and "More about Nell". It is adapted from `apps/desktop/gallery/about/about-founder-note`, on the light page;
- **the footer (adapted from `apps/desktop/gallery/footer/footer-simple-centered`, on forest):** the name, one line, the links from `navigation`, "Written in Providence since 2021", and Spaka's credits link.

**Letters** (`/letters`):
- the title, "142 letters since 2021", and a row of topic links;
- the letters grouped by year, each row with its date, number, title, topics and minutes (its own `blog-margin-archive`, from `blog-date-list`);
- "Read one at random".

**A letter** (`/letters/<letter>`), a page per record:
- the compact header with the reading rule;
- the label (category and number), the title, the dek, the byline with date and minutes, and the cover developing into color with its caption;
- **the text,** in three columns on a desktop: a sticky left rail with the season and the topics, the 66-character measure, and the right margin for the notes. The first paragraph has its drop cap; a blockquote in the Markdown is set as a pull quote; an image in it is a figure that develops into color. An `<aside>` written on its own line just after a paragraph becomes a numbered margin note, in CSS alone: a counter numbers the paragraph it follows (`p:has(+ aside)`), and the note floats into the margin on a desktop or sits indented under its paragraph on a phone;
- the sign-off, then a short note about the writer (literal text in a part, editable in place);
- the letterbox, compact;
- **"More on <first topic>":** three letters sharing a topic, adapted from the end of `apps/desktop/gallery/blog/blog-category-tags`'s page;
- the previous and next letters by number.

**Topics** (`/topics`): the five plates with their lines and how many letters each has. **A topic** (`/topics/<topic>`), a page per record: its plate, its name and a paragraph, then its letters as rows (the letters whose `topics` holds the topic's title).

**About** (`/about`):
- **the opening:** a portrait (optional; Nell's initials on the fern otherwise) beside a paragraph of bio;
- **the route:** how the letter began (a broken-down car and a year of walking to work), with two pictures (adapted from `apps/desktop/gallery/about/about-story-picture`);
- **"On my walks now" (its own, a section list):** labelled lines (Walking, Reading, Looking for, Eating, Wondering about), with "Last updated 9 November 2026";
- **a colophon:** what it is set in, where the pictures come from, how often it comes (adapted from `apps/desktop/gallery/about/about-facts-inline`);
- **"Write to me":** a form with name, email and message, answered with "I read every letter; I answer most of them" (adapted from `apps/desktop/gallery/forms/forms-contact-card`).

**Newsletter** (`/newsletter`):
- the pitch at heading size;
- the signup with first name, email and what to receive, as checkbox tiles: the Sunday letter, the four seasonal long walks, the spring walking tours (adapted from `apps/desktop/gallery/newsletter/newsletter-interests`);
- "What arrives", three numbered lines (adapted from `apps/desktop/gallery/features/features-numbered`);
- the latest three letters as rows;
- questions (adapted from `apps/desktop/gallery/faq/faq-accordion`): is it free, how often, can I reply, unsubscribing.

**Datasources:**
- `navigation`;
- `blog`, the letters, sorted `-date`: title, number, category (Essay, Note, Walk, Reading), season (choice), date, summary (the dek), cover, cover caption, topics (list), minutes, author, featured, body. There are six records, from "The stairs nobody uses" (no. 142) back through "Where the river went underground", "Reading the ghost signs", "A year of walking every street", "What the mill buildings remember" and "A winter reading list for walkers";
- `topics`: title, summary, plate. Five records: Streets, Buildings, Rivers, Signs and names, Books;
- `about-now`: a section list of label and line;
- `newsletter-features` and `newsletter-faq`: section lists;
- `newsletter`: collected; email, first name and interests (choice list); used on every page that has the letterbox;
- `contact`: collected.

## Its own blocks

The Blocks tab offers these first for a site started from Margin:

- `header-margin-masthead`: the dateline, the name at masthead size and the links;
- `blog-margin-lead`: the lead letter with its inked cover and the season's rows, a data block over `blog`;
- `blog-margin-archive`: the letters grouped by year with "Read one at random", a data block over `blog`;
- `newsletter-margin-letterbox`: the Sunday signup with its reader line, a form over `newsletter`;
- `about-margin-now`: the "On my walks now" list with its date, a data block over a section list.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. About 20:

- **six covers:** a long public stairway between houses, a river running out of a culvert under a street, a faded painted advertisement on a brick wall, a quiet residential street in early light, an old mill building by a river, a stack of books on a café table by a window;
- **four pictures inside the letters:** a street-name sign, cobblestones, a footbridge, rain on a sidewalk;
- **five plates for the topics:** public-domain old maps, bird's-eye views and engravings of American cities, of which Commons has thousands (the Library of Congress's panoramic maps among them);
- **for the about page:** a walking route seen from above, a notebook and a paper map, and a portrait of the writer on a street, the one recognizable person, as a publication shows its own writer (initials otherwise).

The ink makes them one set whatever their colors, so choose them for clear light and shadow, which the duotone needs: daylight or early morning, brick, stone, water and paper, strong lines, no crowds and no faces but the portrait, nothing glossy or staged.
