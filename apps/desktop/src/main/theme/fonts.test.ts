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
  expect(one).toMatch(/^@import url\("x\.css"\);\n\n\/\* Fonts chosen in Upstart's Theme tab/);
  expect(one).toContain('@font-face { font-family: "Manrope"; font-style: normal; font-weight: 200 800;');
  expect(one).toContain('src: url("/fonts/manrope/normal.woff2") format("woff2"); }');
  expect(one).toMatch(/End of the fonts chosen in Upstart's Theme tab \*\/\n:root/);
  const two = fonts.withFaces(one, ["fraunces"]);
  expect(two).not.toContain("Manrope");
  expect(two.match(/@font-face/g)).toHaveLength(2);
  expect(fonts.withFaces(two, [])).toBe('@import url("x.css");\n\n:root { --theme-radius: 1rem; }\n');
  expect(setRegion(":root{}", "")).toBe(":root{}");
  expect(setRegion(":root{}", "/* r */\n")).toBe("/* r */\n:root{}");
});
