// Spaka's build host (ADR 0013, packages plan, slice 3): Spaka's Vite makes
// one ES module for each package a website's scripts import. Spaka runs it
// with its own Node, under Node's permissions: it reads, but writes nothing,
// starts no program and loads no native code, so rolldown runs as
// WebAssembly, the same on every system and in the signed app. The request
// comes on stdin, the modules go out on stdout, as JSON:
//   in:  { root, modules: [{ specifier, external: [specifier…] }] }
//   out: [{ specifier, code, moduleIds, exports, warnings } | { specifier, error }]
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(join(process.env.SPAKA_VITE_DIR ?? process.cwd(), "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { root, modules } = JSON.parse(input);

const results = [];
for (const { specifier, external } of modules) {
  const warnings = [];
  try {
    const output = await build({
      root,
      configFile: false,
      envDir: false,
      publicDir: false,
      logLevel: "silent",
      mode: "production",
      build: {
        write: false,
        target: "es2022",
        minify: true,
        modulePreload: false,
        copyPublicDir: false,
        reportCompressedSize: false,
        rolldownOptions: {
          // The specifier itself is the entry, resolved as a browser resolves it, so
          // that the module exports what the package does, its default export included.
          input: { module: specifier },
          preserveEntrySignatures: "strict",
          // What the import map holds besides: shared, never bundled twice.
          external,
          output: { format: "es", entryFileNames: "[name].js", codeSplitting: false, comments: { legal: true } },
          onwarn: (warning) => warnings.push(warning.message),
        },
      },
    });
    const outputs = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output);
    const chunk = outputs.find((o) => o.type === "chunk");
    const styles = outputs.filter((o) => o.type === "asset" && o.fileName.endsWith(".css"));
    if (styles.length && !chunk?.code.trim()) results.push({ specifier, error: "it is a stylesheet, not a module" });
    else if (!chunk) results.push({ specifier, error: "Vite made no module of it" });
    else
      results.push({
        specifier,
        code: chunk.code,
        moduleIds: chunk.moduleIds,
        exports: chunk.exports,
        warnings: styles.length ? [...warnings, "it imports a stylesheet, which its module leaves out"] : warnings,
      });
  } catch (error) {
    results.push({ specifier, error: reason(error, root) });
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
// Out at once: rolldown's WebAssembly threads would keep the process alive.
process.stdout.write(JSON.stringify(results), () => process.exit(0));
