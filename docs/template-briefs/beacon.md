# Beacon: brief

The fourth of wave 1's four standard templates: the launch page (`launch`, not one of the original designs). Named Beacon rather than Signal, a messaging app's name (Q261).

## Concept

**Concept.** A product's page in the weeks before and after its launch. It is dark and precise, like the product's own interface, with one violet light. It makes one promise in a short sentence, then shows the product working, drawn in HTML rather than photographed. Then it says what it does, how it works, who already uses it, where the launch stands, what it will cost and what people ask. It ends where it began, on the waitlist. An updates page proves that the team ships.

**The fictional product** its texts are written for is **Nightjar**: uptime and scheduled-job monitoring for small software teams, which stays quiet until something really needs a person. It watches websites, APIs and cron jobs from twelve regions and groups related failures into one incident. It wakes only whoever is on call. Nightjar Labs is five people in Rotterdam. The public beta opened in October 2026, and 1.0 launches on March 3, 2027. Everyone who joins the waitlist before then gets the Team plan at half price for its first year.

The same structure suits any software or app before its launch, a hardware product taking pre-orders, a course, a book or a newsletter. The agent rewrites the texts, the window's contents and the lists.

## Trends it draws on

These come from 16 product and launch sites of 2025-2026, opened with WebFetch: linear.app (and its changelog), raycast.com, resend.com, warp.dev, zed.dev, cursor.com, granola.ai, diabrowser.com, factory.com, daylightcomputer.com, plaud.ai, sandbar.com, brilliant.xyz, analogue.co/3d, repebble.com and sesame.com. WebFetch reads a page's text, not its styles. Where a trend is about color, it rests on how galleries and reviews describe the sites (saasframe.io on Linear, the adminlte.io and uxdesign.cc roundups on Raycast and Resend). Each trend was seen on at least two sites.

1. **The product drawn as its interface,** not photographed. The mockups are built in the page: an issue list, a task grid, a notepad, a diff, a terminal (linear.app, warp.dev, granola.ai, cursor.com, zed.dev, diabrowser.com, raycast.com). Hardware pages draw diagrams instead, such as an I/O diagram or line art (analogue.co/3d, repebble.com).
2. **Lab-notebook labels.** "Fig 0.1-0.3" over the value cards, bracketed "fig." labels and block characters, "Est 2021 / Est 2026", steps numbered 01-03, numbered footnotes (linear.app, warp.dev, zed.dev, diabrowser.com, analogue.co/3d).
3. **Short declarative headlines,** each a sentence with its period, often in two parts: "It's not about saving time." then "It's about…", "The computer, de-invented.", "Think free.", "Plug in. Power On. Play.", "Built for the future. Available today." (raycast.com, daylightcomputer.com, sandbar.com, analogue.co/3d, linear.app, plaud.ai).
4. **How it works in three verbs:** Captured / Understood / Done, Connect / Speak / Think, Ask / Make / Play, Before / During / After (plaud.ai, sandbar.com, brilliant.xyz, granola.ai, diabrowser.com).
5. **Proof as exact numbers, named quotes and press:** "800k+ devs", "4.96 from 14,698 ratings", "50,000 product teams", scored reviews, a press wall (warp.dev, granola.ai, linear.app, plaud.ai, analogue.co/3d, cursor.com, daylightcomputer.com, brilliant.xyz).
6. **The launch's state in plain sight.** A status line ("In stock · Ships in 3-5 business days", "Ships now", "$20 off, pre-order"), dated updates on the home page, and a changelog page with "Fixed" lines (daylightcomputer.com, analogue.co/3d, plaud.ai, linear.app, cursor.com, repebble.com, raycast.com).
7. **A dark ground with one luminous accent:** inky blacks, indigo highlights, soft glows on hover, and the one action repeated at the top and the bottom (linear.app, raycast.com, resend.com for the dark; daylightcomputer.com, raycast.com, diabrowser.com, sandbar.com for the repeated action).

**What makes it its own:**
- **the aperture:** concentric rings drawn in SVG behind the hero, with a violet sweep turning slowly round them like a radar;
- **the window:** the product's interface, built in HTML. It rises out of the aperture's glow, tipped back in perspective, and lies flat as the page scrolls. Its uptime bars then fill one after another;
- **the launch track:** a line of dated milestones (alpha, beta, 1.0, what comes next), lit as far as "now". It answers "where are you?" better than a countdown does.

**What it leaves out:**
- countdown timers (a launch date in words never goes stale);
- WebGL and 3D renders;
- pop-ups and chat widgets;
- autoplay video;
- real companies' logos or press names (the wordmarks and quotes are fictional);
- the italic-serif words of Corner and Folio: its contrast is a heading's second sentence set in a muted tone.

## Type

Both fonts are files of the template, under the SIL Open Font License, like Corner's and Folio's.

