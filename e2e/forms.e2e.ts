import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp, SLOW } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// Forms in the preview (Q171-Q189), on the recorded bakery with a guestbook
// shown on a page (held for review) and a contact form beside it: the test
// records shown, newest first; a form tried in the preview answered with the
// definition's fragment and kept as a test record; a mistake answered 422 in
// the site's words; the hidden trap field; a page whose file starts with an
// underscore told to the agent.
describe("forms in the preview", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page } = previewDriver(() => launched);
  const w = () => launched.window;
  const testRecords = (name: string) => {
    const dir = join(path, ".spaka/test-records", name);
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  };
  const shown = () =>
    page(`[...document.querySelectorAll("article.entry")].map((e) => e.textContent.trim())`) as Promise<string[]>;
  const submit = (selector: string, values: Record<string, string>) =>
    page(`(() => {
      const form = document.querySelector(${JSON.stringify(selector)});
      for (const [name, value] of Object.entries(${JSON.stringify(values)})) form.elements[name].value = value;
      form.requestSubmit();
      return true;
    })()`);

  beforeAll(async () => {
    launched = await launchApp();
    await w().getByTestId("message-input").waitFor();
    await invoke("conversation:send", "A bakery in Lyon. Warm colours please.");
    await until(() => w().locator('[data-testid="agent-message"][data-status="done"]').count(), 30_000);
    path = (await invoke("projects:current")).path;
    const write = (name: string, text: string) => {
      mkdirSync(join(path, name, ".."), { recursive: true });
      writeFileSync(join(path, name), text);
    };
    write(
      "data/guestbook/_datasource.yaml",
      [
        "label: Livre d'or",
        "collected: true",
        "review: true",
        "answer: guestbook-thanks",
        "body: message",
        "messages:",
        '  required: "{field} est obligatoire"',
        "fields:",
        "  - name: name",
        "    label: Votre nom",
        "    kind: text",
        "    required: true",
        "  - name: message",
        "    kind: markdown",
        "    required: true",
        "",
      ].join("\n"),
    );
    write(
      ".spaka/test-records/guestbook/2026-11-10-0800-aaaa.md",
      "---\nname: Older\nsubmitted: 2026-11-10T08:00:00Z\n---\nLovely bread.\n",
    );
    write(
      ".spaka/test-records/guestbook/2026-11-11-0800-bbbb.md",
      "---\nname: Newer\nsubmitted: 2026-11-11T08:00:00Z\n---\nBest croissants.\n",
    );
    write(
      "data/contact/_datasource.yaml",
      "label: Contact\ncollected: true\nfields:\n  - name: email\n    kind: email\n    required: true\n",
    );
    write(
      "fragments/guestbook-thanks.liquid",
      '<p class="thanks">Merci {{ record.name }}, votre message paraîtra après relecture.</p>',
    );
    write(
      "pages/guestbook.liquid",
      `<!doctype html><html lang="fr"><head><title>Livre d'or</title></head><body>
<form id="sign" hx-post="/_data/guestbook" hx-target="this" hx-swap="outerHTML" hx-status:422="target:#problems swap:innerHTML">
  <input name="name"><textarea name="message"></textarea><div id="problems"></div><button>Signer</button>
</form>
<form id="contact" hx-post="/_data/contact" hx-target="this" hx-swap="outerHTML"><input name="email"><button>Envoyer</button></form>
{% for entry in data.guestbook %}<article class="entry">{{ entry.name }}: {{ entry.message }}</article>{% endfor %}
</body></html>`,
    );
    write("pages/_draft.liquid", "<p>draft</p>");
    await invoke("preview:navigate", "/guestbook");
    await until(async () => ((await shown()) ?? []).length === 2, 15_000);
    // Forms are tried in the visitor's view: in edit mode the page's own forms do nothing.
    await invoke("preview:set-mode", "visitor");
    // Until the page has it, the editor keeps the page's own submits and clicks.
    await until(() => page(`document.querySelector("spaka-editor")?.dataset.mode === "visitor"`));
  }, 90_000 * SLOW);
  afterAll(async () => {
    await launched?.close();
  });

  test("the test records are shown, newest first, and each form has the trap field", async () => {
    expect(await shown()).toEqual(["Newer: Best croissants.", "Older: Lovely bread."]);
    expect(await page(`document.querySelectorAll('form input[name="_website"]').length`)).toBe(2);
    await launched.capture("forms-test-records");
  });

  test("a mistake is answered 422 in the site's words, in the form", async () => {
    await submit("#sign", { name: "", message: "Bonjour" });
    await until(async () => ((await page(`document.querySelector("#problems")?.textContent`)) ?? "").length > 0);
    expect(await page(`document.querySelector("#problems").textContent`)).toContain("Votre nom est obligatoire");
    expect(testRecords("guestbook")).toHaveLength(2);
  });

  test("a form tried in the preview is answered with the fragment and kept as a test record", async () => {
    await submit("#sign", { name: "Claire", message: "Un pain sans gluten ?" });
    await until(async () => (await page(`document.querySelector(".thanks")?.textContent`)) != null);
    expect(await page(`document.querySelector(".thanks").textContent`)).toBe(
      "Merci Claire, votre message paraîtra après relecture.",
    );
    await until(async () => testRecords("guestbook").length === 3);
    const file = testRecords("guestbook").find((f) => !/aaaa|bbbb/.test(f))!;
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}-[0-9a-f]{4}\.md$/);
    const text = readFileSync(join(path, ".spaka/test-records/guestbook", file), "utf8");
    expect(text).toMatch(/^---\nname: Claire\nsubmitted: .+\nstatus: pending\n---\nUn pain sans gluten \?\n$/);
    // Held for review: not shown.
    await invoke("preview:navigate", "/guestbook");
    await until(async () => ((await shown()) ?? []).length === 2);
    expect(await shown()).not.toContainEqual(expect.stringContaining("Claire"));
  });

  test("without a fragment the built-in thanks answers; the record is shown at once", async () => {
    await submit("#contact", { email: "claire@example.com" });
    await until(async () => (await page(`document.querySelector("[data-spaka-sent]")?.textContent`)) != null);
    expect(await page(`document.querySelector("[data-spaka-sent]").textContent`)).toBe("Thank you, it was sent.");
    await until(async () => testRecords("contact").length === 1);
  });

  test("the agent is told of a page whose file starts with an underscore", async () => {
    const notes = await launched.app.evaluate(() =>
      // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
      ((globalThis as any).spaka.preview.site.runtime.pageNotes() as { file: string }[]).map((n) => n.file),
    );
    expect(notes).toEqual(["pages/_draft.liquid"]);
  });
});
