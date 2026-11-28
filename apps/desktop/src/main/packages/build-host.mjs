// Spaka's build host (ADR 0013, packages plan, slice 3; Q557): Spaka's
// Rolldown makes one ES module for each package a website's scripts import.
// Spaka runs it with its own Node, under Node's permissions: it reads, but
// writes nothing, starts no program and loads no native code, so Rolldown runs
// as WebAssembly, the same on every system and in the signed app. On Windows
// it sees each drive as a folder of its own, /c for C:\ (wasi-drives.mjs). The
// request comes on stdin, the modules go out on stdout, as JSON:
//   in:  { root, modules: [{ specifier, external: [specifier…] }] }
//   out: [{ specifier, code, moduleIds, exports, warnings } | { specifier, error }]
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(join(process.env.SPAKA_ROLLDOWN_DIR ?? process.cwd(), "package.json"));
const { rolldown } = await import(pathToFileURL(require.resolve("rolldown")).href);

/**
 * A Windows path as Rolldown's WebAssembly reads it, D:\a\b as /d/a/b, and back:
 * when it runs as WebAssembly, as Spaka always runs it (the unit tests run the
 * repository's native Rolldown, which reads Windows paths).
 */
const windows = process.platform === "win32" && process.env.NAPI_RS_FORCE_WASI === "error";
const toGuest = (path) =>
  windows
    ? path
        .replace(/^(\\\\\?\\)?([A-Za-z]):[\\/]?/, (_, _long, drive) => `/${drive.toLowerCase()}/`)
        .replaceAll("\\", "/")
    : path;
const toHost = (path) =>
  windows && /^\/[a-z](\/|$)/.test(path) ? `${path[1].toUpperCase()}:\\${path.slice(3).replaceAll("/", "\\")}` : path;

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { root, modules } = JSON.parse(input);
const cwd = toGuest(root);

const results = [];
for (const { specifier, external } of modules) {
  const warnings = [];
  let styles = false;
  try {
    const bundle = await rolldown({
      cwd,
      // The specifier itself is the entry, resolved as a browser resolves it, so
      // that the module exports what the package does, its default export included.
      input: { module: specifier },
      platform: "browser",
      preserveEntrySignatures: "strict",
      // What the import map holds besides: shared, never bundled twice.
      external,
      // As Vite resolves for a browser in production.
      resolve: {
        conditionNames: ["module", "browser", "production"],
        mainFields: ["browser", "module", "jsnext:main", "jsnext", "main"],
      },
      transform: { target: "es2022", define: { "process.env.NODE_ENV": '"production"' } },
      plugins: [
        {
          // A package's stylesheet is left out of its module, and said.
          name: "spaka:stylesheets",
          load(id) {
            if (!/\.css($|\?)/.test(id)) return null;
            styles = true;
            return { code: "", moduleType: "js", moduleSideEffects: false };
          },
        },
      ],
      onwarn: (warning) => warnings.push(warning.message),
    });
    const { output } = await bundle.generate({
      format: "es",
      entryFileNames: "[name].js",
      codeSplitting: false,
      minify: true,
      comments: { legal: true },
    });
    await bundle.close();
    const chunk = output.find((o) => o.type === "chunk");
    if (styles && /\.css($|\?)/.test(chunk?.facadeModuleId ?? ""))
      results.push({ specifier, error: "it is a stylesheet, not a module" });
    else if (!chunk) results.push({ specifier, error: "Rolldown made no module of it" });
    else
      results.push({
        specifier,
        code: chunk.code,
        moduleIds: chunk.moduleIds.map(toHost),
        exports: chunk.exports,
        warnings: styles ? [...warnings, "it imports a stylesheet, which its module leaves out"] : warnings,
      });
  } catch (error) {
    results.push({ specifier, error: reason(error, cwd) });
  }
}

/** Rolldown's first error, in one line: its cause when it has one, the project's folder left out. */
function reason(error, root) {
  const text = String(error?.errors?.[0]?.message ?? error?.message ?? error)
    // Without the terminal's colours.
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
    .replace(/^Build failed with \d+ errors?:/, "");
  const cause = text.split("Caused by:")[1] ?? text;
  return cause
    .replaceAll(`${root}/`, "")
    .replace(/^\s*\[[A-Z_]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}
// Out at once: Rolldown's WebAssembly threads would keep the process alive.
process.stdout.write(JSON.stringify(results), () => process.exit(0));
