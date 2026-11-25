---
name: htmx-patterns
description: Worked htmx 4 patterns for Spaka projects — content loaded on demand from fragments, tabs, "show more", a filtered list, a section refreshed on its own. Use when a page needs something to change without loading a new page.
---

# htmx 4 patterns in a Spaka project

The page already loads htmx 4; the cheat sheet in your instructions has the syntax. In a Spaka project htmx asks for a fragment, `fragments/<name>.liquid`, served at `/fragments/<name>` with its query parameters in `params`, or posts a form to a collected datasource at `/_data/<name>` (the datasources skill shows the form, its answer and its errors). There is no server code. Prefer plain links and plain HTML; reach for htmx when something must change in place.

Put each hx- attribute on the element that makes the request: inheritance needs the `:inherited` modifier in htmx 4.

## Load a section after the page

```html
<section id="reviews" hx-get="/fragments/reviews" hx-trigger="load" hx-swap="innerHTML">
  <p class="text-base-content/60">Loading reviews…</p>
</section>
```

`hx-trigger="revealed"` waits until the section scrolls into view.

## Tabs

```html
<div role="tablist" class="tabs tabs-border">
  <button role="tab" class="tab tab-active" hx-get="/fragments/menu-tab?tab=bread" hx-target="#tab-panel">Bread</button>
  <button role="tab" class="tab" hx-get="/fragments/menu-tab?tab=pastry" hx-target="#tab-panel">Pastries</button>
</div>
<div id="tab-panel" hx-get="/fragments/menu-tab?tab=bread" hx-trigger="load"></div>
```

In `fragments/menu-tab.liquid`, branch on `params.tab`:

```liquid
{% if params.tab == "pastry" %}<ul>…</ul>{% else %}<ul>…</ul>{% endif %}
```

Moving the active class between tabs: `hx-on::after:request="this.parentElement.querySelectorAll('.tab').forEach(t => t.classList.toggle('tab-active', t === this))"`.

## Show more

```html
<ul id="items">…the first items…</ul>
<button class="btn" hx-get="/fragments/more-items?page=2" hx-target="#items" hx-swap="beforeend" hx-on::after:request="this.remove()">
  Show more
</button>
```

The fragment returns the next `<li>` elements and, when there are more, a new button pointing at the next page, placed with `<hx-partial hx-target="#more" hx-swap="innerHTML">`.

## A filtered list

```html
<input type="search" name="q" class="input" placeholder="Search the menu"
  hx-get="/fragments/menu-search" hx-trigger="input changed delay:300ms" hx-target="#results">
<div id="results" hx-get="/fragments/menu-search" hx-trigger="load"></div>
```

The fragment reads `params.q`. A static export serves each fragment once, without parameters: a filtered list or tabs driven by parameters work in the preview and with server exports, not on a static host. When the maker plans to publish statically, prefer plain HTML (all tabs in the page, shown and hidden with daisyUI's radio tabs or a details element).

## A form

What a visitor sends goes to a collected datasource: the form posts to `/_data/<name>` and is replaced by the definition's answer fragment; a mistake comes back with status 422, which `hx-status:422="target:#… swap:innerHTML"` puts inside the form. The datasources skill has the whole pattern.

## Refresh a section on its own

```html
<div hx-get="/fragments/opening-status" hx-trigger="load, every 60s"></div>
```

## Avoid

- Writing a fragment for what plain HTML does: a link, an anchor, a details element, daisyUI's collapse or modal.
- hx-boost on a whole page: navigation between pages is plain links.
- JavaScript files: inline handlers with hx-on are enough here.
