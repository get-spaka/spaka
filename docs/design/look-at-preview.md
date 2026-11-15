# Looking at a page: what the agent can check

Design document, 2026-11-15. It decides how far `look_at_preview` should go beyond one picture of one screen: other screen sizes, the rest of the page, hover and click, measured problems. Matt settled it the same day, Q314 to Q324. The decisions are at the end and in `docs/v2.0-decisions.md` ("The agent looks at a page"). Each branch keeps its options; ✅ marks the one chosen.

## What the agent has today

`look_at_preview` ([upstart-tools.ts](../../apps/desktop/src/main/agent/upstart-tools.ts), `look()` in [preview.ts](../../apps/desktop/src/main/preview/preview.ts)) is an Upstart tool, the same for Claude and for Pi (ADR 0012). Given a `route`, it first moves the maker's preview to that page, then answers with three things:

- **A picture of the visible screen only.** `Page.captureScreenshot` is called with no option, so the agent never sees below the first screen.
- **The page's JavaScript errors** from the last minute: console messages of level `error`, at most 50.
- **The rendering notes**: a status other than 200, what the runtime repaired or skipped, records left out, page files with no address.

The picture comes from the maker's own view. The page is laid out at whatever the maker shows:

- **Desktop**: the width of the preview column, which depends on the maker's window. A 900 px column shows the tablet layout of a template whose links appear from `lg` (1024 px).
- **Tablet or phone**: the device the maker chose (Q110), an iPad Air (820×1180) or an iPhone 15 (393×852).

What the agent cannot do:

- see the rest of the page;
- choose a width;
- hover or click;
- see a scroll-driven section in motion.

Upstart also tells the agent some things without being asked ([turn-checks.ts](../../apps/desktop/src/main/agent/turn-checks.ts)): datasource files that do not read, samples, lorem ipsum and template texts left, pages taken off still there. On 2026-11-15 Matt chose not to add a check of page errors before the agent stops. This document keeps to that: everything here happens when the agent looks.

## What went wrong that a look would have caught

