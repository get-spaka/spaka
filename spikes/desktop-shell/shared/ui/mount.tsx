import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { ShellBridge } from "./types";

export type { ShellBridge } from "./types";

export function mount(shell: ShellBridge) {
  createRoot(document.getElementById("root")!).render(<App shell={shell} />);
}
