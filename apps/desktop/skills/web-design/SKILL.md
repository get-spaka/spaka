---
name: web-design
description: Spaka's rules for a website's design — read before a new page, a change of style, or a script.
---

# A website's design

The maker should open their site and feel it was made for their business, by a studio, this year. A site reaches that by a **direction** held everywhere: decided once, before theme.css, and kept by every later page, section and script.

## 1. The direction

Before the theme, decide from what the maker said (and guess the rest):

- **The business's character**: who comes, what for, and how the place feels. A notary's calm, a bakery's warmth at dawn, a tattoo studio's edge, a wedding's tenderness.
- **The direction**, in three or four words that follow from it: "graphic and loud", "bright and playful", "warm, handmade, generous", "precise and airy", "dark and intimate", "quiet and literary". Two businesses of different characters never share a direction.
- **One strong move**: the thing a visitor remembers, chosen from the list below by the character. Everything around it stays quiet, so the move carries. Each move is a hero of the gallery, which carries it among its tags: the home page opens on it.

The move follows the business's character, never its trade alone: every trade fits several moves, and two businesses of one trade open differently when their characters differ. Read the character in the maker's words (what they stress, who comes, how they speak of the place): a barbershop with loud music and a crowd opens on giant type, a family hairdresser on its local details; a vineyard that receives guests on picture first, a winemaker of natural wines among friends on a dark statement.

| Move | For a character that is | For example | The hero made for it |
|---|---|---|---|
| giant type | loud, graphic, sure of itself | a blackwork tattoo studio, a record shop, a boxing gym, a street-food stand | one huge headline across the width, no picture |
| full-bleed photo | generous, sensory, about a place | a restaurant, a hotel, a farm, a wedding in a garden | a photograph filling the first screen, the text over its foot |
| picture first | open, scenic, unhurried | a gîte, a vineyard, a wedding in the mountains, a sailing school | a wide picture, the headline below it |
| split screen | bright, bold in one color | a children's activity, a festival, a juice bar, an ice-cream shop | half picture, half a panel in the primary color |
| dark statement | nocturnal, intimate, edgy | a cocktail bar, a club, a cinema, a late-night tattoo parlour | a dark screen, one statement, one accent |
| index | precise, methodical, sober | a notary, an architect, an accountant, a dental clinic | the services as a numbered index |
| overlap | layered, creative, artful | a design studio, a gallery, a florist, a hair salon with a signature style | a panel over the picture's edge |
| magazine serif | quiet, literary, refined | a bookshop, a fashion label, a tea room, a winemaker's estate | a very large serif beside a tall picture |
| picture mosaic | abundant, with much to show | a bakery, a photographer, a tattoo studio known for its portfolio, a market stall | the headline beside a mosaic of pictures |
| local details | neighbourly, practical, everyday | a corner bakery, a hairdresser, a cobbler, a pharmacy | the headline beside the hours and address |
| friendly checklist | reassuring, helpful, warm | a dog walker, a tutor, a cleaner, a climbing gym for children | the headline over three promises with ticks |

**Done when** you can say the direction and its move in one sentence, and each choice below follows from it.

## 2. Type

- One or two Google Fonts under the OFL, loaded by the `@import` on theme.css's first line: a heading font with the direction's character (a grotesque with quirks for graphic, a condensed or extended sans for loud, a rounded or humanist sans for friendly, a slab for sturdy and practical, a mono as an accent for technical, a high-contrast serif for literary or luxurious), and a body font made for reading, or one family in two weights. A serif is one voice among these, not the default for a site that should look careful. Choose among Google Fonts' many families for this character, as a type designer would, and give each a fallback stack.
- A contrasted scale: the hero's headline far larger than the body (`text-5xl md:text-7xl` and beyond for a display move, `tracking-tight` at that size), section headings a clear step below, body text at `text-base` or `text-lg` in lines of 60 to 75 characters (`max-w-prose`).
- Headings say something about this business ("Bread out of the oven at 6"), with a small label above them when a reader needs the section's name.

## 3. Color

- Four to six colors in the theme, each with a role: the surface and its alternate, the text, the primary that carries the brand, and a secondary and accent used sparingly. One color dominates; the accent is rare (one button, a mark, a rule).
- Light or dark by character: daylight businesses on a light surface; a bar, a cinema, a night event on a dark one.
- A light surface follows the direction too, like the fonts: pure white or a cool grey for the precise and the graphic, a pale tint of the primary's own hue for the bright and the playful, a warm paper only for the warm or the literary. Its alternate (`--theme-color-surface-alt`) is a step of the same family.
- Text on its surface, and each `-content` on its color, reads at a contrast of 4.5:1 or more.
- The four style values (`--theme-radius-field`, `--theme-depth`, `--theme-size`, `--theme-border`) follow the direction too: square and flat for precise, pill and raised for friendly, fine borders for quiet, bold ones for graphic.

## 4. Layout and rhythm

- Ask for the hero by its move, the move's own words first: `{ kind: "hero", query: "giant type hero, graphic and loud" }`, and place the block made for it. When the move you chose needs a layout no hero has, place the nearest and rewrite its structure for the move: the hero is the one block whose structure you may change (the gallery skill).
- Choose the other blocks by the direction: put its words in each `find_blocks` query, so the sections share one character. They keep their structure (the gallery skill); the theme and `styles/site.css` make them this site's.
- Sections alternate in density and background: text sections on the surface and its alternate, then a band of color or a full-bleed image. Generous space between them (`py-20 md:py-32`), more for a calm direction.
- One section breaks the grid, on the home page: asymmetric columns, an oversized number or word, or the overlap hero when it is the move.
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
- CSS first (scroll-driven animations, `@starting-style`, transitions), then the libraries the site-scripts skill lists: Motion, Lenis, Splitting, Embla, OGL. GSAP stays out: its licence excludes tools like Spaka.
- Reduced motion is the floor: under `prefers-reduced-motion: reduce` the page is complete and still.
- The site-scripts skill has the rules every script and stylesheet keeps: read it before writing one.

## 6. What reads as generic

Each of these makes a site look like any site; write its alternative instead:

- **The gradient of every AI site** (purple into blue, gradient text in a heading): one flat brand color, a gradient only between the theme's own colors when the direction calls for it.
- **The tasteful default** (cream paper, a very large serif headline, a muted dark red or brown, a small spaced-out label above it, whatever the business): the colors, fonts and move of this business's own character; keep that look for the few that are truly literary or luxurious.
- **The warm off-white of every site** (a cream surface, `#FAF7F2` or near it, whatever the direction): the surface family of the direction, from section 3.
- **Three equal cards with an icon each**: a numbered list, a split of text and image, or one large item and two small.
- **Everything centered**: a strong left edge, the center kept for the hero and the closing call.
- **Glass and glow** (frosted panels, neon shadows, blurred blobs): solid surfaces, depth from the theme's `--theme-depth`.
- **The same fade-up on every block**: movement on the few things that matter, by the table above.
- **Stock smiles** (people at a laptop, a handshake): the place, the work, the product, in one consistent light.
- **Words that fit any business** ("Welcome to our website", "Elevate your experience", "seamless"): this business's facts, in its own voice.

## 7. Look at it

Once a new page is written, look at its first screen with `look_at_preview`.

**Done when** the move shows on that screen, every text reads against its background, and nothing from section 6 is left.
