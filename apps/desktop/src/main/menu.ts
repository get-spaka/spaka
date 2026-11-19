// The app's macOS menus (Q335): the app's, File, Edit, View, Window and Help,
// each item with its shortcut from shared/shortcuts.ts. An item sends its
// command to the interface, which does what its button does; the main process
// does the few that are its own (settings, text size, asking the agent).
// Undo and Redo act on the text being typed, in the interface or in the page,
// and otherwise on the website's history.
import { app, Menu, type MenuItemConstructorOptions, webContents } from "electron";
import { acceleratorOf, type Command } from "../shared/shortcuts";
import { en } from "../shared/strings/en";

const t = en;

export type MenuActions = {
  /** The interface does what the command's button does. */
  send(command: Command): void;
  settings(): void;
  /** The About page of the settings, which Settings → About Upstart shows too (Q339). */
  about(): void;
  /** One step larger or smaller, or back to the usual size. */
  textSize(step: 1 | -1 | 0): void;
  askAgent(): void;
  /** Developer tools, in a development build only. */
  development: boolean;
};

/** Whether what has the keyboard, in the interface or in the page, is a text being typed. */
const TYPING = `(() => { const e = document.activeElement; return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)); })()`;

/**
 * On Windows there is no app menu: Settings and Exit are in File, About in
 * Help, as Windows apps have them; the menu bar is hidden under the window's
 * own title bar and its shortcuts still work.
 */
export function buildMenu(actions: MenuActions, mac = process.platform === "darwin"): Menu {
  const item = (command: Command, click?: () => void): MenuItemConstructorOptions => ({
    label: t.commands[command],
    accelerator: acceleratorOf(command, mac),
    click: click ?? (() => actions.send(command)),
  });
  /** Undo or redo the text being typed, else the website's change. */
  const history = (command: "undo" | "redo") =>
    item(command, async () => {
      const focused = webContents.getFocusedWebContents();
      const typing = focused ? await focused.executeJavaScript(TYPING).catch(() => false) : false;
      if (focused && typing) {
        if (command === "undo") focused.undo();
        else focused.redo();
      } else if (command === "undo") actions.send("undo");
    });

  const appMenu: MenuItemConstructorOptions[] = mac
    ? [
        {
          label: app.name,
          submenu: [
            { label: t.menus.about, click: actions.about },
            { type: "separator" },
            item("settings", actions.settings),
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ]
    : [];
  return Menu.buildFromTemplate([
    ...appMenu,
    {
      label: t.menus.file,
      submenu: [
        item("new-website"),
        item("open-folder"),
        { type: "separator" },
        item("publish"),
        { type: "separator" },
        ...(mac
          ? [{ role: "close" } as const]
          : [item("settings", actions.settings), { type: "separator" } as const, { role: "quit" } as const]),
      ],
    },
    {
      label: t.menus.edit,
      submenu: [
        history("undo"),
        history("redo"),
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: t.menus.view,
      submenu: [
        item("tab-conversation"),
        item("tab-blocks"),
        item("tab-theme"),
        item("tab-content"),
        { type: "separator" },
        {
          label: t.menus.preview,
          submenu: [
            item("screen-desktop"),
            item("screen-tablet"),
            item("screen-phone"),
            { type: "separator" },
            item("all-pages"),
            { type: "separator" },
            item("mode-edit"),
            item("mode-comment"),
            item("mode-visitor"),
            { type: "separator" },
            item("reload-preview"),
          ],
        },
        item("sidebar"),
        { type: "separator" },
        item("text-larger", () => actions.textSize(1)),
        item("text-smaller", () => actions.textSize(-1)),
        item("text-default", () => actions.textSize(0)),
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(actions.development ? [{ type: "separator" } as const, { role: "toggleDevTools" } as const] : []),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      label: t.menus.help,
      submenu: [
        item("tour"),
        item("ask-agent", actions.askAgent),
        { type: "separator" },
        item("shortcuts"),
        ...(mac ? [] : [{ type: "separator" } as const, { label: t.menus.about, click: actions.about }]),
      ],
    },
  ]);
}
