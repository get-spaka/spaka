import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { Fonts, setRegion } from "./fonts";

const fonts = new Fonts(join(__dirname, "../../../fonts"));

test("the system's fonts and the twenty shipped ones are offered, each with a stack", () => {
  const list = fonts.list();
  expect(list.filter((f) => f.shipped)).toHaveLength(20);
  expect(list.find((f) => f.id === "fraunces")).toMatchObject({
    name: "Fraunces",
    stack: '"Fraunces", Georgia, "Times New Roman", serif',
  });
  for (const f of list.filter((x) => x.shipped))
    expect(Object.keys(fonts.files([f.id])).every((file) => existsSync(join(__dirname, "../../..", file)))).toBe(true);
});

test("a theme value is traced to the shipped font it starts with", () => {
  expect(fonts.usedBy('"Fraunces", Georgia, serif')?.id).toBe("fraunces");
  expect(fonts.usedBy("'inter', system-ui")?.id).toBe("inter");
  expect(fonts.usedBy("Georgia, serif")).toBeUndefined();
  expect(fonts.usedBy(undefined)).toBeUndefined();
});

test("the font files are named as the project keeps them", () => {
  expect(Object.keys(fonts.files(["fraunces", "manrope"])).sort()).toEqual([
    "fonts/fraunces/italic.woff2",
    "fonts/fraunces/normal.woff2",
    "fonts/manrope/normal.woff2",
  ]);
});

test("the @font-face region goes after the imports, is replaced, and goes away", () => {
  const css = '@import url("x.css");\n:root { --theme-radius: 1rem; }\n';
  const one = fonts.withFaces(css, ["manrope"]);
  expect(one).toMatch(/^@import url\("x\.css"\);\n\n\/\* Fonts chosen in Spaka's Theme tab/);
  expect(one).toContain('@font-face { font-family: "Manrope"; font-style: normal; font-weight: 200 800;');
  expect(one).toContain('src: url("/fonts/manrope/normal.woff2") format("woff2"); }');
  expect(one).toMatch(/End of the fonts chosen in Spaka's Theme tab \*\/\n:root/);
  const two = fonts.withFaces(one, ["fraunces"]);
  expect(two).not.toContain("Manrope");
  expect(two.match(/@font-face/g)).toHaveLength(2);
  expect(fonts.withFaces(two, [])).toBe('@import url("x.css");\n\n:root { --theme-radius: 1rem; }\n');
  expect(setRegion(":root{}", "")).toBe(":root{}");
  expect(setRegion(":root{}", "/* r */\n")).toBe("/* r */\n:root{}");
});

// The agent's Google Fonts import has semicolons inside its address.
const GOOGLE =
  "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');";

test("the region goes after an import whose address holds semicolons", () => {
  const css = `${GOOGLE}\n\n:root { --theme-radius: 1rem; }\n`;
  const one = fonts.withFaces(css, ["manrope"]);
  expect(one.startsWith(`${GOOGLE}\n`)).toBe(true);
  expect(one).toMatch(/End of the fonts chosen in Spaka's Theme tab \*\/\n\n?:root/);
  expect(fonts.withFaces(fonts.withFaces(one, ["fraunces"]), ["fraunces"])).toBe(fonts.withFaces(one, ["fraunces"]));
});

test("a region once written inside such an address is moved out, and the address made whole again", () => {
  const [head, tail] = [GOOGLE.slice(0, GOOGLE.indexOf("500;") + 4), GOOGLE.slice(GOOGLE.indexOf("500;") + 4)];
  const broken = `${head}\n\n/* Fonts chosen in Spaka's Theme tab (kept by Spaka) */\n@font-face { font-family: "Inter"; }\n/* End of the fonts chosen in Spaka's Theme tab */\n${tail}\n\n:root { --theme-radius: 1rem; }\n`;
  const fixed = fonts.withFaces(broken, ["manrope"]);
  expect(fixed.startsWith(`${GOOGLE}\n`)).toBe(true);
  expect(fixed).toContain("Manrope");
  expect(fixed).not.toContain('"Inter"');
  expect(fonts.withFaces(broken, [])).toBe(`${GOOGLE}\n\n:root { --theme-radius: 1rem; }\n`);
});
