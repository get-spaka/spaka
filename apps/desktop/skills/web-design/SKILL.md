---
name: web-design
description: Upstart's rules for a website's design — read before a new page, a change of style, or a script.
---

# A website's design

The maker should open their site and feel it was made for their business, by a studio, this year. A site reaches that by a **direction** held everywhere: decided once, before theme.css, and kept by every later page, section and script.

## 1. The direction

Before the theme, decide from what the maker said (and guess the rest):

- **The business's character**: who comes, what for, and how the place feels. A notary's calm, a bakery's warmth at dawn, a tattoo studio's edge, a wedding's tenderness.
- **The direction**, in three or four words that follow from it: "quiet and editorial", "warm, handmade, generous", "graphic and loud", "precise and airy".
- **One strong move**: the thing a visitor remembers. A headline set very large in a serif with character; one saturated color on paper white; a full-bleed photograph under the first screen's text; hard rules and a strict grid; a dark page with a single bright accent. Everything around it stays quiet, so the move carries.

**Done when** you can say the direction and its move in one sentence, and each choice below follows from it.

## 2. Type

- One or two Google Fonts under the OFL, loaded by the `@import` on theme.css's first line: a heading font with the direction's character (a high-contrast serif for editorial, a grotesque with quirks for graphic, a rounded or humanist sans for friendly, a mono as an accent for technical), and a body font made for reading, or one family in two weights. Choose among Google Fonts' many families for this character, as a type designer would, and give each a fallback stack.
- A contrasted scale: the hero's headline far larger than the body (`text-5xl md:text-7xl` and beyond for a display move, `tracking-tight` at that size), section headings a clear step below, body text at `text-base` or `text-lg` in lines of 60 to 75 characters (`max-w-prose`).
- Headings say something about this business ("Bread out of the oven at 6"), with a small label above them when a reader needs the section's name.

## 3. Color

- Four to six colors in the theme, each with a role: the surface and its alternate, the text, the primary that carries the brand, and a secondary and accent used sparingly. One color dominates; the accent is rare (one button, a mark, a rule).
- Light or dark by character: daylight businesses on a light surface; a bar, a cinema, a night event on a dark one.
- Text on its surface, and each `-content` on its color, reads at a contrast of 4.5:1 or more.
- The four style values (`--theme-radius-field`, `--theme-depth`, `--theme-size`, `--theme-border`) follow the direction too: square and flat for precise, pill and raised for friendly, fine borders for quiet, bold ones for graphic.

## 4. Layout and rhythm

- Choose the gallery's blocks by the direction: put its words in each `find_blocks` query, so the sections share one character. They keep their structure (the gallery skill); the theme and `styles/site.css` make them this site's.
- Sections alternate in density and background: text sections on the surface and its alternate, then a band of color or a full-bleed image. Generous space between them (`py-20 md:py-32`), more for a calm direction.
- One section breaks the grid, on the home page: asymmetric columns, an image overlapping its text, an oversized number or word.
- Text sits on a strong left edge; a centered column suits the hero and the closing call. One primary action per screen.
- On a phone the page is designed, not shrunk: headings sized for it, tap targets of 44 px, nothing wider than the screen.

## 5. Movement, by character

How much a site moves follows its character, from still to orchestrated:

| Character | Examples | Movement |
|---|---|---|
| Still | a notary, an accountant, a clinic | hover and focus states only, 150 to 200 ms transitions |
| Gentle | a café, a salon, a florist, a shop | sections rising softly as they scroll into view (CSS `view()` timeline), images fading in |
| Expressive | a restaurant at night, a portfolio, a studio | smooth scrolling (Lenis), a heading arriving word by word (Splitting), a carousel by touch (Embla) |
| Orchestrated | an event, a launch, an architecture or design studio | one moment the page is built around: the hero's letters arriving, a WebGL background (OGL), an image moving with the scroll (`Motion.scroll`); calm everywhere else |

- One orchestrated moment a page at most; durations of 0.4 to 0.9 s, easing out.
- CSS first (scroll-driven animations, `@starting-style`, transitions), then the libraries the site-scripts skill lists: Motion, Lenis, Splitting, Embla, OGL. GSAP stays out: its licence excludes tools like Upstart.
- Reduced motion is the floor: under `prefers-reduced-motion: reduce` the page is complete and still.
- The site-scripts skill has the rules every script and stylesheet keeps: read it before writing one.

## 6. What reads as generic

Each of these makes a site look like any site; write its alternative instead:

- **The gradient of every AI site** (purple into blue, gradient text in a heading): one flat brand color, a gradient only between the theme's own colors when the direction calls for it.
- **Three equal cards with an icon each**: a numbered list, a split of text and image, or one large item and two small.
- **Everything centered**: a strong left edge, the center kept for the hero and the closing call.
- **Glass and glow** (frosted panels, neon shadows, blurred blobs): solid surfaces, depth from the theme's `--theme-depth`.
- **The same fade-up on every block**: movement on the few things that matter, by the table above.
- **Stock smiles** (people at a laptop, a handshake): the place, the work, the product, in one consistent light.
- **Words that fit any business** ("Welcome to our website", "Elevate your experience", "seamless"): this business's facts, in its own voice.

## 7. Look at it

Once a new page is written, look at its first screen with `look_at_preview`.

**Done when** the move shows on that screen, every text reads against its background, and nothing from section 6 is left.
