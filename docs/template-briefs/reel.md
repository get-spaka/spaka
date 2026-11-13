# Reel: brief

The fourth of wave 1's four original designs: the creative studio (`portfolio`, one of the original, animated designs).

## Concept

**Concept.** A loud, confident studio site where the work moves sideways. Heavy extended capitals on a black ground, slabs of chartreuse that tilt and overlap, and a home page whose case studies run past as a reel when you scroll down. Each case opens onto a page in its own color, and everything ends on one question, "Got a brief?", with a form that asks for one.

**The fictional business** its texts are written for is **Halfvolt**, a brand, motion and film studio of fourteen people in a former harbor warehouse on Keileweg, Rotterdam. Founded in 2014, it makes identities that move (logo, type, color and the motion rules that bring them to life), campaign films and idents, and websites for brands that want to be noticed. Its clients are a ferry line, a cinema, a skate hall, a bike maker, a night market and a wine importer.

The same structure suits a branding or design agency, a motion or animation studio, a film production company, an architecture collective, or a freelancer who wants to look bigger. The agent rewrites the cases, the services and the lists.

Beside Folio, the wave's other portfolio, it is a team rather than one person, loud rather than quiet, black with acid slabs rather than off-white with one vermilion, a sideways reel of colored panels rather than a numbered vertical index, and extended black capitals rather than a light grotesk with a serif italic.

## Trends it draws on

These come from 20 creative studio and agency sites opened in November 2026: Awwwards' Design Agencies nominees, Sites of the Day and Honorable Mentions of 2025-2026, and the studios behind its horizontal-scroll elements. WebFetch reads their text, not their styles, so colors come from each site's Awwwards entry. Each trend was seen on at least two sites.

1. **The work moves sideways:** case studies as a horizontal row, scroll-driven or dragged, rather than a grid (poison.studio, square43.com, garcy.studio, stercq.nl; horizontal-scroll elements of redmango.agency and madeinuxstudio.com).
2. **A black ground and one loud color:** lime #BADA55 on black (poison.studio), orange #FF4D00 on black (basement.studio), pink on black (unseen.co), bone on black (auge-xp.com), pure yellow (square43.com).
3. **Loud first-person statements in capitals:** "Most websites are forgettable. That is a choice." (dopaminestudio.io), "be unmistakable" (garcy.studio), "brands that refuse to be ordinary" (square43.com); also madetodisrupt.com, flabbergast.agency, wearebouldergroup.com.
4. **Numbered services and menus:** services 01-04 (flabbergast.agency, burgundy.studio, darencurtis.sk, madeinuxstudio.com, emblematica.agency); numbered menus (burgundy.studio, wearebouldergroup.com, clou.ch).
5. **Proof as figures and a ledger:** "70+ awards" (rejouice.com), "350+ migrations, 2× Agency of the Year" (flatlineagency.com), "100+ products, 30 people" (flabbergast.agency), a stats row (dopaminestudio.io), an awards row or count (wearebouldergroup.com, poison.studio).
6. **Clients as names, not logos:** a text list (basement.studio), "name drops" (wearebouldergroup.com), client-name strips (flatlineagency.com).
7. **A real brief, not a contact form:** a brief with budget and deadline ranges (poison.studio/contact); "Start a project", "Start a session" or "Send a brief" in the header (dopaminestudio.io, madetodisrupt.com, burgundy.studio). Around it, a cursor that changes over the work (poison.studio, redmango.agency, lusion.co) and a touch of WebGL (dopaminestudio.io, lusion.co, phantom.land).

**What makes it its own:**
- the reel's panels each take their case's color (chartreuse, acid yellow, bone or graphite), so the row reads like a strip of swatches, with big case numbers in the condensed width of the family whose expanded width sets the headlines;
- chartreuse slabs, tilted a few degrees, overlap the black headline and settle as they arrive;
- the "acid smoke" behind the hero: a slow WebGL ink drawn in the theme's own colors;
- a sideways wipe between pages.

**What it leaves out:**
- a clock, local time and "available" dots (Folio has them, as do half the studio sites);
- loaders, entry gates, sound and 3D objects;
- logo marquees and endless loops (Corner and Folio both loop): here the reel moves only when the visitor scrolls.

## Type

