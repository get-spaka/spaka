---
name: writing-skills
description: How to write a skill into the project when the maker asks for one — a reusable way of doing something for this website (a tone of voice, a page format, a checklist). Use when the maker asks you to remember how to do something, or to make a skill.
---

# Writing a skill into the project

A project's skills live in `.spaka/skills/<name>/SKILL.md`, in the Agent Skills format. They travel with the project folder, and you get them with the maker's next message. This is the only place in `.spaka` you may write.

## When

Only when the maker asks: "make a skill for…", "remember how we write the menu", "always write the news this way". Do not write skills on your own initiative.

## The file

```markdown
---
name: menu-format
description: How this bakery's menu pages are written — sections, prices, allergens. Use when writing or changing a menu page.
---

# Menu pages

- One section per category, in this order: bread, viennoiseries, pastries, drinks.
- Each item: name, one line of description, price in euros with a comma ("3,20 €").
- Allergens in a small badge after the description.
```

- `name`: lowercase letters, digits and hyphens, at most 64 characters, and exactly the folder's name.
- `description`: what the skill is about and when to use it, in one or two sentences. It is all you see of the skill until you open it, so name the situations that call for it.
- The body: short, concrete instructions and examples. Write it in English unless the maker asks otherwise; quote the site's own wording as it is.
- Other files next to SKILL.md (an example page, a list of terms) are fine when the body refers to them by their relative path. No scripts unless the maker asks for one.

## Then

Tell the maker in one sentence what the skill does and that it applies from their next message. They can see and remove it in Settings.
