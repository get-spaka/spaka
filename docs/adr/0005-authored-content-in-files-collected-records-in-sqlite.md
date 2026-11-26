# Authored content lives in project files; only records collected from visitors live in a database

A datasource stores its records in one of two places. Records the maker writes (articles, products, team members) are plain files in the project folder: the agent writes them like any other file, snapshots cover them, and they ship with every publication. Records submitted by visitors through forms are stored in SQLite where the project is published, and the app reads and manages them through the runtime's token-protected management API.

We split it this way so that a local database never has to be synchronised with a published one: content travels with the project, and visitor data never leaves the host.

## Considered options

- **SQLite for everything** (what v1 and most CMSs do): one mechanism and real queries at any volume, but content stops being readable files, escapes snapshots, and every publication has to reconcile the local database with the published one.
- **Files for everything**: impossible for visitor writes on Cloudflare Workers and on static hosting, which have no writable disk.

## Consequences

- A project with no collected datasource needs no database.
- Static hosting cannot store anything, so in a static export each form becomes a plain HTML form that posts to a third-party form service the maker chooses and then shows a thank-you page. Those submissions never appear in Spaka.
- A project with a page that displays collected records cannot be exported statically.
- A datasource is either authored or collected, never both.
- In the preview a collected datasource holds test records, written by the agent or by trying a form. They are never published: a published collected datasource starts empty.
- Changing the fields of a collected datasource that is already published needs no migration. Older records simply have no value for the new fields.
- Changing authored content on a published project means publishing again.
- Authored datasources are sized for what reads comfortably from files. Very large catalogues are out of scope in v2.0.
