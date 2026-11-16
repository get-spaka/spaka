// The menus' items and their shortcuts (Q335), done where their buttons are:
// the component that has the buttons says what each command does, while it is
// on screen.
import { useEffect, useRef } from "react";
import type { Command } from "../../shared/shortcuts";
import { upstart } from "../lib/bridge";

export function useCommands(run: Partial<Record<Command, () => void>>) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => upstart.on("menu:command", (command) => latest.current[command]?.()), []);
}
