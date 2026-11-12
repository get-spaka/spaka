---
name: gallery
description: How to start sections from Upstart's gallery of ready-made blocks with the find_blocks and use_block tools — headers and footers, heroes, about, features, services, key figures, team, testimonials, pictures, blog, events, menus, products, pricing, questions, contact and hours, forms, calls to action — and how a block that lists things brings its datasource and sample records. Use before writing a new page, and when the maker asks to add a section.
---

# Starting from the gallery

Upstart ships a gallery of blocks: sections written for daisyUI and the theme, readable with any palette, light or dark, and good on a phone. The maker can drag them into a page; you find them with `find_blocks` and put them in with `use_block`, which places them exactly as a drag does.

## When

- Before writing a new page: one `find_blocks` call for all its sections, then one `use_block` call that creates the page with them.
- When the maker asks to add a section, or names a block of the gallery: `use_block` with that page and the one block.
- Most sections have blocks now, a menu, opening hours, a team, events or a booking form included. Write a section yourself only when no block fits it.

## How

1. Ask for every section in one call, each with a few words in any language on what it holds and how it looks:
   `find_blocks({ sections: [{ kind: "hero", query: "calm, centred headline" }, { kind: "menu", query: "dishes by course with prices" }, { kind: "faq", query: "questions that open one at a time" }] })`
   It answers with each block's id, what it holds, its mood, and what a block that lists things lists; never its template.
2. Put the chosen blocks in, in reading order, each named after its role on the site:
   `use_block({ page: "pages/index.liquid", title: "Chez Margot", description: "…", lang: "fr", blocks: [{ block: "header-dark", name: "header" }, { block: "hero-editorial", name: "hero" }, { block: "menu-courses", name: "menu" }, { block: "footer-local-shop", name: "footer" }] })`
   - Each block becomes a shared part, `parts/<name>.liquid`, numbered if the name is taken, and its `{% render %}` line goes into the page, a banner and header at the top, a footer at the end.
   - A page that does not exist yet is created with the site's head, header and footer; give its title and description, in the site's language, and the language for the site's first page.
3. Then, part by part, the hero's first (it is what the maker looks at), read the part and write this project's own texts in place of every example. Keep its structure and classes; change the structure only for what the maker asked. Keep the color classes: they come from the theme.
4. If no block fits a section, write it yourself in the page.

## A block that lists things

A block that repeats something (questions, plans, team members, posts, dishes, links) reads a datasource, and `use_block` writes it with the gallery's sample records:

- **A collection** (`data.team`, `data.services`, `data.menu`, `data.blog`, `data.products`, `data.events`, `data.testimonials`, `data.gallery`, `data.hours` for the opening hours) is shared by the whole site under that name. If `data/<name>/` exists already, it is reused: its records kept, only the fields the block needs added to its definition.
- **A list of one section** (questions, plans, features, key figures, steps) belongs to its page and is named after it: `data/home-faq/` on the home page, `data/services-faq/` on /services, read as `data["home-faq"]` in the part.
- **Replace every sample with this site's own records**: rewrite them, add records, delete those you do not need, and adapt the definition's labels to the site. At the end of your turn, Upstart renames each sample you rewrote after its title, since a record's file name is its page's address (`/events/wine-evening`): its place in the order and the links to it follow. None may stay as the gallery wrote it: before your turn ends, Upstart names those left.

## A form

A form block (contact, booking, guestbook, reviews, newsletter) brings a collected datasource, which visitors fill: `use_block` writes its definition, the fragment it answers a valid submission with, and, for a guestbook or reviews that the page shows, test records in `.upstart/test-records/`, which the preview shows and the site never publishes.

- Write in the site's language the definition's `label`s and `messages`, the form's legends and button, and the answer fragment.
- Rewrite the test records like samples, in the site's language. A contact, booking or newsletter form has none: the maker tries it in the preview's visitor view.
- Keep the form's `hx-post`, `hx-target`, `hx-swap` and `hx-status:422`, and its inputs' names: they are what Upstart collects.

## A page per record

A blog, events or products block comes with its page per record: if the site has none for that collection, `use_block` writes `pages/<name>/[<name>].liquid` from the page's frame. Read it, and write its texts like a part's.

## The navigation

Every header and footer of the gallery reads `data.navigation`, the site's one list of links:

- The site's first header or footer starts it from its pages. Check it: one record per page in the menu, home first, in the site's language: `label`, `href`, `place` (header, footer, both, or social for a network's link), and `links` for a menu that opens, a list of `label` and `href`.
- Its order is the definition's `order`.
- **Each time you create a page that belongs in the menu, add its record** to `data/navigation/` and its id to the order. When you remove a page, remove its record.
