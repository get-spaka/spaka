---
name: datasources
description: How to write datasources in an Upstart project — a definition and one Markdown file per record under data/, lists in pages with data.<name>, a page per record with pages/<folder>/[<name>].liquid, image fields from the media library, and collected datasources that forms post to (contact, guestbook, reviews, sign-ups) with their test records. Use before writing a site that lists posts, products, team members, events, dishes or anything else made of similar items, before writing any form, and when the maker asks to add, change or reorder such items.
---

# Datasources

A datasource holds the items a site lists: blog posts, products, team members, events, dishes. The maker edits them in Upstart's Content tab, as a form per record; you write them as files. Write a datasource whenever a page shows several items of the same shape, rather than writing them out in the page: the maker can then add one without asking you.

## Files

```
data/posts/_datasource.yaml     the definition
data/posts/hello-world.md       one record, its id is the file's name
data/posts/opening-day.md
pages/blog/index.liquid         a page that lists them, at /blog
pages/blog/[posts].liquid       a page per record, at /blog/hello-world
```

Write the definition first, then the page that lists the records, then the records, each with one Write call, then the record page if there is one. The preview shows three stand-in records until the first real one is written, so the page takes shape at once.

## The definition

```yaml
label: Posts
fields:
  - name: title
    kind: text
    required: true
  - name: date
    kind: date
  - name: cover
    kind: image
  - name: summary
    kind: text
  - name: tags
    kind: list
  - name: body
    kind: markdown
body: body
sort: -date
```

- `label`: the name the maker sees, in the site's language.
- `fields`: each with `name` (lowercase letters, digits and underscores), `kind`, and optionally `label`, `required: true`, and for a choice `choices: [a, b, c]`. The first text field is the record's title: the maker sees records by it.
- `body`: the markdown field written below the fields, as the file's text. Use it for the one long text of a record.
- `sort: date` lists records by a field, `sort: -date` newest or largest first. Without `sort`, records follow `order: [id, id, …]`, the order the maker sets by dragging; ids not in it come last, alphabetically. Use `order` when the order is a choice (a team, a menu), `sort` when it follows a field (posts, events).

Kinds of field:

| kind | in the file | in a template |
|---|---|---|
| text | `title: Opening day` | the text |
| markdown | Markdown | HTML, to output as it is |
| number | `price: 4.5` | a number |
| boolean | `vegan: true` | true or false |
| date | `date: 2026-11-01` | "2026-11-01", use the date filter |
| choice | `status: published` | one of `choices` |
| image | `cover: /media/croissants.jpg` | its address |
| link | `url: https://…` or `/contact` | the address |
| list | `tags: [news, bakery]` | a list of texts |
| links | `links:` then one `- label: Bread` / `  href: /bread` per link | links with a label and an address each: a menu's own links, a footer column; loop with `{% for link in item.links %}<a href="{{ link.href }}">{{ link.label }}</a>{% endfor %}` |
| email | `email: claire@example.com` | the address (collected datasources) |
| phone | `phone: +33 4 72 00 00 00` | the number as typed (collected datasources) |

There is no link between datasources: to group records, use a choice or a list field.

## A record

```markdown
---
title: Opening day
date: 2026-11-01
cover: /media/shop-front.jpg
summary: We open our doors on rue Mercière with bread from our own oven.
tags: [news]
---
After two years of work, the bakery opens on **1 November**.

## What you will find
Sourdough loaves, viennoiseries, and coffee from a local roaster.
```

- The id is the file's name: lowercase words with dashes, made from the title (`opening-day.md`). It is the record page's address, so keep it short.
- Write believable records, three to six unless asked otherwise, each complete: every required field, a real text.
- A value of the wrong kind shows empty, and a file whose fields do not read as YAML is left out of the site. Upstart says so right after you write it: fix it at once.
- Images: find them with find_images and add them with use_image, then write the address it gives (`/media/…`) in the field. Never an external address.

## YAML that does not read

A record's fields, like a definition, are YAML, which reads a plain text strictly. Put a text in double quotes as soon as it holds or starts with one of these, and write a `"` inside it as `\"`:

