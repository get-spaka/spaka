# Block gallery

Ready-made page sections the maker drags into a page and the agent finds with `find_blocks`. Each block lives in `<kind>/<id>/` (id = `<kind>-<slug>`, also the folder name), with:

- `block.liquid`, copied into the project as `parts/<id>.liquid`;
- `block.json`: `name`, `kind`, `source` (where its layout comes from), `description`, `tags`, `mood` and `synonyms` (English and French) for the search, and `data` for a data block;
- for a data block, `data/_datasource.yaml` (its datasource's definition, as in a project) and `data/<id>.md`, three to six sample records (none needed for a form whose records no page shows);
- for a list of a collection with a page per record (blog, events, products), `detail.liquid`: the record page's section, reading `record`.

## Rules

`gallery.test.ts` checks them for every block.

- One root element: `<header>` for a header, `<footer>` for a footer, `<section>` otherwise.
- Tailwind 4 and daisyUI 5 classes with the theme's colours only (base, primary, secondary, accent, neutral, info, success, warning, error and their `-content`, with an opacity if needed): never `bg-blue-600`, `text-white` or `bg-[#…]`, so blocks follow any palette, light or dark.
- No script, no style, no remote address. Interactive parts work without JavaScript (`<details>`, daisyUI's collapse and dropdown); mobile first.
- A block that lists things is a data block (Q197): `"data": { "name": "faq", "family": "section" }`. Its template loops over `data.<name>` and reads no other datasource; every other block holds literal texts only, with no Liquid.
  - A **collection** (team, blog, events, menu, products, gallery, testimonials, navigation) keeps its name for the whole site: dropping a second block reuses it.
  - A **section list** (questions, features, plans, figures, logos, steps) is renamed after the page it is dropped on (`home-faq`): write `data.faq`, Upstart rewrites it.
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
- `upstart`: written by us.
