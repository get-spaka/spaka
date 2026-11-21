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

test("daisyUI's revert-layer answer to a Tailwind utility of the same name stays in the utilities layer too", () => {
  const css = [
    "@layer utilities{",
    ".collapse:not(td, tr, colgroup){visibility:revert-layer;@layer daisyui.l1.l2.l3{display:grid}}",
    ".collapse{visibility:collapse}",
    "@media (width>=640px){.sm\\:collapse:not(td,tr,colgroup){visibility:revert-layer;@layer daisyui.l1{display:grid}}}",
    "}",
  ].join("");
  expect(daisyuiBelowComponents(css)).toBe(
    [
      "@layer daisyui{",
      ".collapse:not(td, tr, colgroup){visibility:revert-layer;@layer daisyui.l1.l2.l3{display:grid}}",
      "}",
      "@layer utilities{.collapse{visibility:collapse}}",
      "@layer daisyui{@media (width>=640px){.sm\\:collapse:not(td,tr,colgroup){visibility:revert-layer;@layer daisyui.l1{display:grid}}}}",
      "@layer utilities{.collapse:not(td, tr, colgroup){visibility:revert-layer}@media (width>=640px){.sm\\:collapse:not(td,tr,colgroup){visibility:revert-layer}}}",
    ].join(""),
  );
});

test("a breakpoint's block holding daisyUI's classes beside utilities is cut in its order: the utilities stay", () => {
  const css = [
    "@layer utilities{",
    ".flex-col{flex-direction:column}",
    "@media (width>=40rem){.sm\\:flex-row{flex-direction:row}@layer daisyui.l1{.sm\\:btn-md{--size:2.5rem}}.sm\\:w-auto{width:auto}}",
    "}",
  ].join("");
  expect(daisyuiBelowComponents(css)).toBe(
    [
      "@layer utilities{.flex-col{flex-direction:column}@media (width>=40rem){.sm\\:flex-row{flex-direction:row}}}",
      "@layer daisyui{@media (width>=40rem){@layer daisyui.l1{.sm\\:btn-md{--size:2.5rem}}}}",
      "@layer utilities{@media (width>=40rem){.sm\\:w-auto{width:auto}}}",
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
  // The collapse's answer to Tailwind's .collapse (visibility: collapse) stays where it wins.
  expect(layersOf(layered, ".collapse:not(td,tr,colgroup)")).toContain("utilities");
  // Only moved: every brace still paired.
  expect(layered.split("{").length).toBe(layered.split("}").length);
});
