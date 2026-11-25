# Block gallery

Ready-made page sections the maker drags into a page and the agent finds with `find_blocks`. Each block lives in `<kind>/<id>/` (id = `<kind>-<slug>`, also the folder name), with:

- `block.liquid`, copied into the project as `parts/<id>.liquid`;
- `block.json`: `name`, `kind`, `source` (where its layout comes from), `description`, `tags`, `mood` (one to three of minimal, friendly, bold, elegant, playful, warm, professional, editorial, dark, colorful) and `synonyms` (English and French) for the search, and `data` for a data block;
- for a data block, `data/_datasource.yaml` (its datasource's definition, as in a project) and `data/<id>.md`, three to six sample records (none needed for a form whose records no page shows);
- for a list of a collection with a page per record (blog, events, products), `detail.liquid`: the record page's section, reading `record`;
- for a form, `fragments/<name>.liquid`: the fragment its datasource answers a valid submission with (`answer: <name>`), copied into the project's `fragments/` unless one of that name is there.

## Rules

`gallery.test.ts` checks them for every block.

- One root element: `<header>` for a header, `<footer>` for a footer, `<section>` otherwise.
- Tailwind 4 and daisyUI 5 classes with the theme's colours only (base, primary, secondary, accent, neutral, info, success, warning, error and their `-content`, with an opacity if needed): never `bg-blue-600`, `text-white` or `bg-[#…]`, so blocks follow any palette, light or dark.
- No script, no style, no remote address. Interactive parts work without JavaScript (`<details>`, daisyUI's collapse and dropdown); mobile first.
- A block that lists things is a data block (Q197): `"data": { "name": "faq", "family": "section" }`. Its template loops over `data.<name>` and reads no other datasource; every other block holds literal texts only, with no Liquid.
  - A **collection** (team, services, blog, events, menu, products, gallery, testimonials, hours, navigation, and the forms' contact, bookings, guestbook, reviews and newsletter) keeps its name for the whole site: dropping a second block reuses it.
  - A **section list** (questions, features, plans, figures, logos, steps, values, milestones, a tasting menu) is renamed after the page it is dropped on (`home-faq`): write `data.faq`, Spaka rewrites it.
- A **form** (contact, booking, guestbook, reviews, newsletter) is a data block over a collected collection (`collected: true` in its definition), as at step 4 (Q194):
  - its `<form>` posts to its own datasource, `hx-post="/_data/<name>" hx-target="this" hx-swap="outerHTML"`, and puts the alert of a wrong submission in an element of the block named after it, `hx-status:422="target:#<id>-problems swap:innerHTML"` with `<div id="<id>-problems"></div>`;
  - every field has a `label`, each input is named after a field, and each required field has its input, with `required`, `type` and `maxlength` so that the browser catches most mistakes first; no hidden anti-spam field, which Spaka adds;
  - `review: true` when a page shows what visitors send (a guestbook, reviews), and then three to six test records in `data/` with `submitted` among their fields, which Spaka writes into the preview's `.spaka/test-records/`; none for a form no page shows (contact, booking, newsletter);
  - its answer fragment thanks the visitor, with the new record as `record`.
- Nothing floats over the rest: no badge, sticker, rating or card placed over a picture or straddling its edge, no tilted or stacked pictures. An absolutely placed element is only ever a hidden decoration (`aria-hidden="true"`), such as a blurred shape behind a hero.
- A hero alone may lay its own headline over its own picture, the move it is made for (Q440): a full-bleed photo under its text, darkened by a scrim in the theme's colors, or a panel overlapping the picture's edge. It layers them in the grid (`col-start-1 row-start-1`, or overlapping columns with `relative z-10`), never by absolute placement.
- Each hero that carries a move of the web-design skill's list has the move among its tags, in the list's words (`giant type`, `full-bleed photo`, `split screen`…), so that the agent finds it by the move it chose (Q441); `search.test.ts` checks each move finds its hero.
- Images come only from records, with a placeholder in theme colours when the field is empty:
  `{% if member.photo %}<img src="{{ member.photo }}" class="…">{% else %}<div class="… bg-gradient-to-br from-primary/20 to-accent/20">…</div>{% endif %}`.
- Sample records are neutral but believable, in English, without remote images.
- Headers and footers read `data.navigation` (Q206, Q208).

## Sources

Layouts adapted from these collections, each under the MIT licence kept beside this file, are marked by `source`:

- `hyperui`: HyperUI, `LICENSE-HyperUI`;
- `meraki-ui`: Meraki UI, `LICENSE-Meraki-UI`;
- `mamba-ui`: Mamba UI, `LICENSE-Mamba-UI`;
- `wicked-blocks`: Wicked Blocks, `LICENSE-Wicked-Blocks`;
- `spaka`: written by us.
