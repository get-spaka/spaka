---
name: site-scripts
description: How to give a Spaka site its own JavaScript and stylesheet — scripts/*.js modules with start(root) and stop(root), styles/*.css, and the packages they import by name, added with add_package (Motion, Lenis, Splitting, Embla, OGL and others) — for reveals on scroll, smooth scrolling, sliders, split text, WebGL backgrounds. Use before writing any script or stylesheet for a site.
---

# A site's own scripts and stylesheet

How much a site moves follows its character, from still to orchestrated: the web-design skill says which. Tailwind's classes, daisyUI and htmx already cover layouts, menus, accordions, tabs and forms; a script is for the movement they cannot do. Try CSS first: much movement needs no script at all (below).

Pages never hold `<script>`, `<style>` or `<link>` tags. Spaka loads, for every page:

- `styles/*.css`, the site's stylesheet, compiled with Tailwind's: `@apply`, Tailwind's functions and the theme's variables (`var(--color-primary)`, `var(--radius-box)`) work there. To restyle one of daisyUI's components (`.btn`, `.card`…), write the rule in `@layer components`: it comes after daisyUI's, and Tailwind's classes on an element still win over it. Set the properties themselves (`border-radius`, `padding-inline`), not daisyUI's own variables such as `--btn-p`, which daisyUI may change in any release;
- `scripts/*.js`, the site's modules, which Spaka imports and starts. They import packages by their name (below).

## Rules that keep the site editable

The maker edits the page in Spaka's preview with no script running and no animation playing: they see it as it is when everything has finished moving. Once published, and in the preview's visitor mode, it moves. So:

1. **The page must look right with no script.** Never hide something in the stylesheet waiting for a script to show it (`opacity: 0` on `.reveal`): set the hidden state from the script, in `start`, just before animating it.
2. **Texts stay in the templates.** A script animates the elements that are there; it never writes the site's texts, which the maker edits in place.
3. **Respect reduced motion.** Leave out movement when `matchMedia("(prefers-reduced-motion: reduce)").matches`, and wrap CSS animations in `@media (prefers-reduced-motion: no-preference)`.
4. **No colors of its own.** Colors, fonts and corners come from the theme's variables, so the Theme tab keeps restyling the whole site.
5. **Nothing from outside:** no tracking, no fetching another site's data, no keys, no script from another server. What the site uses comes from its packages.

## A module

```js
// scripts/reveal.js
import { animate, inView } from "motion";

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
      inView(el, () => {
        animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
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
- `stop(root)` undoes what `start` set up: observers, listeners, the instances it made (`lenis.destroy()`, `embla.destroy()`), styles it set, elements it moved or added. In the preview, after each change of a file, Spaka calls `stop(document)` on the page as `start` left it, puts the new rendering in its place, then calls `start(document)` again on the same elements. So `start` must work a second time:
  - Give every animated value where it starts from: `opacity: [0, 1]`, never `opacity: 1`. Motion remembers the last value it set on an element and would see nothing to animate, leaving it hidden.
  - Leave what `start` needs again: stop a WebGL loop and clear the canvas, but keep its context (no `WEBGL_lose_context`), since the same canvas starts again.
- Mark what a script acts on with a `data-` attribute (`data-reveal`, `data-split`, `data-carousel`) rather than a class: the maker's classes stay theirs.
- One module per effect, named after it: `scripts/reveal.js`, `scripts/smooth-scroll.js`, `scripts/carousel.js`.

## Packages

A module imports a package of npm's registry by its name, never by an address:

```js
import EmblaCarousel from "embla-carousel";
```

1. **Add it with `add_package` first.** Spaka checks it, installs it into the website's `node_modules` and writes it into `package.json`. Never write `package.json`'s dependencies, never run npm or pnpm: Spaka undoes it. A script that imports a package not installed is told to you as you write it.
2. **Import it by its name, or a path inside it:** `import { OrbitControls } from "three/addons/controls/OrbitControls.js"`. Spaka makes one module of each name or path for visitors' browsers, with its licence notice, and the page's import map points the name to it. A path and its package share one copy: the addons use the page's `three`.
3. **The whole package comes with it.** Its module holds everything the name exports, whatever you import from it: prefer a small package, and look at what each weighs for visitors in the website's settings.
4. **What a browser runs.** A package written for Node, one that reads files or starts programs, does nothing in a page. A package's stylesheet is not imported: copy the rules the site needs into `styles/site.css`, with the package's name and licence in a comment. Read them in the package's files (`node_modules/lenis/dist/lenis.css`), and never write in `node_modules`.
5. **An open licence** (MIT, BSD, ISC, Apache-2.0, Unlicense): `add_package` says each package's. **Never GSAP**: its licence forbids tools that compete with Webflow, which Spaka is.

### Packages that suit a site

| Package | What for | In a module |
|---|---|---|
| `motion` | animations, reveals on scroll, scroll-linked movement, staggers | `import { animate, inView, scroll, stagger } from "motion"` |
| `lenis` | smooth scrolling | `import Lenis from "lenis"`; `new Lenis({ autoRaf: true })`, then `lenis.destroy()` in `stop` |
| `splitting` | a heading split into words or letters, to animate them one by one | `import Splitting from "splitting"`; `Splitting({ target: el, by: "chars" })` |
| `embla-carousel` | sliders and carousels, by touch and by buttons | `import EmblaCarousel from "embla-carousel"`; `EmblaCarousel(viewport, { loop: true })`, then `.destroy()` |
| `ogl` | a light WebGL background, a shader | `import { Renderer, Camera, Program, Mesh, Triangle } from "ogl"`; the renderer on a `<canvas data-shader aria-hidden="true">`, its loop stopped in `stop` |

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

### A site's older libraries

A site made before packages may still list libraries in `scripts/libraries.json`, its modules using their globals (`Motion.animate`). Spaka no longer loads them: add each with `add_package`, import what the modules use by its name (`import { animate } from "motion";`, then `animate(…)` for `Motion.animate(…)`), and remove the file.

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

The preview's visitor mode is where the page moves; the maker opens their site in it. An error in a module, or a package whose module Spaka could not make, is reported among the page's errors, which `look_at_preview` shows you: look once after writing a script.

A look sees the page as a visitor does, once it has settled, and its `steps` act on it first, as a visitor would. To see what a script does, do what starts it:

- an entrance or a scroll-driven effect: end the look on its part with `at` (the page is scrolled to it, as a visitor scrolls, so the animation plays);
- a hover effect, a menu, an accordion, a dialog: a `hover` or `click` step on it;
- a carousel or a menu worked with the keyboard: `press` steps ("Tab", "ArrowRight", "Escape").

An element that a script was to reveal and that stays hidden once the page has settled is among the problems the look measures, with its file and line.
