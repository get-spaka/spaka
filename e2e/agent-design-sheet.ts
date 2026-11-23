// The design bench's first screens side by side (Q439): one row a brief, one
// column a label and an agent (before-claude, after-claude, before-pi…), from
// the pictures agent-design.e2e.ts left in e2e/.runs/agent-design/, with the
// variety tables it wrote. Run after the bench:
//
//   node e2e/agent-design-sheet.ts [desktop-1|phone-1]
//
// Writes e2e/.runs/agent-design/sheet-<picture>.png and variety.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const dir = join(import.meta.dirname, ".runs/agent-design");
const picture = process.argv[2] ?? "desktop-1";
const sharp = createRequire(join(import.meta.dirname, "../apps/desktop/package.json"))("sharp");

const BRIEFS = ["patisserie", "tattoo", "bar", "notary", "climbing", "wedding"];
const ORDER = ["before-claude", "after-claude", "before-pi", "after-pi"];
const shot = (column: string, brief: string) => join(dir, `${column}-${brief}-${picture}.png`);
const columns = ORDER.filter((c) => BRIEFS.some((b) => existsSync(shot(c, b))));
const briefs = BRIEFS.filter((b) => columns.some((c) => existsSync(shot(c, b))));
if (!columns.length) throw new Error(`no ${picture} pictures in ${dir}: run the bench first`);

const width = picture.startsWith("phone") ? 260 : 560;
const height = picture.startsWith("phone") ? 560 : 350;
const gap = 16;
const label = 28;
const text = (s: string, w: number, size = 16) =>
  Buffer.from(
    `<svg width="${w}" height="${label}"><text x="0" y="${label - 8}" font-family="Helvetica" font-size="${size}" fill="#222">${s}</text></svg>`,
  );

const left = 110;
const composites: { input: Buffer; left: number; top: number }[] = [];
columns.forEach((c, i) => {
  composites.push({ input: text(c, width), left: left + i * (width + gap), top: 0 });
});
for (const [row, brief] of briefs.entries()) {
  const top = label + row * (height + gap);
  composites.push({ input: text(brief, left - 8, 15), left: 0, top: top + height / 2 - label });
  for (const [i, column] of columns.entries()) {
    const file = shot(column, brief);
    if (!existsSync(file)) continue;
    const input = await sharp(file).resize(width, height, { fit: "cover", position: "top" }).png().toBuffer();
    composites.push({ input, left: left + i * (width + gap), top });
  }
}
const out = join(dir, `sheet-${picture}.png`);
await sharp({
  create: {
    width: left + columns.length * (width + gap),
    height: label + briefs.length * (height + gap),
    channels: 3,
    background: "#f4f4f2",
  },
})
  .composite(composites)
  .png()
  .toFile(out);

const tables = readdirSync(dir)
  .filter((f) => /^(before|after)-(claude|pi)\.md$/.test(f))
  .sort((a, b) => ORDER.indexOf(a.replace(".md", "")) - ORDER.indexOf(b.replace(".md", "")))
  .map((f) => readFileSync(join(dir, f), "utf8"));
writeFileSync(join(dir, "variety.md"), tables.join("\n"));
console.log(`${out}\n${join(dir, "variety.md")}`);
