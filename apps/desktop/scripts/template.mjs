// The template commands (Q232): `pnpm template:check <folder or .zip>` runs a
// template's checks; `pnpm template:shoot <folder>` photographs its pages in
// the app, offscreen, into its pictures/ and a review sheet; `pnpm
// template:image` finds images and adds them with their credits. The checks are
// the app's own code, bundled here on the fly so that Node runs them as they are.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const root = join(desktop, "../..");
const [command, ...args] = process.argv.slice(2);

/** The app's template code, bundled for Node. */
async function cli() {
  const { build } = await import("rolldown");
  const out = join(desktop, "out/template-check.mjs");
  mkdirSync(dirname(out), { recursive: true });
  await build({
    input: join(desktop, "src/main/templates/cli.ts"),
    platform: "node",
    logLevel: "warn",
    external: ["electron", "sharp"],
    output: { file: out, format: "esm" },
  });
  return import(pathToFileURL(out).href);
}

if (command === "check") {
  const { main } = await cli();
  process.exit(main(args));
} else if (command === "image") {
  const { imageMain } = await cli();
  process.exit(await imageMain(args, join(root, "e2e/.runs/template-images")));
} else if (command === "shoot") {
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("Usage: pnpm template:shoot <template folder> [--no-build]");
    process.exit(2);
  }
  const run = (cmd, argv, env = {}) =>
    spawnSync(cmd, argv, { cwd: root, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env } })
      .status ?? 1;
  if (!args.includes("--no-build") && run("pnpm", ["--filter", "@upstart/desktop", "build"]) !== 0) process.exit(1);
  process.exit(
    run("npx", ["vitest", "run", "--config", "e2e/vitest.config.ts", "e2e/template-shoot.e2e.ts"], {
      UPSTART_BACKGROUND: "1",
      UPSTART_TEMPLATE_SHOOT: resolve(target),
    }),
  );
} else {
  console.error(
    "Usage: pnpm template:check <folder or .zip> | pnpm template:shoot <folder> | pnpm template:image find|use …",
  );
  process.exit(2);
}
