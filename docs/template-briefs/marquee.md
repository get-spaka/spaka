# Marquee: brief

The first of wave 1's four original designs: the event (`event`, one of the original, animated designs).

## Concept

**Concept.** A festival site that is its own poster. The name, the dates and the place are the headline, at poster size, on two loud inks: hot pink and tangerine over a deep plum. The letters of the name stretch and narrow as if the music pushed them. A field of halftone dots swells under the cursor. Every photo is printed in the two inks. The lineup reads like a bill, the days stack up like flyers, and the passes are ticket stubs. Under all that noise, the practical pages (timetable, getting there, access, questions) are calm and complete.

**The fictional event** its texts are written for is **Hot Static**, three days of music, light and late swims on the north docks of Marseille. It runs from Friday 9 to Sunday 11 July 2027 at La Raffinerie, a former sugar refinery, across four stages. It has 41 acts, from afternoon jazz on a barge to techno in the old machine hall. It is in its fourth year, for about 9,000 people a day. Passes go from €59 for a day to €129 for the weekend, and a companion comes free with an access card.

The same structure suits a film, design, food or ideas festival, a conference, a biennale, or a club's season. The agent rewrites the acts as speakers, films or chefs, the stages as rooms, and the passes as tickets.

## Trends it draws on

These come from 22 festival and event sites of 2025-2026, mostly from Awwwards' Events and Culture categories, with One Page Love and It's Nice That for direction. WebFetch returns a page's text and not its look, so each site's type, color and motion come from its Awwwards entry (palette, tags, named elements). Each trend was seen on at least two of them.

