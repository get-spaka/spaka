---
name: gallery
description: How to start sections from Upstart's gallery of ready-made blocks with the find_blocks tool — headers and footers, heroes, about, features, services, key figures, team, testimonials, pictures, blog, events, menus, products, pricing, questions, contact and hours, forms, calls to action — and how a block that lists things brings its datasource. Use before writing a new page, and when the maker asks to add a section.
---

# Starting from the gallery

Upstart ships a gallery of blocks: sections written for daisyUI and the theme, readable with any palette, light or dark, and good on a phone. The maker can drag them into a page; you find them with the `find_blocks` tool.

## When

- Before writing a new page: one `find_blocks` call for all its sections, then the page.
- When the maker asks to add a section, or names a block of the gallery.
- Most sections have blocks now, a menu, opening hours, a team, events or a booking form included. Write a section yourself only when no block fits it.

## How

1. Ask for every section in one call, each with a few words in any language on what it holds and how it looks:
   `find_blocks({ sections: [{ kind: "hero", query: "calm, centred headline" }, { kind: "menu", query: "dishes by course with prices" }, { kind: "faq", query: "questions that open one at a time" }] })`
2. Write the page with `{% render '<name>' %}` where each block goes; a short name for its role (`pricing`, `reviews`).
3. Then write each part, `parts/<name>.liquid`, the hero's first (it is what the maker looks at), then the others in reading order: the block's structure and classes, with this project's own texts in place of every example. Change the structure only for what the maker asked. Keep the colour classes: they come from the theme.
4. If no block fits a section, write it yourself in the page rather than searching again.

## A block that lists things

A block that repeats something (questions, plans, team members, posts, dishes, links) reads a datasource. `find_blocks` gives you, below its template, the datasource it reads, its definition and one sample record.

- **Write the definition from the block's**, adapting labels to the site, and **this site's own records**. The sample only shows the shape: never copy its texts.
- **A collection** (`data.team`, `data.blog`, `data.products`, `data.events`) is shared by the whole site under that name. If `data/<name>/` exists already, reuse it: add to its definition only the fields the template needs, and keep its records.
- **A list of one section** (questions, plans, features, key figures, steps) belongs to its page and is named after it: `data/home-faq/` on the home page, `data/services-faq/` on /services. In the part, read it as `data["home-faq"]` (a name with a hyphen is read with brackets).
- The definition goes before the page, its records right after the page: the preview shows stand-ins until the first record is written.

## A page per record

A blog, events or products block comes with the section of its page per record. If the site has no page for that collection yet, write `pages/<name>/[<name>].liquid` from the page that lists them: its head, header and footer as they are, this section in place of its own sections, and the record's title at the start of its `<title>`: `<title>{{ record.title }} · Chez Margot</title>`.

## The navigation

Every header and footer of the gallery reads `data.navigation`, the site's one list of links:

- Write it before the header, one record per page in the menu, home first, in the site's language: `label`, `href`, `place` (header, footer, both, or social for a network's link), and `links` for a menu that opens, a list of `label` and `href`.
- Its order is the definition's `order`.
- **Each time you create a page that belongs in the menu, add its record** to `data/navigation/` and its id to the order. When you remove a page, remove its record.
