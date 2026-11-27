// The entry of server.mjs: `node server.mjs` in the export's folder. PORT
// (3000), HOST (0.0.0.0), SPAKA_DATA (./data, where data.sqlite is kept)
// and SPAKA_TOKEN, the website's management token, from the environment,
// or from the .env beside it that the export wrote (Q191). SPAKA_PROXY=1,
// which the export's compose.yaml sets, says every request comes through a
// reverse proxy (Q486).
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { siteServer } from "./node.ts";

const dir = dirname(fileURLToPath(import.meta.url));
// What the environment already says wins over the file.
if (existsSync(join(dir, ".env"))) process.loadEnvFile(join(dir, ".env"));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const token = process.env.SPAKA_TOKEN?.trim();
if (!token) console.warn("SPAKA_TOKEN is not set: Spaka cannot read what visitors send. See README.md.");
const server = siteServer({
  dir,
  dataDir: resolve(dir, process.env.SPAKA_DATA ?? "data"),
  ...(token ? { managementToken: token } : {}),
  proxied: process.env.SPAKA_PROXY === "1",
});
server.listen(port, host, () => console.log(`Listening on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
