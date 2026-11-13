# Folio: brief

The second of wave 1's four standard templates: the portfolio (`portfolio`, not one of the original designs).

## Concept

**Concept.** The work first, the person close behind. A quiet, editorial portfolio whose home page is a numbered index of projects rather than a grid of cards. Hovering a row brings up its picture beside the cursor. Each project opens onto a page of large images with its credits. Small signs say that someone is there: the local time, whether they are at work, and when they can take on a project.

**The fictional person** its texts are written for is **Noor Haddad**, an architecture and interiors photographer based in Lisbon. She shoots houses, public buildings, hotels and restaurants, and still lifes of objects for designers. She has worked since 2014 and is represented for commercial work.

The same structure suits an illustrator, a designer, an architect, a ceramicist or a small studio. The agent rewrites the projects, the categories and the lists.

## Trends it draws on

These come from 20 recent portfolio sites (Awwwards, Siteinspire, One Page Love and Minimal Gallery, 2025-2026). Each was seen on at least two of them.

1. **A numbered index of projects.** Each row gives a number, a title, a type and a year, with the image appearing on hover (fredericlord.com, aliciadubuis.com, samthies.com, officebenganz.com, kalokyeung.com).
2. **Editorial type.** A neutral grotesk with a book serif in italic, and a mono for every piece of metadata (aliciadubuis.com, terakawaoffice.com, etablissements.studio, benmedansky.com for the pairing; samthies.com, petrillo.studio, kalokyeung.com for the mono).
3. **The name at poster size** against small body text (tomdekoning.work, terakawaoffice.com, felixpeault.com, petrillo.studio).
4. **Near-monochrome with one accent:** the work brings the color (scullion.ie, tomdekoning.work, terakawaoffice.com, samthies.com).
5. **Quiet movement:**
   - page transitions where the project's image grows into its page (taylorhare.com, scullion.ie, terakawaoffice.com, emitakahashi.ca);
   - smooth scrolling (samthies.com, gilhuybrecht.com, tomdekoning.work);
   - images uncovered as they come into view.
6. **An endless strip of images** (mersi-architecture.com, aliciadubuis.com, scullion.ie, benmedansky.com).
7. **Signs that a person is there:** the local time, an "at work / away" dot, and an availability line (fredericlord.com, tomdekoning.work, taylorhare.com, davidfiz.com, petrillo.studio).

**What makes it its own:**
- the index rows give a project's place and year in mono, and the hover preview tilts slightly in the direction the cursor moves;
- an accent-colored hairline marks the row in view on a phone;
- the name splits across the screen's two edges.

**What it leaves out:**
- loaders;
- WebGL;
- cursor trails;
- logo walls (clients are a plain list).

## Type

All three fonts are files of the template, under the SIL Open Font License, like Corner's.

| Role | Font | Setting |
|---|---|---|
| Headings and the name | Inter Tight | 300 to 500, never bold; the name at `clamp(4rem, 15vw, 14rem)`, `tracking-tighter`, `leading-[0.85]` |
| Body | Inter Tight | 400, 1.0625 rem |
| Accent | Newsreader italic | the `<em>` of a heading or a statement ("Buildings, rooms *and the light in them.*") |
| Metadata | Geist Mono | numbers, years, places, credits, captions, the clock; small, uppercase |

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.975 0.004 90) | off-white |
| `--theme-color-surface-alt` | oklch(0.94 0.005 90) | a light grey, for the info page's lists |
| `--theme-color-text` | oklch(0.19 0.005 90) | near-black |
| `--theme-color-primary` | oklch(0.63 0.2 35) | vermilion: the dot, the row in view, links on hover, the button |
| `--theme-color-neutral` | oklch(0.17 0.005 90) | near-black: the footer and the contact band |
| `--theme-color-border` | the text at low opacity | hairlines between rows |
| `--theme-radius` | 0 | square corners throughout |

