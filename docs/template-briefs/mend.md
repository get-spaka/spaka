# Mend: brief

One of wave 2's standard templates: the health practice (`business`, not one of the original designs). Its motion is quiet: a figure that moves one joint at the pace of an exercise, a slow breath, an hour that fills in, soft reveals.

`mend` is a working name: several real clinics are called Mend (a UK physiotherapy practice among them), which matters only if it were the business's name; the fictional business below has its own.

## Concept

**Concept.** A practice that explains before it treats. The site is calm and warm, never clinical: a soft, generous serif on warm white, one deep lake blue, and a terracotta dot that marks where it hurts. A faceless, jointed figure, drawn in a fine line like an artist's wooden mannequin, answers a patient's first question ("Can they help with my knee?"): choose a place on it and its joints glow, breathing slowly, while the figure moves that joint through its range, the way a physiotherapist asks you to, and what is treated there opens beside it. Then come the first visit as an hour divided into its four steps, the people you will see, fees and insurance in plain words, and a request form that says when you will hear back.

**The fictional business** its texts are written for is **Tern Physiotherapy & Osteopathy**, on the bright second floor above a bike shop at 41 Ropewalk Lane (an invented street) in the North End of Halifax, Nova Scotia, ten minutes from the harbor, with a step-free entrance and an elevator. It was opened in 2018 by physiotherapist **Maren Holt** and osteopath **Théo Lachance**, who trained in Montreal; **Priya Raman** (pelvic health physiotherapy) and **Owen Achterberg** (physiotherapy after surgery, balance and persistent pain) joined later. It offers physiotherapy, osteopathy, pelvic health physiotherapy, sports injuries and return to running, and recovery after surgery. Every first visit lasts an hour, one to one. No doctor's referral is needed; it bills most extended health plans directly, and handles car accident and workplace injury claims. It is open Monday to Thursday from 7:30 am to 8 pm, Friday until 4 pm and Saturday morning. A request sent through the site is answered by phone or email within one working day. The name was searched: no practice is called Tern.

The same structure suits a physiotherapy or osteopathy practice, a chiropractor, a sports medicine or rehabilitation clinic, a massage therapy practice, a pelvic health clinic, a podiatrist, or one practitioner working alone. The agent rewrites the treatments, the areas and their conditions, the people, the fees and how insurance works.

## Trends it draws on

These come from twelve sites of practices opened in November 2026: physiotherapy, osteopathy, sports and rehabilitation clinics, a naturopathy practice that was Awwwards' Site of the Day (leandra-isler.ch, through its Webflow showcase), an Awwwards nominee of December 2025 (101physio.ca), and therapy and primary care practices known for calm sites. WebFetch reads a page's text; the fonts, colors and libraries below come from each site's own HTML and stylesheets, read with curl. puresportsmedicine.com refused the connection. Each trend was seen on at least two of the sites.

