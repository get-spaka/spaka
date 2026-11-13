---
status: accepted (2026-11-13, Q233-Q243); not built yet
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
