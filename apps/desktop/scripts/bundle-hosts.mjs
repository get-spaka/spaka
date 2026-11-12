// Bundles the published site's two servers into out/hosts, shipped with the
// app (extraResources) and copied by the Node and Cloudflare exports: the
// runtime and its libraries in one file each, so that an export needs no
// install to run (Node) and wrangler only adds site.json (Cloudflare).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const here = dirname(fileURLToPath(import.meta.url));
const hosts = join(here, "../../../packages/runtime/src/hosts");
const out = join(here, "../out/hosts");
const banner = "// Upstart's published-site server. Generated: do not edit.";

await build({
  input: join(hosts, "node-main.ts"),
  platform: "node",
  logLevel: "warn",
  output: { file: join(out, "server.mjs"), format: "esm", banner, minify: true },
});
await build({
  input: join(hosts, "worker-main.ts"),
  platform: "browser",
  external: ["./site.json"],
  logLevel: "warn",
  output: { file: join(out, "worker.mjs"), format: "esm", banner, minify: true },
});
