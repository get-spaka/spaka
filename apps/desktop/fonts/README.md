# Fonts

Open fonts the Theme tab offers (Q93), all under the SIL Open Font License 1.1 (each folder has its `LICENSE`).
A font the maker picks is copied into the project's `fonts/` folder with its `@font-face` in `theme.css`, so a
published site never asks a font service for it.

The files are the Latin subset of the [Fontsource](https://fontsource.org) packages (`@fontsource-variable/<id>`,
`@fontsource/dm-serif-display`), version 5.3: `normal.woff2` and, when the family has one, `italic.woff2`.
`fonts.json` lists them with their family name, category and weight range.
