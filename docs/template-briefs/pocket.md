# Pocket: brief

The second of wave 1's four original designs: the mobile app (`app`, one of the original, animated designs).

## Concept

**Concept.** An app's site where the app itself does the talking. Its screens are built in HTML from the theme, inside phone frames, never screenshots. Three phones fan out over a soft mint, sky and lilac glow. Then one phone stays in place while the page scrolls, and its screen changes with each chapter of the story. Small things can be touched: a plant row in the hero phone can be ticked as watered, and a drop fills its ring.

**The fictional business** its texts are written for is **Fernway**, a houseplant care app for iPhone and Android. It is made by a team of five in Utrecht and has been out since 2022. Fernway reminds you when each plant needs water or food. It measures a window's light with the phone's camera and checks a sick leaf from a photo. It also shares the watering with housemates.
- **Free:** up to 10 plants, the reminders and the light meter.
- **Fernway Plus:** $3.99 a month or $29.99 a year, after a 14-day trial. It adds unlimited plants, the plant doctor, a shared home for up to five people, vacation mode and seasonal care plans.

The same structure suits any consumer app: a habit tracker, a budget, a language course, a sleep, recipe or fitness app. The agent rewrites the texts, the screens' parts and the records that fill them.

## Trends it draws on

These come from 19 app sites of 2025-2026 (Awwwards' mobile and apps category and its nominees, plus well-known consumer apps). Each trend was seen on at least two of them. WebFetch reads a page's text, not its styles, so the type, color and motion come from the sites' Awwwards entries (fonts, palettes, tags) and from the sites' own words. Grail's page did not render; its Awwwards entry stands in for it.

1. **A story in numbered chapters that the scroll plays.** On twodo.design, seven "moments" drive one phone's screens. Sparkle and GoShuin number their chapters 01 to 07, and Tinkeroll's header bar counts levels as the visitor scrolls (twodo.design, sparkle.ankatms.com, aestudio.studio/goshuin, layernative.com/tinkeroll, and grail-app.com and thewayapp.com per their Awwwards entries).
2. **The interface rebuilt on the page rather than screenshotted** (flighty.com, yumlog.dev, copilot.money, twodo.design, sparkle.ankatms.com). Flighty shows notification cards for gate changes and YumLog chat-style exchanges. Copilot's panels have Approve and Dismiss states, and Two-Do has a live prototype to tap.
3. **Play in small things** (sparkle.ankatms.com, twodo.design, opalapp.com, layernative.com/tinkeroll). Sparkle counts the stars gathered on the way down, and Opal has collectible focus gems. On Two-Do, a heart beats once when both partners agree; the site also writes down what each effect becomes under reduced motion.
4. **The rating beside the store buttons** (opalapp.com 4.8 from 150k, bevel.health 4.8 from 64.7k, risescience.com 75,829 ratings, finchcare.com 5.0 from 500k+, copilot.money 4.8 from 31,000+, getstoic.com 4.8).
5. **Privacy as a section of its own, in plain words** (sparkle.ankatms.com "your child's data is not a business model", gentlerstories.com/gentlerstreak "on the device, no accounts", copilot.money "Privacy first", bevel.health, getstoic.com "Private & Secure").
6. **Free to start, one paid plan, said plainly** (copilot.money: one plan with a monthly or yearly switch; yumlog.dev and tiimoapp.com: free core and a trial of the paid tier; getstoic.com; layernative.com/tinkeroll and hole.money: free with no subscription).
7. **Reviews in rows that move** (structured.app, bevel.health, opalapp.com, getstoic.com), then an FAQ and a closing call to action that repeats the hero's buttons (sparkle.ankatms.com, yumlog.dev, tiimoapp.com, layernative.com/tinkeroll).

**What makes it its own:**
- the phone that stays, whose screens are HTML parts that the `plants` records fill;
- the watering tick in the hero phone, a real checkbox that works with no script;
- the fanned phones over a living glow in the theme's three soft colors, which leans toward the cursor;
- one word of a heading set on a soft gradient pill, the "marker", where Corner and Folio use an italic serif.

**What it leaves out:** dark mode first (most app sites are dark this year; this one is light), 3D device renders, loaders, sound and video, press logo walls, and the stores' official badge artwork (see Images).

## Type

Both fonts are files of the template, under the SIL Open Font License, like Corner's and Folio's.

| Role | Font | Setting |
|---|---|---|
| Headings | Fredoka | 600, width 85 (its `wdth` axis), `leading-[0.92]`, `tracking-tight`; the hero at `clamp(3rem, 8vw, 7.5rem)`, sections at 2.5 to 4.5 rem |
| Chapter numbers and big figures | Fredoka | 500, width 100, 3 to 6 rem ("01", "4.8", "$29.99") |
| Body | Figtree | 400 and 500, 1.0625 rem |
| Inside the phones | Figtree | 500 to 700 at 11 to 17 px with `tabular-nums`, to read like a system interface |
| Labels | Figtree | 600, small, uppercase, `tracking-wide` (chapter kickers, "Most popular") |
| Marker | (no other font) | one word in `<mark>`: a rounded gradient pill from secondary to accent behind it, the text unchanged ("Every plant, *on time*") |

## Palette

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.985 0.006 220) | a cool white |
| `--theme-color-surface-alt` | oklch(0.94 0.035 230) | pale sky: alternate sections, the glow's middle color, the phones' cards |
| `--theme-color-text` | oklch(0.24 0.035 265) | ink with a blue-violet cast |
| `--theme-color-primary` | oklch(0.48 0.1 200) | lagoon teal: buttons, links, the health rings, the toggle |
| `--theme-color-primary-content` | oklch(0.985 0.006 220) | text on primary (about 5.5 to 1) |
| `--theme-color-secondary` | oklch(0.9 0.09 165) | mint: the glow, the marker's start, the "Most popular" plan, ticks |
| `--theme-color-secondary-content` | the ink | |
| `--theme-color-accent` | oklch(0.86 0.08 305) | lilac: the glow, the marker's end, notifications, chapter rail |
| `--theme-color-accent-content` | the ink | |
| `--theme-color-neutral` | oklch(0.26 0.04 275) | ink-plum: the phone bodies, the store buttons, the footer |
| `--theme-color-neutral-content` | oklch(0.97 0.01 220) | text on neutral |
| `--theme-color-border` | the text at low opacity | hairlines, card edges |
| `--theme-radius` | 1.5rem | soft cards; the phone frame has its own fixed radius (2.75rem outside, 2.25rem for the screen) |