Both fonts are files of the template, under the SIL Open Font License. Archivo is one variable family whose width axis (62 to 125) gives three voices: expanded for shouting, normal for reading, condensed for numbers. No italic serif.

| Role | Font | Setting |
|---|---|---|
| Headlines and the wordmark | Archivo, width 125 | 800 to 900, uppercase, `leading-[0.82]`, `tracking-[-0.02em]`; the hero at `clamp(3.25rem, 12.5vw, 12rem)`, short words so each line fits a 390 px phone |
| Body | Archivo, width 100 | 400 and 500, 1.0625 rem, `leading-relaxed` |
| Big numbers | Archivo, width 75 | 700: the reel's case numbers, the figures, the years of the awards ledger |
| Labels and metadata | Fragment Mono | 400, 0.75 rem, uppercase, `tracking-[0.06em]`: disciplines, years, credits, the form's group numbers, the "Now booking" chip |

The widths are two classes of `styles/site.css`, `.wide` and `.narrow` (`font-stretch`).

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.14 0.004 120) | near-black: the ground of every page |
| `--theme-color-surface-alt` | oklch(0.2 0.006 120) | graphite: fields, the jobs rows, a graphite case panel |
| `--theme-color-text` | oklch(0.95 0.012 105) | bone white |
| `--theme-color-border` | oklch(0.32 0.008 120) | hairlines and field outlines |
| `--theme-color-primary` | oklch(0.92 0.22 123) | chartreuse: slabs, buttons, the cursor disc, the service fill, the footer band, a case panel |
| `--theme-color-primary-content` | oklch(0.16 0.01 120) | black on chartreuse |
| `--theme-color-secondary` | oklch(0.95 0.012 105) | bone: the quote slab, a case panel |
| `--theme-color-secondary-content` | oklch(0.16 0.01 120) | black on bone |
| `--theme-color-accent` | oklch(0.9 0.17 98) | acid yellow: a case panel, the "Now booking" chip, the hiring tag |
| `--theme-color-accent-content` | oklch(0.16 0.01 120) | black on acid yellow |
| `--theme-color-neutral` | oklch(0.1 0.003 120) | the deepest black: the header bar |
| `--theme-color-neutral-content` | oklch(0.95 0.012 105) | bone on it |
| `--theme-radius` | 0.375rem | slabs and panels barely softened |

Other settings:
- buttons and fields are pills (`--theme-radius-field: 9999px`);
- relief is off (`--theme-depth: 0`);
- density is normal (`--theme-size: 0.25rem`);
- borders are bold (`--theme-border: 2px`).

Contrast stays at WCAG AA or better: bone on black, and black on chartreuse, acid yellow or bone, are all above 14:1; chartreuse on black about 15:1; muted text (`text-base-content/65`) on black above 7:1. Chartreuse text is never set on bone or acid yellow.

## Motion

Every module respects `prefers-reduced-motion`, and every effect is turned on by an attribute, so a new section can get it. In edit mode no script runs: every slab sits at its final tilt and the reel is the plain row described below.

