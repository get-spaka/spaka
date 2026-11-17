---
name: upstart-help
description: How Upstart works for the maker — putting the website online, history and undo, models and effort, skills, what is not available yet. Use when the maker asks a question about Upstart itself rather than about their website.
---

# Answering questions about Upstart

Answer briefly, in the maker's language, and point to where things are in the app. Do not change files to answer a question.

## The app

- Three columns: the projects on the left, the conversation in the middle, the live preview on the right.
- Each project is a folder of plain files on the maker's computer (by default in Documents/Upstart). The maker can open any such folder with "Open a folder…" in the left column.
- Above the conversation: undo (goes back to the version before the last change), the history (every version, after each of your turns; going back to one keeps the others), and "start over", which makes you forget the conversation without changing the files or what is shown.
- Under the message box: the model and the effort. Higher effort thinks longer before writing; "medium" is the default. Both are kept per project and can change at any time.
- Above the preview: the page shown, "Publish", and reload.

## Putting the website online

"Publish", above the preview, asks how, each time, among three ways shown equally, then exports the website into a folder the maker chooses and shows the steps that put it online:

- Static files: plain files any web host serves (Netlify Drop, Cloudflare Pages, GitHub Pages, for free). A form sends to a form service's address (Formspree, Basin, Getform…) the maker gives in the same window. Not offered when a page shows what visitors send, such as a guestbook: say why, and suggest a server.
- Node.js server: a folder with server.mjs and a Dockerfile, for a server of the maker's own or a platform that runs Docker. It keeps what visitors send.
- Cloudflare Worker: a folder deployed with Cloudflare's wrangler, on a Cloudflare account. It keeps what visitors send.

For the two servers, the window shows the website's management token, which the published site is given as the steps say. Once the site is online, the maker gives its address in the website's settings (the icon beside the project's name): the Content tab then lists what visitors sent, with the test records, and lets the maker approve, delete or download them as CSV. Exporting again into the same folder replaces the export but keeps what a server has kept. A fragment that reads its parameters cannot vary on a static host: it is served once, without them.

## Skills

Skills teach you how to do something: a writing style, a format, a procedure. They come from three places: those shipped with Upstart, the maker's own for all their projects, and the project's, kept in its folder (.upstart/skills) so they travel with it. The maker adds or removes them in Settings, at the bottom of the left column. You can also write a skill into the project when the maker asks for one (see the writing-skills skill); you get it with their next message.

## Lists and images

- Lists of similar items (posts, products, a team, events) are datasources, in the project's data/ folder: the maker edits them in the Content tab, beside the conversation, as a form per item, and can add, duplicate, reorder or delete items there. A datasource can have a page per item. Only you change a datasource's fields.
- Images are in the media library, in the same tab: the maker adds files by dropping them, or searches free images (Openverse and Wikimedia Commons); each image keeps its alternative text and its credits. An image used somewhere cannot be deleted; renaming it updates the pages that use it. Clicking an image in the preview offers "Replace…". A record's several pictures (an `images` field, such as a home's photos) are a row of thumbnails in its form, where the maker adds several at once, reorders and removes them; in the preview each can also be replaced, moved earlier or later, dragged onto another of its list, or removed from the list.
- The credits that licences ask for are listed on the site's /credits page, linked from every footer, both in the site's language (from the page's `<html lang>`; English for a language Upstart does not know).

## Not available yet

Say so in one sentence when asked, and build what you can:

- Video and audio files.
- Connectors to other services, if none is set up in Settings.
