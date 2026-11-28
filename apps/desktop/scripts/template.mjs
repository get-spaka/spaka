// The template commands (Q232): `pnpm template:check <folder or .zip>` runs a
// template's checks, online for its packages; `pnpm template:install <folder>`
// installs its packages with Spaka's pnpm and writes its lockfile; `pnpm template:shoot <folder>` photographs its pages in
// the app, offscreen, into its pictures/ and a review sheet, and renders each
// page again as after an edit, checking nothing is left hidden; `pnpm
// template:image` finds images and adds them with their credits, or generates
// them with a key set in the terminal. The checks are
// the app's own code, bundled here on the fly so that Node runs them as they are.
// Spaka's own templates live in the public repository
// get-spaka/templates, a submodule at apps/desktop/templates (Q250,
// Q265, Q267), and are released from it: `pnpm template:release <out> <tag>
// [previous catalogue]` builds a release here as its CI does, `pnpm
// template:release-script` rebuilds the script its CI runs, and `pnpm
// template:snapshot` takes the latest release's catalogue and pictures to ship
// with the app (Q247).
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
    external: ["electron", "sharp", "@google/genai"],
    output: { file: out, format: "esm" },
  });
  return import(pathToFileURL(out).href);
}

/** The release script for the public repository: the app's checks, bundled with all they need, for Node alone. */
async function releaseScript(out) {
  const { build } = await import("rolldown");
  await build({
    input: join(desktop, "src/main/templates/release-entry.ts"),
    platform: "node",
    logLevel: "warn",
    output: {
      file: out,
      format: "esm",
      banner:
        "// Built by `pnpm template:release-script` in Spaka's repository, from the app's own checks: do not edit.",
    },
  });
}

const templates = join(desktop, "templates");

if (command === "check") {
  const { main } = await cli();
  process.exit(await main(args));
} else if (command === "install") {
  const { installMain } = await cli();
  process.exit(await installMain(args, join(root, "e2e/.runs/template-install")));
} else if (command === "image") {
  const { imageMain } = await cli();
  process.exit(await imageMain(args, join(root, "e2e/.runs/template-images")));
} else if (command === "release") {
  const flags = args.filter((a) => a.startsWith("--"));
  const [out, tag, previous] = args.filter((a) => !a.startsWith("--"));
  if (!out || !tag) {
    console.error(
      "Usage: pnpm template:release <out folder> <tag> [previous catalogue.json: path or address] [--offline]",
    );
    process.exit(2);
  }
  const { releaseMain } = await cli();
  process.exit(await releaseMain([templates, resolve(out), tag, ...(previous ? [previous] : []), ...flags]));
} else if (command === "snapshot") {
  const { snapshotMain } = await cli();
  process.exit(await snapshotMain(join(desktop, "templates-catalogue"), process.env.SPAKA_TEMPLATES_URL));
} else if (command === "release-script") {
  // The release script of the templates' repository, rebuilt after the checks change here.
  await releaseScript(join(templates, "scripts/release.mjs"));
  console.log("✓ apps/desktop/templates/scripts/release.mjs: commit it in the templates' repository.");
} else if (command === "shoot") {
  // --clock <instant>: the time the pages are photographed at (else the template's own, or now).
  const clockAt = args.indexOf("--clock");
  const clock = clockAt >= 0 ? args[clockAt + 1] : undefined;
  const target = args.find((a, i) => !a.startsWith("--") && (clockAt < 0 || i !== clockAt + 1));
  if (!target || (clockAt >= 0 && !clock)) {
    console.error("Usage: pnpm template:shoot <template folder> [--no-build] [--clock 2027-04-14T09:30:00-05:00]");
    process.exit(2);
  }
  const run = (cmd, argv, env = {}) =>
    // On Windows pnpm and npx are .cmd scripts, which only a shell runs.
    spawnSync(cmd, argv, {
      cwd: root,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    }).status ?? 1;
  if (!args.includes("--no-build") && run("pnpm", ["--filter", "@spaka/desktop", "build"]) !== 0) process.exit(1);
  process.exit(
    run(
      "npx",
      ["vitest", "run", "--config", "e2e/vitest.config.ts", "e2e/template-shoot.e2e.ts", "e2e/templates-again.e2e.ts"],
      {
        SPAKA_BACKGROUND: "1",
        SPAKA_TEMPLATE_SHOOT: resolve(target),
        ...(clock ? { SPAKA_TEMPLATE_SHOOT_CLOCK: clock } : {}),
      },
    ),
  );
} else {
  console.error(
    "Usage: pnpm template:check <folder or .zip> | template:install <folder> | template:shoot <folder> | template:image find|use|generate … | template:release <out> <tag> [previous] | template:snapshot | template:release-script",
  );
  process.exit(2);
}
