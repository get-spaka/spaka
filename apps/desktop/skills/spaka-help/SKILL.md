---
name: spaka-help
description: How Spaka works for the maker — putting the website online, history and undo, models and effort, skills, what is not available yet. Use when the maker asks a question about Spaka itself rather than about their website.
---

# Answering questions about Spaka

Answer briefly, in the maker's language, and point to where things are in the app. Do not change files to answer a question.

## The app

- Three columns: the projects on the left, the conversation in the middle, the live preview on the right.
- Each project is a folder of plain files on the maker's computer (by default in Documents/Spaka). The maker can open any such folder with "Open a folder…" in the left column.
- Above the conversation: undo (goes back to the version before the last change), the history (every version, after each of your turns; going back to one keeps the others), and "start over", which makes you forget the conversation without changing the files or what is shown.
- Under the message box: the model and the effort. Higher effort thinks longer before writing; "medium" is the default. Both are kept per project and can change at any time.
- Above the preview: the page shown, "Publish", and reload.

## Putting the website online

Spaka does not host websites yet: a hosting service does, which the maker chooses. "Publish", above the preview, writes the website into a folder the maker chooses, then shows the steps that put it online, and how to use a domain name of their own. It offers:

- "With a hosting service", the simple way, recommended and needing no technical knowledge: the maker drags the folder onto Netlify Drop's page, and creates a free Netlify account to keep the website online. The folder holds plain files any web host serves; Cloudflare Pages and GitHub Pages are named under "Other hosting services". A form sends to a form service's address (Formspree, Basin, Getform…) the maker gives in the same window. Not offered when a page shows what visitors send, such as a guestbook: say why, and that such a website needs one of the advanced ways, or the help of someone at ease with a terminal.
- Under "Other ways to publish (advanced)", two ways that keep what visitors send and need a terminal. "On Cloudflare": a folder deployed with Cloudflare's wrangler, on a Cloudflare account, free for a small website. "On a server (Docker or Node.js)": a folder with server.mjs, a Dockerfile and a compose.yaml, for a server of the maker's own or a hosting service that runs Docker. On their own server, the maker writes their domain name into the folder's .env (SPAKA_DOMAIN) and runs `docker compose up -d --build`: it starts the website and Caddy, which sets HTTPS up by itself. A new export into the same folder keeps what they wrote into .env.

A domain name is bought from a registrar, and its DNS settings there say where it leads: with Netlify, the records Netlify shows once the name is added under "Domain management"; with a server, A records to the server's IP address, and the name in .env; with Cloudflare, the name's servers changed to Cloudflare's, then a custom domain added to the Worker. The window's last part and the folder's README.md say so step by step.

For the two advanced ways, the website's management token is written into the folder's .env, which the published site reads as the steps say; the website's settings show it. Once the site is online, the maker gives its address in the website's settings (the icon beside the project's name): the Content tab then lists what visitors sent, with the test records, and lets the maker approve, delete or download them as CSV. Exporting again into the same folder replaces the export but keeps what a server has kept. A fragment that reads its parameters cannot vary on a static host: it is served once, without them.

## Skills

Skills teach you how to do something: a writing style, a format, a procedure. They come from three places: those shipped with Spaka, the maker's own for all their projects, and the project's, kept in its folder (.spaka/skills) so they travel with it. The maker adds or removes them in Settings, at the bottom of the left column. You can also write a skill into the project when the maker asks for one (see the writing-skills skill); you get it with their next message.

## Lists and images

- Lists of similar items (posts, products, a team, events) are datasources, in the project's data/ folder: the maker edits them in the Content tab, beside the conversation, as a form per item, and can add, duplicate, reorder or delete items there. A datasource can have a page per item. Only you change a datasource's fields.
- Images are in the media library, in the same tab: the maker adds files by dropping them, or searches free images (Openverse and Wikimedia Commons); each image keeps its alternative text and its credits. An image used somewhere cannot be deleted; renaming it updates the pages that use it. Clicking an image in the preview offers "Replace…". For an image written in the page itself (not one coming from a record), it also offers "Adjust the image": a small panel under the image with a zoom slider, nine buttons for the part of the image to keep in sight, and the frame's shape, from wide to tall (Auto, which keeps the shape the page gives, then 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16); the image always fills its frame unless the page's design shows it whole, which the agent can change; the image can be dragged in its frame meanwhile, the page shows each change at once, and Save keeps it. The setting is for every screen size unless the maker turns some off in the panel's "For" line (Desktop, Tablet, Phone): the image is then set apart on the screen the preview shows, and the others keep what they have; to set another screen, show it in the preview (the width buttons above it) and open the panel again. A screen size is a page width: a phone turned on its side is as wide as a tablet and so shows and sets the tablet's setting, and a tablet on its side the desktop's; the panel says so when it happens. A record's several pictures (an `images` field, such as a home's photos) are a row of thumbnails in its form, where the maker adds several at once, reorders and removes them; in the preview each can also be replaced, moved earlier or later, dragged onto another of its list, or removed from the list.
- The credits that licences ask for are listed on the site's /credits page, linked from every footer, both in the site's language (from the page's `<html lang>`; English for a language Spaka does not know).

## Not available yet

Say so in one sentence when asked, and build what you can:

- Video and audio files.
- Connectors to other services, if none is set up in Settings.
