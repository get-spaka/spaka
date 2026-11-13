# Ember: brief

The third of wave 1's four original designs: the evening restaurant and wine bar (`business`, one of the original, animated designs).

## Concept

**Concept.** An evening seen by candlelight. The site opens on the dark room, and the visitor's pointer carries a warm light that brings it out of the shadow. The pages are paced like a film: one scene per screen, slow reveals, images that drift as the page scrolls, and an evening that runs from 5 pm to the last glass as you scroll down through it. The menu is walked course by course, and the cellar has its own page. A table, a private room or a gift card is never more than one tap away.

**The fictional business** its texts are written for is **Wick**, a wine bar and wood-fire kitchen at 62 Chandler Lane, Portland, Maine, in an 1868 ship chandler's brick warehouse, opened in 2021 by chef Mara Lindqvist and sommelier Julien Okafor. It opens Tuesday to Saturday from 5 pm until midnight (the kitchen until 10:30) and cooks fish from the Gulf of Maine, oysters and vegetables from inland farms over a hearth of maple and oak. Its cellar holds about 300 bottles and 14 wines by the glass, mostly from small growers in the Loire, the Jura, Piedmont and the Finger Lakes. The Cellar Room under the brick vaults seats 14, and the whole house can be booked for 60. It sells gift cards and sends a monthly letter announcing its wine dinners.

The same structure suits a cocktail bar, a steakhouse, a tasting-menu dining room, an izakaya, a jazz bar, a wine shop with a bar, or a boutique hotel's restaurant. The agent rewrites the dishes, the wines, the rooms and the evening.

## Trends it draws on

