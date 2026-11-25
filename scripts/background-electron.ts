// Makes a copy of Electron that macOS treats as an agent app (LSUIElement):
// no Dock icon, never activated, never in front. Automated checks launch the
// app with it, so that a run never disturbs whoever is using the machine.
//
// Prints the path of the executable. Usable as a module too.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function backgroundElectron(): string {
  const appRequire = createRequire(join(root, "apps/desktop/package.json"));
  const original = appRequire("electron") as unknown as string; // path of the executable
  if (process.platform !== "darwin") return original;
  const version = JSON.parse(readFileSync(appRequire.resolve("electron/package.json"), "utf8")).version;
  const bundle = original.replace(/\/Contents\/MacOS\/Electron$/, "");
  const target = join(root, ".cache/electron-background", version, "Electron.app");
  const executable = join(target, "Contents/MacOS/Electron");
  if (existsSync(executable)) return executable;
  rmSync(dirname(target), { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(bundle, target, { recursive: true, verbatimSymlinks: true });
  execFileSync("/usr/libexec/PlistBuddy", ["-c", "Add :LSUIElement bool true", join(target, "Contents/Info.plist")]);
  return executable;
}

/**
 * The same for a packaged Spaka.app: a copy marked as an agent app, for a
 * check of the packaged build in the background. Returns its executable.
 */
export function backgroundPackagedApp(bundle = join(root, "apps/desktop/dist/mac-arm64/Spaka.app")): string {
  // Windows: the unpacked build, run as it is; a check keeps its window hidden by itself (SPAKA_BACKGROUND).
  if (process.platform === "win32") return join(root, "apps/desktop/dist/win-unpacked/Spaka.exe");
  const target = join(root, ".cache/packaged-background/Spaka.app");
  rmSync(dirname(target), { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(bundle, target, { recursive: true, verbatimSymlinks: true });
  execFileSync("/usr/libexec/PlistBuddy", ["-c", "Add :LSUIElement bool true", join(target, "Contents/Info.plist")]);
  return join(target, "Contents/MacOS/Spaka");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(backgroundElectron());
