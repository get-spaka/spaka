---
name: datasources
description: How to write datasources in an Upstart project — a definition and one Markdown file per record under data/, lists in pages with data.<name>, a page per record with pages/<folder>/[<name>].liquid, image fields from the media library. Use before writing a site that lists posts, products, team members, events, dishes or anything else made of similar items, and when the maker asks to add, change or reorder such items.
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