Other settings:
- the fields and buttons are pills (`--theme-radius-field: 9999px`);
- relief is off (`--theme-depth: 0`); the phones and cards get a soft shadow made from the neutral color (`oklch(from var(--color-neutral) l c h / 0.14)`);
- density is spacious (`--theme-size: 0.28125rem`).

All text meets WCAG AA on its background:
- the ink on the surface is about 15 to 1, and on mint, sky or lilac at least 11 to 1;
- `text-base-content/70` on the surface stays above 6 to 1;
- the store buttons' text on neutral is above 13 to 1.

The palette keeps clear of the wave's cobalt, butter, vermilion, deep green, violet-blue, pink, oxblood and chartreuse.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode, Spaka runs no script and plays no animation: every phone, screen and card is in its final place, and each chapter shows its own phone.

- **The glow** (`<canvas data-aurora aria-hidden="true">` in the hero and the download band):
  - `scripts/aurora.js` uses OGL to draw three soft blobs that drift slowly and lean toward the cursor. Their colors are the theme's secondary, surface-alt and accent, read from the CSS variables at start, so the Theme tab still restyles the glow;
  - the loop pauses off-screen and `stop` disposes of it; on a phone it renders at pixel ratio 1;
  - with no script, in edit mode or without WebGL, the section's own CSS background shows: three radial gradients in the same colors. Under reduced motion no canvas is made.
