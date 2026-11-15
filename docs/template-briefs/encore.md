# Encore: brief

One of wave 2's original designs: the musician or band (`portfolio`, one of the original, animated designs). Encore is a working name.

**Why `portfolio` and not `event`:** a band's site shows a body of work, record by record, each with its own page, with videos and press around it, as a studio shows its cases; its concerts are one list among the others and change every season. `event` is for a site built around one dated event, which Marquee already covers. A maker looking for a site for their music looks among the portfolios.

## Concept

**Concept.** The website as a record shop and a tour board. Every release is a square sleeve with a black disc inside, drawn by the page: point at a sleeve, and the disc slides out and turns at 33⅓ rpm (45 for a single); open it, and the sleeve flies to its own page, where the disc rolls out as you scroll and the back of the sleeve, on paper, gives the tracklist, the credits and the liner notes. The shows are a departure board whose letters flip into place. Photos are in black and white, so the only color on the stage is the records' and one aqua stage light.

**The fictional business** its texts are written for is **Velvet Freight**, a four-piece band from Duluth, Minnesota, that plays slow-burning soul with guitars. It formed in 2019 in a rehearsal room above a marine supply store by the harbor: Nora Halvorsen (voice and electric piano), Marcus Reyes (guitar), Tom Wierzbicki (bass) and June Abernathy (drums). It has made five records, all released by the band: *First Ice* (EP, 2021), *Lake Effect* (album, 2023), *Ore Dock Sessions* (live EP, 2025), *Slow Thaw* (single, August 2026) and *Breakwater* (album, October 2026, on LP, CD and digital). It sells them on Bandcamp and is on every streaming service. In late 2026 it plays a sold-out hometown show and then tours the Upper Midwest and Ontario in February 2027 and three European cities in April, at venues of 300 to 900 people. A booking agency handles North America, another Europe, and a publicist handles the press. The band's own domain is a `.example` one, as Ember's is, so no real inbox is named; the venues and publications are invented, in real cities. Searched: no band of that name exists.

The same structure suits a singer-songwriter, a jazz trio, a DJ or producer, a classical ensemble, a choir or a small label's single artist. The agent rewrites the records, the shows, the videos and the press.

**What Upstart cannot do, and how the site does without it.**
- **No audio in the page.** The media library takes images and documents, never audio or video (`mediaKind` in `apps/desktop/src/main/media/library.ts`, decision Q169: no players in v2.0); the preview's server does not even serve an `.mp3`, and `template:image` finds only images. So a visitor hears the music where it lives: each record has a "Listen" row of links to the services (Bandcamp, Spotify, Apple Music, YouTube Music, Tidal: a `links` field, only those filled are shown), the header's Listen button leads to the featured record's row, and the footer links the band's profile on each service. If Upstart later takes audio, the release page has the place for a short preview per track.
- **No embedded videos.** The template check refuses `<video>`, `<audio>` and `<iframe>` from another site. A video is its poster (an image of `media/`), its kind and running time, and a link to it on YouTube or Vimeo, opened in a new tab.
- **No tickets or payments.** Each show links to its own ticket page, at the venue or the ticket seller (an outside page); a sold-out show has no link. Records are bought on the band's Bandcamp page (an outside page).
- **Bookings and the mailing list are requests sent through forms**, kept by Upstart: a promoter's booking request (date, city and venue, kind of show, capacity, message) and a fan's email and city. Press writes to the publicist's email.

## Trends it draws on

