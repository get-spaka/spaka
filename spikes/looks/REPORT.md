# Spike: where the agent looks at a page

Slice 0 of the build plan for the agent's look at pages (`~/.claude/plans/look-at-preview.md`, design Q314–Q324 in `docs/design/look-at-preview.md`), 2026-11-15.

The question: which hidden view the agent should look in, and what a look costs. Two candidates:

- **A parked view**: a `WebContentsView` added to the maker's window, out of its sight. The preview already does this under the thumbnails (Q142).
- **An offscreen window**: a `BrowserWindow` with `offscreen: true`, never shown. The "All pages" pictures already use one.

`probe.ts` opens copies of Pocket, Reel and Ember in the app, launched in the background. It tries each candidate in two settings:

- **in the app.** The checks' switches keep hidden windows drawing, so this stands for the maker's window on screen;
- **in a bare Electron** (`host/`), without those switches. The parked view's window is hidden, which stands for the maker's window minimized or covered by another app, as it often is during a 2-minute turn.

For each, the probe:

- counts the frames drawn;
- takes a picture with `Page.captureScreenshot`;
- wheels through Lenis and the pinned sections;
- reads a scroll timeline;
- presses Tab with and without focus emulation;
- lays the page out at the three screens;
- times every step and reads the view's memory.

```
node spikes/looks/probe.ts        # both views, both settings
node spikes/looks/probe.ts jump   # second round, below
```

The pictures and `results.json` go to `runs/`, which is not kept.

## Results

### Frames, and the time of a look

A look here means: wheel down to a section three quarters down the page, wait until the page settles, take the picture.

| | frames/s | look, desktop | look, tablet | look, phone |
|---|---|---|---|---|
| Parked view, maker's window on screen | 30–122 | 2.7–7.7 s | 3.5–9.9 s | 4.8–8.2 s |
| Parked view, maker's window hidden | **4–6** | **18–32 s** | **36–87 s** | **48–104 s** |
| Offscreen window, in the app | 62 | 2.1–2.9 s | 2.9–6.0 s | 0.3–2.2 s |
| Offscreen window, bare Electron | 52–62 | 2.1–2.9 s | 2.9–6.0 s | 0.3–2.2 s |

- **A hidden window starves the parked view.** It draws 4 to 6 frames a second, so Lenis, Motion and the settle wait crawl. A picture alone takes 3 to 4 s. The maker's window is often behind another app while the agent works, so this rules the parked view out.
- **The offscreen window draws at its own frame rate**, 60 a second, whether or not the maker's window is shown. With the checks' switches or without, it behaves the same.
- **First load** in the offscreen window, until the site's modules have started and the fonts are in: 0.17–0.57 s.

### What works in the offscreen window

- **`Page.captureScreenshot`** gives the screen at the size emulated, never blank:
  - desktop 1440×900;
  - phone 786×1704 (393×852 at scale 2);
  - tablet 1640×2360 at scale 2, 820×1180 at scale 1.
  - `capturePage` does not work there; that is why grid.ts paints instead.
- **Wheel events** (`Input.dispatchMouseEvent`, `mouseWheel`) go through Lenis as a person's scrolling does:
  - **Pocket**: the pinned story pins (`data-story-on`), and its chapters 1 to 4 come in turn. A section revealed on scroll goes from opacity 0 to 1.
  - **Reel**: the reel pins (`data-pinned`) and its track slides through 7 positions.
  - **Ember**: the header's scroll timeline (`animation-timeline: scroll(root)`) turns it from transparent to night.
- **Tab** (`Input.dispatchKeyEvent`) moves the focus through the links, and `:focus-visible` matches.
  - It works with or without `Emulation.setFocusEmulationEnabled`, and `document.hasFocus()` is true either way. The emulation is kept anyway: it makes the page's answer not depend on the window.
  - No window took the focus: the focused window was the same before and after, and the view's own contents never reported focus.
- **Changing screens** relayouts the page in 0.3–1.2 s, the settle wait included.

### Settling

The page counts as settled when:

- two frames have passed;
- the scroll has not moved for 200 ms;
- no finite animation is running (`document.getAnimations()`, leaving out scroll-driven ones);
- no `style` or `class` attribute has changed for 150 ms. This last rule catches Motion's JavaScript animations, which `getAnimations` does not list.

The wait is capped at 2 s.

In the offscreen window, every look settled within the cap, at 1.4–1.5 s after the last wheel event. Most of that time is Lenis easing to a stop. The endless animations (Pocket's aurora, Ember's candlelight, Reel's smoke) draw on canvases or change no attribute, so they never held the wait back.

### Second round: jump, then wheel the last screen

Wheeling all the way down is the slow part: up to 34 wheel events on a phone, and 6 s on a tablet. The second round changes the descent:

1. the view jumps, without animation, to one screen above the section;
2. it wheels the last screen, so the page sees a person's scroll arriving. Lenis takes the jump as a native scroll.

The tablet is laid out at scale 1 in this round.

| | look, desktop | look, tablet | look, phone |
|---|---|---|---|
| Pocket | 2.8 s | 2.0 s | 1.8 s |
| Reel | 2.1 s | 1.9 s | 1.7 s |
| Ember | 1.9 s | 2.1 s | 2.1 s |

What the first round checked still holds: Pocket's story pins and its chapters come in turn, the revealed section shows, Reel's reel slides through 7 positions, and Ember's header turns.

The tablet at scale 1:

- is a 0.97-megapixel picture, which Claude reads without shrinking it (the limit is about 1.15 megapixels);
- takes 60–120 ms to capture, against 300 ms to 1.5 s at scale 2;
- stays sharp enough to read every text.

The phone stays at scale 2. A 393 px picture would be too small to read text, and 786×1704 is shrunk only slightly.

### Memory

The view's renderer holds 230–320 MB while a page is open (Pocket 290–324, Reel 263–265, Ember 227–237). Q141 measured about 125 MB, but that was for lighter pages.

## Decisions for the build

- **The agent's view is an offscreen window** (`BrowserWindow`, `offscreen: true`, `show: false`, frame rate 60). The design document's branch 1a described it this way, "a hidden window, like the one that takes the 'All pages' pictures". The plan's parked `WebContentsView` is dropped.
- **Pictures come from `Page.captureScreenshot`** on the emulated screen.
- **Screens**:
  - desktop 1440×900 at scale 1;
  - tablet 820×1180 at scale 1;
  - phone 393×852 at scale 2, `mobile: true`.
- **Reaching a part**: jump to one screen above it, then wheel down the last screen.
- **The settle rule above**, capped at 2 s.
- **A look after the first load takes 1.7–2.8 s**, under the plan's 3 s target. The first look of a turn adds the page's load, 0.2–0.6 s.
- **Memory: 230–320 MB while the view is open.** It closes after 5 minutes unused, as planned.

No product question came out of the probe.