- **The fan** (`data-fan` on the hero's phones): on load, the three phones rise from a stack into a fan (−8°, 0°, 7°) with a Motion spring, one after another. As the page scrolls on, the side phones slide in behind the middle one (`Motion.scroll`). With no script, under reduced motion and in edit mode, the fan is as the stylesheet places it. On a phone, the middle phone stands alone with the two others peeking behind it, never wider than the screen (the section clips overflow).
- **Tilt** (`data-tilt`): on a desktop with a pointer, a phone turns up to 6° in 3D toward the cursor (Motion). There is no tilt on touch screens or under reduced motion.
- **The watering tick** (`data-water`, CSS only): each plant row in the Today screen is a `<label>` around a checkbox ("Mark Monty as watered"). Once ticked:
  - the plant's ring fills, through a registered `@property` animated on `:has(:checked)`;
  - a drop falls from its keyframes, under `no-preference` only.

  It works with no script; under reduced motion the ring is simply full; in edit mode the rows show the state written in the page.
- **The phone that stays** (`data-phone-story` on the section; each chapter's phone has `data-screen`):
  - on screens 1024 px wide or more, `scripts/phone-story.js` gathers the chapters' screens into the first chapter's phone frame and makes that frame sticky. As each chapter's text reaches the middle (`Motion.inView`), its screen slides up into the frame and the rail of chapter numbers moves on. `stop` puts every screen back;
  - with no script, under reduced motion and in edit mode, each chapter shows its text beside its own phone (alternating sides on a desktop, the phone below the text on a phone, where each tilts in from 4° as it comes into view).
- **Reveals:** Motion's `inView` raises a section's main elements (`y: [24, 0]`, opacity), under `data-reveal`, as in the site-scripts skill.
- **Counts:** under `data-count`, the hero's rating and the figures count up to the number written in the page (Motion). With no script, the written number shows.
- **Review rows** (`data-marquee`): two rows of cards drift in opposite directions in CSS and pause on hover or focus. `scripts/marquee.js` copies the cards once so the loop is seamless, as Corner's ribbon does. With no script, under reduced motion and in edit mode, they are rows that scroll sideways with snap points.
- **The notification** (`data-notify` in the download band): a card ("Monty is thirsty · Water today") drops from the phone's island with a spring when the band comes into view (Motion). With no script it sits in its place.
- **Small things, in CSS under `no-preference`:** store buttons and plan cards lift on hover, the bento's light-meter needle sways, and the price fades when the billing switch is flipped (the switch itself works with no script).
- **Smooth scrolling:** Lenis.

The libraries are Motion, Lenis and OGL, pinned on jsDelivr. Motion and Lenis are under MIT, OGL under the Unlicense.

## Pages

**The phones' screens** are parts (`parts/screen-today.liquid`, `screen-plant`, `screen-light`, `screen-doctor`, `screen-home`). Each sits in a phone frame part (bg-neutral bezel, island, "9:41" status bar, a tab bar of inline SVG icons), built from theme classes:
- **Today:** "Good morning, Sam", three plants due today as tickable rows (round photo, name, species, ring), and "Later this week";
- **Plant:** Monty's photo, its name and species, chips (Bright light · Every 7 days · Living room), a 92% health ring, a care timeline and "Water now";
- **Light:** a half-circle gauge with its needle on "Bright, indirect", "2,400 lx · South-west window", and which plants suit the spot;
- **Doctor:** a yellowing leaf in a scanning frame, then "Likely overwatering · 82% sure" and three steps;
- **Home:** "The flat on Oudegracht", housemates' initials, who watered what ("Ana watered Fig · 2 h ago"), and vacation mode ("Away 12–19 Aug · Ana covers").

**Home** (`/`):
- **the header:** a floating pill with Features, Pricing, Help and "Get the app", adapted from `apps/desktop/gallery/header/header-floating`;
- **the hero (its own):** the headline with its marker, one sentence, the two store buttons, the rating line ("4.8 · 21,400 ratings"), and the three fanned phones (Plant, Today, Light) over the glow;
- **figures:** "310k plants on shelves", "9 in 10 still alive after a year" and "12 languages", adapted from `apps/desktop/gallery/stats/stats-divided-row`;
- **the phone story (its own):** five chapters, 01 to 05, each a kicker, a title, two sentences and its screen;
- **features:** a bento of six tiles, each with a small working piece of interface (a reminder, the needle, a scan frame, avatars, a calendar, a home-screen widget), adapted from `apps/desktop/gallery/features/features-bento`;
- **reviews (its own):** the two moving rows of cards, each with stars, the text, the name, the city and the store, under "Loved on both stores";
- **pricing:** the two plans with the monthly or yearly switch, Plus marked "Most popular" on mint, and "Compare plans →", adapted from `apps/desktop/gallery/pricing/pricing-billing-toggle`;
- **privacy in plain words (its own, short):** three promises and "Read the privacy page";
- **FAQ:** six questions, adapted from `apps/desktop/gallery/faq/faq-accordion`;
- **the download band (its own):** "Your plants are waiting.", the store buttons, the Today phone rising from the band's bottom edge with the notification, over the glow;
- **the footer:** links, store buttons and a small wordmark, adapted from `apps/desktop/gallery/footer/footer-columns`.

**Pricing** (`/pricing`): the plans with the switch (as on home); a comparison table of Free and Plus, adapted from `apps/desktop/gallery/pricing/pricing-comparison-table` (two columns); billing questions, adapted from `apps/desktop/gallery/faq/faq-two-columns`; the download band.

**Help** (`/help`): "How can we help?" with topic chips that jump to each group (its own, small); the articles by topic, adapted from `apps/desktop/gallery/faq/faq-by-topic`, each linking to its page; "Still stuck?", a support form adapted from `apps/desktop/gallery/forms/forms-contact-card`, with "We reply within a day, Monday to Friday", whose answer fragment thanks the visitor by name.

**A help article** (`/help/<article>`), a page per record: the topic chip, the title, the date it was updated, the text, "More in this topic", and a "Write to us" band adapted from `apps/desktop/gallery/cta/cta-centered-two-buttons`.

**Privacy** (`/privacy`): "Privacy, in plain words" and the date it was updated; the plain-words cards in full (its own), what Fernway keeps and what it never does; the policy in sections beside a sticky table of contents read from the same records (its own); the email of the person in charge of data.

**Datasources:**
- `navigation`;
- `stores`: label, store (app-store, google-play), url;
- `plants`, which fills the screens: name, species, photo, water_every (days), next_water, light (low, medium, bright), room, health;
- `home-chapters`: kicker, title, text, screen (today, plant, light, doctor, home);
- `home-figures`: value, label, note;
- `home-features`: title, text, size (wide, square), visual (reminders, light, identify, household, vacation, widgets);
- `reviews`: name, city, stars, text, store, date;
- `plans`, a collection shared by home and pricing: name, monthly, yearly, summary, features (list), highlighted, button;
- `pricing-compare`: feature, free, plus;
- `home-faq` and `pricing-faq`: question, answer;
- `help-articles`: title, topic (Getting started, Reminders, Plus and billing, Account and data), summary, updated, body; six records;
- `privacy-points`: title, text, kind (keep, never);
- `privacy-sections`: title, body;
- `support` (collected): name, email, device (iPhone, Android), topic, message.

## Its own blocks

The Blocks tab offers these first for a site started from Pocket:

- `hero-pocket-phones`: the headline with its marker, the store buttons, the rating, and the three fanned phones over the glow;
- `features-pocket-phone-story`: the numbered chapters with the phone that stays, a data block over a section list;
- `testimonials-pocket-review-rows`: the two moving rows of reviews, a data block over `reviews`;
- `cta-pocket-download`: the download band with the rising phone and its notification;
- `about-pocket-plain-privacy`: the plain-words privacy cards, a data block over a section list.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. About 12 images:
- **houseplants, one each, for the `plants` records:** a monstera, a pothos, a snake plant, a calathea, a fiddle-leaf fig and a fern. They show in the screens as round avatars and as the Plant screen's header;
- **a yellowing or spotted leaf,** for the Doctor screen;
- **a sunny windowsill with pots,** for the Light chapter;
- **a shelf of plants in a home,** for the Home chapter;
- **a watering can,** and **hands repotting** (no face), for the help page and the bento.

They should read as one set: daylight, pale walls or plain light backgrounds, soft greens, nothing dark or moody, no people but hands. Their crops are square and close, so they hold up as small circles.

The store buttons are the template's own neutral pills: a simple inline glyph and the store's name in text. The official App Store and Google Play badges are trademarked artwork and are not shipped; the maker can add theirs.