1. **A soft display serif over a plain sans, instead of the clinical all-sans.** sixphysio.com (Tobias and DM Sans, "Physiotherapy that moves with you"), twochairs.com (Feijoa and Untitled Sans), parsleyhealth.com (Teodor and Euclid Circular B), asktia.com (Inferi and Basis Grotesque), n1physio.com.au (IBM Plex Serif and Inter), physiolocal.com.au (Bogart and Spline Sans Mono). Bogart, Feijoa and Teodor are all soft, rounded serifs. The older look is still there for contrast: 101physio.ca, Poppins and clinic blue (#2b7bb9).
2. **Warm off-white and oat grounds with one deep, muted color, never hospital blue.** twochairs.com (sage #50685f and clay #a28978 on #f6f4ec), parsleyhealth.com (deep teal #284849 on #f8f6f2), n1physio.com.au (a slate called "river bed" #435153, heathered olive and peach #f2d7c2 on #fdf9f6), physiolocal.com.au (sage #82a776 and near-black green #10140e on sand), sixphysio.com (plum #5c0935 on cream #fffbed), asktia.com (plum #831a4a and coral on cream #fcf4e9), leandra-isler.ch (near-black #1e211e with sand #d6bd97 and bronze).
3. **Starting from the problem: what hurts, by body area or symptom, beside the treatments.** fysioo.dk (conditions under back, knee, foot, head, shoulder, hip, elbow and hand, and "the most common cases"), asktia.com ("Symptoms we treat" as tiles beside the services), parsleyhealth.com (a grid of conditions, each with its symptoms), sixphysio.com (a "Treatment Finder" and conditions such as jaw pain and dizziness), leandra-isler.ch (four problems in the patient's own words). physiolocal.com.au and n1physio.com.au show the gap: "Conditions we treat" over cards that only name services.
4. **The first visit spelled out, step by step, with its length, and "no referral needed".** fysioo.dk (45 minutes: a conversation, an examination, the start of treatment), asktia.com ("How Tia works" in four numbered steps), spearcenter.com ("No referral or prescription is needed to book your first visit"), twochairs.com ("appointments in one week or less"), ten.co.uk (the initial assessment's price on the home page), parsleyhealth.com (a first 30-minute visit, and what to bring).
5. **Practitioners as named people, with what they see most, and a request to see one of them.** twochairs.com (cards with specialties and "Fully licensed"), spearcenter.com (therapists by location, each with "Request appointment" that chooses them in the form), physiolocal.com.au (cards with degrees and a "Read Bio"), n1physio.com.au (ten portraits with names and roles), leandra-isler.ch and fysioo.dk (one practitioner, a portrait and words in the first person).
6. **Insurance and price said plainly and early, and a request answered within a promised time.** spearcenter.com ("No prescription required, most insurances accepted" in the hero, and its own request form), asktia.com ("We accept most PPO insurances" just under the hero, and its membership price), physiolocal.com.au and n1physio.com.au (the health funds they bill, right after the hero), ten.co.uk (£130 for a first assessment), parsleyhealth.com (prices and insurance in its questions), leandra-isler.ch ("Termin anfragen", a request page answered "within 24 hours", with no outside booking tool).

Two smaller things were common too: quiet motion, with smooth scrolling and soft reveals (Lenis on leandra-isler.ch, physiolocal.com.au and n1physio.com.au, each with GSAP), and an advice page written by the practitioners (leandra-isler.ch's health blog, sixphysio.com's knowledge hub, n1physio.com.au's insights, oastosteopathy.co.uk's advice).

**What makes it its own:**
- **the jointed figure:** a faceless figure like an artist's wooden mannequin, drawn in a fine line, whose joints are the places the practice treats. Choosing an area lights its joints in terracotta with a slow breathing halo, opens its conditions beside it, and sets the figure moving that joint through its range: the head turns, the arm rises, the trunk bends to the side, the leg lifts, the knees bend in a small squat, the figure rises onto its toes. All of it is CSS; the figure and its list work with no script;
- **the hour, divided:** the first visit drawn as a ring of sixty minutes cut into its four steps (20, 15, 20 and 5 minutes), each arc filling in turn as the section comes into view, the step under the pointer lighting its own;
- **the fee card on the home page:** what a visit costs and how insurance pays for it, in a few plain lines, where other practices hide it behind a link;
- **the request that says what happens next:** "We call or email within one working day; nothing is booked until we confirm."

**What it leaves out:**
- clinical blue, skeletons, spines and anatomy renders;
- review-site badges and star widgets, a chat bubble, a map embed (all third-party embeds); a quiz or treatment finder (the figure answers the same question);
- a line drawn down the page as you scroll (the climbing gym's) or a thread sewn between sections (the guesthouse's), a scrolling ribbon (Corner's), italic accent words in headings (Corner's trend), pinned or sideways sections, page transitions, carousels and loaders.

## Type

Both fonts are files of the template, as `woff2` subset to Latin and Latin Extended (for names such as Théo), under the SIL Open Font License, from Google Fonts. Young Serif has one weight and no italic, so the headings have none; Inclusive Sans ships as a variable file (300 to 700) with its italic, for emphasis in long text.

| Role | Font | Setting |
|---|---|---|
| Headings | Young Serif | its one weight (400), never synthesized bold; the hero at `clamp(2.5rem, 5vw + 1rem, 5rem)`, `leading-[1.05]`, `tracking-[-0.015em]`, `text-balance`; section headings at `clamp(1.875rem, 2.5vw + 1rem, 3rem)`; small headings at 1.375 rem; sentence case |
| Large figures | Young Serif | the minutes on the hour's ring ("60"), the step numbers and the prices on the fee card, at 2.5 to 3.5 rem |
| Body | Inclusive Sans | 400, 1.125 rem, `leading-relaxed`, `text-base-content/80`, measure `max-w-[62ch]`; 1.1875 rem in a treatment's or a note's text |
| Labels, buttons, prices and hours | Inclusive Sans | 600, 0.8125 rem, sentence case with `tracking-[0.02em]` rather than spaced capitals, `tabular-nums` for prices and hours; buttons 600 at 1 rem |

Young Serif is a heavy old-style serif whose round `b` and `f` give it the tender, generous softness that Bogart, Feijoa and Teodor give the sites above. Inclusive Sans is a text face designed for accessibility and readability, with the friendly air of a contemporary grotesque and letters drawn so as not to be confused with one another: the right voice for a practice whose patients include people in their seventies and eighties.

**If a sibling template takes them:** Hedvig Letters Serif (headings, with optical sizes) with Hedvig Letters Sans (body); or Besley at 400 to 500 (headings, a soft Clarendon) with Karla (body). All four are on Google Fonts under the OFL, and none is used by wave 1 or chosen by the wave 2 briefs written so far (Atkinson Hyperlegible Next and Fraunces, considered first, went to the nonprofit and the guesthouse).

## Palette

Warm white, oat and clay, one deep lake blue, and a terracotta dot. Every pair of text and background passes WCAG AA, measured from these values: ink on warm white 14.2:1, ink on oat 12.8:1, lake on warm white 7.3:1, light text on lake 7.4:1, ink on clay 10.7:1, lake on clay 5.5:1, terracotta on warm white 4.6:1, light text on terracotta 4.8:1, light text on lake night 12.1:1.

| Variable | Value | What it is |
|---|---|---|
| `--theme-color-surface` | oklch(0.970 0.011 75) | warm white: the page |
| `--theme-color-surface-alt` | oklch(0.935 0.020 75) | oat: the figure's panel, the fee card, the form's aside |
| `--theme-color-text` | oklch(0.26 0.030 235) | slate ink, softer than black; also the figure's line |
| `--theme-color-primary` | oklch(0.43 0.065 220) | deep lake: buttons, links, the hour's longest arcs |
| `--theme-color-primary-content` | oklch(0.975 0.008 80) | light text on lake |
| `--theme-color-secondary` | oklch(0.88 0.042 55) | clay: the first visit's band, the open area's row |
| `--theme-color-secondary-content` | oklch(0.26 0.030 235) | ink on clay |
| `--theme-color-accent` | oklch(0.555 0.12 40) | terracotta: the lit joints and their breath, the step numbers, the dot after the name; marks and short labels only (4.1:1 on oat, so no small text there) |
| `--theme-color-accent-content` | oklch(0.985 0.006 85) | light text on terracotta |
| `--theme-color-neutral` | oklch(0.29 0.040 228) | lake at night: the request band and the footer |
| `--theme-color-neutral-content` | oklch(0.95 0.012 80) | light text on lake night |
| `--theme-color-border` | oklch(0.87 0.018 75) | hairlines between rows and fees |
| `--theme-radius` | 1.5rem | soft, large frames for photos and panels |

Other settings: fields and buttons at the default corners, `calc(var(--theme-radius) * 0.5)`, soft rather than pills (a pill would turn the form's note into a stadium); relief off (`--theme-depth: 0`); density spacious (`--theme-size: 0.28125rem`); fine borders (1px). The status colors are derived, as always; the form's errors use them.

It is not Margin's single green, Corner's warm paper with cobalt, nor Ember's dark room: a light, warm site whose one strong color is a blue-green that reads as calm water, not as a hospital. The Theme tab still restyles all of it: the figure's line is `currentColor` and the lit joints are `--color-accent`.

## Motion

Everything respects `prefers-reduced-motion`. In edit mode nothing moves: Upstart's stillness rule stops CSS animations and transitions, no script runs, the figure stands still with the first area open and its joints lit, and the hour's ring is whole. Each effect is turned on by an attribute, so a new section can have it too.

- **The jointed figure** (`data-body-map` on the section; CSS, plus `scripts/body-map.js` with no library):
  - the figure is an inline SVG in the part, `aria-hidden="true"`, stroked in `currentColor` at 1.25 px: ovals for the head and the two halves of the trunk, tapered capsules for the limbs, and a circle at each joint (`data-joint="knee"`, both knees sharing it). Each limb is a group nested in the one above it (upper arm, forearm, hand; thigh, shin, foot), turning about its joint (`transform-origin` set in the SVG's own units). Being faceless, it stands for front and back at once; the back's two dots sit on the trunk;
  - beside it, the areas are a list of `<details>`, one per `areas` record, each with `data-area` naming the joints it lights; the first is `open`. **In CSS alone,** `:has()` lights the joints of the open area (`[data-body-map]:has(details[data-area="knee"][open]) [data-joint="knee"]`), and of an area hovered or focused in the list;
  - **the movement** (`data-move`): the same `:has()` rule plays that area's keyframes on the figure's groups, one slow repetition every eight seconds, eased in and out like an exercise: the head turns from side to side (head and neck), the arm rises to shoulder height and lowers (shoulder and arm), the trunk bends a little to the side (back), the leg lifts outward (hip and pelvis), both knees bend in a small squat while the trunk lowers (knee), the figure rises onto its toes (ankle and foot). Only under `prefers-reduced-motion: no-preference` and `html[data-up-moving]`; otherwise the figure stands still, its joints lit;
  - the script adds what CSS cannot: a click or tap on a joint opens its area and closes the others, and on a phone scrolls the opened area into view. It writes no text. With no script the list alone is the control, which is also what screen readers use.
- **The breath** (`data-breath`, CSS only): a lit joint has a soft terracotta halo that swells and fades in time with the movement, three seconds in and five out. Same conditions; otherwise a still, faint ring. The request band's small dot beside "We reply within one working day" breathes the same way.
- **The hour** (`data-hour`, `scripts/hour.js`, Motion's `inView`):
  - a ring of sixty minutes beside the four steps, each step an arc (`<circle>` with `pathLength="60"` and a dash of its minutes, in the step's own shade: terracotta, lake, lake at 60%, clay), "60" and "minutes" in its middle in Young Serif;
  - as the section comes into view, the script empties the arcs and fills them in turn, 0.5 s each, 0.1 s apart; hovering or focusing a step thickens its arc and dims the others (CSS `:has()`, a transition under no-preference);
  - with no script, under reduced motion and in edit mode, the ring is whole. `stop` takes off the styles it set.
- **Reveals** (`data-reveal`, `scripts/reveal.js`, Motion's `inView`): a section's main elements rise a little (`y: [16, 0]`, `opacity: [0, 1]`, 0.9 s, `ease: [0.22, 1, 0.36, 1]`), its children 80 ms apart under `data-reveal="stagger"`, as in the site-scripts skill. The figure's panel rises like the rest; nothing draws itself.
- **Smooth scrolling** (`scripts/smooth-scroll.js`): Lenis, light (`lerp: 0.1`, `anchors: true`, so "Where does it hurt?" glides to the figure). Anchored sections carry `scroll-margin-top` for the sticky header.
- **The request, filled in from the link** (`data-prefill`, `scripts/prefill.js`): "Request an appointment with Maren" leads to `/book?with=maren-holt`, a treatment's button to `/book?treatment=osteopathy`, an area's to `/book?area=knee`; the script checks the matching option of the form. It does not move and writes no text; with no script nothing is checked in advance.
- **The header** is sticky on warm white at 95% with a hairline under it; it does not change as you scroll.

Libraries: Motion and Lenis, pinned on jsDelivr, under MIT. Everything else is CSS.

## Pages

The practitioners are the gallery's `team` collection and the advice notes its `blog` collection, so a team or blog block dropped later lists the same records. The form posts to `bookings`, the collection of `forms/forms-booking-appointment`. Every "Request an appointment" button leads to `/book`.

**Home** (`/`):
- **the header** (adapted from `apps/desktop/gallery/header/header-simple`): "Tern" in Young Serif with a terracotta dot after it, and "Physiotherapy & Osteopathy" small beside it on wide screens; Treatments, Practitioners, First visit, Prices & insurance and Advice; the phone as a quiet link; a "Request an appointment" button. Labels hold a third more on one line (`whitespace-nowrap`); below the width where they all fit, a menu button takes over;
- **the hero (its own):** "Unhurried care for the body you live in"; "Physiotherapy and osteopathy in Halifax's North End. An hour for every first visit, a plan you understand, and no referral needed."; Request an appointment and "Where does it hurt?"; a line in labels with the breathing dot, "We reply within one working day". Beside it, a tall photo in a 1.5 rem frame. Under both, four reassurances as a ruled row: "No referral needed", "Direct billing to most plans", "An hour for every first visit" and "Evenings and Saturday mornings" (adapted from `apps/desktop/gallery/features/features-icon-row`, without its round icons, over `home-features`);
- **where does it hurt (its own, over `areas`):** on an oat panel, the jointed figure on the left and the six areas on the right: Head, jaw and neck; Shoulder, arm and hand; Back; Hip and pelvis; Knee; Ankle and foot. Each opens to the conditions seen there most ("Runner's knee · ligament sprains · after ACL surgery · arthritis · kneecap pain"), a sentence on how the practice helps, links to the treatments that fit, and "Request an appointment about your knee". On a phone the figure stands at about 60% of the width above the list;
- **how we treat** (adapted from `apps/desktop/gallery/services/services-image-list` over `treatments`): five rows, each with a photo, the treatment's name, a sentence, "First visit 60 min · from $125" in labels, and a link to its page;
- **your first visit (its own, over `first-visit-steps`):** on clay, "An hour, start to finish", the hour's ring beside four steps: Tell us what's going on (a request; we call within one working day); The conversation (20 minutes on your history, your work, your sleep and what you want back); The assessment (15 minutes: how you move, then hands-on); Treatment and a plan you understand (20 minutes of treatment, then 5 on your exercises, which arrive by email, and how many visits to expect). Then "More about your first visit";
- **the people you'll see** (adapted from `apps/desktop/gallery/team/team-portrait-grid` over `team`): four tall portraits in soft frames (or initials on clay), each with the name, the role and a "Sees most" line, linking to their page;
- **prices and insurance, in brief (its own fee card, adapted from `apps/desktop/gallery/pricing/pricing-session-rates` over `fees`, the featured ones):** "Plain fees. Insurance, handled." with three lines (no referral needed; we bill most extended health plans directly; receipts by email for the rest), beside an oat card of four fees with their minutes, then "All fees and how insurance works";
- **in our patients' words** (adapted from `apps/desktop/gallery/testimonials/testimonials-headline-quote` over `testimonials`): one large quote and two smaller ones, each with a short headline ("I finally understood my back"), a first name and what they came in for. These are invented: see What varies;
- **the request band** (adapted from `apps/desktop/gallery/cta/cta-dark-panel`, on lake night): "Tell us what's going on. We'll take it from there.", Request an appointment, the phone, and the breathing dot beside "We reply within one working day";
- **the footer** (adapted from `apps/desktop/gallery/footer/footer-local-shop`, without its map placeholder, on lake night): the name, the address with "Get directions" (a link to a map's address, never an embed), the phone and email, the hours from `hours`, the links from `navigation`, "Not an emergency service: in an emergency, call 911", and Upstart's credits link.

**Request an appointment** (`/book`):
- the title, and "Tell us what's going on and when suits you. We call or email within one working day to set a time; nothing is booked until we confirm.";
- **the request form (its own styling, adapted from `apps/desktop/gallery/forms/forms-booking-appointment` over `bookings`),** in four numbered steps: 1. What for: Physiotherapy, Osteopathy, Pelvic health or "Not sure yet" as cards; who you would like to see ("No preference" first, then the four); a first visit or a returning patient. 2. When suits you: weekday mornings, weekday afternoons, evenings, Saturday morning or any time. 3. Where it hurts (the six areas or "Not sure", optional) and a short note (optional, 600 characters: "No need for your full history; we'll ask at your visit"). 4. Your name, email and phone. "Send my request". Beside it on a desktop, a sticky oat aside: the hours, the phone ("Prefer to call?") and "This form isn't for emergencies";
- **its answer** (the `bookings-thanks` fragment): "Thank you, Ana. Your request is with us: we'll call or email you within one working day to set a time.";
- **finding us** (adapted from `apps/desktop/gallery/contact/contact-find-us`, without its map placeholder): the address and "Get directions", then four cards: parking, the bus, bikes (racks at the bike shop below), and access (step-free entrance, elevator, accessible restroom);
- **cancelling:** one ruled line, "Need to cancel? Call or email 24 hours ahead."

**Treatments** (`/treatments`):
- the title, "How we treat", and "Hands-on treatment, exercise you'll actually do, and clear explanations. Most plans combine all three.";
- **the treatments** (adapted from `apps/desktop/gallery/features/features-alternating` over `treatments`): alternating rows of a photo and the name, a summary, three facts (the first visit's length, the price from, "Covered by most extended health plans") and a link to its page;
- **everything we treat, by area (its own, over `areas`):** six columns, each area's name after a terracotta dot and its conditions as a list, each with its anchor (`/treatments#knee`);
- the request band.

**A treatment** (`/treatments/<treatment>`), a page per record (its own):
- the name, the summary and a photo; a ruled row of facts: first visit 60 min, follow-ups 45 min, from $125, covered by most plans;
- the text (what it is, what it helps with, what a session is like) in one reading column;
- **who does it:** the practitioners whose `treats` holds the treatment's name, as small portrait cards;
- **where it helps:** the areas whose links lead to it;
- "Request an appointment for osteopathy" (`/book?treatment=osteopathy`), then the other treatments.

**Practitioners** (`/team`):
- the title, "The people you'll see", and "Physiotherapists and an osteopath under one roof, who talk to each other about your care, with your permission.";
- **the practitioners** (adapted from `apps/desktop/gallery/team/team-bio-rows` over `team`): rows of a portrait, the name, the role, "Sees most", the days in clinic and a link to their page;
- **how we work (its own, over `promises`):** four promises, each under a terracotta dot: one practitioner from start to finish; never two patients at once; we explain before we treat; we refer you on when it isn't for us;
- the request band.

**A practitioner** (`/team/<person>`), a page per record (its own): the portrait, name, role and registration; "Sees most" as a list; training; languages; days in clinic; "In their words", a few paragraphs in the first person; "Request an appointment with Maren" (`/book?with=maren-holt`); their advice notes, if any.

**First visit** (`/first-visit`):
- the title, "Your first visit", and "An hour, unhurried. Here's what happens, and what to bring.";
- **the steps (its own, over `first-visit-steps`)** in full: the hour's ring larger, and a longer text for each step;
- **what to wear and bring** (adapted from `apps/desktop/gallery/features/features-checklist` over `what-to-bring`): loose clothes or shorts, your plan's details, scans or a surgeon's notes, a list of your medications, and arriving ten minutes early;
- **questions** (adapted from `apps/desktop/gallery/faq/faq-two-columns` over `first-visit-faq`): Do I need a referral? How many visits will I need? Will it hurt? Can I bring someone? Do you see children? What if I need to cancel?;
- the request band.

**Prices & insurance** (`/prices`):
- the title, "Prices and insurance", and "What a visit costs, and how your plan pays for it.";
- **the fees** (adapted from `apps/desktop/gallery/services/services-price-list` over `fees`): grouped by treatment, each with its minutes, a dotted leader and its price in tabular figures;
- **how insurance works (its own):** on oat, three columns, extended health plans (we bill most directly; you pay only what your plan doesn't), car accident claims, and workplace injuries, then "Paying yourself" (card or debit at the clinic, a receipt by email);
- **cancelling:** "24 hours' notice, or half the fee";
- **questions** (adapted from `apps/desktop/gallery/faq/faq-accordion` over `prices-faq`): Does my plan need a doctor's note? Is osteopathy covered? Can I use a health spending account? Do you charge for a missed visit?;
- the request band.

**Advice** (`/advice`):
- the title, "Notes from the treatment room", and a line on who writes them;
- **the notes** (adapted from `apps/desktop/gallery/blog/blog-side-covers` over `blog`): rows with a cover, the area as a label, the title, the summary, the author and the minutes. Four notes: "Ice or heat? It depends on the day" (Owen), "Running again after a calf strain" (Maren), "What an osteopath actually does" (Théo), "Back to running after a baby" (Priya).

**A note** (`/advice/<note>`), a page per record (adapted from `blog-side-covers`' `detail.liquid`): the title beside the cover, the text in a reading column, the author's card with "Request an appointment with Maren", then three more notes.

**Datasources:**
- `navigation`; `home-features` (the four reassurances);
- `treatments`: name, summary, image, first visit minutes, follow-up minutes, price from, `covered` (yes or no), body; five, in a set order;
- `areas`: name, `joint` (a choice among the joints drawn: head-neck, shoulder-arm, back, hip-pelvis, knee, ankle-foot, which also names the figure's movement), conditions (a list), a sentence, links (to treatments); six, one per area of the figure;
- `team`: name, role, registration, photo, sees (a list), treats (a list of treatment names, by which a treatment's page finds its practitioners), training, languages, days, a short line, and their words as the body; four;
- `first-visit-steps` (shared by the home and first visit pages, so one edit changes both, the ring included): title, minutes, short text, long text; four, their minutes adding up to sixty;
- `fees`: treatment, visit (first or follow-up), minutes, price, note, `featured`; six;
- `testimonials`: headline, quote, name, what they came in for; three;
- `hours`: day, opens, closes, note; seven;
- `promises`, `what-to-bring`, `first-visit-faq` and `prices-faq`;
- `blog`: title, date, author, area, cover, summary, minutes, body; four;
- `bookings`, collected: name, email, phone, treatment, practitioner, visit, when, area and a note, each a choice where the form offers one; answered by `bookings-thanks`. No page shows its records, so it has no test records.

## Bookings, payments and what stays outside

Upstart has no calendar, no payments and no embeds, so:
- **an appointment is a request,** sent through the form to `bookings`, which the practice confirms by phone or email; the page says so before and after sending. A practice with its own online booking page (Jane, Cliniko, Acuity…) links to it from every booking button instead (see What varies): a link that leaves the site, never its widget;
- **fees are paid at the clinic,** by card or debit; there is no deposit and no online payment. Direct billing and claims are described in words, not done by the site;
- **no review widgets or star badges:** patients' words are records typed in by the maker;
- **no map:** "Get directions" links to the address on a map site, beside written directions;
- **no health records:** the form asks only what it takes to arrange a visit, and a short optional note; the history is taken at the visit. The guide tells the agent never to add medical history, medication or insurance number fields to it.

## What varies

### Home (`/`), with the choices for the whole site

#### How do patients book?
- **A request form, confirmed by the practice** (as built): requests arrive in the Content tab; the practice calls or emails to set a time. Every booking button leads to `/book`.
- **On the practice's own online booking page:** every booking button (header, hero, request band, treatment and practitioner pages) links to that address and says "Book online"; `/book` keeps the hours, finding us and the phone, with a large "Book online" button in place of the form; `data/bookings/` and `scripts/prefill.js` go.
- **By phone:** every booking button becomes a call button (`tel:`); `/book` shows the number large with the hours to call in place of the form; `data/bookings/` and `scripts/prefill.js` go.

#### One practitioner, or a team?
- **A team** (as built): the practitioners page with a page each, the people section on the home page, and the form's "Who would you like to see?".
- **One practitioner:** the texts speak in the first person; the practitioners page type becomes one About page (`/about`) with the portrait, the training and their words, without record pages; the home page's people section becomes a portrait beside a note (adapted from `apps/desktop/gallery/about/about-founder-note`); the form's practitioner field and the "Practitioners" link go.

#### Where do patients come?
- **One clinic** (as built).
- **Several clinics:** the address in the footer and on `/book` becomes a card per clinic (adapted from `apps/desktop/gallery/contact/contact-locations`); the form asks "Which clinic?"; `hours` gets a clinic field.
- **To the clinic, or at home:** the form asks "At the clinic or at home?", and the first visit page says how a home visit works and which neighborhoods it reaches.

#### How do visitors find what you treat?
- **The jointed figure** (as built): by body area.
- **A plain list:** for a practice whose work does not map onto joints (pelvic health alone, massage therapy, counseling): the figure, its panel, its movement and `scripts/body-map.js` go; the areas become columns of concerns, and `joint` is no longer used.

When adapting, the three quotes of "In our patients' words" are invented and never stay: the agent asks for real ones, given with the patients' permission, or replaces the section with the promises block (`about-mend-promises`), since some health regulators restrict testimonials.

### Request an appointment (`/book`)

No choice of its own: its form and its finding-us section follow how patients book and where they come, chosen with the home page.

When removed: delete `pages/book.liquid`, its parts, `data/bookings/`, `fragments/bookings-thanks.liquid`, `scripts/prefill.js` and its navigation record; point every booking button to the phone (`tel:`) or to the practice's booking page. The footer keeps the address, the hours and the phone.

### Treatments (`/treatments`)

No choice of its own: its buttons follow how patients book.

When removed: delete `pages/treatments/`, its parts and its navigation record. `treatments` stays for the home page's rows, which no longer link, and for the form's choices; the figure's links to treatments and the practitioners' "treats" become plain text.

### Practitioners (`/team`)

#### Do patients choose who they see?
- **Yes, by name** (as built): "Request an appointment with Maren" on each practitioner's page, and "Who would you like to see?" in the form, "No preference" first.
- **The practice matches them:** one "Request an appointment" button on every page; the form's practitioner field goes; the page says how the practice chooses ("We'll match you with the right person for what's going on").

When removed: delete `pages/team/`, its parts and its navigation record; the home page's people section stays without links, or goes if the maker shows no one; the advice notes keep their author's name as text.

### First visit (`/first-visit`)

#### How does a new patient start?
- **With an hour-long first visit** (as built).
- **With a free 15-minute call first:** the first step becomes the call, the form's first choice becomes "A free 15-minute call", and the home page's steps and ring follow, since they are the same records.

When removed: delete `pages/first-visit.liquid`, `data/what-to-bring/`, `data/first-visit-faq/` and its navigation record; the home page keeps its steps and ring without "More about your first visit".

### Prices & insurance (`/prices`)

#### How do patients pay?
- **Per visit, with direct billing to insurers** (as built).
- **Per visit; patients claim themselves:** the page says receipts come by email for their claim; the direct billing lines go, here, in the hero's reassurances and on the fee card.
- **Mostly with a prescription, through public or statutory insurance** (as in France, Germany or Belgium): the page leads with what a prescription covers and what remains to pay, then the private fees; the first visit page adds the prescription to what to bring.
- **Self-pay only:** the insurance section and questions go; the page is titled "Prices" and may offer packs of visits.

When removed: delete `pages/prices.liquid`, its parts, `data/prices-faq/` and its navigation record; the home page's fee card gives way to one line, "Ask us about fees and insurance when you call", and the prices go from the treatments' rows and pages; `fees` goes too.

### Advice (`/advice`)

No choice of its own.

When removed: delete `pages/advice/`, `data/blog/`, its navigation and footer records, and the notes listed on the practitioners' pages.

## Its own blocks

The Blocks tab offers these first for a site started from Mend:

- `hero-mend-unhurried`: the headline, two buttons, the reply line with its breathing dot and the framed photo, with the row of reassurances;
- `services-mend-body-map`: the jointed figure that moves the chosen joint, beside the areas, a data block over `areas`;
- `steps-mend-first-hour`: the hour's ring beside its steps, a data block over a section list;
- `team-mend-practitioners`: portraits in soft frames with "Sees most", a data block over `team`;
- `pricing-mend-fee-card`: the fee card beside the three insurance lines, a data block over `fees`;
- `forms-mend-appointment-request`: the request form in four steps with its aside, over `bookings`;
- `about-mend-promises`: the practice's promises under terracotta dots, a data block over a section list; the agent drops it in where testimonials cannot be.

## Images

From Wikimedia Commons and Openverse (CC0, public domain, CC BY, CC BY-SA), credited. About 22 images. Searches made while writing this brief: "physiotherapy" finds mostly clinical rooms, branded and watermarked clinic photos and anatomy renders, none usable; "woman stretching outdoors" finds a usable CC BY 2.0 set of a trainer guiding a client through stretches in a park. So the photos lean on movement and daylit places, with treatment close-ups only where a clean one is found.

- **the hero:** hands working on a shoulder or a back in daylight if a clean one exists; otherwise a person stretching by a window, or a runner's stride on a harbor path in the morning;
- **the five treatments:** an exercise with a band or guided by a practitioner (physiotherapy); hands on a neck or back (osteopathy); a pregnant woman or a new mother stretching, never intimate (pelvic health); a runner on a trail (sports injuries); someone walking by the water or climbing stairs (after surgery);
- **life the patients want back:** a cyclist, a swimmer, an older person gardening, a walk with a dog;
- **the place:** a daylit room with a wooden treatment table and a plant, a stairway or a bike shop's front;
- **the people:** four portraits only if fitting ones are found, otherwise initials on clay;
- **the advice notes:** four covers, reusing these where they fit (a runner tying a shoe, a calf stretch on a step, a stroller on a path).

To read as one set they are chosen for daylight, soft natural color and calm: warm rather than blue, uncluttered, with no logos or watermarks, no skeletons or spine renders, no posed stock smiles, and no faces outside the team. No filter is applied to them.