These come from 14 musician, band and label sites opened with WebFetch in November 2026 (Awwwards' Music & Sound category of 2025-2026, Siteinspire's Music category, Siiimple's label list), plus three seen through their Awwwards entry only (lolawilde.com and davidkushnermusic.com refused the connection; damso.com), and from the Awwwards entries of eleven of them in all. WebFetch reads a page's text, not its styles, so colors, motion and features come from each Awwwards entry's palette, tags and featured elements. Each trend was seen on at least two of them.

1. **The record as an object: the cover leads, with its kind and year, and the album is shown as a record with sides and a tracklist.** ty1official.com (the vinyl's Side A and Side B at 33⅓ RPM, its 15 tracks, and a "monster to vinyl transformation" in its Awwwards entry); openstatemusic.com (an "Interactive Album & Tracklist", numbered tracks with durations); lolawilde.com (a "3D Song Carousel", from its Awwwards entry); arresteddevelopmentmusic.com (cover cards labeled "year · type", a page per release); alexandracapitanescu.com ("Album · 2026", "Single · 2025", a release opened with previous and next); jagjaguwar.com (cover cards, a page per release with its catalog number, formats and tracklist); ninjatune.net (a grid of covers, each with LISTEN and BUY); pankow.band (album cards "year | label", each its own page); paulkalkbrenner.net (recordings filtered by year, "CD & 12" Vinyl and digital").
2. **"Listen" sends the visitor out, to every service.** paulkalkbrenner.net (Spotify, YouTube Music, Amazon Music, Deezer, iTunes, Beatport, Apple Music, Tidal); arresteddevelopmentmusic.com (Spotify, Apple Music, YouTube Music, Bandcamp, per release); pankow.band (six services under each album); alexandracapitanescu.com ("Choose a platform"); ty1official.com ("Listen now", five services); nilsfrahm.com (Spotify, Apple Music, SoundCloud, Bandcamp, Deezer, YouTube); alcestmusic.com (each cover linking to Spotify). Even the sites that play sound in the page (paulkalkbrenner.net's "Now playing" bar, openstatemusic.com's "SOUND ON_") send listeners out for the records.
3. **The shows as a ruled board: date, city, venue, and tickets at the seller's.** paulkalkbrenner.net (Date, Venue, City, a "tickets" link to Bandsintown, "View all dates"); arresteddevelopmentmusic.com ("Upcoming Shows": date, "City, Country", venue, Tickets, "All Dates →"); alcestmusic.com ("I. Date", "II. Location", "III. Venue", "IV. Links", "Buy tickets" to several sellers); ty1official.com ("Prossimi live"); openstatemusic.com (upcoming shows with date, venue and city).
4. **Contacts split by purpose, with a kit for the press.** inherited.band ("Inquiries", "Collaborations", "Booking"); alcestmusic.com (management, booking US and booking EU emails in the footer); alexandracapitanescu.com (a form whose topics are "Booking a show", "Press & interviews", "Collaboration", "Fans & other"); ty1official.com (booking by email and a press kit to download); openstatemusic.com (one email and a PDF to download).
5. **Black and white, or two tones, with big type.** paulkalkbrenner.net (#000000 and #FFFFFF only, a "year number animation", an intro animation); avara.band (#FFFFFF and #000000, WebGL); inherited.band (#CF0207 on #EEE2C5, a letter-spaced title "I N H E R I T E D"); davidkushnermusic.com (#93583B on #DBCDC1, typography and big background images); openstatemusic.com (bold capitals and a letter-spaced wordmark).
6. **Videos as cards with their kind and running time, and transitions that carry the visitor between pages.** paulkalkbrenner.net (eight videos with runtimes and "(Official Visualizer)", "(Official Video)", and animated transitions); pankow.band (video cards labeled "TV-Auftritt", "Live", "Offizielles Video"); alcestmusic.com and nilsfrahm.com (a video linked, not embedded); davidkushnermusic.com ("Page Preview & Seamless Transitions"); damso.com (its navigation's transitions, in its Awwwards entry).

**What makes it its own:**
- **the sleeve:** every record is a square sleeve with a disc inside, drawn in CSS from the theme's colors with the cover as its label, that slides out and turns at the record's own speed;
- **the flight:** a sleeve opened flies from its place in the list to the top of its own page (a view transition), and the disc there rolls out with the scroll;
- **the board:** the shows' dates, cities and venues flip into place letter by letter, like a departure board, when the board comes into view;
- **only the records are in color:** every photo is in black and white with a fine grain, the covers keep theirs;
- **front and back:** each record's page is its sleeve, the dark front with the cover, then the paper back with the sides, the credits and the notes.

**What it leaves out:**
- audio players, a sound toggle and autoplay (Upstart has no audio, and sound that starts by itself sends visitors away), embedded videos and social feeds;
- loaders and "Enter" gates, WebGL and 3D, a custom cursor;
- lyrics, fan art, a shop of its own (Bandcamp or the maker's shop is linked);
- wave 1's devices: duotone photos (Margin, Marquee), stickers and tape (Marquee), letters that stretch, rise, blur in or flicker (Marquee, Folio, Beacon, Ember), a picture following the cursor (Folio), anything pinned while the page scrolls (Pocket, Ember) or scrolling sideways (Reel), a ticker (Corner).

## Type

The three fonts are files of the template, under the SIL Open Font License, from Google Fonts (`google/fonts`, `ofl/`). None is used by wave 1.

| Role | Font | Setting |
|---|---|---|
| The name and headings | Big Shoulders (variable: optical size 10 to 72, weight 100 to 900) | optical size 72; the name at 900, uppercase, `clamp(4.5rem, 15vw, 15rem)`, `leading-[0.82]`, `tracking-tight`, on two lines if it needs them; headings at 800, uppercase, 2.5 to 6 rem with `clamp()`, `leading-[0.9]`; a record's title on its page as large as the name |
| Body | Host Grotesk | 400 and 600, 1.0625 rem, `leading-relaxed`, `text-base-content/80` on dark, the ink on paper |
| The board, tracklists and labels | Azeret Mono | 500, uppercase, `tracking-[0.06em]`, 0.75 to 0.875 rem, `tabular-nums`: the board's tiles ("FEB 12 · MINNEAPOLIS · LARKSPUR HALL"), track numbers and durations ("A3 · 4:12"), catalog numbers ("VF-005"), "Album · 2026", running times |

The board needs a fixed-width face: each character sits in its own tile. Condensed capitals let a long band name or a long city fit across a phone.

**If a sibling took them,** two other pairings, also OFL and also free of wave 1:
- Anton (headings, uppercase) with Golos Text (body) and Chivo Mono (board and labels): the same poster voice, a little heavier (Onest, first named here, is Chalk's body face);
- Gloock (headings, sentence case) with Albert Sans (body) and Spline Sans Mono (board and labels): a sleeve of the jazz age rather than a gig poster.

## Palette

The stage before the lights come up, the paper of a sleeve's back, and one aqua stage wash. Every pair of text and background passes WCAG AA, worked out from these values: bone on graphite 15.8:1, aqua on graphite 12.2:1, graphite on aqua 12.2:1, ink on bone paper 14.5:1, signal red on graphite 5.2:1, graphite on signal red 5.2:1. They are measured again with a contrast tool while building.

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.17 0.012 230) | graphite, with a cold tint: the stage, the hero, the board, the front of every sleeve |
| `--theme-color-surface-alt` | oklch(0.215 0.015 230) | a lighter graphite: the board's tiles, the video cards |
| `--theme-color-text` | oklch(0.935 0.016 85) | bone |
| `--theme-color-primary` | oklch(0.84 0.12 195) | aqua, the stage wash: the Listen button, links, the hovered row of the board, the "Out now" dot |
| `--theme-color-primary-content` | oklch(0.17 0.012 230) | graphite on aqua |
| `--theme-color-secondary` | oklch(0.925 0.02 85) | bone paper: the back of the sleeve (tracklist, credits, notes), the press page's bios, the booking form's band |
| `--theme-color-secondary-content` | oklch(0.2 0.014 230) | ink on paper |
| `--theme-color-accent` | oklch(0.64 0.2 25) | signal red, the red of a recording light: "Sold out", "Few left", the "On tour" dot; marks and short labels only, never on paper (3:1 there) |
| `--theme-color-accent-content` | oklch(0.17 0.012 230) | graphite on red |
| `--theme-color-neutral` | oklch(0.115 0.008 230) | the record's black: the discs, the header once scrolled, the footer |
| `--theme-color-neutral-content` | oklch(0.935 0.016 85) | bone |
| `--theme-color-border` | oklch(0.32 0.016 230) | hairlines between the board's rows and the tracks |
| `--theme-radius` | 0.25rem | square sleeves and tiles with a hair of rounding; the discs and the label are circles of their own |

Other settings: buttons and fields are pills (`--theme-radius-field: 9999px`), like the label of a record; relief is off (`--theme-depth: 0`); density is normal (`--theme-size: 0.25rem`); borders are fine (1px).

It stays clear of wave 1: not Beacon's violet glow, Ember's amber and oxblood, Reel's chartreuse on black, nor Marquee's pink and tangerine; its one light surface is a warm bone, not Folio's or Pocket's white. The Theme tab still restyles all of it: the discs are drawn from `--color-neutral` and the grooves' sheen from `--color-neutral-content`, so they follow any palette.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves, everything is in its final place, and every sleeve shows its disc a little out, still. Each effect is turned on by an attribute, so a new section can have it too.

- **The sleeve** (`data-sleeve`, `scripts/sleeve.js`, Motion), the signature:
  - the markup is the cover (`<img>`) and, behind it, the disc (`<span class="disc" aria-hidden="true">`): a circle drawn in CSS, a `repeating-radial-gradient` of grooves from `--color-neutral`, a still `conic-gradient` sheen from `--color-neutral-content` laid over it (the light stays put while the record turns, as on a real turntable), the cover again as a round label, and the hole in surface color;
  - the stylesheet's own state, which edit mode, reduced motion and a page with no script show: the disc 18% out of the sleeve's right edge (its foot on a phone), still, in a frame that keeps room for the disc fully out, so it never runs over the next sleeve or past the screen;
  - the script sets `data-sleeve-live`, and only then does a hovered or focused sleeve lift 8 px while its disc slides 55% out and turns (a CSS transition and a `@keyframes` turn, under no-preference): 1.8 s a turn for an album, an EP or a live record, 1.33 s for a single (`data-rpm="45"`), from the record's `type`;
  - the featured record in the hero: on load, the disc slides out of the sleeve (Motion, `x` from 0 to 55%, 1.2 s, `ease: [0.22, 1, 0.36, 1]`), then keeps turning while the hero is in view; `inView` pauses the turn off screen;
  - on a record's page (`data-sleeve="scroll"`), the disc rolls out as the first screen scrolls away: Motion's `scroll` maps the progress to `x` (0 to 60%) and `rotate` (0 to 540°), so scrolling back turns it back; on a phone it rolls down out of the sleeve, so nothing is wider than the screen;
  - `stop` removes the listeners, the scroll and `data-sleeve-live`, and resets what it set.
- **The flight** (CSS only): each sleeve in a list and the sleeve at the top of its page carry the same `view-transition-name` (`style="view-transition-name: sleeve-{{ release.id }}"`), and `@view-transition { navigation: auto }` under no-preference morphs the cover from its place in the list to its page in about 0.5 s, the rest of the page crossfading. Back, it flies home. A name is given once per page, since a name twice cancels the transition: on the home page the hero's sleeve carries it, and the same record in the row below does not. Browsers without cross-document view transitions simply change page.
- **The board** (`data-board`, `scripts/board.js`, Splitting then Motion):
  - with no script, under reduced motion and in edit mode, each row is mono capitals on a surface-alt strip crossed at mid-height by a hairline, which already reads as a board;
  - the script splits each cell (`data-flap`) into characters, which the stylesheet turns into tiles once the board has `data-board-on`, and gives the row an `aria-label` from its own text so a screen reader reads it whole;
  - when the board comes into view (`inView`), each tile shows three to eight random characters before its own, through its `data-glyph` attribute read by a `::before`, flipping on `rotateX` from the top, left to right, about 0.9 s a row and 80 ms between rows. The page's text is never changed: only the attribute is, and `stop` clears it;
  - the hero's next-show line flips the same way on load;
  - a hovered or focused row of an upcoming show turns aqua and shows "Tickets ↗" (a CSS transition).
- **Black and white** (`data-bw`, CSS only): photos take `filter: grayscale(1) contrast(1.08)`, and a fine grain lies over them: an SVG noise used as a `mask-image` over a layer of `--color-neutral` at low opacity, so it has no color of its own. Covers never take it. The grain shifts in steps (eight a second) under no-preference, and holds still otherwise. A video card's poster brings its color back on hover (a transition).
- **`data-reveal`:** headings, rows and cards rise (`y: [24, 0]`, opacity, 0.8 s) with Motion's `inView`, as in the site-scripts skill.
- **The header:** transparent over the hero, then the record's black once scrolled: a CSS scroll-driven animation from transparent to the stylesheet's own `bg-neutral/90`, which edit mode and older browsers show.
- **The release filter** on the music page (All, Albums, EPs, Singles, Live): daisyUI radio tabs, with `:has(:checked)` hiding the other sleeves in CSS. It works in edit mode too.
- **Smooth scrolling:** Lenis, light (`lerp: 0.1`).

Libraries: Motion, Lenis and Splitting, pinned on jsDelivr as the site-scripts skill lists them, under MIT. No OGL: the discs are CSS.

## Pages

**Home** (`/`):
- **the header** (adapted from `apps/desktop/gallery/header/header-dark`): "Velvet Freight" on the left; Music, Shows, Videos, Press and Contact; an aqua "Listen" pill leading to the featured record's listen row (`/music/<its id>#listen`, worked out from `releases`); a full-screen menu on a phone;
- **the hero (its own):** the name at poster size on graphite, "Slow-burning soul from the shore of Lake Superior", and the next show flipping in on the board's tiles ("NEXT · DEC 19 · DULUTH · THE HARBOR ROOM · SOLD OUT"); beside it the featured record (`featured` in `releases`): its sleeve with the disc sliding out and turning, "New album · Out now" with the aqua dot, *Breakwater*, the services in a row, Listen and "Buy the LP" (Bandcamp);
- **the board (its own):** "On the road", the next six shows from `events` (date, city, venue, status, tickets), then "All dates";
- **the records (its own):** the five records as sleeves in a row (two columns on a phone), each with its title and "Album · 2026", flying to its page;
- **videos (its own):** the three newest, poster, title, kind and running time, each opening on YouTube, then "All videos";
- **the band** (adapted from `apps/desktop/gallery/about/about-story-picture`): a black and white photo of the band on stage from behind, three sentences about the harbor room and the sound, and the four members with their instruments (from `team`), then "Read the full story" (the press page's long bio);
- **said of us** (adapted from `apps/desktop/gallery/logos/logos-press-quotes`): three quotes, each with its publication set as a wordmark in Big Shoulders;
- **the mailing list** (adapted from `apps/desktop/gallery/newsletter/newsletter-dark-band`): "Hear first when we come to your town", an email and a city;
- **the footer (its own):** "Encore" as a small label over "Bring Velvet Freight to your town" and a link to the booking form; the name across the width; the band's profile on each service (`navigation`, place `listen`) and its social pages (place `social`); the links; the press page and the contact page.

**Music** (`/music`):
- the title "Records", "Five records since 2021", and the filter by kind;
- **the sleeves (its own),** larger, three columns on a desktop, each with its title, kind and year, formats and its disc;
- **listen everywhere** (adapted from `apps/desktop/gallery/logos/logos-muted-row`): the service names as wordmarks, each to the band's profile there.

**A record** (`/music/<release>`, `pages/music/[releases].liquid`), a page per record:
- **the front (its own):** on graphite, the sleeve large with the disc rolling out with the scroll; the title at poster size; "Album · October 2, 2026 · Self-released · VF-005"; **listen** (`#listen`): the services filled in the record, and "Buy the LP" with its formats ("LP · CD · Digital");
- **the back (its own):** on bone paper, the tracklist as "Side A" and "Side B" with each track's number and duration in mono and the running time (one list, "Tracks", when the record has no side B), the credits beside it (written by, produced by, recorded at, mixed by, mastered by, artwork by), then the liner notes (the record's text);
- **videos from this record:** those of `videos` whose `release` is this record, as on the home page;
- **the next record:** its sleeve and title, "Next record →".

**Shows** (`/shows`):
- the title "Shows" and the tour's line ("The Breakwater tour: the Midwest and Ontario in February, Europe in April");
- **the board (its own),** every upcoming show, grouped by month, with the opening act, doors and ages in a second line;
- **past shows:** a `<details>` per year, plain rows without links. A show moves from upcoming to past by itself: Liquid compares its date with today's (`"now" | date: "%Y-%m-%d"`) on every request in the Node and Cloudflare exports; a static export fixes the split on the day it is made;
- **bring us to your town** (adapted from `apps/desktop/gallery/cta/cta-split-image`), a black and white crowd photo, to the booking form;
- the mailing list again.

**Videos** (`/videos`):
- the title, then the featured video large: poster, title, kind, date, running time, director, "Watch on YouTube ↗";
- **every video (its own block, as on the home page),** newest first;
- "More on our YouTube channel" (the `social` record).

**Press** (`/press`):
- the title "Press" and a line ("Everything you need to write about us. Questions go to our publicist.") with the publicist's name and email;
- **the bios:** short (about 50 words) and long (about 250 words), on bone paper, to copy as they are;
- **the facts** (adapted from `apps/desktop/gallery/about/about-facts-inline`): from Duluth, Minnesota; four members; the sound in words rather than other artists' names ("soul ballads played loud by a guitar band"); the newest record; booking;
- **quotes** (adapted from `apps/desktop/gallery/testimonials/testimonials-masonry-columns`): every quote of `quotes`, with publication, writer and a link;
- **press photos** (adapted from `apps/desktop/gallery/gallery/gallery-square-grid`): four photos, each with its caption, its photographer's credit and "Download" (a `download` link to the file in `media/`). The template's samples name their real authors from Commons, so no photo is misattributed;
- **contacts:** press and management, from `contacts`.

**Contact** (`/contact`):
- the title "Contact" and "Booking, press, or just hello";
- **who to write to** (adapted from `apps/desktop/gallery/contact/contact-three-cards`): booking for North America and for Europe (each agent's name, agency and email), press, management, and a general address, from `contacts`;
- **book the band** (`#booking`, adapted from `apps/desktop/gallery/forms/forms-booking-appointment`): name, email, phone, the date, the city and venue or event, the kind of show (club show, festival, private event, something else), the expected capacity and a message; beside it, **for promoters** (adapted from `apps/desktop/gallery/features/features-checklist`): four on stage, sets of 60 to 90 minutes, what the band brings and what it needs. The answer says the agent replies within a week;
- the mailing list again.

**Datasources:**
- `navigation`, its `place` choices extended with `listen` (the band's profile on each service);
- `releases`: title, type (Album, EP, Single, Live), date, label, catalog, cover, formats (a list), `side_a` and `side_b` (lists of "title · 4:12"), credits (a list of "role · name"), listen (links: one per service), buy (a link), summary, `featured`, and the liner notes as the body; five, newest first;
- `events`, labeled Shows, named and shaped like the gallery's collection so the Blocks tab's event blocks show it too: title (the city), region (state or country), date, time (doors), place (the venue), summary (who opens, ages), price, status (On sale, Few left, Sold out, Free), booking (the ticket link); nine upcoming from December 2026 to April 2027 and six past ones of 2026;
- `videos`: title, kind (Official video, Live session, Visualizer, Documentary), date, runtime, poster, url, release (a record's id, or empty), director, `featured`; six;
- `team`: the four members, with role (their instruments), a line and a photo;
- `quotes`: quote, publication, writer, link, date; five, from invented publications;
- `press-photos`: image, caption, credit; four;
- `contacts`: purpose, name, company, email; five;
- `contact-rider`: the promoters' list;
- `bookings` and `newsletter`: collected, each with its thank-you fragment.

## Its own blocks

The Blocks tab offers these first for a site started from Encore:

- `hero-encore-sleeve`: the name at poster size and the featured record's sleeve with its disc sliding out, its listen links and two buttons, a data block over `releases` (the page's own hero adds the next show from `events`, which a block reading one datasource leaves out);
- `events-encore-board`: the shows as a flipping departure board, a data block over `events`;
- `gallery-encore-sleeves`: records as sleeves whose discs slide out and turn, each flying to its page, a data block over `releases`;
- `gallery-encore-videos`: videos as posters with their kind, running time and a link out, a data block over `videos`;
- `footer-encore-encore`: the footer with its "Encore" call to book the band, the name across the width and the listen and follow links, reading `navigation`.

## What varies

The choices that change the design and cost the agent work, page type by page type; the first option is the one recommended. Whether a page exists is not a choice: under each page type, what goes with it when the maker leaves it out.

### Home (`/`), with what every page shares

**A band or a solo artist?**
- **A band** (as built): the texts say "we"; the four members are on the home and press pages.
- **A solo artist:** the texts say "I"; one portrait replaces the band photo, the live band is named in a line, and `team` holds the players or goes. Every page's texts change voice, `parts/band.liquid` takes the single portrait, the press page's facts lose "four members".

**Where do fans buy the records?**
- **On Bandcamp** (as built): each record's Buy button goes to its Bandcamp page, and Bandcamp leads its listen links.
- **In the maker's own shop:** the Buy buttons go to each record's page in that shop; Bandcamp, if any, joins the listen links.
- **Nowhere, streaming only:** the Buy buttons and the formats line go, from the hero, the sleeves and the record pages; the listen links stay.

**How do promoters book the band?**
- **With the booking form** (as built): requests arrive in Upstart's Content tab; "Book the band" links lead to `/contact#booking`.
- **Through a booking agent:** the agent's name, agency and email replace the form; every booking link becomes a `mailto:`; `data/bookings/` and its fragment go.
- **Not booking shows:** the footer's "Encore" call and every booking link go; the contact page keeps press and management.

**How do fans hear about new shows?**
- **The mailing list form** (as built): email and city, kept by Upstart and downloadable as CSV from the Content tab.
- **The maker's newsletter service:** a "Join the list" link to its sign-up page (Mailchimp, Substack, Laylo…) in place of each form; `data/newsletter/` and its fragment go.
- **Follow links only:** no list; the footer and the shows page point to the band's social pages.

### Music (`/music`) and its records (`/music/<release>`)

**A page for each record?**
- **Yes, a page each** (as built): the sleeve flies to a page with the front, the back (sides, credits, notes) and the record's videos.
- **The discography only:** the sleeves stay, without pages; each opens its listen links instead (its Bandcamp page, or the first service). Delete `pages/music/[releases].liquid`; the sleeves lose their `view-transition-name`; the notes and credits go from `releases`.

When left out: delete `pages/music.liquid`, `pages/music/` and its navigation record. The home page's hero and sleeves keep `releases`; the sleeves open their listen links; the header's Listen button leads to the hero's listen row (`/#listen`).

### Shows (`/shows`)

**How do fans get tickets?**
- **A ticket link for each show** (as built), at the venue or the ticket seller; a sold-out show has none.
- **One page for the whole tour:** the band's page on Bandsintown or Songkick, or a promoter's; the rows lose their links and the board ends on "Tickets for every date ↗".
- **At the door:** no links; each row shows its door price (`price`), and the board says "Tickets at the door".

When left out: delete `pages/shows.liquid`, `parts/past-shows.liquid` and its navigation record. The home page's board keeps `events` and loses "All dates"; for a maker who plays no shows, the board, the hero's next-show line and `data/events/` go too, and the hero keeps the record alone.

### Videos (`/videos`)

No choice: a video is always a poster and a link out.

When left out: delete `pages/videos.liquid` and its navigation record. The home page's videos and each record's videos stay; "All videos" points to the band's YouTube channel (the `social` record). With no videos at all, `data/videos/` and every videos section go.

### Press (`/press`)

**A press kit to download?**
- **The page is the kit** (as built): bios to copy, facts, quotes, photos to download and the contacts.
- **The page and a PDF:** a "Download the press kit (PDF)" button to the maker's file, which they add to the media library (it takes documents); until they do, the button is left out rather than linked to nothing.

When left out: delete `pages/press.liquid`, `parts/bios.liquid`, `parts/press-photos.liquid`, `data/press-photos/` and its navigation record. The home page's quotes stay; "Read the full story" goes; the footer's press link becomes the publicist's email (`mailto:`).

### Contact (`/contact`)

Its booking section follows how promoters book, and its mailing list how fans hear about shows, both chosen with the home page.

When left out: delete `pages/contact.liquid`, `parts/contacts.liquid`, `parts/booking.liquid`, `data/contact-rider/`, `data/bookings/`, `fragments/booking-thanks.liquid` and its navigation record. Every booking link becomes the booking agent's email (`mailto:` from `contacts`), and the footer names the press and booking emails.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. About 24 images. A search for concert stage lights and one for the Duluth harbor each found ten free images (`pnpm template:image find`):
- **the covers (5), the only ones in color,** square crops strong enough to read small: the harbor's pier lighthouse at the blue hour, sunset on lake ice, a freighter's lit hull at night, northern lights over the water, tail lights on a snowy highway;
- **the stage (6):** stage lights through haze, a crowd seen from behind, a guitarist and a drummer as silhouettes, a small club stage before the doors open, a hand on a bass neck;
- **the band (5):** the band on stage from behind (the home page's photo), and for the four members their instruments close up (an electric piano's keys, a hollow-body guitar, a bass headstock, a drum kit), so no stranger's face stands for a member; the maker's own portraits replace them;
- **the road and the harbor (4):** a van on a winter highway, a motel at night, the lift bridge in fog, an ore dock;
- **the studio (2):** a mixing desk, tape reels;
- the videos' posters and the press photos reuse these.

Shown in black and white with the grain (`data-bw`), so they are chosen for light and shape, low-key, at night or in winter light, with no recognizable face; only the covers are chosen for their color.
