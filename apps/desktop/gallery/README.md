# Block gallery

Ready-made page sections the maker drags into a page. Each block lives in `<kind>/<id>/` (id = `<kind>-<slug>`, also the folder name):
`block.liquid` is copied as-is into the project as `parts/<id>.liquid`; `block.json` holds `name`, `kind`, `description`, `tags`, `mood` and `synonyms` (English and French) for the agent's search.

Rules: one root element (`<header>`, `<footer>` or `<section>`); literal texts only, no Liquid tags, scripts or styles; Tailwind 4 and daisyUI 5 classes
with theme colours only (base, primary, secondary, accent, neutral and their `-content`), so blocks follow any palette, light or dark; no remote images
(placeholders instead); interactive parts work without JavaScript; mobile first.

Layouts adapted from HyperUI (MIT), see `LICENSE-HyperUI`.
