# Upstart v2: plan for the tour and the polish (end of step 5)

## Status (2026-11-22): complete

| Slice | Done | Commits |
|---|---|---|
| 0. Dark appearance and color tokens | ✅ | 6dbe928 |
| 1. Menus and keyboard shortcuts | ✅ | 75824d3 |
| 2. Tooltips | ✅ | 3d79710 |
| 3. The tour | ✅ | 88ae8c3 |
| 4. Statistics | ✅ | 77213df; Aptabase key set in 507be76 |
| 5. Startup screen, About, icon | ✅ | ff32da3, 4a3b780 |
| 6. Review of every screen, light and dark | ✅ | 38fd266; accent from the icon's violet, Q341-Q342, fd11222 |
| 7. All together, the real agent, the packaged app | ✅ | 513d99d |

## Context

After wave 2 of the templates (v7), you chose to finish step 5 (Q327). The design is done (Q328-Q340, commit `7a7dc20`, section "Editing" of `docs/v2.0-decisions.md`, glossary term **Tour**).

Goals:
- a five-step tour, shown once after the first website is built;
- a tooltip of our own on every button, with its shortcut;
- a dark appearance that follows macOS by default;
- anonymous statistics through Aptabase, about fifteen events;
- the macOS menus and keyboard shortcuts;
- the startup screen, the About page and your icon;
- a review of every screen, light and dark.

### What exists today

**Help and guidance**
- No tour.
- Empty states exist: in the conversation ("What are we building?") and in the preview.

**Tooltips**
- Only the native `title`, on about 35 of the 37 icon buttons.
- Two icon buttons have none: image search (`MediaLibrary.tsx:387`) and the template card (`StartPanel.tsx:278`).
- No text button has one.
- `radix-ui` 1.8.1 is already a dependency (used only for `Slot`).
- The editor's bar in the preview (`preload/editor/editor.ts:356`) uses `title` too.

**Appearance**
- Tailwind v4 with shadcn's "neutral" tokens in OKLCH (`renderer/index.css:9-66`).
- The variant `dark` is declared, but there is no `.dark` block.
- The window's background is hard-coded (`main/index.ts:146`, `#fafafa`).
- The settings panel uses colors written out by hand (`SettingsPanel.tsx:42-49`, `:86-91`).

**Menus** (`main/index.ts:202`)
- The app menu has Settings… (⌘,).
- The other menus are Electron's default roles (`fileMenu`, `editMenu`, `viewMenu`, `windowMenu`).
- There is no Help menu.

**Statistics**
- The `statistics` setting exists (on by default) and has its switch on the Privacy page, which says that nothing is sent.
- There is no service.

**End of a turn** (`main/index.ts:482`)
- `turn-end` already tells whether an adaptation is finished: `turnEnded` in `main/templates/adaptation.ts:174`.

**Icon**
- None: the app uses Electron's.
- `electron-builder` is configured in `package.json` (`mac`, `extraResources`).

## Working rules (unchanged)

- Launches run in the background (`UPSTART_BACKGROUND=1`). `dev:live` is stopped during builds and restarted afterwards.
- One commit on `main` per slice that works, without attribution, then main is pushed.
- `pnpm lint` stays clean. The e2e tests run in the background.
- Any new design question goes to you, from Q341 on.

## Technical choices (no new product decision)

**Colors**
- Every color comes from the tokens: the light ones on `:root` and the dark ones on `.dark`.
- `.dark` is set on `<html>` from `nativeTheme.shouldUseDarkColors`, which main sends at startup and whenever it changes.

**The `appearance` setting**
- A new setting, `appearance: "system" | "light" | "dark"`, set to `"system"` by default.
- It sets `nativeTheme.themeSource`, so the native menus and dialogs follow it too.
- The window's background takes the token color for the current appearance, so the window does not flash white in dark mode.

**Shortcuts**
- One source of truth, `shared/shortcuts.ts`, gives for each gesture its id, its Electron accelerator and its label.
- The menus, the tooltips and the shortcuts sheet all read from it.

**Tooltips**
- A `Tip` component built on Radix's `Tooltip` (already a dependency), with one `TooltipProvider` at the root.
- It opens after a short delay (300 ms, instant from one button to the next) and is drawn in the tokens' colors.
- Each button's text lives in `en.ts`.
- In the preview, the editor's bar draws its own tooltip in its shadow root, in the same colors.

