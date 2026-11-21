---
name: site-scripts
description: How to give an Upstart site its own JavaScript and stylesheet — scripts/*.js modules with start(root) and stop(root), styles/*.css, the libraries Upstart has checked (Motion, Lenis, Splitting, Embla, OGL) and how to add another — for reveals on scroll, smooth scrolling, sliders, split text, WebGL backgrounds. Use before writing any script or stylesheet for a site.
---

# A site's own scripts and stylesheet

How much a site moves follows its character, from still to orchestrated: the web-design skill says which. Tailwind's classes, daisyUI and htmx already cover layouts, menus, accordions, tabs and forms; a script is for the movement they cannot do. Try CSS first: much movement needs no script at all (below).

Pages never hold `<script>`, `<style>` or `<link>` tags. Upstart loads, for every page:

- `styles/*.css`, the site's stylesheet, compiled with Tailwind's: `@apply`, Tailwind's functions and the theme's variables (`var(--color-primary)`, `var(--radius-box)`) work there. To restyle one of daisyUI's components (`.btn`, `.card`…), write the rule in `@layer components`: it comes after daisyUI's, and Tailwind's classes on an element still win over it. Set the properties themselves (`border-radius`, `padding-inline`), not daisyUI's own variables such as `--btn-p`, which daisyUI may change in any release;
- the libraries listed in `scripts/libraries.json`, from their address, then those in `scripts/lib/*.js`, in name order;
- `scripts/*.js`, the site's modules, which Upstart imports and starts.

## Rules that keep the site editable

The maker edits the page in Upstart's preview with no script running and no animation playing: they see it as it is when everything has finished moving. Once published, and in the preview's visitor mode, it moves. So:

1. **The page must look right with no script.** Never hide something in the stylesheet waiting for a script to show it (`opacity: 0` on `.reveal`): set the hidden state from the script, in `start`, just before animating it.
2. **Texts stay in the templates.** A script animates the elements that are there; it never writes the site's texts, which the maker edits in place.
3. **Respect reduced motion.** Leave out movement when `matchMedia("(prefers-reduced-motion: reduce)").matches`, and wrap CSS animations in `@media (prefers-reduced-motion: no-preference)`.
4. **No colors of its own.** Colors, fonts and corners come from the theme's variables, so the Theme tab keeps restyling the whole site.
5. **Nothing from outside but the libraries:** no tracking, no fetching another site's data, no keys.

## A module

```js
// scripts/reveal.js
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The elements matching `selector` in what is starting: the root itself included. */
const within = (root, selector) =>
  root === document
    ? [...document.querySelectorAll(selector)]
    : [root, ...root.querySelectorAll(selector)].filter((el) => el.matches(selector));

let stops = [];

export function start(root) {
  if (reduced()) return;
  for (const el of within(root, "[data-reveal]")) {
    el.style.opacity = "0";
    el.style.transform = "translateY(24px)";
    stops.push(
      Motion.inView(el, () => {
        Motion.animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
      }),
      () => {
        el.style.opacity = "";
        el.style.transform = "";
      },
    );
  }
}