These come from 14 restaurant, bar and venue sites opened with WebFetch (2025-2026: Awwwards' Hotel / Restaurant and Food & Drink categories, One Page Love, Minimal Gallery) and from their Awwwards entries, plus two seen through their Awwwards entry only (abarcalledgemma.se, from 2024, whose site no longer answers; faithibiza.com). WebFetch returns a page's text but not its styles, so the colors, motion and features below come from each Awwwards entry's palette, tags and featured elements. Each trend was seen on at least two of the sites.

1. **Cinematic, full-bleed photos of the room and the plates, one scene per screen** (qissa.co.uk, rebuilt as "a single cinematic scroll"; restaurantzimmerl.at, tagged fullscreen and parallax; restaurantgem.com, fullscreen and photography; ballenacabo.com, a full-width hero; mugaritz.com, a video hero; faithibiza.com, big background images).
2. **Dark backgrounds lit by one warm, metallic accent** (restaurantzimmerl.at: deep green-black and copper; munrooftoprome.com: a night navy; abarcalledgemma.se: near-black and one hot red; lostontos.be: black-green and gold; qissa.co.uk, whose room is navy velvet and brass light).
3. **A moving opening and transitions between pages** (restaurantgem.com: a first-load animation and page transitions; munrooftoprome.com: the hero's moon animation; damaria-roma.webflow.io: transitions with BARBA; mugaritz.com: an animated header and footer), with **full-screen navigation** (qissa.co.uk, restaurantgem.com, abarcalledgemma.se's side navigation, damaria-roma.webflow.io's unusual navigation).
4. **The menu walked course by course, the dish's picture brought forward** (qissa.co.uk: "Explore the menu, course by course"; restaurantgem.com: a dish preview on hover and a six-course tasting menu; restaurantzimmerl.at: "23 courses"; ballenacabo.com: a horizontal menu; 11elevenbar.com: eleven cocktails, each with what goes into it; munrooftoprome.com: ten cocktails, one per district).
5. **Short lines that tell the evening as a story** (11elevenbar.com: the bar as the hours after dinner, in broken lines; mugaritz.com: a numbered "Come to Mugaritz if…"; qissa.co.uk: the "tale" running through every heading; devonshiresoho.co.uk: short, staggered lines; munrooftoprome.com: a view that changes "from sunset").
6. **Private dining and events as a chapter of their own, with gift cards and a newsletter close by** (devonshiresoho.co.uk: four private rooms for up to 60, plus gift vouchers; qissa.co.uk: "Private Dining & Celebrations"; munrooftoprome.com: renting the rooftop, and events; restaurantzimmerl.at: chef's room dining; noblerot.co.uk: private dining and a newsletter; therechabite.com.au: functions and what's on; lostontos.be and ballenacabo.com: gift cards; studenterkilden.dk and restaurantgem.com: a newsletter).
7. **"Reserve" always in reach, the hours said plainly** (restaurantzimmerl.at: a reserve button at the top, the middle and the end, and "Thursday to Saturday from 18:00"; damaria-roma.webflow.io: a reservation modal; noblerot.co.uk: a reservation pop-up; ballenacabo.com and devonshiresoho.co.uk: "Book now" in the header; qissa.co.uk: hours day by day).

**What makes it its own:**
- **the candlelight:** the hero photo is shown darker, and a warm pool of light follows the pointer and flickers (WebGL, with a CSS light where WebGL is not available);
- **the evening:** the hour pinned at poster size on the left while the evening's four moments scroll past beside it, from 5 pm to the last pour, the background deepening from amber dusk to oxblood to night (vertical, decision Q260: the sideways reel is Reel's);
- **the menu card:** a cream card, tilted, overlapping the photo of a dish, the only light surface on a dark site; and the name at poster size, crossing the hero photo's bottom edge.

**What it leaves out:**
- preloaders, a custom cursor, an Instagram feed, anything that scrolls sideways (Reel's);
- video, which owners rarely have good footage for;
- a marquee or ribbon (Corner and Folio both have one), and the few words of a heading in an italic serif.

## Type

Both fonts are files of the template, under the SIL Open Font License, from Google Fonts. Only the roman of Bodoni Moda is shipped; the template has no italic accents.

| Role | Font | Setting |
|---|---|---|
| Headings and the name | Bodoni Moda | variable, optical size at its display end (`font-optical-sizing: auto`), 400 to 500, never bold; the name at `clamp(5.5rem, 24vw, 22rem)`, `leading-[0.8]`, `tracking-tight`; headings 3 to 6.5 rem, sentence case |
| Large numbers | Bodoni Moda | the evening's hours ("5", "7", "10:30"), the course numbers and the Cellar Room's "14", set large as figures |
| Body | Hanken Grotesk | 400, 1.0625 rem, `leading-relaxed`, `text-base-content/80` |
| Labels, times and prices | Hanken Grotesk | 500, 0.75 rem, uppercase, `tracking-[0.2em]`, `tabular-nums` for prices and times |

## Palette

Dark and warm: the room at night, lit by candles. Every pair of text and background passes WCAG AA, measured from these values: cream on the surface 15.6:1, amber on the surface 10:1, cream on oxblood 9.3:1, ember on the surface 6.3:1, `text-base-content/70` about 7:1.

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.17 0.014 45) | the room: a warm near-black, brown rather than grey |
| `--theme-color-surface-alt` | oklch(0.215 0.02 40) | a lighter dark, for the menu's rows and the evening's first panel |
| `--theme-color-text` | oklch(0.93 0.022 80) | candle cream; also the menu card's paper |
| `--theme-color-primary` | oklch(0.8 0.13 72) | amber, the candlelight: buttons, links, the pointer's light, prices on hover |
| `--theme-color-primary-content` | oklch(0.17 0.014 45) | the room's dark, on amber |
| `--theme-color-secondary` | oklch(0.36 0.11 22) | oxblood: the private dining band, the evening's middle, the wine page's styles |
| `--theme-color-secondary-content` | oklch(0.93 0.022 80) | cream on oxblood |
| `--theme-color-accent` | oklch(0.68 0.16 42) | ember: the "open tonight" dot and small marks only |
| `--theme-color-accent-content` | oklch(0.14 0.012 40) | dark on ember |
| `--theme-color-neutral` | oklch(0.12 0.01 40) | night: the footer, the header once scrolled, the evening's end |
| `--theme-color-neutral-content` | oklch(0.93 0.022 80) | cream |
| `--theme-color-border` | oklch(0.32 0.02 50) | hairlines between dishes and wines |
| `--theme-radius` | 0rem | square images and panels, like frames of film |

Other settings: buttons and fields are pills (`--theme-radius-field: 9999px`), outlined in amber and filled on hover; relief is off (`--theme-depth: 0`); density is spacious (`--theme-size: 0.28125rem`); borders are fine (1px).

The Theme tab still restyles all of it. The light is drawn from `--color-primary` over `--color-neutral`, so it follows the palette, though it is meant for a dark one.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves and everything is in its final place, as in Corner and Folio. Each effect is turned on by an attribute, so a new section can have it too.

- **The candlelight** (`<canvas data-shader aria-hidden="true">` in the hero's figure, `scripts/candlelight.js`, OGL):
  - the script draws the figure's own `<img>` as a texture, darkened to about 45%, with a pool of warm light (the theme's primary) that follows the pointer with a slight lag, flickers by noise (about 6% of its strength) and carries a fine grain; on a touch screen it drifts by itself and settles near the name; scrolling past zooms the photo slightly;
  - without WebGL, the same script sets `--candle-x` and `--candle-y` on the figure, and a CSS radial gradient made from the neutral color does the darkening and the light;
  - with no script, under reduced motion and in edit mode: the photo as it is, with a static gradient of neutral at its foot so the name reads. `stop` cancels the frame loop, loses the GL context and removes the listeners.
- **`data-candle`, the light on any dark section** (the private dining band, the footer): a soft amber light, a `color-mix` of the primary, follows the pointer, drawn by a `::before` that exists only once the script has added `data-candle-on`. With no script, under reduced motion and in edit mode, there is no light.
- **The name** (`data-flicker`, Splitting then Motion): its letters come up from a blur in random order over about 1.4 s, like candles being lit; this is not Folio's rise from left to right. With no script it is plain text.
- **The hero comes up from black** (`data-fade-in`, Motion): the script sets the photo's opacity to 0 and brings it to 1 over 1.6 s while it scales from 1.1 to 1.04, like a projector warming up. With no script, under reduced motion and in edit mode it is simply there.
- **`data-reveal`:** sections' main elements rise slowly (`y: [32, 0]`, opacity, `filter: blur(6px)` to none, 1.2 s, `ease: [0.16, 1, 0.3, 1]`) with Motion's `inView`, as in the site-scripts skill, only slower.
- **`data-curtain`:** a large image opens from its middle outward (`clip-path: inset(0 50% 0 50%)` to `inset(0)`, 1.4 s), set and played by the script.
- **`data-drift`:** an image moves inside its frame as the page scrolls (`translate` from -6% to 6% at `scale: 1.12`). This is CSS, with `animation-timeline: view()` inside `@supports` and `@media (prefers-reduced-motion: no-preference)`; the stylesheet's own state is the middle of the drift, so a still page reads right.
- **`data-kindle`:** the words of a statement light up one by one as they cross the middle of the screen. Splitting splits it into words; the script sets each to 25% opacity and Motion's `scroll` brings it to full. With no script, under reduced motion and in edit mode, every word is at full.
- **The evening** (`data-evening`, `scripts/evening.js`, Motion's `scroll`):
  - on a desktop, the section is two columns: the hour (`data-evening-hour`, Bodoni at poster size) is `position: sticky` on the left, and the four moments scroll past on the right. As each moment crosses the middle, the script writes its time into the hour, which changes with a short blur, and sets `--evening` from 0 to 1, by which the stylesheet blends the background from surface-alt through secondary to neutral; on a phone, each moment shows its own time above it, and the background still deepens;
  - the sticky column is layout, not motion: with no script, under reduced motion and in edit mode, the hour shows the first moment's time and every moment shows its own time too, on surface-alt.
- **The menu card:** a fixed `-rotate-2` on wide screens (layout, not motion), which straightens on hover (a transition, under no-preference). On a phone it is not tilted and overlaps the photo above it by 3 rem.
- **The courses** (CSS only): on the menu page, each course's picture is `position: sticky` beside its list, so the picture of the course you are reading stays in view and the next one takes its place. It works the same in edit mode.
- **The header:** transparent over the hero, then night once scrolled. This is a CSS scroll-driven animation on `animation-timeline: scroll()`, from transparent to the stylesheet's own `bg-neutral/90`, which edit mode and older browsers show.
- **Open tonight** (`data-tonight`, `scripts/tonight.js`): the script reads the hours on the page (`data-day`, `data-opens`, `data-closes`) and writes "Open now · kitchen until 10:30", "Open tonight from 5 pm" or "Closed tonight · back Tuesday at 5". With no script, the line written in the page ("Tuesday to Saturday, 5 pm till late").
- **Page transitions:** CSS only (`@view-transition { navigation: auto }`). The old page fades to night and the new one fades up from it, a cut through black of about 0.5 s, under no-preference. Browsers without view transitions simply change page.
- **Smooth scrolling:** Lenis, a little heavier than usual (`lerp: 0.08`).

Libraries: Motion, Lenis and Splitting, pinned on jsDelivr, under MIT; OGL, imported in its module from jsDelivr, under the Unlicense.

## Pages

**Home** (`/`):
- **the header:** "Wick" on the left; Menu, Wine, Private dining, Story and Visit; a "Reserve" pill; folds into a full-screen menu on a phone (adapted from `apps/desktop/gallery/header/header-dark`);
- **the hero (its own):** the dark room under the candlelight, the name at poster size crossing the photo's bottom edge, "Wine, fire and a late kitchen on Chandler Lane", the open tonight line, Reserve a table and See the menu;
- **the statement (its own):** three sentences in Bodoni at 3 rem that kindle as they scroll ("We light the hearth at four…");
- **the evening (its own, a section list):** four panels: 5 pm, the first pour; 7, the hearth; 10:30, the bar menu; midnight, the last glass;
- **tonight's menu card (its own):** a dish photo with drift, and the tilted cream card listing four featured dishes with prices, then "The whole menu";
- **by the glass:** five featured wines with dotted leaders and their glass price, then "The cellar" (adapted from `apps/desktop/gallery/menu/menu-course-leaders`);
- **the Cellar Room:** on oxblood with `data-candle`: a curtained photo of the vaulted room, "Fourteen seats under the bricks" and "Plan a dinner" (adapted from `apps/desktop/gallery/cta/cta-split-image`);
- **what's on:** the next three events, adapted from `apps/desktop/gallery/events/events-dark-whats-on`;
- **said of us:** three short quotes from invented publications (adapted from `apps/desktop/gallery/logos/logos-press-quotes`);
- **the footer (its own):** a huge "Wick" lit by `data-candle`, the address, the hours, the newsletter line, "Give an evening" (gift cards) and the links.

**Menu** (`/menu`):
- the title and a note ("It changes with the boats and the farms; this is tonight's");
- **the courses (its own):** Snacks, Raw bar, Small plates, From the hearth, Sides and Sweet. Each course has a large number in Bodoni and its sticky picture beside its dishes. Each dish has its name, a line, its price and diet marks;
- **trust the hearth:** a five-course tasting menu at $95, with $60 for the pairing (adapted from `apps/desktop/gallery/menu/menu-tasting`), then a link to the wine page.

**Wine** (`/wine`):
- the title, and a note by the sommelier beside his portrait (or his initials);
- **by the glass:** fourteen wines grouped by style, each with producer, region, vintage, a note and two prices;
- **the cellar:** bottles grouped by style with dotted leaders (both lists adapted from `apps/desktop/gallery/menu/menu-course-leaders` over `wines`), and "Bring your own bottle on Tuesdays, $25 corkage";
- the next wine dinners, adapted from `apps/desktop/gallery/events/events-date-list`.

**Private dining and events** (`/private-dining`):
- the title over a drifting photo, then **two ways to gather:** the Cellar Room and the whole house, each with its seats, minimum spend, a text and a photo (adapted from `apps/desktop/gallery/services/services-image-list`);
- **upcoming:** the events, adapted from `apps/desktop/gallery/events/events-dark-whats-on`;
- **an enquiry form:** name, email, phone, date, guests, the kind of evening and a message (adapted from `apps/desktop/gallery/forms/forms-contact-card`).

**An event** (`/events/<event>`), a page per record: the cover with the curtain, the date, time and price, the text with that evening's menu and wines, and "Request seats", linking to the enquiry form (adapted from `events-dark-whats-on`'s `detail.liquid`).

**Story** (`/story`):
- the title, then the story in three short chapters with drifting photos (the warehouse, the hearth, the cellar), adapted from `apps/desktop/gallery/about/about-editorial-pullquote`;
- **the people:** the chef, the sommelier, the bar manager and the floor manager (adapted from `apps/desktop/gallery/team/team-bio-rows`);
- **who we buy from:** five growers and fishermen with what and where (adapted from `apps/desktop/gallery/features/features-split-list`).

**Visit** (`/visit`):
- **request a table:** the date, a time (from 5:00 to 9:30), guests, name, email, phone, the occasion and notes. It is set beside the hours and "The bar is kept for walk-ins" (adapted from `apps/desktop/gallery/forms/forms-booking-table`). The answer says the request becomes a booking once Wick confirms by email;
- **the hours:** with the open tonight line (adapted from `apps/desktop/gallery/contact/contact-dark-hours`);
- **finding us:** the address, parking and the ferry terminal nearby (adapted from `apps/desktop/gallery/contact/contact-find-us`);
- **gift cards:** "Give an evening at Wick", from $50, at the bar or by email (adapted from `apps/desktop/gallery/cta/cta-split-image`);
- **questions:** walk-ins, dietary needs, children, corkage and access (adapted from `apps/desktop/gallery/faq/faq-accordion`).

**Datasources:**
- `navigation`; `menu`: name, description, price, course, tags, image, `featured` (18 dishes, three per course); `menu-tasting`: its five courses;
- `wines`: name, producer, region, vintage, style (sparkling, white, skin-contact, rosé, red, sweet), glass price, bottle price, `by_the_glass`, note, `featured` (about 24, a short real list rather than six);
- `home-evening`: time, title, text, image; `private-rooms`: name, seats, minimum, text, image;
- `events`: title, date, time, price, summary, cover, body; four, such as a Jura dinner, a Finger Lakes winemaker's visit, an oyster night and New Year's Eve;
- `team`, `hours`, `home-press`, `story-suppliers` and `visit-faq`;
- `reservations`, `enquiries` and `newsletter`: collected, each with its thank-you fragment.

## Its own blocks

The Blocks tab offers these first for a site started from Ember:

- `hero-ember-candlelight`: the dark photo with the candlelight, the name across its edge, the open tonight line and two buttons;
- `about-ember-kindle`: a statement whose words light up as it scrolls;
- `steps-ember-evening`: the evening with its pinned hour and its deepening background, a data block over a section list;
- `menu-ember-card`: the tilted menu card over a dish photo, a data block over `menu` (its featured dishes);
- `menu-ember-courses`: the menu by course with the sticky picture per course, a data block over `menu`;
- `footer-ember-hearth`: the footer with the lit wordmark, the hours, the newsletter line and the gift card link.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. About 28 images:
- the room at night: a candlelit dining room, a bar counter, a brick or stone wine cellar with vaults, a lit window seen from a dark street;
- the hearth: embers, a wood-fired grill, flames under a grate;
- the plates: oysters on ice, grilled fish, charred vegetables, bread, a dessert, around eight;
- the wine: a glass of red by candlelight, bottles on racks, a pour;
- the evening's four panels and the events' covers, partly reusing these;
- the people: four portraits only if fitting photos are found, otherwise initials on oxblood.

To read as one set they are chosen low-key: warm tungsten or firelight, deep shadows, dark backgrounds, no daylight or white tablecloths, and no faces outside the team. A shared CSS treatment (`[data-grade]`: a little less saturation and a little more contrast, a filter with no color of its own) pulls them together.