**The tour**
- **Seen or not:** a flag `tourSeen` in the app's settings. The first time this version starts, it is set to `true` if a website already exists (Q340).
- **When it opens:** main emits `tour:start` at a `turn-end` with status `done` for the open website, in two cases:
  - the website has no adaptation and now has a page: a website built from nothing;
  - its adaptation has just finished.
  
  A website whose adaptation is unfinished does not open it (Q328, Q333, Q336).
- **Where it points:** each step points at an element marked `data-tour="<step>"`.
- **How it is drawn:**
  - The renderer draws the veil and the bubble over its own areas.
  - The preview is a native view. For steps 1, 3, 4 and 5, the editing script draws the veil over the page too.
  - For step 2, the editing script draws the bubble itself, on the first heading of the page (ADR 0008).
- **Ending it:** Skip and the last Next set `tourSeen`. The Help menu starts the tour again.

**Statistics**
- `@aptabase/electron` is called from main only, through `main/stats.ts`.
- The events and their properties are a closed list. Each property takes its value from a set of values (a provider, a way of publishing, a type of error), never free text.
- Nothing is sent unless `statistics` is on and the app is packaged with its Aptabase key. Locally, the e2e tests read the events from a log.

**The icon**
- `build/icon.icns`, generated from your 1024 px PNG or your SVG, referenced in `mac.icon`.
- In development, `app.dock.setIcon`.

## Slices

### 0. Dark appearance and color tokens
- **The tokens:**
  - a `.dark` block in `index.css`;
  - the colors written out by hand in the settings panel replaced by tokens, along with every other hex or `neutral-*` class in the renderer;
  - a unit test that fails on any color written out in `renderer/`.
- **The setting:**
  - `appearance` in `AppSettings`, under General (Light / Dark / System), searchable in the settings;
  - `nativeTheme.themeSource`, and the `.dark` class kept up to date;
  - the window's background.
- **In the preview:** the editor's overlays (selection, bar, text pop-up, comment pins) take the light or dark colors.
- **e2e** (`settings.e2e.ts`, extended): switching to Dark changes the interface and the overlays, and the site keeps its own theme.

### 1. Menus and keyboard shortcuts
- **`shared/shortcuts.ts`:** the list of shortcuts.
- **The menus:**
  - **File:** New website ⌘N, Open folder… ⌘O, Publish… ⇧⌘P.
  - **Edit:** the text roles. ⌘Z undoes the website's change when the focus is not in a text field, and the field's typing otherwise.
  - **View:**
    - the tabs Conversation, Blocks, Theme and Content (⌘1 to ⌘4);
    - the screens computer, tablet and phone (⌥⌘1 to ⌥⌘3);
    - All pages;
    - Edit / Visitor mode;
    - reload the preview;
    - text size;
    - show or hide the sidebar.
  - **Window:** the default role.
  - **Help:** Tour of Upstart (wired at slice 3), Ask the agent, Keyboard shortcuts.
- **The shortcuts sheet:** a small dialog that lists them, opened from Help.
- **"Ask the agent":** opens the conversation tab with "How do I …?" in the message box, the cursor at the end.
- **e2e** (`shell.e2e.ts`, extended): the menu items through the main process, and the shortcuts sent to the window.

### 2. Tooltips
- **The `Tip` component** and its provider.
- **Every `title` in the renderer** is replaced by `Tip`.
- **Every text button** gets its tooltip: what it does, and its shortcut from `shortcuts.ts`.
- **The two icon buttons without one** get a tooltip and an `aria-label`.
- **The editor's bar in the preview** gets its own tooltip.
- **A unit test** fails on any `<button>` or `Button` in the renderer that has neither `Tip` nor an explicit exemption.
- **e2e:** hovering a button in the preview bar and in the sidebar shows its text and its shortcut.

### 3. The tour
- **The `tourSeen` flag**, and its one-time migration at startup (Q340).
- **`tour:start` emitted by main**, by the rules above, tested in units on the possible cases:
  - first website built from nothing;
  - template, with its adaptation unfinished;
  - template, with its adaptation finished, or its remaining pages removed;
  - a maker who already had websites;
  - a turn that failed.
- **`Tour.tsx` in the renderer:**
  - the veil cut out around the target;
  - a bubble with an arrow, "2 of 5", Next and Skip;
  - Escape skips it;
  - it follows the window as it is resized.
- **In the preview**, the editing script has two new messages:
  - `tour:veil`, the veil over the page;
  - `tour:bubble`, the bubble on the first heading or the first image in view, with the same buttons, whose clicks come back to the renderer.
- **The texts of the five steps**, in `en.ts`:
  1. The conversation: ask for a change in words.
  2. The page: click a text or an image to change it.
  3. The blocks: drag a section into the page.
  4. The theme: colors and fonts.
  5. Publish.