export function stop() {
  for (const stop of stops) stop();
  stops = [];
}
```

- Move with Motion's own `x`, `y`, `scale` and `rotate` (`y: [24, 0]`), or with keyframes of the same functions (`transform: ["translateY(24px)", "translateY(0px)"]`): never to `transform: "none"`, which Motion turns into a transform that shrinks the element to nothing.
- `start(root)` is called with `document` once the page has loaded, then with each element htmx brings in. That element may itself be the one to start, hence `within`.
- `stop(root)` undoes what `start` set up: observers, listeners, library instances (`lenis.destroy()`, `embla.destroy()`), styles it set, elements it moved or added. In the preview, after each change of a file, Upstart calls `stop(document)` on the page as `start` left it, puts the new rendering in its place, then calls `start(document)` again on the same elements. So `start` must work a second time:
  - Give every animated value where it starts from: `opacity: [0, 1]`, never `opacity: 1`. Motion remembers the last value it set on an element and would see nothing to animate, leaving it hidden.
  - Leave what `start` needs again: stop a WebGL loop and clear the canvas, but keep its context (no `WEBGL_lose_context`), since the same canvas starts again.
- Mark what a script acts on with a `data-` attribute (`data-reveal`, `data-split`, `data-carousel`) rather than a class: the maker's classes stay theirs.
- One module per effect, named after it: `scripts/reveal.js`, `scripts/smooth-scroll.js`, `scripts/carousel.js`.

## Libraries Upstart has checked

Put the ones you use in `scripts/libraries.json`, exactly as below: their addresses pin a version, and their licences allow a website builder.

```json
[
  { "name": "motion", "url": "https://cdn.jsdelivr.net/npm/motion@14.9.0/dist/motion.min.js", "licence": "MIT" }
]
```

| Library | `url` | Licence | What for | In a module |
|---|---|---|---|---|
| Motion | `https://cdn.jsdelivr.net/npm/motion@14.9.0/dist/motion.min.js` | MIT | animations, reveals on scroll, scroll-linked movement, staggers | `Motion.animate`, `Motion.inView`, `Motion.scroll`, `Motion.stagger` |
| Lenis | `https://cdn.jsdelivr.net/npm/lenis@1.3.27/dist/lenis.min.js` | MIT | smooth scrolling | `new Lenis({ autoRaf: true })`, then `lenis.destroy()` in `stop` |
| Splitting | `https://cdn.jsdelivr.net/npm/splitting@1.1.0/dist/splitting.min.js` | MIT | a heading split into words or letters, to animate them one by one | `Splitting({ target: el, by: "chars" })` |
| Embla Carousel | `https://cdn.jsdelivr.net/npm/embla-carousel@8.6.0/embla-carousel.umd.js` | MIT | sliders and carousels, by touch and by buttons | `EmblaCarousel(viewport, { loop: true })`, then `.destroy()` |
| OGL | imported in the module: `import { Renderer, Camera, Program, Mesh, Triangle } from "https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm"` | Unlicense | a light WebGL background, a shader | create the renderer on a `<canvas data-shader aria-hidden="true">`; stop its loop in `stop` |

Lenis and Splitting need a few rules of CSS, from their own stylesheets: copy them into `styles/site.css`.

```css
/* Lenis (MIT) */
html.lenis, html.lenis body { height: auto; }
.lenis:not(.lenis-autoToggle).lenis-stopped { overflow: clip; }
.lenis.lenis-smooth iframe { pointer-events: none; }
/* Splitting (MIT) */
.splitting .word, .splitting .char { display: inline-block; }
```

Splitting sets `--word-index` and `--char-index` on each piece: enough to stagger them with CSS, `transition-delay: calc(var(--char-index) * 20ms)`.

**Never GSAP**: its licence forbids tools that compete with Webflow, which Upstart is.

### Another library

Only under an open licence (MIT, BSD, ISC, Apache-2.0, Unlicense), with its version pinned in the address, from `cdn.jsdelivr.net` or `unpkg.com`, its licence written in its entry. A library given by its address is loaded from there on every visit: visitors' browsers reach that server. A library's own file can also be copied into `scripts/lib/`, which keeps the site independent of that server; write its licence's name at the top of the file.

## Movement without a script

CSS alone does a great deal, in `styles/site.css`:

```css
@media (prefers-reduced-motion: no-preference) {
  /* Each section rises as it scrolls into view. */
  [data-rise] {
    animation: rise linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
  @keyframes rise {
    from { opacity: 0; translate: 0 40px; }
  }

  /* A marquee of logos or words. */
  [data-marquee] > * { animation: marquee 30s linear infinite; }
  @keyframes marquee { to { translate: -50% 0; } }
}
```

A keyframe's `from` alone is enough: the element ends as the stylesheet has it, which is how the maker sees it while editing.

## Checking

The preview's visitor mode is where the page moves; the maker opens their site in it. An error in a module, or a library that does not load, is reported among the page's errors, which `look_at_preview` shows you: look once after writing a script.

A look sees the page as a visitor does, once it has settled, and its `steps` act on it first, as a visitor would. To see what a script does, do what starts it:

- an entrance or a scroll-driven effect: end the look on its part with `at` (the page is scrolled to it, as a visitor scrolls, so the animation plays);
- a hover effect, a menu, an accordion, a dialog: a `hover` or `click` step on it;
- a carousel or a menu worked with the keyboard: `press` steps ("Tab", "ArrowRight", "Escape").

An element that a script was to reveal and that stays hidden once the page has settled is among the problems the look measures, with its file and line.
