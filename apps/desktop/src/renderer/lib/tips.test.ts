// Every button of the interface has its tooltip of Spaka's own (Q329): a
// `Button` its `tip`, a `<button>` the `<Tip>` around it. No native `title` is
// left. A button that needs none says why, in a `{/* no tip: … */}` just before it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const RENDERER = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

/** The JSX opening tags named `name` in a source: where each starts, and its text up to its `>`. */
function tags(source: string, name: string): { at: number; text: string }[] {
  const found: { at: number; text: string }[] = [];
  const start = new RegExp(`<${name}(?=[\\s>/])`, "g");
  for (const m of source.matchAll(start)) {
    let depth = 0;
    let quote: string | undefined;
    let i = m.index + m[0].length;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = undefined;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    found.push({ at: m.index, text: source.slice(m.index, i + 1) });
  }
  return found;
}

const line = (source: string, at: number) => source.slice(0, at).split("\n").length;
/** Whether the code just before a tag is a `<Tip …>` around it, or a `no tip:` comment. */
const covered = (source: string, at: number) => {
  const before = source.slice(Math.max(0, at - 400), at).trimEnd();
  return /<Tip\b[^<]*>$/.test(before) || /\{\/\* no tip: [^*]+\*\/\}$/.test(before);
};

describe("the interface's tooltips", () => {
  const files = sources(RENDERER).map((path) => ({
    name: relative(RENDERER, path),
    source: readFileSync(path, "utf8"),
  }));

  test("every button has one", () => {
    const missing = files.flatMap(({ name, source }) => [
      ...tags(source, "Button")
        .filter((tag) => !/\stip=/.test(tag.text) && !covered(source, tag.at))
        .map((tag) => `${name}:${line(source, tag.at)} <Button>`),
      ...tags(source, "button")
        .filter((tag) => !covered(source, tag.at))
        .map((tag) => `${name}:${line(source, tag.at)} <button>`),
    ]);
    expect(missing).toEqual([]);
  });

  test("none is the native title", () => {
    const titles = files.flatMap(({ name, source }) =>
      ["button", "Button", "span", "div", "a", "label", "img", "input", "li"].flatMap((tag) =>
        tags(source, tag)
          .filter((t) => /\stitle=/.test(t.text))
          .map((t) => `${name}:${line(source, t.at)} <${tag} title>`),
      ),
    );
    expect(titles).toEqual([]);
  });
});
