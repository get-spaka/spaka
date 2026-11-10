// Copies the three browser libraries the canned page needs into ./vendor so
// that both apps can ship them as plain files (no CDN, works offline).
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "vendor");
await mkdir(out, { recursive: true });

const files = {
  "node_modules/@tailwindcss/browser/dist/index.global.js": "tailwind.js",
  "node_modules/daisyui/daisyui.css": "daisyui.css",
  "node_modules/htmx.org/dist/htmx.min.js": "htmx.js",
};

for (const [from, to] of Object.entries(files)) {
  await cp(join(here, from), join(out, to));
  console.log(`vendor/${to}`);
}