Other settings:
- the fields are square (`--theme-radius-field: 0rem`);
- relief is off (`--theme-depth: 0`);
- density is spacious (`--theme-size: 0.28125rem`).

A dark version is just the theme flipped, in the Theme tab.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves, and every image and row is in its place.

- **The name:** its letters rise one after another when the page loads (Splitting, then Motion). With no script it is plain text.
- **The index hover preview:**
  - on a desktop, `scripts/preview.js` copies the hovered row's own image into a floating figure that follows the cursor, tilting a little with its movement;
  - on a phone, each row shows its thumbnail in place, and the row in view gets the accent hairline;
  - with no script, every row shows its thumbnail as a small image at its end.
- **Images uncovered:** each large image of a project page is uncovered from the bottom as it comes into view (Motion, `clip-path`), under `data-uncover`.
- **Page transitions:** in CSS only (`@view-transition { navigation: auto }`). The project's image is named after the project on the index (`view-transition-name`), so it grows into place on the project page. Browsers without them simply change page.
- **The strip:** a row of selected images on the home page loops slowly sideways, copied once by `scripts/strip.js` as Corner's ribbon is. With no script it is a row you scroll.
- **The clock:**
  - `scripts/clock.js` writes the time in the city named by `data-tz` ("Europe/Lisbon"), and turns the dot to the accent color within `data-hours` ("09:00-18:00", Monday to Friday);
  - with no script, it shows only the city's name.
- **Smooth scrolling:** Lenis.

Libraries: Motion, Lenis and Splitting, pinned on jsDelivr and under MIT.

## Pages

**Home** (`/`):
- **the header:**
  - the name, small;
  - Work, Info and Contact;
  - on the right, "Lisbon · 14:32" with the dot;
- **the name at poster size (its own),** split across the width, with one statement under it and the availability line ("Booking commissions from March 2027");
- **the strip (its own):** about eight selected images;
- **the index (its own):** six selected projects, each row with number, title, category, place and year, the hover preview, then "All work →";
- **a short about:** two sentences and "More about Noor";
- **clients:** a plain list of names in two or three columns, adapted from the gallery's `logos` lists;
- **the contact band (its own):** "Have a project in mind?", the email at large size, Instagram and the reply time;
- the footer.

**Work** (`/work`):
- the full index, with filter buttons by category (Residential, Public, Hospitality, Objects);
- with no script all projects show; the script hides those that do not match.

**A project** (`/work/<project>`), a page per record:
- the title, then a block of labelled lines (Client, Year, Location, Architect, Role);
- a paragraph of about 80 words;
- the cover and four images in one column, each uncovered as it comes into view;
- "Next project", with that project's image and title.

**Info** (`/info`):
- **the opening:** a portrait, optional (initials on the accent otherwise), beside one paragraph of bio;
- **labelled lists:** Services, Selected clients, Recognition (dated), Represented by;
- **a commission enquiry form:** name, email, type of project, timing, budget (optional) and message, with "I reply within two working days".

**Datasources:**
- `navigation`;
- `projects`: title, client, category, location, year, architect, role, summary, cover and four images, with `featured` for the home page's index;
- `strip`: images;
- `clients`;
- `recognition`: year, title, publication or prize;
- `enquiries`: collected.

## Its own blocks

The Blocks tab offers these first for a site started from Folio:

- `hero-folio-name`: the name at poster size with the statement and the availability line;
- `gallery-folio-index`: the numbered index with the hover preview, a data block over a collection;
- `gallery-folio-strip`: the endless strip of images;
- `cta-folio-contact`: the contact band with the large email, the clock and the reply time;
- `about-folio-lists`: the labelled lists of an info page.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited:
- architecture and interiors (modern houses, a library, a concrete stair, a hotel lobby, a restaurant interior);
- still lifes of objects (ceramics, a chair, a lamp).

About 26 images: six projects with a cover and four images each, plus the strip, which reuses some of them. They are chosen for light and composition, so they read as one photographer's work: similar color, no people in view.