| Role | Font | Setting |
|---|---|---|
| Headings | Sora | 500 for the hero, 400 otherwise, `tracking-tight`, `leading-[1.02]`; the hero at `clamp(2.75rem, 7vw, 6rem)`. The second sentence of a two-part heading goes in a `<span class="text-base-content/45">`, on headings only. |
| Body | Sora | 300 and 400, 1.0625 rem, `leading-relaxed`, `text-base-content/70` |
| Labels and data | Martian Mono | 400, 0.6875 rem, uppercase, `tracking-[0.08em]`: the "FIG. 03" labels, versions, dates, plan periods, the status lines. Width 87.5 (`font-stretch`) inside the window, where the data is dense. |
| Figures | Martian Mono | 300 at 3 to 4.5 rem: the numbers of the proof row and the plan prices |

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.155 0.018 278) | blue-black: the ground of every page |
| `--theme-color-surface-alt` | oklch(0.2 0.022 278) | lifted ink: cards, the window, the FAQ's rows |
| `--theme-color-text` | oklch(0.94 0.008 278) | cool white |
| `--theme-color-border` | oklch(0.3 0.025 278) | hairlines, the window's frame, the aperture's rings |
| `--theme-color-primary` | oklch(0.7 0.18 285) | luminous violet: the buttons, the sweep, the lit part of the track, the cards' glow, links on hover |
| `--theme-color-primary-content` | oklch(0.17 0.03 285) | dark text on the violet buttons |
| `--theme-color-secondary` | oklch(0.72 0.14 255) | electric blue, used only with the violet in the glow gradients, never alone |
| `--theme-color-accent` | oklch(0.88 0.07 295) | pale lilac: the "now" node, the founding-offer badge, the update pill |
| `--theme-color-neutral` | oklch(0.115 0.015 278) | the deepest ink: the closing waitlist band and the footer |
| `--theme-color-neutral-content` | oklch(0.9 0.01 278) | text on it |

Other settings:
- the corners are crisp (`--theme-radius: 0.625rem`);
- the fields are half that (`--theme-radius-field: calc(var(--theme-radius) * 0.5)`);
- relief is off (`--theme-depth: 0`);
- density is normal (`--theme-size: 0.25rem`);
- borders are fine (`--theme-border: 1px`).

Contrast: text on the surface is about 15:1, the violet on the surface about 6.5:1, and the dark text on the violet buttons about 6.5:1. Body text at /70 stays above 7:1. The muted second sentence (/45, about 3.4:1) passes AA for large text only, which is why it goes on headings alone. The uptime bars use the derived `success` and `warning` colors, never colors of their own.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves: the window lies flat, its bars are full, the track is lit to "now" and every heading is whole.

- **The hero headline:** its words come out of a blur one after another when the page loads (Splitting by words, then Motion, `filter: blur(8px)` to 0 with `y`), under `data-split`. With no script, or under reduced motion, it is plain text.
- **The aperture:**
  - an inline SVG of five concentric rings in `border`, `aria-hidden`, behind the hero;
  - a conic gradient from the primary to transparent turns once every 14 s (CSS keyframes on `[data-sweep]`, under `no-preference`);
  - a radial glow of primary and secondary sits under it, still;
  - under reduced motion and in edit mode the sweep rests at its first angle.
- **The window:**
  - `scripts/window.js` uses Motion's `scroll` to take `[data-window]` from `rotateX(24deg) scale(0.92)` to flat across the first screen of scrolling;
  - when the window comes into view, its `[data-bars]` fill one after another (`scaleY` from 0, `Motion.stagger`), and the sparkline draws itself (`pathLength`);
  - with no script, under reduced motion and in edit mode, it lies flat with its bars full.
- **The cards' glow:** `scripts/glow.js` sets `--glow-x` and `--glow-y` on a `[data-glow]` card as the pointer moves over it. The stylesheet draws a radial gradient of `oklch(from var(--color-primary) l c h / 0.18)` at that point, on the card and its border. The variables start off the card, so with no script, on a touch screen and in edit mode the card is a plain hairline card. It is not movement, so it stays under reduced motion, with no transition.
- **The launch track:** when `[data-track]` comes into view, its lit line grows from the first node to "now" (Motion, `scaleX` from 0 on `[data-track-lit]`, whose width the page sets). The "now" node gives off a slow ring (CSS keyframes, under `no-preference`). With no script, the line is lit to "now".
- **The figures:** `[data-count]` numbers count up to their own text when they come into view, then show that text exactly. With no script they are their text.
- **Reveals:** `data-reveal` on each section's label, heading, text and cards, as in the site-scripts skill.
- **Anchor links** scroll smoothly (`scroll-behavior: smooth`, under `no-preference`). There is no Lenis: the page is short and its anchors must land exactly.

Libraries: Motion and Splitting, pinned on jsDelivr, under MIT.

## Pages

**Home** (`/`):
- **the header:** sticky, `bg-base-100/80` with a backdrop blur and a hairline below. The wordmark with a small ring glyph, the links (Features, How it works, Pricing, FAQ, Updates) and "Join the waitlist". Adapted from `apps/desktop/gallery/header/header-simple`.
- **the hero (its own):**
  - the update pill, "New in 0.9 · Status pages →", linking to that update;
  - the mono line "Public beta · 1.0 on March 3, 2027";
  - "Quiet until it matters. *Then it wakes the right person.*";
  - one sentence;
  - the waitlist form (email and "Join the waitlist");
  - "2,418 teams on the list · No card needed";
  - the aperture behind it.