| In the text | Read as | Write |
|---|---|---|
| a colon and a space, French spacing included | a field inside the field | `summary: "Loaves: the menu is here"`, `summary: "Du pain : notre façon"` |
| a space and `#` | a comment, the rest lost | `title: "Room #4 opens"` |
| a start with `-`, `*`, `&`, `!`, `%`, `@`, `` ` ``, `>`, `\|`, `[`, `{`, `'` or `"` | a list, a reference, a block | `summary: "* New: our rye"` |
| `yes`, `no`, `on`, `off`, `true`, `false`, `null` alone | a yes or no, or nothing | `answer: "Yes"` |
| a number or a date meant as text | a number or a date | `code: "007"`, `version: "1.10"` |
| a list item holding a comma | two items | `tags: ["salt, pepper", bread]` |

Indent with spaces, never tabs. A long text goes below the `---` as the record's text, or after `|` on lines indented by two spaces.

## In a page

`data.<name>` is the list of records, in the definition's order. Each record has its fields, plus `id`.

```liquid
<section class="mx-auto max-w-5xl px-6 py-16">
  <h2 class="text-3xl font-bold">News</h2>
  <div class="mt-8 grid gap-6 md:grid-cols-3">
    {% for post in data.posts limit: 3 %}
      <a href="/blog/{{ post.id }}" class="card bg-base-100 border border-base-300 hover:shadow-md">
        {% if post.cover %}<figure><img src="{{ post.cover }}" class="aspect-video w-full object-cover"></figure>{% endif %}
        <div class="card-body">
          <p class="text-sm text-base-content/60">{{ post.date | date: "%-d %B %Y" }}</p>
          <h3 class="card-title">{{ post.title }}</h3>
          <p>{{ post.summary }}</p>
        </div>
      </a>
    {% endfor %}
  </div>
</section>
```

Useful Liquid: `limit:` and `offset:` on a for loop, `where: "status", "published"`, `sort: "price"`, `size`, `first`, `date: "%-d %B %Y"`, `{% if post.tags contains "news" %}`. A shared part sees only what is passed to it: `{% render 'post-card', post: post %}`, or `data` itself: `{% render 'latest', data: data %}`.

Output each field with its own `{{ post.title }}`, without filters where you can: the maker can then change that text by clicking it in the preview.

## A page per record

`pages/blog/[posts].liquid` is one page per record of `posts`, at `/blog/<id>`; the record is `record`. It is a complete page like any other:

```liquid
<!doctype html>
<html lang="en">
<head>
  <title>{{ record.title }} — Le Fournil</title>
  <meta name="description" content="{{ record.summary }}">
</head>
<body>
  {% render 'header', page: page %}
  <article class="mx-auto max-w-3xl px-6 py-16">
    <p class="text-sm text-base-content/60">{{ record.date | date: "%-d %B %Y" }}</p>
    <h1 class="mt-2 text-4xl font-bold">{{ record.title }}</h1>
    {% if record.cover %}<img src="{{ record.cover }}" class="mt-8 aspect-video w-full rounded-box object-cover">{% endif %}
    <div class="mt-8 space-y-4 text-lg [&_h2]:pt-4 [&_h2]:text-2xl [&_h2]:font-bold [&_a]:link [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6">{{ record.body }}</div>
  </article>
  {% render 'footer' %}
</body>
</html>
```

There is no "prose" class: give the long text's container classes for what Markdown makes (headings, links, lists), as above.

The page for the list is an ordinary page beside it (`pages/blog/index.liquid` for `/blog`). Link records by their id: `/blog/{{ post.id }}`.

## Changing records later

- To add a record, write a new file; to change one, Edit its file; to remove one, tell the maker they can delete it from the Content tab, or delete it with the shell if asked.
- To add a field, add it to the definition, then to the records that have a value for it.
- To reorder records without a sort, change `order` in the definition.
- Never rename a record's file: its page's address would change. The maker renames records in the Content tab.

## Collected datasources and forms

What visitors send through a form (a contact message, a guestbook entry, a review, a sign-up) goes to a collected datasource. Its records are not files you write: Upstart keeps them where the site is published, and the maker reads, approves and deletes them in the Content tab.

```yaml
label: Livre d'or
collected: true
review: true
answer: guestbook-thanks
body: message
messages:
  required: "{field} est obligatoire"
  invalid: "{field} n'est pas valide"
  too_many: "Trop d'envois, réessayez dans quelques minutes"
  sent: "Merci, c'est envoyé"
fields:
  - name: name
    label: Votre nom
    kind: text
    required: true
  - name: email
    label: Votre e-mail
    kind: email
  - name: message
    label: Votre message
    kind: markdown
    required: true
```

- `collected: true`, and no record file under `data/<name>/`.
- `review: true` holds each record until the maker approves it: always for what a page shows publicly (a guestbook, reviews), never for a form whose records no page shows (contact).
- `answer`: the fragment a valid submission is answered with (`fragments/guestbook-thanks.liquid`), the new record in `record`. Without one, Upstart answers with `messages.sent`.
- `messages`: the sentences of the alert Upstart shows when what was sent is wrong, in the site's language; `{field}` is the field's label. Give every field a `label` in the site's language too.
- Kinds: text, markdown (a long text, shown as plain paragraphs: what visitors type is never read as HTML or Markdown), number, boolean (a checkbox), date, choice, list (checkboxes with `choices`), link, email, phone. No image: visitors cannot send files.
- Upstart adds the record's `id` and `submitted` (when it was sent, an ISO date and time): never declare them as fields.

The form posts to `/_data/<name>`, each input named after a field:

```liquid
<form hx-post="/_data/guestbook" hx-target="this" hx-swap="outerHTML" hx-status:422="target:#guestbook-problems swap:innerHTML" class="flex flex-col gap-3">
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Votre nom</legend>
    <input name="name" class="input w-full" required maxlength="200">
  </fieldset>
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Votre e-mail</legend>
    <input name="email" type="email" class="input w-full">
  </fieldset>
  <fieldset class="fieldset">
    <legend class="fieldset-legend">Votre message</legend>
    <textarea name="message" class="textarea w-full" required></textarea>
  </fieldset>
  <div id="guestbook-problems"></div>
  <button class="btn btn-primary self-start">Signer le livre d'or</button>
</form>
```

- A valid submission replaces the form with the `answer` fragment (`hx-target="this" hx-swap="outerHTML"`).
- A wrong one is answered with status 422 and a small alert listing what is wrong; `hx-status:422` puts it in the form's empty element, which needs an id of its own on the page.
- Give inputs `required`, `type="email"`, `type="tel"`, `type="number"` and `maxlength`, so that the browser catches most mistakes first.
- Never add a hidden anti-spam field: Upstart adds one to every such form, and limits how often one visitor sends.

The fragment it answers with:

```liquid
<div class="alert alert-success" role="status">Merci {{ record.name }} ! Votre message paraîtra après relecture.</div>
```

Pages show a collected datasource like any other, with `data.<name>`, newest first, without the records waiting for review: `{% for entry in data.guestbook %}…{{ entry.message }}…{{ entry.submitted | date: "%d/%m/%Y" }}{% endfor %}`. Say what a visitor wrote as it is: it is already safe to show.

### Test records

In the preview, a collected datasource holds test records, which are never published. They are files like the records of an authored datasource, in `.upstart/test-records/<name>/<id>.md`, with `submitted` among their fields and the long text below:

```markdown
---
name: Claire
email: claire@example.com
submitted: 2026-11-12T09:31:04Z
---
Un pain sans gluten, ce serait possible ?
```

- When a page shows the records (a guestbook, reviews), write three realistic ones, in the site's language, after the definition, so the page shows its layout. For a form whose records no page shows (contact), write none.
- Name each file after when it was sent and four letters or digits: `2026-11-12-0931-a7f3.md`.
- `status: pending` marks one still waiting for review: it is not shown.
- The maker tries a form in the preview's visitor view; what they send there becomes a test record too.

Once the site is published, its own records start empty; test records stay in the preview.
