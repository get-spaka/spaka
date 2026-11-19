// Makes the app's icon from build/icon.svg, Upstart's own artwork (from the
// brand's assets): placed on macOS's icon grid, an 824-point shape in a
// 1024-point canvas, its corners those of macOS's icons, with the system's
// shadow under it, so that it sits beside the other apps in the Dock. Writes
// build/icon.png (1024, the Dock's icon in development) and build/icon.icns
// (electron-builder's, every size macOS asks for), and build/icon.ico for
// Windows, whose icons are the shape alone, filling their square, from 16 to
// 256 pixels. Run it again after the artwork changes:
// pnpm --filter @upstart/desktop icon.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
mkdirSync(set);
for (const size of [16, 32, 128, 256, 512]) {
  await sharp(icon)
    .resize(size, size)
    .toFile(join(set, `icon_${size}x${size}.png`));
  await sharp(icon)
    .resize(size * 2, size * 2)
    .toFile(join(set, `icon_${size}x${size}@2x.png`));
}
// iconutil is macOS's own: elsewhere the .icns already in the repository stays.
if (process.platform === "darwin") execFileSync("iconutil", ["-c", "icns", set, "-o", join(build, "icon.icns")]);
rmSync(work, { recursive: true, force: true });

// Windows: an .ico holding one PNG per size (Windows Vista and later read them).
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((size) => sharp(masked).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size === 256 ? 0 : size, at);
  header.writeUInt8(size === 256 ? 0 : size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(pngs[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += pngs[i].length;
});
writeFileSync(join(build, "icon.ico"), Buffer.concat([header, ...pngs]));
console.log("build/icon.png, build/icon.icns and build/icon.ico written");
