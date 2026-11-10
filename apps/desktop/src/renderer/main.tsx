import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { upstart } from "./lib/bridge";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
upstart.send("app:ready");
