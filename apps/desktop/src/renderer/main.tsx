import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SETTINGS_PAGES, type SettingsPage } from "../shared/ipc";
import { App } from "./App";
import { upstart } from "./lib/bridge";
import "./index.css";
import { SettingsWindow } from "./settings/SettingsWindow";

// The same interface serves two windows: Upstart's, and the settings (#settings/<page>).
const settings = /^#settings(?:\/(\w+))?/.exec(location.hash);
const page = SETTINGS_PAGES.find((p) => p === settings?.[1]) ?? ("general" satisfies SettingsPage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{settings ? <SettingsWindow initial={page} /> : <App />}</StrictMode>,
);
upstart.send("app:ready");
