// A pnpm for the checks that installs nothing: `add name@version` and
// `remove name` change package.json, then each command writes the lockfile
// from it (the exact version, or the one FAKE_VERSIONS gives for a range) and
// its copy in node_modules, with each package's own package.json, and says
// what it added as pnpm's ndjson does. Each call is noted in pnpm-calls.txt.
const { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const [command, ...rest] = process.argv.slice(2);
const dir = rest[rest.indexOf("--dir") + 1];
// runPnpm puts the specs right after the command, then the flags.
const spec = rest[0] && !rest[0].startsWith("-") ? rest[0] : undefined;
appendFileSync(join(dir, "pnpm-calls.txt"), `${[command, spec].filter(Boolean).join(" ")}\n`);
const file = join(dir, "package.json");
const json = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
if (command === "add") {
  const at = spec.lastIndexOf("@");
  json.dependencies = { ...json.dependencies, [spec.slice(0, at)]: spec.slice(at + 1) };
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
if (command === "remove") {
  delete json.dependencies[spec];
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
const versions = JSON.parse(process.env.FAKE_VERSIONS || "{}");
const lines = ["lockfileVersion: '9.0'", "", "importers:", "", "  .:"];
const deps = Object.entries(json.dependencies || {});
if (deps.length) lines.push("    dependencies:");
for (const [name, specifier] of deps) {
  const version = versions[`${name}@${specifier}`] || specifier;
  lines.push(
    `      ${name.startsWith("@") ? `'${name}'` : name}:`,
    `        specifier: ${specifier}`,
    `        version: ${version}`,
  );
  const at = join(dir, "node_modules", name);
  mkdirSync(at, { recursive: true });
  writeFileSync(join(at, "package.json"), JSON.stringify({ name, version, license: "MIT" }));
  console.error(JSON.stringify({ name: "pnpm:root", added: { name, version } }));
}
lines.push("", "snapshots:", "");
for (const [name, specifier] of deps) lines.push(`  ${name}@${versions[`${name}@${specifier}`] || specifier}: {}`, "");
writeFileSync(join(dir, "pnpm-lock.yaml"), lines.join("\n"));
mkdirSync(join(dir, "node_modules", ".pnpm"), { recursive: true });
writeFileSync(join(dir, "node_modules", ".pnpm", "lock.yaml"), lines.join("\n"));
