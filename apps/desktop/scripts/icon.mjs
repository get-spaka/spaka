// Makes the app's icon from build/icon.svg, Upstart's own artwork (from the
// brand's assets): placed on macOS's icon grid, an 824-point shape in a
// 1024-point canvas, its corners those of macOS's icons, with the system's
// shadow under it, so that it sits beside the other apps in the Dock. Writes
// build/icon.png (1024, the Dock's icon in development) and build/icon.icns
// (electron-builder's, every size macOS asks for). Run it again after the
// artwork changes: pnpm --filter @upstart/desktop icon.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const build = join(dirname(fileURLToPath(import.meta.url)), "../build");
const CANVAS = 1024;
const SHAPE = 824;
const AT = (CANVAS - SHAPE) / 2;
/** macOS's icon shape is close to a rounded square with this radius at 824 points. */
const RADIUS = 185.4;

const artwork = await sharp(readFileSync(join(build, "icon.svg")), { density: 72 * (SHAPE / 512) })
  .resize(SHAPE, SHAPE)
  .png()
  .toBuffer();
const shape = (fill) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHAPE}" height="${SHAPE}"><rect width="${SHAPE}" height="${SHAPE}" rx="${RADIUS}" fill="${fill}"/></svg>`,
  );
const masked = await sharp(artwork)
  .composite([{ input: shape("#fff"), blend: "dest-in" }])
  .png()
  .toBuffer();
const shadow = await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: shape("rgba(0,0,0,0.3)"), left: AT, top: AT + 10 }])
  .png()
  .toBuffer()
  // sharp composites last: the shadow is blurred once drawn.
  .then((drawn) => sharp(drawn).blur(10).png().toBuffer());
const icon = await sharp(shadow)
  .composite([{ input: masked, left: AT, top: AT }])
  .png()
  .toBuffer();
await sharp(icon).toFile(join(build, "icon.png"));

const work = mkdtempSync(join(tmpdir(), "upstart-icon-"));
const set = join(work, "icon.iconset");
execFileSync("mkdir", [set]);
for (const size of [16, 32, 128, 256, 512]) {
  await sharp(icon)
    .resize(size, size)
    .toFile(join(set, `icon_${size}x${size}.png`));
  await sharp(icon)
    .resize(size * 2, size * 2)
    .toFile(join(set, `icon_${size}x${size}@2x.png`));
}
execFileSync("iconutil", ["-c", "icns", set, "-o", join(build, "icon.icns")]);
rmSync(work, { recursive: true, force: true });
console.log("build/icon.png and build/icon.icns written");
