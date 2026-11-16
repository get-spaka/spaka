import { describe, expect, test } from "vitest";
import { ACCELERATORS, COMMANDS, keysOf, SHEET, shortcutOf } from "./shortcuts";
import { en } from "./strings/en";

describe("the commands and their shortcuts (Q335)", () => {
  test("an accelerator is written as macOS menus write it", () => {
    expect(keysOf("Shift+CommandOrControl+P")).toBe("⇧⌘P");
    expect(keysOf("Alt+CommandOrControl+1")).toBe("⌥⌘1");
    expect(keysOf("Control+CommandOrControl+S")).toBe("⌃⌘S");
    expect(keysOf("CommandOrControl+Plus")).toBe("⌘+");
    expect(keysOf("CommandOrControl+-")).toBe("⌘-");
    expect(keysOf("CommandOrControl+,")).toBe("⌘,");
    expect(shortcutOf("publish")).toBe("⇧⌘P");
    expect(shortcutOf("tour")).toBeUndefined();
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
