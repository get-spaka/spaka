# Corner: brief

The first of wave 1's four standard templates: the local business (`business`, not one of the original designs).

## Concept

**Concept.** A neighborhood shop's site that reads like its shopfront: poster-sized type on warm paper, one strong color, the day's hours always in sight, and a ribbon of what is on the counter today.

**The fictional business** its texts are written for is **Marlow Street Bakery**, a sourdough bakery and café at 214 Marlow Street. It opens at 7 every morning but Monday and sells bread, pastries, coffee and cakes made to order. It was founded in 2019 by two bakers.

The same structure suits a café, a florist, a barber or a corner shop. The agent rewrites the texts and swaps the photos.

## Trends it draws on

These were seen on 17 recent sites (Awwwards, Siteinspire, One Page Love, 2025-2026). Each was seen on at least two of them.

1. **Display type at poster scale.** One heavy face at 8 to 10 rem, one word per line, as the main graphic element (impastofornoantico.com, crispmtl.com, madie.es, doubledimanche.fr, casagay.com).
2. **One accent word per heading.** One word set in an italic serif inside a sans heading, with a mono face for labels and prices (madie.es, lepetitbleucafe.com, tabkitchenbakery.com, florawellnesscafe.com).
3. **Warm paper and one saturated color.** Whole sections are flipped to that color or to a dark ink (lepetitbleucafe.com, unionboulangerie.com, madie.es, crispmtl.com).
4. **A ribbon of products, slightly tilted.** The items are separated by asterisks (impastofornoantico.com, bar-topas.ch, madie.es, thunder-buns.com).
5. **Photos cropped by a frame (an arch) rather than cut out,** with sections rising into view and one photo that stays in place while its text scrolls (lepetitbleucafe.com, doubledimanche.fr, tabkitchenbakery.com).
6. **A live "Open now, until 7 pm" line read from the hours,** and hours shown as hairline-ruled rows (bar-topas.ch, lepetitbleucafe.com, delice.ca, the Monte café).

**What makes it its own:**

- the arch-framed photo set against the poster headline;
- a round stamp ("Baked daily since 2019") turning slowly;
- the hours board, which is the page's practical heart, rather than footer small print.

**What it leaves out:**

- preloaders;
- 3D;
- content hidden until a script runs;
- cut-out product photos (owners rarely have them).

## Type

All four fonts are Google Fonts under the SIL Open Font License, loaded by the `@import` on the first line of `theme.css`.

| Role | Font | Setting |
|---|---|---|
| Headings | Bricolage Grotesque | 800, condensed width, `leading-[0.85]`, `tracking-tight`, uppercase for the hero, 3 to 10 rem with `clamp()` |
| Body | DM Sans | 400 and 500, 1.0625 rem |
| Accent | Instrument Serif italic | the `<em>` inside a heading ("Bread, baked *slowly*.") |
| Labels and prices | DM Mono | small uppercase labels above headings, prices, the hours |

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.965 0.018 85) | warm paper |
| `--theme-color-surface-alt` | oklch(0.93 0.025 80) | a darker paper, for the menu cards |
| `--theme-color-text` | oklch(0.22 0.02 40) | ink |
| `--theme-color-primary` | oklch(0.47 0.17 262) | cobalt: the flipped sections, the buttons, the stamp |
| `--theme-color-accent` | oklch(0.86 0.14 90) | butter yellow: the "Open now" pill and the ribbon on the cobalt section |
| `--theme-color-neutral` | oklch(0.24 0.03 255) | blue-black: the footer |
| `--theme-color-border` | ink at low opacity | hairlines |
| `--theme-radius` | 1rem | the arch frame has its own fixed full top radius |

The Theme tab still restyles all of it, since every color comes from the theme.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves and every element is in its final place.

- **The ribbon:**
  - in CSS, a tilted strip (`-rotate-2`) scrolling sideways;
  - a module `scripts/ribbon.js` copies the items once at start so the loop is seamless; the maker edits one list;
  - without the script it is a static strip.
- **Reveals:** Motion's `inView` lets each section's main elements rise (`y: [24, 0]`, opacity) as they come into view, under `data-reveal`, as in the site-scripts skill.
- **The hero arch:** the photo inside the arch scales from 1.08 to 1 as the page scrolls (Motion's `scroll`). The story section's photo stays in place (`position: sticky`) while its text scrolls; that is plain CSS.
- **The stamp:** an SVG text on a circle, turning once every 20 s (CSS).
- **Open now:**
  - `scripts/open-now.js` reads the hours rendered on the page (`data-day`, `data-opens`, `data-closes` on each row) and writes "Open now · until 7 pm", "Opens tomorrow at 7 am" or "Closed today" into the pill;
  - without the script the pill shows the general line written in the page ("Open daily but Monday, 7 am to 7 pm").
- **Smooth scrolling:** Lenis, light.

The libraries are Motion and Lenis, pinned on jsDelivr, both under MIT.

## Pages

**Home** (`/`):
- the header, read from `navigation`, with an "Order a cake" button;
- **the hero (its own):** the poster headline, the arch photo, the "Open now" pill, the stamp, and two buttons (See the menu, Find us);
- **the ribbon (its own, a section list):** the day's breads;
- **On the counter today:** six menu items as photo cards with mono prices (adapted from `menu-photo-cards`);
- **Our story (its own):** a sticky photo with the text scrolling, the founding year and a pull quote;
- **The hours board (its own, the `hours` collection):** hairline-ruled rows, the "Open now" line, the address, the phone, "Get directions";
- **From the kitchen:** a strip of six photos with the shop's handle (adapted from `gallery-scroll-strip`);
- a cobalt "Order a cake" call to action (adapted from `cta-booking-hours`);
- **the footer (its own):** a huge wordmark, navigation, address and social links.

**Menu** (`/menu`): the poster title and the menu by category (Bread, Pastries, Coffee, Cakes to order), with dotted leaders and mono prices (adapted from `menu-two-columns`), then the hours board.

**Our story** (`/story`): the poster title, the story told in three parts with photos, the team of the two bakers and two others (adapted from `team`), and the shop's values.

**Visit** (`/visit`): the hours board, the address with directions and transport hints, and a contact and cake-order form (adapted from `forms-contact-beside-address`) whose answer fragment thanks the visitor.

**Datasources:**
- `navigation`;
- `menu`: the dishes, with category, price and photo;
- `hours`;
- `team`;
- `kitchen-photos`;
- `home-ribbon`;
- `contact` (collected).

## Its own blocks

The Blocks tab offers these first for a site started from Corner:

- `hero-corner-poster`: the poster headline with the arch photo, the stamp and the pill;
- `banner-corner-ribbon`: the tilted ribbon, a data block over a section list;
- `about-corner-sticky-story`: the sticky photo beside its scrolling text;
- `contact-corner-hours-board`: the hours with the "Open now" line, the address and the directions;
- `footer-corner-wordmark`: the footer with the huge wordmark.

## Images

These come from Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited:

- sourdough loaves;
- a baker shaping dough;
- croissants;
- a coffee cup on a counter;
- a shop window;
- a cake;
- flour on a wooden bench.

They should be warm and natural, not stock-polished. No recognizable faces outside the team cards, which use initials placeholders unless a fitting photo is found.
