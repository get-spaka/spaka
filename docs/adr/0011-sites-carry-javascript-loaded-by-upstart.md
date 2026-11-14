---
status: accepted (2026-11-13, Q233-Q243); the runtime, the preview and the exports built on 2026-11-13 (templates slice 1); the agent told, by its instructions and the site-scripts skill, on 2026-11-13 (templates slice 2)
---

# A site may carry JavaScript, loaded by Upstart

A site's pages hold no script tags, but a site may have JavaScript of its own in scripts/: libraries in scripts/lib/ or loaded from an address, and its own modules in scripts/*.js, each exporting a start function. Upstart loads them in the preview and once published, and calls each start function when a page loads, after each htmx swap and after each preview update. In edit mode the preview runs none of it and stops animations, so that the page is edited in its final state. Templates bring such scripts for their animations, and the agent may write new ones.

Until then a site was HTML, Liquid and CSS only, and the agent was told to write no JavaScript. The templates Matt wants, original and animated in the spirit of Awwwards or Land-book, need more than CSS can do: text split into letters, smooth scrolling, sliders, WebGL backgrounds.

## Considered options

- **CSS only**: nothing to start again after a swap, nothing to stop while editing, nothing for the agent to break, but much of what makes those designs stand out is out of reach.
- **CSS plus a few attributes of Upstart's own** (reveal on scroll, counters, parallax): one small script of ours, no code in sites, but every new effect waits for Upstart.
- **Script tags written in the pages**: no convention to learn, but every script would have to handle htmx swaps and preview updates itself, and edit mode could not stop them.

## Consequences

- One convention for every site, with or without a template: what is in scripts/ is loaded, in a known order, and started again after each swap or update.
- A library given by its address is loaded from there on every visit (Q241): the published site depends on that server, and visitors' addresses reach it.
- GSAP is left out: its licence forbids tools that compete with Webflow, which a website builder is. Upstart keeps a checked list of openly licensed libraries; an author may add others.
- An outside template's scripts run in the maker's preview and on their published site; the import shows only its name and pictures (Q248). The preview's isolation from the app (a sandboxed view, the editor's bridge kept from the page) is what protects the app, and is to be verified when building.
- Scripts that rewrite the page (splitting text, moving elements) would break editing in place, which is why edit mode runs none. A state hidden until a script reveals it must be set by the script, never by the stylesheet alone, or the page would show it hidden in edit mode.
- The agent's instructions no longer forbid JavaScript; they say where it goes and how it starts.
- As built: a module's start(root) gets the document on load, then each element htmx brings in, which may itself be the element to start; in the preview, stop(document) runs before a new rendering takes the page's place, on the page its start changed, and start(document) once the rendering is complete. A start must work again on elements it has already started: an animation says where it starts from (opacity: [0, 1], not opacity: 1, since the animation library remembers the last value it set), and a stop leaves what start needs again (a canvas keeps its WebGL context). The site's stylesheet, styles/*.css, is compiled with Tailwind's, so @apply and the theme's names work in it, in the page in the preview and into site.css once exported.
- In the preview not one script of the site is in the page outside visitor mode: Upstart's start script loads the libraries and the modules only once told the page is in visitor mode, and leaving that mode loads the page again. Comment mode is still too, as edit mode is. A drag a script of the page makes up is ignored by the editor, so that a script cannot drop a block or an image into the page. A check (`e2e/scripts.e2e.ts`) found nothing of the app within a page script's reach: no Node, no Electron, no bridge, no window it can open, no file above the project. The drags made up could not be checked there, since the app's own checks rely on them.
- A new rendering of the preview (a file written) puts the page back as the files have it, what htmx brought included, as before.
- The agent learns all of it from the site-scripts skill, which its instructions tell it to read before its first script: the rules that keep the site editable, a module written out, the checked libraries with their pinned addresses and licences (Motion, Lenis, Splitting, Embla Carousel, OGL), how to add another, and movement done in CSS alone. A check (`e2e/libraries.e2e.ts`, needing the network) loads each library from its address in visitor mode, runs the skill's example module as written, and finds no error.
- A module that fails, a library that does not load, and any other error of the page reach the agent through the preview's console, by `look_at_preview`. The page's own errors had never reached it before: the page's world is out of the preload's reach.