1. **The dates and the place are the headline.** They are set large and repeated: in the hero, the header bar, the ticket copy and the footer (kelvin.8b.com, wip.workoholics.es, offforum.com, shapeshiftfestival.com, superlocaldesign.com, sonar.es).
2. **A program by day.** Each entry gives its time, its kind and its venue, with the day's opening hours (spatial-festival.program.studio, superlocaldesign.com, gravelleduparc.com, imdday.ch, kelvin.8b.com).
3. **A lineup as coded entries,** each with a number, a day code, a stage or a country code (wip.workoholics.es, shapeshiftfestival.com, imdday.ch, paaspop.nl), and the long tail as a plain list of names, "& many more" (sonar.es, kelvin.8b.com).
4. **Passes as named objects,** framed like tickets and tiered (paaspop.nl, kelvin.8b.com, sonar.es, spatial-festival.program.studio, superlocaldesign.com, sitcon.org/2026), with a sign-up to be first in line that asks what to hear about (paaspop.nl, offforum.com, noartmusic.com, shapeshiftfestival.com).
5. **Practical information given in full:** venues by day with directions (designbomb.it, spatial-festival.program.studio), transport by mode (kelvin.8b.com, imdday.ch, gravelleduparc.com), questions grouped by topic (gravelleduparc.com, flowfest.co.uk, spatial-festival.program.studio).
6. **Two loud colors, full bleed:** orange and amber on flowfest.co.uk (#F3A20F, #F97028), green and pink on francouvertes.com (#74f260, #f370ff), periwinkle and blush on lagolago.nl, one electric blue on shapeshiftfestival.com and performeurope.eu. **One treatment over all the imagery:** every photo in heat colors on kelvin.8b.com, one grainy neon green through the whole identity of nuits-sonores.com (from It's Nice That's write-up).
7. **A layer of motion:** WebGL or shaders (paaspop.nl, imdday.ch, spatial-festival.program.studio, creativecruise.nl, hoyojerez.com), page transitions (paaspop.nl, designbomb.it, lagolago.nl), and running bands of words (shapeshiftfestival.com's activity ticker, flowfest.co.uk's sponsor strip, read from repeated items in the page rather than seen moving).

**What makes it its own:**
- the motion is in the type itself: the name's letters change width (a variable width axis) rather than sliding in;
- the halftone dots are drawn in WebGL, with a printed CSS halftone underneath when WebGL cannot run;
- every photo is a two-ink duotone made in CSS from the theme's colors, so any maker's photos match, and so does any palette from the Theme tab;
- the day cards stack on top of each other like flyers on a wall, each slightly askew;
- the passes are ticket stubs with notched edges and a status stamp.

**What it leaves out:** loaders and intro screens; 3D models and sound; horizontal scroll hijacking and custom cursors; a cursor-following preview (Folio's); an italic serif accent (Corner's and Folio's); artist portraits: acts are shown through duotone photos of instruments, lights and crowds, which a maker can replace with their own.

## Type

Both fonts are files of the template, under the SIL Open Font License, like Corner's and Folio's.

| Role | Font | Setting |
|---|---|---|
| The name and the dates | Anybody (variable: width 50 to 150, weight 100 to 900) | weight 900, uppercase. The name at `clamp(4.5rem, 21vw, 19rem)`, `leading-[0.8]`, width 100 at rest. The dates at the same scale, width 62. |
| Headings | Anybody | weight 800, width 70, uppercase, `leading-[0.85]`, `tracking-tight`, 2.5 to 7 rem with `clamp()` |
| Body | Rethink Sans | 400 and 600, 1.0625 rem, `leading-relaxed` (Schibsted Grotesk, first chosen, is Margin's label face) |
| Labels, times and codes | Anybody | weight 700, width 55, uppercase, `tracking-wide`, small, with tabular figures if the font has them: "FRI 09 · 22:30 · THE TANK" |

Width is set through one variable, `--wdth`, read by `font-stretch` (the `@font-face` declares `font-stretch: 50% 150%`). The stylesheet sets it on `h1` to `h3` and on `.label`, and the scripts animate it. With no script, every word sits at its set width.

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-primary` | oklch(0.68 0.26 352) | hot pink: the hero's dots, the tape, the buttons, one day card in three, the duotone's light ink |
| `--theme-color-primary-content` | oklch(0.2 0.07 340) | plum, on pink |
| `--theme-color-secondary` | oklch(0.77 0.18 58) | tangerine: the hero's ground, the stubs, one day card in three |
| `--theme-color-secondary-content` | oklch(0.2 0.07 340) | plum, on tangerine |
| `--theme-color-accent` | oklch(0.88 0.1 80) | apricot: the stickers and the "few left" stamp |
| `--theme-color-accent-content` | oklch(0.2 0.07 340) | plum |
| `--theme-color-neutral` | oklch(0.2 0.06 335) | plum-black: the night band, the footer, the duotone's dark ink |
| `--theme-color-neutral-content` | oklch(0.95 0.035 350) | blush |
| `--theme-color-surface` | oklch(0.95 0.035 350) | blush paper, for the long pages (info, timetable, an act's text) |
| `--theme-color-surface-alt` | oklch(0.9 0.06 350) | deeper blush, for the timetable's cells and the FAQ |
| `--theme-color-text` | oklch(0.24 0.08 340) | plum ink |
| `--theme-color-border` | oklch(0.24 0.08 340) | the ink itself: outlines are drawn, not hinted |
| `--theme-radius` | 1.5rem | chunky cards and stickers. The stubs' notches are their own (a CSS mask). |

Other settings: pill buttons and fields (`--theme-radius-field: 9999px`), no relief (`--theme-depth: 0`), bold borders like a printed outline (`--theme-border: 2px`), normal density (`--theme-size: 0.25rem`).

**Contrast.** Text is always plum on pink, tangerine, apricot or blush, or blush on plum. All of these pass WCAG AA, worked out roughly here: about 5.7:1 for plum on pink, the lowest, and about 14:1 for plum on blush. They are checked with a contrast tool while building. Pink and tangerine never carry text on each other (about 1.3:1); they meet only in the dots and the tape. White text is not used on pink (about 2.5:1).

These stay clear of the wave's palettes. They are not Corner's cobalt and butter yellow, nor Folio's vermilion, which is redder and darker than this tangerine. Nor are they the studio's chartreuse or the restaurant's oxblood and amber. A night version is the theme with surface and neutral swapped, in the Theme tab.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves, everything is in its final place, and every photo, sticker and card is where the stylesheet puts it. Each effect is turned on by an attribute, so a new section can have it too.

- **The name stretches** (`data-stretch`), the signature, with Splitting and Motion:
  - on load, its letters grow from width 50 to their set width one after another;
  - on a desktop, the letters nearest the cursor widen to about 130 while the others narrow, so the word keeps its length, as if pushed by the sound;
  - on a phone, the name narrows to width 60 as the hero scrolls away (Motion's `scroll`);
  - with no script, under reduced motion and in edit mode, it is plain text at width 100.
- **The halftone field** (`<canvas data-shader="halftone" aria-hidden="true">`, OGL), `scripts/halftone.js`:
  - a grid of pink dots on the tangerine hero, their size following a slow noise and swelling around the cursor (around the scroll position on a phone);
  - it reads the two colors from the theme's computed `--color-primary` and `--color-secondary` at start;
  - it runs at 30 frames a second at most, at a pixel ratio of 1.5 at most, and stops when off screen;
  - under the canvas, the section itself carries a CSS halftone: a `radial-gradient` dot pattern in the primary color, its dots masked larger toward one corner;
  - with no script, no WebGL, under reduced motion and in edit mode, that printed halftone is what shows, and the empty canvas is transparent.
- **The dates part** (`data-part`), in CSS: the three day numbers "09 10 11" move apart sideways as the hero scrolls (`animation-timeline: view()`, a `from` keyframe only). Browsers without scroll timelines show them still. Their place in the stylesheet is the final one.
- **Stickers** (`data-sticker`): round and pill-shaped apricot badges with a plum outline, each tilted by its classes (`-rotate-6`, `rotate-3`). Motion slaps them on as they come into view, from a scale of 1.3 and an extra 12° to their place. With no script, under reduced motion and in edit mode, they are simply in place.
- **The tape** (`data-tape`):
  - two bands cross over the edge between the hero and the next section, one pink at −3°, one plum at 2°, running in opposite directions (CSS keyframes);
  - `scripts/tape.js` copies the items once so the loop is seamless, with the copies `aria-hidden`; the maker edits one list;
  - with no script, under reduced motion and in edit mode, they are two still, tilted bands. On a phone they tilt half as much, and the section clips them, so nothing is wider than the screen.
- **The day stack** (`data-stack`):
  - `scripts/stack.js` sets `data-stacking` on the list, which turns on `position: sticky` with a growing top offset: each day card slides over the one before like a flyer pasted on a wall;
  - a card that is covered shrinks to a scale of 0.94 (CSS, `animation-timeline: view()`);
  - with no script, under reduced motion and in edit mode, the cards are a plain column, each slightly askew, all readable and clickable.
- **The bill** (`data-bill`): `scripts/bill.js` sets `data-live` on the lineup, and only then does a hovered or focused name widen from width 70 to 110 (a CSS transition). Edit mode shows the names at rest.
- **Stubs tilt** (`data-tilt`): a hovered pass leans toward the cursor in 3D, at most 8° (Motion). With no script, under reduced motion and in edit mode, the stubs sit flat, alternately at −1.5° and 1°.
- **Rises** (`data-rise`), in CSS as in the site-scripts skill: headings rise and widen from width 50 as they come into view.
- **The countdown** (`data-countdown="2027-07-09T14:00:00+02:00"`): `scripts/countdown.js` writes "238 days to go" from its attributes, in the site's language: `data-days` ("{n} days to go"), `data-on` ("It's on. Gates open at 2 pm"), `data-over` ("See you next July"). Its written text, the dates, is what shows with no script and while editing.
- **The lineup filter** (`data-filter`): buttons by day. With no script every act shows; the script hides the others.
- **Page transitions,** in CSS only: `@view-transition { navigation: auto }`, the new page wiping in behind a diagonal edge (`clip-path`), under no-preference. Browsers without them simply change page.
- **Smooth scrolling:** Lenis, light.

Libraries: Motion, Lenis, Splitting (MIT) and OGL (Unlicense), pinned on jsDelivr as the site-scripts skill lists them.

## Pages

**Home** (`/`):
- **the header** (adapted from `header-floating`): a plum pill with the name small and the dates ("09—11.07.27"), Lineup, Timetable, Tickets and Info, and a pink "Get passes" button;
- **the poster (its own),** on tangerine with the halftone field: HOT STATIC across the width (two lines on a phone), "09 10 11 JULY 2027" at the same scale, "Marseille · La Raffinerie, north docks", three stickers ("41 acts · 4 stages", "Weekend from €129", the countdown), and Get passes and See the lineup;
- **the tape (its own, a section list):** "MUSIC ✺ LIGHT ✺ LATE SWIMS ✺ 3 DAYS ✺ 4 STAGES ✺ NORTH DOCKS";
- **the bill (its own):** three columns, FRI 09, SAT 10 and SUN 11, read from `acts` by day, the headliner very large, then the main acts, then the support, separated by ✺ and each a link to its page; then the day's "and also" names from `days`, and "Full lineup and timetable →";
- **the days (its own):** three stacked flyers, one per day, alternating pink, tangerine and plum. Each gives the day at poster size, the date, gates and curfew, a line ("Long night in the machine hall"), a duotone photo and "Friday's timetable →";
- **the passes (its own,** its structure from `pricing-three-tiers`**):** four stubs, each with name, price, what is included, a status stamp (on sale, few left, sold out) and a button, then "Prices include fees. Under 26? Half price on Sunday.";
- **getting there** (adapted from `contact-find-us`), on plum: the address at large size with no map placeholder, four short cards (metro, tram, bike, night bus), one line on step-free access, and "Plan your visit →";
- **partners** (adapted from `logos-muted-row`): names as wordmarks set in Anybody, since makers rarely have logo files;
- **the ticket alert** (adapted from `newsletter-interests`): "Be first when Sunday tickets drop", an email and the days the visitor cares about;
- **the footer (its own):** the name across the width at width 150, the countdown, navigation, socials, the press email and the access team's contact.

**Lineup** (`/lineup`):
- the title, with the day filter;
- the bill again, in full;
- **the acts** (adapted from `events-cover-cards`): every act as a card with its duotone photo, name, day and time, stage, genre and origin code ("LAGOS NG").

**An act** (`/lineup/<act>`), a page per record: the name at poster size, stretching; labelled lines (Day, Time, Stage, From, Genre); the duotone photo, tilted, with a sticker of the day; about 90 words of bio and a "Listen" link; "Also on Friday", three other acts of the same day; "Get a Friday pass".

**Timetable** (`/timetable`), adapted from `events-agenda-table`:
- tabs for Friday, Saturday and Sunday, as daisyUI radio tabs, which need no script;
- each day shows its gates and curfew, then one column per stage, each set placed on a grid of quarter hours from its start and end (worked out in Liquid);
- on a phone, a list per stage in time order.

**Tickets** (`/tickets`): the stubs; what each pass includes; access tickets (a free companion, and how to ask); the questions of the Tickets topic (adapted from `faq-by-topic`); the ticket alert.

**Info** (`/info`):
- **the stages** (adapted from `services-image-list`): The Tank, the Machine Hall, the Barge and the Roof. Each has its duotone photo, what plays there, its capacity and its access notes;
- **getting there** (adapted from `contact-find-us`): by metro, tram, bike, train from further away, and car (no parking; a park and ride);
- **access** (adapted from `features-checklist`): step-free routes, a viewing platform at The Tank, a quiet room, ear defenders on loan, French Sign Language at the headline sets, a free companion ticket;
- **questions by topic** (adapted from `faq-by-topic`): Tickets, On site, Getting there, Access;
- **partners;**
- **contact:** press, access team, the general address.

**Datasources:**
- `navigation`;
- `acts`: 12, four a day: name, day (Friday, Saturday, Sunday), stage, start, end, billing (headliner, main, support), genre, origin, summary, image, listen link, and the bio as the body;
- `days`: 3, each with title, date, gates, curfew, line, image, and `more`, the "and also" names;
- `passes`: 4 (Day €59, Weekend €129, Weekend + late swims €159, Companion free), each with name, price, note, includes, status and link;
- `stages`: 4, each with name, kind, what plays, capacity, access and image;
- `travel`: 5, each with mode and text;
- `access`: 6, each with title and text;
- `faq`: 6, each with question, topic and the answer as the body;
- `partners`: 6, each with name, tier (presenting, partner, media) and link;
- `home-tape`;
- `alerts`: collected, with email and days.

## Its own blocks

The Blocks tab offers these first for a site started from Marquee:

- `hero-marquee-poster`: the name, dates and place at poster size, with the halftone field, the stickers and the countdown;
- `banner-marquee-tape`: the two crossing tilted bands, a data block over a section list;
- `events-marquee-bill`: the lineup as a bill by day, a data block over `acts`;
- `events-marquee-days`: the stacked day flyers, a data block over `days`;
- `pricing-marquee-stubs`: the passes as ticket stubs with their stamps;
- `footer-marquee-countdown`: the footer with the full-width name and the countdown.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. Every one is shown as a duotone, a CSS class over the theme's colors that the design notes name, so it is chosen for strong light and shape rather than for its colors:

- **acts (12):** instruments and gear close up (a synthesizer's knobs, turntables, a saxophone, a drum kit, a guitar amplifier, a microphone), stage lights and haze, and silhouettes seen from behind;
- **days (3):** a crowd from afar at dusk, confetti in stage light, swimmers in a harbor at sunset;
- **stages (4):** an industrial hall, a silo or warehouse yard, a barge on a harbor basin, a rooftop at dusk;
- **info (2):** the docks of Marseille, and a concrete quay with water.

That makes about 21 images, at night or dusk, high in contrast, a little grainy, with no recognizable face. A maker's photos of their own artists take the same treatment.
