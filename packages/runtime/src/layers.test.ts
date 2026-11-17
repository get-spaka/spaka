import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { daisyuiBelowComponents, LAYER_ORDER, layersOf } from "./layers.ts";

test("the layers are ordered theme, base, daisyui, components, utilities", () => {
  expect(LAYER_ORDER).toBe("@layer theme, base, daisyui, components, utilities;");
});

test("daisyUI's components leave the utilities layer for the daisyui layer, in their order; utilities stay", () => {
  const css = [
    "@layer theme, base, components, utilities;",
    "@layer base{:root{--color-base-100:#fff}}",
    "@layer utilities{",
    ".p-4{padding:1rem}",
    "@layer daisyui.l1.l2.l3{.btn{border-radius:4px}}",
    "@media (width>=640px){@layer daisyui.l1{.sm\\:btn{padding:1rem}}}",
    ".kbd{@layer daisyui.l1{border:1px solid}}",
    '.rounded-none{border-radius:0;content:"}{"}',
    "/* @layer daisyui */.text-primary{color:red}",
    "}",
    "@layer components{.btn{border-radius:0}}",
  ].join("");
  expect(daisyuiBelowComponents(css)).toBe(
    [
      "@layer theme, base, components, utilities;",
      "@layer base{:root{--color-base-100:#fff}}",
      "@layer utilities{.p-4{padding:1rem}}",
      "@layer daisyui{",
      "@layer daisyui.l1.l2.l3{.btn{border-radius:4px}}",
      "@media (width>=640px){@layer daisyui.l1{.sm\\:btn{padding:1rem}}}",
      ".kbd{@layer daisyui.l1{border:1px solid}}",
      "}",
      '@layer utilities{.rounded-none{border-radius:0;content:"}{"}/* @layer daisyui */.text-primary{color:red}}',
      "@layer components{.btn{border-radius:0}}",
    ].join(""),
  );
});

test("a stylesheet without daisyUI's components is left as it is", () => {
  const css = "@layer utilities{.p-4{padding:1rem}}\n.hero{color:red}\n";
  expect(daisyuiBelowComponents(css)).toBe(css);
});

test("in daisyui.css, the button is in the daisyui layer only; a utility of daisyUI's stays a utility", () => {
  const file = createRequire(import.meta.url).resolve("daisyui/daisyui.css", {
    paths: [`${import.meta.dirname}/../../../apps/desktop`],
  });
  const css = readFileSync(file, "utf8");
  expect(layersOf(css, ".btn").every((l) => l.startsWith("utilities > daisyui"))).toBe(true);
  const layered = daisyuiBelowComponents(css);
  const btn = layersOf(layered, ".btn");
  expect(btn.length).toBeGreaterThan(0);
  expect(btn.every((l) => l.startsWith("daisyui > daisyui"))).toBe(true);
  expect(layersOf(layered, ".rounded-box")).toEqual(["utilities"]);
  // Only moved: every brace still paired.
  expect(layered.split("{").length).toBe(layered.split("}").length);
});