- **Header links wrapped or ran into the button** at 768–1280 px with French labels (Corner, Margin, Marquee, Pocket; releases v2 and v3). It was found by measuring outside the app, not by the agent.
- **A blank home page after a new rendering** (Pocket, Matt's Mitonne site): elements left at `opacity: 0`. A picture shows a blank screen; a measurement would say "these elements are still hidden".
- **New texts longer than the template's** break the markup. The adaptation tells the agent to look at each page for this ([adapt.ts](../../apps/desktop/src/main/templates/adapt.ts)), but it only sees the first screen, at the maker's width.
- **Pinned and scroll-driven sections** (Pocket's story, Ember's evening, Reel's reel) cannot be seen without scrolling.
- **Sections revealed on scroll** stay invisible in any picture taken without scrolling to them. A full-page picture would show them empty.

## agent-browser, and why not ship it

[agent-browser](https://github.com/vercel-labs/agent-browser) (Vercel, Apache-2.0) is a CLI in Rust. Through a daemon, it drives Chrome for Testing, which it downloads. It reads the page as text with references (`@e1`), clicks, fills, hovers, scrolls, and reads the console, network, Web Vitals and accessibility.

Electron already holds a Chromium and gives the DevTools protocol (`webContents.debugger`). The preview already uses it to emulate devices and take its pictures. Everything below can therefore be built on the preview's own page, rendered by Upstart's runtime. That keeps:

- the rendering notes;
- the overlay of files being written;
- the agent's confinement.

It also needs no second browser in the app, and no Bash access to a daemon that can open any site.

## The branches

Each branch gives the options, then a recommendation marked ➡️.

### 1. Where the agent looks (Q314)

- **a. In a view of its own that the maker does not see** ➡️ ✅. It is a hidden window, like the one that takes the "All pages" pictures ([grid.ts](../../apps/desktop/src/main/preview/grid.ts)), loading the same preview server, so it shows the overlay too.
  - The maker's preview stays where it is, following what the agent writes (ADR 0009).
  - Widths, scrolling and clicks never move it.
  - Cost: a page of its own, about 125 MB while it is open (the measure behind Q141). It closes after a while unused.
- **b. In the maker's preview, as today.** The maker sees what the agent checks, but the preview would jump between widths, scroll and open menus under the maker's eyes, and over the device the maker chose.
- **c. Mixed.** Plain looks stay in the maker's preview; other widths and interactions go to the hidden view. That means two paths to keep alike.

### 2. Which screens (Q315)

- **a. The preview's three devices, by name** ➡️ ✅: `screen: "desktop" | "tablet" | "phone"`.
  - Tablet and phone are the iPad Air and the iPhone 15 of Q110, so the agent and the maker speak of the same screens.
  - Desktop becomes a fixed laptop screen, 1440×900, instead of the column's width.
  - Desktop by default.
- **b. Any width in pixels.** More freedom, but the agent's widths and the maker's devices no longer match, and the agent has to pick breakpoints.
- **c. The three at once in every look.** Three pictures, about three times the tokens and the time.

The answer carries one picture of about 1,500 tokens with Claude, at any of the three screens: a picture is reduced to about 1.15 megapixels before it is read.

### 3. The rest of the page (Q316)

- **a. One screen at a time, at a part of the page** ➡️ ✅: `at: "parts/pricing.liquid"`, or a CSS selector.
  - Every element of the preview already carries `data-up-src="file:line:offset"`, so the agent can name a part by the file it wrote.
  - The view scrolls there as a person would (wheel events, so smooth-scroll libraries and scroll timelines follow), waits until the page settles, and takes one screen.
  - The answer says how many screens the page is tall and which parts it holds, so the agent knows what is left to see.
- **b. A picture of the whole page.**
  - A tall page is shrunk to 1,568 px: a 6,000 px page at 1440 wide becomes about 380 px wide, unreadable.
  - Sections revealed on scroll show empty.
  - Pinned sections show only one state.
- **c. Every screen in one answer.** A long page means 6 to 8 pictures, about 10,000 tokens per look.

### 4. Hover and click (Q317)

- **a. One hover or one click before the picture** ➡️: `hover: "<selector or part>"` or `click: …`.
  - It covers a menu, a burger button, a `<details>`, a tab, an accordion, a hover effect.
  - A link is not followed, since the agent looks at the other page by its route, and a form is not sent, so no record is written.
  - Each look starts from a fresh page, so no state is carried from one look to the next.
- **b. None.** Menus and hover effects stay unchecked.
- **c. A sequence of steps whose state is kept between looks**, as agent-browser does. It is closer to testing a site than to checking a design, and needs more instructions and turns. ✅ Matt chose it, which opened Q321 to Q324 below.

### 4b. The sequence of actions (Q321 to Q324)

- **How it points at an element (Q321)**: by part (`parts/header.liquid`, its first element, or `parts/header.liquid:14`) or by CSS selector, as in Q316. ✅ No text snapshot with references: the agent wrote the markup, and a snapshot would cost a few thousand tokens to redo after each change.
- **Which actions (Q322)**: hover, click, scroll, press a key (Tab, Escape), type in a field. ✅ A form is never sent, so no test record is written. Rejected: sending forms too; hover, click and scroll only.
- **Links (Q323)**: ✅ a link to another page of the website is followed, as by a person, and the answer names the page reached. A link to another website is never opened.
- **How long the state lasts (Q324)**: ✅ until the end of the turn. When the agent writes a file, the page is rendered again in place, as in the maker's preview, keeping an open menu, the scroll and the fields. Another route, or a fresh start, begins again. Rejected: reset at each file written; kept from one turn to the next.

### 5. Problems measured, in text (Q318)

Text is cheap and does not depend on the model reading a picture well. In the hidden view, Upstart can measure:

- the page wider than the screen (it scrolls sideways), and the widest element;
- text cut off or running out of its box (an `overflow: hidden` box whose text is longer);
- elements in view that stay hidden once the page has settled (`opacity: 0`, `visibility: hidden`);
- images that did not load;
- links to an address that has no page.

Each problem comes with the element's `file:line`, from `data-up-src`.

- **a. Measured at the three screens, whatever screen the picture is of** ➡️. The most common breakage is at the screen not looked at. It costs a few hundred tokens, and about a second for three layouts (to measure).
- **b. Only at the screen looked at.** ✅
- **c. None.** Pictures only.

### 6. When the agent uses all this (Q319)

Matt wants the adaptation fast, so this is a trade between time and care. Once Q318 was answered (problems measured only on the screen looked at), the recommendation became b.

- **a. No new rule** ✅ (recommended before Q318). The instructions describe the options and the agent judges. With problems measured only on the screen looked at (Q318), a phone problem is found only when the agent looks on a phone.
- **b. A rule in the adaptation** ➡️ (after Q318): each page type is looked at on desktop and phone. That adds a look of about 5 to 15 s per page type (to measure).
- **c. A rule everywhere**: phone and desktop after any change to a header, a footer or a new page.

### 7. What the maker sees (Q320)

The activity line today reads "Looking at the preview".

- **a. A line naming the page and the screen** ➡️ ✅, for example "Looking at Menu on a phone", or "… after opening the menu".
- **b. The same line, with the agent's picture** as a small image the maker can open.
- **c. Nothing new.**

## Out of scope

- A check of page errors before the agent stops (Matt, 2026-11-15).
- Accessibility audits, Web Vitals and network traces. agent-browser has them; they could come later through the same DevTools access.
- Sending a form in a look (Q322): fields may be filled, but no test record is written (`preview/test-records.ts`); the maker tries the forms.
- Landscape screens.

## Verified since

The probe in `spikes/looks/` (REPORT.md, 2026-11-15) checked what this section left open:

- An offscreen window runs Motion, Lenis and scroll timelines at 60 frames a second, whether or not the maker's window is shown, and `Page.captureScreenshot` works on it. A view parked in the maker's window does not: it drops to 4–6 frames a second once that window is hidden.
- Wheel events drive Pocket's pinned story, Reel's reel and Ember's scroll timeline as a person's scrolling does.
- A look at a part further down takes 1.7 to 2.8 s at any of the three screens, the view jumping to the screen above the part and wheeling the last one.
- The view holds 230–320 MB while open, not the 125 MB of Q141, which was measured on lighter pages.

## Decisions

| | Question | Matt's answer (2026-11-15) |
|---|---|---|
| Q314 | Where the agent looks | A view of its own, hidden from the maker |
| Q315 | Which screens | desktop 1440×900, tablet and phone of Q110, by name; desktop by default |
| Q316 | The rest of the page | One screen at a time, at a part or a selector, scrolled as a person would |
| Q317 | Hover and click | A sequence of actions whose state is kept |
| Q318 | Problems measured | Only on the screen looked at, with file:line |
| Q319 | When the agent looks on a phone | Its own judgment, no rule |
| Q320 | What the maker sees | A line naming the page, the screen and the last action |
| Q321 | Pointing at an element | By part or CSS selector, no text snapshot |
| Q322 | Which actions | Hover, click, scroll, keys, typing; a form is never sent |
| Q323 | Links | Followed within the website, never to another one |
| Q324 | How long the state lasts | Until the end of the turn; rendered again in place when a file is written |

## The tool, as decided

A sketch for the build plan, not a decision.

- **`look_at_preview` keeps its name and gains these inputs**:
  - `route`;
  - `screen` (`desktop` by default);
  - `steps`, each one of `hover`, `click`, `scroll_to`, `press`, `type`, aimed at a part or a selector;
  - `fresh`.
- **One call runs the steps in order, then answers with**:
  - one picture of the screen it ends on;
  - where the view is: page, screen, screen n of m, the parts on it;
  - the page's errors, the rendering notes and the problems measured.
- **A step that cannot be done** (no such element, hidden, covered) stops the sequence and says why, as agent-browser's clicks do.
- **The hidden view** is a window never shown, like the "All pages" pictures window. It is opened at the first look of a turn and reset at the end of the turn; it closes after a while unused.