- **Help → Tour of Upstart** starts the tour again.
- **e2e `tour.e2e.ts`**, on a recording, since the replay already exists:
  - a first website built: the tour opens, goes through its five steps and closes;
  - reopened: it does not open again;
  - started from the menu;
  - a template: nothing until the last page, then the tour.

### 4. Statistics
- **`main/stats.ts`:** the closed list of events (Q334):
  - `launch` (version, system);
  - `site_created` (a template's id or `none`);
  - `message_sent` (provider);
  - `page_edit`;
  - `block_dropped`;
  - `theme_changed`;
  - `content_changed`;
  - `published` (way);
  - `tour_finished`;
  - `tour_skipped`;
  - `error` (type).
- **Wiring:** each event is sent from the place where the action already goes through main. `launch` is sent at most once a day.
- **The Privacy page:** its text says what is sent and to whom, with the list of events.
- **Unit tests:** no property outside its set of values, nothing sent with `statistics` off, nothing sent without the key.
- **Aptabase:** I check the current version of `@aptabase/electron` and its licence before adding it.
- **Waits on you:** the Aptabase account (EU region) and the app's key, which is public and can be written into the code. Without the key, everything is built and tested, and nothing is sent.

### 5. Startup screen, About, icon
- **The startup:**
  - the window appears once it has drawn, in the color of its appearance;
  - while the first data loads, a quiet view shows the icon and the name, in place of the empty frame.
- **The About page** (the app menu's and Settings → About Upstart, made the same):
  - the icon, the name, the version;
  - the licence;
  - the main open source components and their licences;
  - the links that exist (the site; the repository once it is public).
- **The icon:** `build/icon.icns`, `mac.icon`, the Dock in development.
- **Waits on you:** the file. Without it, everything else is done, and the icon goes in when it arrives.

### 6. Review of every screen, light and dark
- **`e2e/screens-sheet.ts`:** launches the app in the background and photographs every screen in light and in dark:
  - start screen;
  - conversation with a website and with the cards (question, pages, plan);
  - Blocks, Theme, Content (datasources, a record, collected data, media);
  - preview: edit mode, visitor mode, all pages, history;
  - publishing;
  - every settings page and a website's settings;
  - the tour, at each of its steps;
  - the shortcuts sheet;
  - About.

  The pictures go onto a sheet in `e2e/.runs/screens/`.
- **First pass:** I review the sheet. Spacing, sizes, empty states, error messages, contrast in dark, alignment. I fix what I find.
- **Your pass:** I send you the sheet, and I fix what you point out.
- **One commit** for the review, or two if your notes call for a second pass.

### 7. All together, the real agent, the packaged app
- Unit tests, lint, every e2e test, then a new package.
- **The "Tour" check in the packaged app**, with the real agent and a fresh profile:
  - a website built from nothing: the tour opens at the end of the first turn;
  - a second profile, started from Ember: nothing during the adaptation, then the tour once the last page is done;
  - the statistics in log mode list the expected events, and nothing else.
- I then suggest you try it in the dev window, light and dark.

## Main files

**Main**
- `main/index.ts` (menus, appearance, tour, window).
- `main/app-settings.ts`, `main/stats.ts` (new), `main/templates/adaptation.ts` (read only).

**Shared**
- `shared/ipc.ts` (settings, `tour:*` messages), `shared/shortcuts.ts` (new), `shared/strings/en.ts`.

**Renderer**
- `renderer/index.css`, `renderer/components/ui/tooltip.tsx` (new), `Tour.tsx` (new), `ShortcutsDialog.tsx` (new).
- Every component that has buttons, `settings/SettingsPanel.tsx`.

**Preview**
- `preload/editor/editor.ts` and `comments.ts` (colors, tooltip, veil and bubble of the tour).

**Packaging**
- `apps/desktop/package.json` (`mac.icon`), `apps/desktop/build/icon.icns`.

**Tests**
- `tour.e2e.ts` (new), `screens-sheet.ts` (new).
- `settings.e2e.ts`, `shell.e2e.ts`.
- The unit tests for colors, buttons, statistics and the tour's trigger.

## Checks

- **Unit tests:**
  - the tour's trigger, case by case;
  - the migration of `tourSeen`;
  - the statistics' values;
  - no color written out, and no button without a tooltip.
- **e2e in the background:** appearance, menus and shortcuts, tooltips, the tour (built from nothing, template, menu), the screens sheet.
- **The sheets:** a light/dark sheet of every screen, reviewed by me, then by you.
- **The real agent:** the "Tour" check in the packaged app.
