---
name: gallery
description: How to start a section from Upstart's gallery of ready-made blocks with the find_blocks tool — headers, heroes, features, testimonials, pricing, questions and answers, calls to action, footers. Use when building a page with such sections, or when the maker asks to add one.
---

# Starting from the gallery

Upstart ships a gallery of blocks: sections written for daisyUI and the theme, which look right with any palette. The maker can drag them into a page; you find them with the `find_blocks` tool.

## When

- A section of a common kind (pricing, testimonials, questions, features, a call to action, a footer) where one of the gallery's layouts fits what the maker wants.
- The maker asks to add such a section, or names a block of the gallery.
- Not for what is specific to this business (a menu, opening hours, a map, a timeline): write those yourself.
- One search per section you want, with a few words on what it holds and how it looks, in any language: `find_blocks({ kind: "pricing", query: "three plans, middle one highlighted" })`. If nothing fits, write the section yourself rather than searching again.

## How

1. A block becomes a shared part: write it to `parts/<name>.liquid`, a short name for its role (`pricing`, `reviews`), and include it with `{% render '<name>' %}` where it goes in the page.
2. Replace every example text with this project's own: names, prices, questions, quotes. Keep the structure and classes; change them only for what the maker asked.
3. Keep the block's colour classes: they come from the theme.

On a new page, keep the page coming first: write the page with its `{% render %}` lines in place, then search and write the parts it includes, in reading order. The preview shows a part as soon as it exists.

A section you write yourself goes in the page, not in a part, unless several pages share it.
