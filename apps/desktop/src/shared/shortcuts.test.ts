import { describe, expect, test } from "vitest";
import { ACCELERATORS, acceleratorOf, COMMANDS, keysOf, SHEET, shortcutOf } from "./shortcuts";
import { en } from "./strings/en";

describe("the commands and their shortcuts (Q335)", () => {
  test("an accelerator is written as macOS menus write it", () => {
    expect(keysOf("Shift+CommandOrControl+P", true)).toBe("⇧⌘P");
    expect(keysOf("Alt+CommandOrControl+1", true)).toBe("⌥⌘1");
    expect(keysOf("Control+CommandOrControl+S", true)).toBe("⌃⌘S");
    expect(keysOf("CommandOrControl+Plus", true)).toBe("⌘+");
    expect(keysOf("CommandOrControl+-", true)).toBe("⌘-");
    expect(keysOf("CommandOrControl+,", true)).toBe("⌘,");
    expect(shortcutOf("publish", true)).toBe("⇧⌘P");
    expect(shortcutOf("tour")).toBeUndefined();
  });

  test("on Windows, Ctrl and the modifiers' names, and Ctrl+B for the sidebar", () => {
    expect(keysOf("Shift+CommandOrControl+P", false)).toBe("Ctrl+Shift+P");
    expect(keysOf("Alt+CommandOrControl+1", false)).toBe("Ctrl+Alt+1");
    expect(keysOf("CommandOrControl+Plus", false)).toBe("Ctrl++");
    expect(keysOf("CommandOrControl+,", false)).toBe("Ctrl+,");
    expect(shortcutOf("sidebar", false)).toBe("Ctrl+B");
    expect(shortcutOf("sidebar", true)).toBe("⌃⌘S");
    const windows = COMMANDS.flatMap((c) => acceleratorOf(c, false) ?? []);
    expect(new Set(windows).size).toBe(windows.length);
  });

  test("every command has its name, and no two share a shortcut", () => {
    for (const command of COMMANDS) expect(en.commands[command]).toBeTruthy();
    const accelerators = Object.values(ACCELERATORS);
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  test("the sheet lists each command with a shortcut once, and only those", () => {
    const listed = SHEET.flatMap((g) => g.commands);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.filter((c) => !shortcutOf(c))).toEqual([]);
    expect(new Set(listed)).toEqual(new Set(Object.keys(ACCELERATORS)));
  });
});
