# Working on Spaka

## Changes to the interface

Every change to what the maker sees (a component, an indicator, a dialog, a colour, a layout) starts as **visual proposals**: an HTML page, published as an artifact, with two to four versions drawn side by side in the app's own look (light and dark when it matters), the recommended one first. The maintainer picks one; only the picked version is built.

## Decisions and their records

- A product decision gets the next free number, `Q###`, in `docs/v2.0-decisions.md`, under the section of its subject, with who decided and the date. Code comments and test names cite that number. Before taking a number, search every open branch and pull request for it too: two pieces of work in parallel have taken the same one.
- A hard-to-reverse choice with real alternatives gets an ADR in `docs/adr/`.
- A build plan lives in `docs/plans/` with a status table, updated at each slice with its commits, and a row in `docs/plans/README.md`.
- The product's words are the ones in `GLOSSARY.md`; its English is American ("colorful").

## Checking

- The app launched for a check runs in background mode (`SPAKA_BACKGROUND=1`, as `e2e/app.ts` does): no window shown, no focus taken from the person working on the same machine.
- The templates are the `apps/desktop/templates` submodule, published from get-spaka/templates.

## Pull requests

`main` is protected: every change goes through a pull request. Its body ends with the unticked box `- [ ] Run the checks on macOS and Windows`, which runs those systems' CI when ticked.