- **the window (its own):** a macOS-like frame with three dots and a title. Inside are a sidebar of monitors, a list of six monitors with their 90-day uptime bars and response times, and a response-time sparkline in SVG.
- **the beta wordmarks:** "In the beta at", seven fictional companies as typographic wordmarks. Adapted from `apps/desktop/gallery/logos/logos-muted-row`.
- **features (its own):** "FIG. 01-06" cards in a bento, the first two wide. Each has a label, a title, a sentence and a small geometric figure drawn in CSS and SVG, with the glow on hover. The figure is one of `rings`, `grid`, `bars`, `nodes`, `wave` or `stack`: abstract, so it fits any product. Adapted from `apps/desktop/gallery/features/features-bento`.
- **how it works:** "Point. Listen. Wake.", three steps with a mono number, a title, a sentence and a one-line example in a code chip. Adapted from `apps/desktop/gallery/steps/steps-numbered-line`.
- **the proof:**
  - four figures in Martian Mono ("38 s median time to alert", "12 regions", "4,100 incidents grouped", "0 alerts at 3 am for a blip"), adapted from `apps/desktop/gallery/stats/stats-divided-row`;
  - five beta users' quotes in uneven columns with initials, adapted from `apps/desktop/gallery/testimonials/testimonials-masonry-columns`.
- **the launch track (its own):** "Where we are", five milestones on a line: Private alpha, Public beta, Status pages, 1.0, Mobile app. On a phone the line runs down.
- **pricing:** a band above it with the founding offer, "Join before 1.0: Team at half price for a year". Three plans (Hobby $0, Team $19, Business $79 a month), the Team plan bordered in violet with its glow. Adapted from `apps/desktop/gallery/pricing/pricing-three-tiers`.
- **latest updates:** the three newest, each with date and version in mono, title and arrow, then "All updates →". Adapted from `apps/desktop/gallery/blog/blog-date-list`.
- **FAQ:** six questions beside "Still curious? hello@nightjar.dev". Adapted from `apps/desktop/gallery/faq/faq-two-columns`.
- **the closing waitlist (its own):**
  - "Be there on day one." on the neutral band;
  - the form with an optional team size;
  - the count;
  - a smaller aperture.
- **the footer:**
  - link columns and "© 2026 Nightjar Labs, Rotterdam";
  - a mono status line with a success dot, "All systems normal", literal;
  - adapted from `apps/desktop/gallery/footer/footer-columns`.

**Updates** (`/updates`):
- the title, "Updates", and "What we shipped, every two weeks";
- every update as a row: a narrow sticky column with the date and version in mono, then the tag (New, Improved, Fixed), title, summary, cover if any, and "Read";
- a compact waitlist form at the end ("Hear about 1.0 first").

**An update** (`/updates/<update>`), a page per record:
- the version, date and tag;
- the title;
- the cover;
- the body (paragraphs, then a "Fixed" list);
- the previous and next updates.

**Privacy** (`/privacy`):
- the title and "Last updated November 2026" in mono;
- an "In short" box of three lines;
- five short sections in prose: what the waitlist keeps (an email and an optional team size), what it never does, where it is stored (the EU), how to be removed, and whom to write to.

**Datasources:**
- `navigation`;
- `waitlist`: collected, with email (required) and team_size (Just me, 2-10, 11-50, 50+). Its answer fragment: "You're on the list. We'll write when your wave opens.";
- `home-logos`: name, logo (optional image);
- `home-features`: label, title, text, figure (choice), wide (boolean);
- `home-steps`: verb, title, text, example;
- `home-stats`: value, label, note;
- `testimonials`: quote, name, role, company;
- `home-milestones`: title, when, state (done, now, next), note;
- `home-plans`: name, price, period, description, features (list), highlighted, button;
- `updates`: title, version, date, tag (choice), summary, cover (optional), body (markdown); five records, from 0.6 "Private alpha opens" to 0.9.2 "Quieter retries";
- `home-faq`: question, answer.

## Its own blocks

The Blocks tab offers these first for a site started from Beacon:

- `hero-beacon-launch`: the headline with the update pill, the status line, the waitlist form, the count and the aperture (a data block over `waitlist`);
- `features-beacon-window`: the interface window, its frame and its tilt, with neutral contents to rewrite;
- `features-beacon-figures`: the bento of labelled cards with their figures and glow, over a section list;
- `steps-beacon-track`: the launch track of dated milestones, over a section list;
- `cta-beacon-waitlist`: the closing waitlist band with the smaller aperture.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. The product itself is never photographed. Its window, figures and aperture are HTML, CSS and SVG, so the agent rewrites them for another product, or replaces the window's contents with a screenshot.

There are about seven photos, all of night and blue hour, with no people:
- covers for the five updates: star trails, a long exposure of light trails, a port's cranes at night from afar, a radio telescope dish, a server aisle lit blue;
- a view of Rotterdam's harbor at blue hour, for the privacy page's header and the default share picture.

They are chosen for a cool, deep cast with points of light, so that they sit on the blue-black ground and read as one set.
