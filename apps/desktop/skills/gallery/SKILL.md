---
name: gallery
description: How to start sections from Upstart's gallery of ready-made blocks with the find_blocks tool — headers, heroes, features, testimonials, pricing, questions and answers, calls to action, footers. Use before writing a new page, and when the maker asks to add such a section.
---

# Starting from the gallery

Upstart ships a gallery of blocks: sections written for daisyUI and the theme, readable with any palette, light or dark, and good on a phone. The maker can drag them into a page; you find them with the `find_blocks` tool.

## When

- Before writing a new page: one `find_blocks` call for all its common sections, then the page.
- When the maker asks to add a section of a common kind, or names a block of the gallery.
- Not for what is particular to this business (a menu, opening hours, a map, a timeline): write those yourself, in the page.

## How

1. Ask for every section in one call, each with a few words in any language on what it holds and how it looks:
   `find_blocks({ sections: [{ kind: "hero", query: "calm, centred headline" }, { kind: "pricing", query: "three passes, middle one highlighted" }, { kind: "faq", query: "questions that open one at a time" }] })`
2. Write the page with `{% render '<name>' %}` where each block goes; a short name for its role (`pricing`, `reviews`).
3. Then write each part, `parts/<name>.liquid`, the hero's first (it is what the maker looks at), then the others in reading order: the block's structure and classes, with this project's own texts in place of every example (names, prices, questions, quotes). Change the structure only for what the maker asked. Keep the colour classes: they come from the theme.
4. If no block fits a section, write it yourself in the page rather than searching again.
