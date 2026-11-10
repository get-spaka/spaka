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
- Above the preview: the page shown, "Put online", and reload.

## Putting the website online

"Put online", above the preview, exports the website as plain files into a folder the maker chooses, then names three free hosts:

- Netlify Drop: drag the exported folder onto the page. The quickest.
- Cloudflare Pages: create a project with "Upload assets" and drop the folder.
- GitHub Pages: put the files in a repository and turn on Pages.

The maker can note the site's address in the same window. Exporting again replaces the previous export in that folder. A fragment that reads its parameters cannot vary on a static host: it is served once, without them.

## Skills

Skills teach you how to do something: a writing style, a format, a procedure. They come from three places: those shipped with Upstart, the maker's own for all their projects, and the project's, kept in its folder (.upstart/skills) so they travel with it. The maker adds or removes them in Settings, at the bottom of the left column. You can also write a skill into the project when the maker asks for one (see the writing-skills skill); you get it with their next message.

## Not available yet

Say so in one sentence when asked, and build what you can:

- Images uploaded by the maker, and a media library.
- Forms that store what visitors send, and collected records.
- Datasources (lists of items edited apart from the pages).
- Editing the page by clicking on it, a gallery of sections, a theme editor.
- Exports that run server code (Node, Cloudflare).
- Connectors to other services, if none is set up in Settings.