- **The reel** (`data-reel` on the section, `data-reel-track` on the row; `scripts/reel.js`, Motion's `scroll`):
  - from 1024 px wide, the script gives the section the height of the row's overflow, its inner box sticks to the top, and the row slides left as the page scrolls down; a chartreuse line fills with progress, and each panel leans (`skewX`, 3° at most) with the speed of the scroll;
  - with no script, under reduced motion and in edit mode, it is the same row scrolled sideways with the trackpad or its scrollbar (`overflow-x: auto`, `scroll-snap-type: x mandatory`): every panel reachable and editable;
  - on a phone, the panels stack vertically, full width, and nothing is pinned;
  - the case page reuses it for its images.
- **Kinetic headline** (`data-kinetic` on a heading, one `<span data-drift="left|right">` per line; Splitting by chars, then Motion): the letters rise from below their line's mask on load, line after line; on scroll, odd lines slide left and even lines right, 6vw at most. With no script, under reduced motion and in edit mode, the lines stand still.
- **Tilted slabs** (`data-tilt`, the tilt as a class such as `-rotate-3`): each drops in from 12° further and settles at its tilt as it comes into view (Motion's `inView`). With no script it simply sits at its tilt; below 768 px, the classes lower the tilt to 1.5° and remove the overlap.
- **The cursor** (`data-cursor="View"`, `"Drag"` or `"Next"`; `scripts/cursor.js`): on fine pointers, a 96 px chartreuse disc reading the attribute's word over the reel's panels, the work tiles and the next-case band. With no script, on touch screens and under reduced motion, the normal cursor.
- **Acid smoke** (`<canvas data-shader aria-hidden="true">` behind the hero; `scripts/smoke.js`, OGL):
  - a slow noise field of chartreuse ink on black, leaning toward the pointer, its colors read from the computed `--color-primary` and `--color-base-100`, so the Theme tab recolors it;
  - the section always carries a CSS radial gradient made with `color-mix()` of the same variables: all there is with no script, without WebGL and in edit mode;
  - under reduced motion, one still frame; the loop stops when the hero leaves the screen, and in `stop()`.
- **Cover zoom** (`data-zoom`): a case's cover goes from scale 1.12 to 1 as you scroll past (Motion's `scroll`); otherwise it stays at 1.
- **Hover fills,** in CSS: a service row fills with chartreuse from the left, a client name flips to a chartreuse block, a team card straightens and comes to the front. Inside `@media (prefers-reduced-motion: no-preference)`; under reduced motion the color changes without sliding.
- **The sideways wipe,** in CSS: `@view-transition { navigation: auto }`, the new page coming in from the right (`clip-path`) as the old one slides 10% left. Browsers without view transitions, and reduced motion, simply change page.
- **Filter on Work:** `scripts/filter.js` hides the tiles whose disciplines do not match the chosen button; with no script every case shows.
- **Smooth scrolling:** Lenis, so the pinned reel glides.

Libraries: Motion, Lenis and Splitting (MIT) pinned on jsDelivr as in the site-scripts skill; OGL (Unlicense) imported in `smoke.js`.

## Pages

**Home** (`/`):
- **the header,** adapted from `apps/desktop/gallery/header/header-dark`: the wordmark HALFVOLT in expanded black, numbered links from `navigation` (01 Work, 02 Studio, 03 Contact), an acid "Now booking spring 2027" chip and a chartreuse "Start a project" pill; the links fold into a dropdown on a phone;
- **the hero (its own):** the kinetic headline "WE MAKE / BRANDS / MOVE.", a chartreuse slab tilted −3° overlapping its last line on desktop with two sentences and two buttons (See the work, Start a project), a tilted still from a case at the top right, the acid smoke behind;
- **the statement (its own):** about forty words at heading size, its slab rising into place ("We build identities that behave like characters…");
- **the reel (its own):** "Selected work" and "2023—2026" in mono; the `featured` cases as panels, each in its tone with number, client, one-line title, disciplines, year and cover; a last chartreuse panel, "All work →";
- **the services (its own,** adapted from `apps/desktop/gallery/services/services-image-list`): four huge numbered rows (Brand identity, Motion systems, Campaign films, Digital), each a `<details>` opening on its summary and deliverables;
- **the clients (its own,** adapted from `apps/desktop/gallery/logos/logos-muted-row`): a wall of names in expanded capitals, separated by slashes;
- **the quote,** adapted from `apps/desktop/gallery/testimonials/testimonials-headline-quote`: one large quote on a bone slab tilted +2°, in Archivo rather than the block's serif, two smaller quotes beneath;
- **the figures,** adapted from `apps/desktop/gallery/stats/stats-divided-row`: 12 years, 140+ brands, 31 awards, 14 people, in condensed numbers;
- **the footer (its own):** a full chartreuse band with "GOT A BRIEF?" at poster size, the email large and "Start a project →"; below, the address, `navigation`, Instagram, Vimeo and LinkedIn.

**Work** (`/work`), adapted from `apps/desktop/gallery/gallery/gallery-by-category`: the kinetic title "WORK (06)", filter buttons (All, Brand, Motion, Film, Digital), and every case as a tile of its tone with its cover, in two columns with the right one offset down, under `data-cursor="View"`.

**A case** (`/work/<case>`, `pages/work/[cases].liquid`):
- the opening panel in the case's tone: the client in expanded capitals, the title as a sentence, labelled lines in mono (Client, Year, Disciplines, Sector) and "← All work";
- the cover, full bleed, under `data-zoom`;
- the summary large, then the body (the brief, the idea, what happened) in two columns;
- up to three results in condensed figures ("+41% / riders in year one");
- its four images in a reel (`data-reel`), then the credits in mono;
- "Next case": a full-width band in the next case's tone with its client in expanded capitals, under `data-cursor="Next"`.

**Studio** (`/studio`):
- the kinetic title "A STUDIO / OF FOURTEEN" beside a photo of the studio;
- the statement, then three principles, adapted from `apps/desktop/gallery/features/features-numbered`;
- the services rows;
- **the team (its own,** adapted from `apps/desktop/gallery/team/team-portrait-grid`): on desktop, six cards tilted alternately ±4° and overlapping like a pile, each straightening on hover; on a phone, a straight two-column grid; each a photo or initials on its tone, name, role and "Currently obsessed with…";
- the figures;
- **the awards ledger,** adapted from `apps/desktop/gallery/events/events-agenda-table`: year, award, category, project, hairline-ruled, the category hidden on a phone. The awards are invented ("Northsea Design Awards", "Moving Type Festival"), never real shows beside fictional projects;
- the clients;
- **the jobs,** adapted from `apps/desktop/gallery/faq/faq-accordion`: each role a `<details>` row with its type, place and an acid "Hiring" tag, opening on its text and "Apply: jobs@halfvolt.studio".

**Contact** (`/contact`):
- the kinetic title "GOT A / BRIEF?";
- **the brief form,** adapted from `apps/desktop/gallery/forms/forms-contact-beside-address`, as three numbered groups on one page (no steps, so it works with no script): 01 You (name, email, company); 02 The project (what you need as pill checkboxes: Brand identity, Motion system, Campaign film, Website, Not sure yet; the message); 03 Budget and timing (pill radios: Under €20k, €20-50k, €50-100k, €100k+; ASAP, This quarter, Next quarter, Just exploring);
- beside it: the address, email, phone, the new-business lead's name and "We reply within two working days";
- the answer fragment `brief-thanks` thanks the sender by name on a chartreuse slab.

**Datasources:**
- `navigation`;
- `cases`: client, title, year, disciplines (list), sector, tone (choice: lime, yellow, bone, graphite), summary, cover, image_1 to image_4, results (list), credits (list), featured, body; six records (Maasveer water taxis, Kino Zuid, Hal 4 skate hall, Spaak Cycles, Kade Nights night market, Ploeg natural wines);
- `services`: name, summary, deliverables (list); four records;
- `clients`: name; six records;
- `testimonials`: quote, name, role, company; three records;
- `figures`, a section list renamed after its page (`home-figures`, `studio-figures`): figure, label; four records;
- `team`: name, role, photo, tone, obsession; six records;
- `awards`: year, award, category, project; six records;
- `jobs`: title, type, location, summary, body; three records;
- `briefs` (collected, `answer: brief-thanks`): name, email, company, needs (list), message, budget (choice), timing (choice).

## Its own blocks

The Blocks tab offers these first for a site started from Reel:

- `hero-reel-kinetic`: the kinetic headline with the tilted slab, its buttons and the acid smoke;
- `gallery-reel-horizontal`: the pinned reel of case panels, a data block over `cases`, with `detail.liquid` for the case page;
- `about-reel-statement`: the statement at heading size on its slab;
- `services-reel-rows`: the huge numbered service rows that fill on hover;
- `logos-reel-type-wall`: the clients as a wall of names;
- `team-reel-pile`: the tilted pile of team cards;
- `footer-reel-brief`: the chartreuse "Got a brief?" footer.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited, about 31 in all. For the six cases, a cover and four images each, standing for the studio's work in the world:
- Maasveer: a water taxi or ferry, the river at night, harbor cranes, a quay sign;
- Kino Zuid: cinema seats, a projector, a lit marquee;
- Hal 4: a concrete skatepark, ramps, a board seen from above;
- Spaak Cycles: bicycle details, light trails, a workshop bench;
- Kade Nights: a night market from afar, string lights, food stalls;
- Ploeg: wine bottles on a shelf, a vineyard, a cellar.

One more for the studio: a warehouse interior or desks with screens, no faces.

They read as one set through night and hard light: high contrast, saturated, deep blacks, greens and yellows that sit beside the chartreuse, motion blur welcome, no pale daylight shots. The team cards use initials on their tone unless photos of people at work, from behind or at a distance, are found; no recognizable faces elsewhere.
