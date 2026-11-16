// The interface's commands and their keyboard shortcuts (Q335): the one list
// that the macOS menus, the tooltips (Q329) and the shortcuts sheet read.
// A menu item sends its command to the interface (menu:command), which does
// what the button does; a few are done by the main process itself.

export const COMMANDS = [
  "new-website",
  "open-folder",
  "publish",
  "undo",
  "redo",
  "tab-conversation",
  "tab-blocks",
  "tab-theme",
  "tab-content",
  "screen-desktop",
  "screen-tablet",
  "screen-phone",
  "all-pages",
  "mode-edit",
  "mode-comment",
  "mode-visitor",
  "reload-preview",
  "sidebar",
  "text-larger",
  "text-smaller",
  "text-default",
  "settings",
  "tour",
  "ask-agent",
  "shortcuts",
] as const;
export type Command = (typeof COMMANDS)[number];

/** Each command's shortcut, as Electron's accelerators write it. */
export const ACCELERATORS: Partial<Record<Command, string>> = {
  "new-website": "CommandOrControl+N",
  "open-folder": "CommandOrControl+O",
  publish: "Shift+CommandOrControl+P",
  undo: "CommandOrControl+Z",
  redo: "Shift+CommandOrControl+Z",
  "tab-conversation": "CommandOrControl+1",
  "tab-blocks": "CommandOrControl+2",
  "tab-theme": "CommandOrControl+3",
  "tab-content": "CommandOrControl+4",
  "screen-desktop": "Alt+CommandOrControl+1",
  "screen-tablet": "Alt+CommandOrControl+2",
  "screen-phone": "Alt+CommandOrControl+3",
  "all-pages": "Shift+CommandOrControl+A",
  "mode-edit": "Alt+CommandOrControl+E",
  "mode-comment": "Alt+CommandOrControl+M",
  "mode-visitor": "Alt+CommandOrControl+V",
  "reload-preview": "CommandOrControl+R",
  sidebar: "Control+CommandOrControl+S",
  "text-larger": "CommandOrControl+Plus",
  "text-smaller": "CommandOrControl+-",
  "text-default": "CommandOrControl+0",
  settings: "CommandOrControl+,",
  shortcuts: "CommandOrControl+/",
};

/** The shortcuts sheet's groups, in the menus' order. */
export const SHEET: { group: "file" | "edit" | "view" | "help"; commands: Command[] }[] = [
  { group: "file", commands: ["new-website", "open-folder", "publish", "settings"] },
  { group: "edit", commands: ["undo", "redo"] },
  {
    group: "view",
    commands: [
      "tab-conversation",
      "tab-blocks",
      "tab-theme",
      "tab-content",
      "screen-desktop",
      "screen-tablet",
      "screen-phone",
      "all-pages",
      "mode-edit",
      "mode-comment",
      "mode-visitor",
      "reload-preview",
      "sidebar",
      "text-larger",
      "text-smaller",
      "text-default",
    ],
  },
  { group: "help", commands: ["shortcuts"] },
];

const GLYPHS: Record<string, string> = {
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  CommandOrControl: "⌘",
  Command: "⌘",
  Plus: "+",
};

/** An accelerator as macOS shows it: ⇧⌘P, in its menus' order (⌃⌥⇧⌘, then the key). */
export function keysOf(accelerator: string): string {
  const parts = accelerator.split("+").map((p) => (p === "" ? "+" : p));
  const key = parts.pop() ?? "";
  const order = ["Control", "Alt", "Shift", "CommandOrControl", "Command"];
  const modifiers = order.filter((m) => parts.includes(m)).map((m) => GLYPHS[m]);
  return `${modifiers.join("")}${GLYPHS[key] ?? key.toUpperCase()}`;
}

/** A command's shortcut as macOS shows it, if it has one. */
export function shortcutOf(command: Command): string | undefined {
  const accelerator = ACCELERATORS[command];
  return accelerator ? keysOf(accelerator) : undefined;
}
