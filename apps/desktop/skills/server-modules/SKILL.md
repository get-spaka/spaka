---
name: server-modules
description: How to give a Spaka site code that runs on its server — server/<name>.ts modules exporting load (data a page asks for with {% load %}), action (a form posted to /_server/<name>) and route (another service's call, such as a payment confirmation), with the site's records, SQL on its database with migrations, a cache, a folder for files, and the packages they import. Use before writing any server module, when a page needs data from another service, a form must do more than keep what was sent, or the maker asks for a booking, a payment, an e-mail or a calendar.
---

# Server modules

A server module is a file of the site's own code in `server/`, in TypeScript or JavaScript, that Spaka runs on the site's server: in the preview, in a process of its own, and once published, on the Node server or the Cloudflare Worker. The pages stay in Liquid: a module gives them data or answers a form, and never writes a page's HTML, so the maker keeps editing every element.

Reach for one only when templates and datasources cannot do it:

- a page shows another service's data (the weather, a feed, opening hours from an API);
- a form does more than keep what was sent: it checks places left, books, pays, sends a message;
- another service calls the site (a payment confirmation, a webhook), or the site serves a file that is not a page (a calendar in `.ics`).

A form that only keeps what visitors send stays a collected datasource posting to `/_data/<name>` (the datasources skill), with no module.

## A module

`server/weather.ts` is the module `weather`. It exports any of three functions, and two settings:

```ts
// server/weather.ts
export const cache = "30m"; // a load's results kept 30 minutes, by arguments; without it, never kept

export async function load(args: { city: string }, { env, data, sql, files }) {
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({ … })}`);
  if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
  const forecast = await response.json();
  return { city: args.city, temperature: forecast.current.temperature_2m };
}
```

- **`load(args, context)`** gives data to a page or a fragment. It returns plain data (objects, lists, text, numbers; a date becomes its ISO text).
- **`action(fields, context)`** answers a form htmx posts to `/_server/<name>`, with the fields sent (a field sent twice is a list). It returns `{ problems: ["…"] }` when something is wrong, shown in the form like a datasource's problems, or its result, shown with the fragment named by `answer`.
- **`route(request, context)`** answers any other request to `/_server/<name>` or `/_server/<name>/…`: it gets the standard `Request` and returns a `Response`. A route gets no trap field and no limit per visitor: check what calls it (a signature, a secret in the address).
- **`export const answer = "booked"`**: the fragment `fragments/booked.liquid` shows an action's result, as `answer`. Without it, a text result is shown as the message, anything else as "Thank you, it was sent."
- **`export const cache = "10m"`** (`30s`, `10m`, `2h`, `1d`): only for a `load` whose answer may be a little old.

The context:

- `env`: the site's secrets, by name (below), and nothing else of the machine's environment.
- `data`: the site's records. `await data.list("lessons")` gives a datasource's records as templates see them; `await data.add("bookings", { email, lesson })` adds one to a collected datasource, checked against its definition as a form is, and answers `{ id }` or `{ problems }`.
- `sql`: SQL on the site's own database (SQLite; D1 on Cloudflare). `await sql.all(query, ...params)`, `await sql.get(…)` (a row, or undefined), `await sql.run(…)` (`{ changes }`). Always pass values as `?` parameters, never inside the query's text.
- `files`: a folder the module may write in, outside the project, kept between restarts. Cloudflare has none: write files only when the site will be published on Node.
- `request`: for an action, the request that sent the form.

## Secrets

A key a module needs (a payment service's secret key, an e-mail service's key) is a secret: Spaka keeps it encrypted on the maker's computer, never in the project, and gives it to the modules alone, as `env.PAYMENT_KEY`.

- Ask for it with ask_secret, once, when you write the module that reads it: its name in capitals (`PAYMENT_KEY`), what it is for, and where the maker finds it, in their language. The maker types it in a card; you learn only whether it was given, never its value.
- Never write a key in a file, a page or the conversation, and never ask the maker to paste one in a message.
- Reading a secret that is not given throws an error that says so, which reaches you with the page's errors: write the page so that it still reads well without it.
- Publish writes the secrets into the exported folder's `.env`, or gives them to Cloudflare as the Worker's secrets.

## In a page

```liquid
{% load weather city: "Biarritz" %}
<p>{{ weather.city }}: {{ weather.temperature }}°</p>
```

The tag runs the module's `load` with its arguments (values or Liquid variables, `params.city`) and puts its result under the module's name, for the rest of the page. A `load` that fails leaves it empty and the page still shows: write the page so that an empty result reads well (`{% if weather %}…{% endif %}`).

A form posts to the action like this, its problems and answer swapped in place as with a datasource's form:

```liquid
<form hx-post="/_server/book" hx-target="this" hx-swap="outerHTML" hx-status:422="target:#book-problems">
  <div id="book-problems"></div>
  …
</form>
```

Spaka adds the hidden trap field against robots, and limits each visitor to five sends in ten minutes; never write either yourself.

## The database

A module's tables come from migrations, SQL files in `server/migrations/`, applied once each, in the order of their names: `0001-places.sql`, `0002-waiting-list.sql`. Spaka applies them in the preview and once published. Never change a migration once written: add the next one. A migration that fails is not applied, and its error reaches you with the page's errors.

```sql
-- server/migrations/0001-places.sql
CREATE TABLE places (lesson TEXT PRIMARY KEY, left INTEGER NOT NULL);
INSERT INTO places VALUES ('morning', 8), ('evening', 6);
```

The database also holds `records`, where a published site keeps what visitors send through collected datasources. Use `data` for those records, never SQL on `records`: in the preview they are test records, which SQL does not see.

## TypeScript

Spaka runs TypeScript as it is, with no build step and no `tsconfig.json`, so:

- import a type with `import type { Booking } from "./types.ts"`, never with a plain `import`;
- write each relative import with its extension: `./types.ts`, `./shared.js`;
- `enum` and constructor properties work; decorators and JSX do not.

## Packages

A module imports a package by its name, added first with add_package (`import { generateIcs } from "ical-generator"`), and Node's own modules with `node:` (`node:crypto`). The server's packages never reach visitors' browsers.

## What a module may not do

It reads the project and writes only in its `files` folder: it cannot start a program, read the maker's other files or write in the project. The network is open: call only the services the site needs, and send them nothing a visitor did not agree to.

## Checking

Spaka starts the modules again whenever a file of `server/` or `package.json` changes. A module's errors, a failed migration and what it prints with `console.log` reach you with the page's errors: look at the page (look_at_preview) after writing a module, try its form there, and fix what it says.
