import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type LaunchedApp, launchApp } from "./app.ts";
import { previewDriver } from "./preview-driver.ts";

// The Content tab (Q148, Q162-Q166), on the recorded bakery with a blog and
// a team written beside it: a field written half a second after typing, the
// preview following, one version when the record is left; a record added
// with an id from its title; a manual order dragged; an id changed; a
// record that does not read, marked, with the agent asked to fix it; a
// record deleted and brought back.
describe("the Content tab", () => {
  let launched: LaunchedApp;
  let path: string;
  const { invoke, until, page } = previewDriver(() => launched);
  const w = () => launched.window;
  const file = (name: string) => readFileSync(join(path, name), "utf8");
  const records = () =>
    w()
      .getByTestId("record")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  const hand = async () =>
    ((await invoke("history:list")) as { kind: string }[]).filter((e) => e.kind === "hand").length;
  const last = async () => ((await invoke("history:list")) as { kind: string; label: string }[]).at(-1);

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
      "data/posts/_datasource.yaml",
      "label: Posts\nfields:\n  - name: title\n    kind: text\n    required: true\n  - name: date\n    kind: date\n  - name: featured\n    kind: boolean\n  - name: tags\n    kind: list\n  - name: body\n    kind: markdown\nbody: body\nsort: -date\n",
    );
    write("data/posts/first.md", "---\ntitle: First post\ndate: 2026-11-01\n---\nHello.\n");
    write("data/posts/second.md", "---\ntitle: Second post\ndate: 2026-11-05\n---\nAgain.\n");
    write(
      "data/team/_datasource.yaml",
      "label: Team\nfields:\n  - name: name\n    kind: text\norder: [zoe, adam, bea]\n",
    );
    for (const [id, name] of [
      ["adam", "Adam"],
      ["bea", "Bea"],
      ["zoe", "Zoe"],
    ])
      write(`data/team/${id}.md`, `---\nname: ${name}\n---\n`);
    write(
      "pages/blog/index.liquid",
      "<!doctype html><html><head><title>Blog</title></head><body><ul>{% for post in data.posts %}<li>{{ post.title }}</li>{% endfor %}</ul></body></html>",
    );
    write(
      "pages/blog/[posts].liquid",
      "<!doctype html><html><head><title>Post</title></head><body><h1>{{ record.title }}</h1>{{ record.body }}</body></html>",
    );
    await w().getByTestId("tab-content").click();
    await until(async () => (await w().getByTestId("datasource").count()) === 2);
  }, 60_000);
  afterAll(async () => {
    await launched?.close();
  });

  test("the datasources, and a datasource's records in its order", async () => {
    expect(await w().getByTestId("datasource").allTextContents()).toEqual([
      expect.stringContaining("Posts2 records"),
      // No page shows the team: marked (Q211), a collection kept all the same.
      expect.stringContaining("TeamUsed by no page3 records"),
    ]);
    expect(await w().getByTestId("datasource-delete").count()).toBe(0);
    await w().locator('[data-testid="datasource"][data-name="posts"]').click();
    await until(async () => (await records()).length === 2);
    expect(await records()).toEqual(["second", "first"]);
    await expect(w().getByTestId("content").textContent()).resolves.toContain(
      "Sorted by date, newest or largest first",
    );
  });

  test("a field written half a second after typing, the preview following; one version on leaving (Q162)", async () => {
    await invoke("preview:navigate", "/blog");
    await until(() => page("document.body.innerText.includes('First post')"));
    const versions = await hand();
    await w().locator('[data-testid="record"][data-id="first"] button').first().click();
    const title = w().getByTestId("field-title");
    await until(async () => (await title.inputValue()) === "First post");
    expect(await w().getByTestId("field-body").inputValue()).toBe("Hello.\n");
    await title.fill("First of all");
    await w().getByTestId("field-featured").check();
    await w().getByTestId("field-tags").fill("news\nshop");
    await until(async () => file("data/posts/first.md").includes("title: First of all"));
    await until(async () => file("data/posts/first.md").includes("tags: [news, shop]"));
    expect(file("data/posts/first.md")).toBe(
      "---\ntitle: First of all\ndate: 2026-11-01\nfeatured: true\ntags: [news, shop]\n---\nHello.\n",
    );
    await until(() => page("document.body.innerText.includes('First of all')"));
    expect(await hand()).toBe(versions);
    await w().getByTestId("content-back").click();
    await until(async () => (await last())?.label === "Edited First of all");
    expect(await hand()).toBe(versions + 1);
  });

  test("a record added, its id from its title (Q165); its page grouped with the others", async () => {
    await w().getByTestId("record-add").click();
    await w().getByTestId("field-title").fill("Third post!");
    await w().getByTestId("field-date").fill("2026-11-09");
    await until(() => Promise.resolve(existsSync(join(path, "data/posts/third-post.md"))));
    await until(async () => file("data/posts/third-post.md").includes("date: 2026-11-09"));
    expect(file("data/posts/third-post.md")).toBe("---\ntitle: Third post!\ndate: 2026-11-09\n---\n");
    await w().getByTestId("content-back").click();
    await until(async () => (await last())?.label === "Added Third post!");
    await until(async () => (await records()).join() === "third-post,second,first");
    const routes = (await launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's objects, set for checks
      () => (globalThis as any).upstart.preview.state(),
    )) as { routes: { route: string; group?: string }[] };
    expect(routes.routes.filter((r) => r.group === "Posts").map((r) => r.route)).toEqual([
      "/blog/third-post",
      "/blog/second",
      "/blog/first",
    ]);
  });

  test("a record's id changed, its page's address with it, the broken links said", async () => {
    await w().locator('[data-testid="record"][data-id="third-post"] button').first().click();
    await w().getByTestId("record-rename").click();
    await expect(w().getByTestId("record-form").textContent()).resolves.toContain(
      "Links to /blog/third-post will no longer work.",
    );
    await w().getByTestId("record-id-input").fill("third");
    await w().getByTestId("record-id-save").click();
    await until(() => Promise.resolve(existsSync(join(path, "data/posts/third.md"))));
    expect(existsSync(join(path, "data/posts/third-post.md"))).toBe(false);
    await until(async () => (await w().getByTestId("record-id").textContent()) === "/blog/third");
    expect((await last())?.label).toBe("Record renamed");
    await w().getByTestId("content-back").click();
  });

  test("a manual order dragged, kept in the definition (Q153)", async () => {
    await w().getByTestId("content-back").click();
    await w().locator('[data-testid="datasource"][data-name="team"]').click();
    await until(async () => (await records()).join() === "zoe,adam,bea");
    await w()
      .locator('[data-testid="record"][data-id="bea"]')
      .dragTo(w().locator('[data-testid="record"][data-id="zoe"]'), { targetPosition: { x: 20, y: 4 } });
    await until(async () => file("data/team/_datasource.yaml").includes("order: [bea, zoe, adam]"));
    await until(async () => (await records()).join() === "bea,zoe,adam");
    expect((await last())?.label).toBe("Records reordered");
    await w().getByTestId("content-back").click();
  });

  test("a record that does not read, marked, the agent asked to fix it (Q166)", async () => {
    writeFileSync(join(path, "data/posts/broken.md"), "---\ntitle: [unclosed\n---\nx\n");
    writeFileSync(join(path, "data/posts/untitled.md"), "---\ndate: 2026-10-01\n---\n");
    await w().locator('[data-testid="datasource"][data-name="posts"]').click();
    await until(async () => (await records()).includes("broken"));
    await w().locator('[data-testid="record"][data-id="untitled"] button').first().click();
    await expect(w().getByTestId("record-problems").textContent()).resolves.toContain("title is required");
    await w().getByTestId("content-back").click();
    await w().locator('[data-testid="record"][data-id="broken"] button').first().click();
    await w().getByTestId("record-problems").waitFor();
    await launched.capture("content-record-problem");
    await w().getByTestId("record-problems").getByRole("button").click();
    const input = w().getByTestId("message-input");
    await until(async () => (await input.inputValue()).startsWith("Fix data/posts/broken.md:"));
    await w().getByTestId("tab-content").click();
  });

  test("a record deleted, and brought back", async () => {
    // Back from the conversation, the tab shows its datasources.
    await w().locator('[data-testid="datasource"][data-name="posts"]').click();
    await until(async () => (await records()).includes("second"));
    await w().locator('[data-testid="record"][data-id="second"] [data-testid="record-delete"]').click();
    await until(() => Promise.resolve(!existsSync(join(path, "data/posts/second.md"))));
    await expect(w().getByTestId("record-deleted").textContent()).resolves.toContain("Second post deleted");
    await until(async () => !(await records()).includes("second"));
    await w().getByTestId("record-deleted-undo").click();
    await until(() => Promise.resolve(existsSync(join(path, "data/posts/second.md"))));
    await until(async () => (await records()).includes("second"));
    await launched.capture("content-records");
  });

  test("a menu's links edited as rows: changed, added, moved, removed (Q212)", async () => {
    const write = (name: string, text: string) => {
      mkdirSync(join(path, name, ".."), { recursive: true });
      writeFileSync(join(path, name), text);
    };
    write(
      "data/navigation/_datasource.yaml",
      "label: Navigation\nfields:\n  - name: label\n    kind: text\n  - name: href\n    kind: link\n  - name: links\n    kind: links\n",
    );
    write(
      "data/navigation/services.md",
      "---\nlabel: Services\nhref: /services\nlinks:\n  - label: Bread\n    href: /bread\n  - label: Cakes\n    href: /cakes\n---\n",
    );
    await w()
      .getByTestId("content-back")
      .click()
      .catch(() => {});
    await until(async () => (await w().locator('[data-testid="datasource"][data-name="navigation"]').count()) === 1);
    await w().locator('[data-testid="datasource"][data-name="navigation"]').click();
    await until(async () => (await records()).includes("services"));
    await w().locator('[data-testid="record"][data-id="services"] button').first().click();
    const rows = w().getByTestId("link-row");
    await until(async () => (await rows.count()) === 2);
    await rows.nth(1).getByTestId("link-label").fill("Pastries");
    await until(async () => file("data/navigation/services.md").includes("label: Pastries"));
    await w().getByTestId("link-add").click();
    await rows.nth(2).getByTestId("link-label").fill("Coffee");
    await rows.nth(2).getByTestId("link-href").fill("/coffee");
    await until(async () => file("data/navigation/services.md").includes("href: /coffee"));
    await rows.nth(0).getByTestId("link-remove").click();
    await until(async () => !file("data/navigation/services.md").includes("Bread"));
    expect(file("data/navigation/services.md")).toBe(
      "---\nlabel: Services\nhref: /services\nlinks:\n  - label: Pastries\n    href: /cakes\n  - label: Coffee\n    href: /coffee\n---\n",
    );
    await launched.capture("content-links");
    await w().getByTestId("content-back").click();
  });

  test("a page's own list under its page; once no page shows it, marked and deleted, then brought back (Q210, Q211)", async () => {
    // Back from the navigation's records to the datasources.
    while (await w().getByTestId("content-back").count()) await w().getByTestId("content-back").click();
    const home = file("pages/index.liquid");
    const loop = '<section>{% for q in data["home-faq"] %}<p>{{ q.question }}</p>{% endfor %}</section>';
    mkdirSync(join(path, "data/home-faq"), { recursive: true });
    writeFileSync(
      join(path, "data/home-faq/_datasource.yaml"),
      "label: Questions\nfields:\n  - name: question\n    kind: text\n",
    );
    writeFileSync(join(path, "data/home-faq/delivery.md"), "---\nquestion: Do you deliver?\n---\n");
    writeFileSync(join(path, "pages/index.liquid"), home.replace("</body>", `${loop}\n</body>`));
    const listed = w().locator('[data-testid="datasource-page"][data-route="/"] [data-testid="datasource"]');
    await until(async () => (await listed.count()) === 1);
    expect(await listed.getAttribute("data-name")).toBe("home-faq");
    expect(await listed.getAttribute("data-unused")).toBeNull();
    expect(await w().getByTestId("datasource-sections").textContent()).toContain("SectionsHome");
    await launched.capture("content-sections");
    // The section taken out of the page: the list is marked, and can go.
    writeFileSync(join(path, "pages/index.liquid"), home);
    await until(async () => (await listed.getAttribute("data-unused")) === "true");
    await w().locator('[data-testid="datasource-page"] [data-testid="datasource-delete"]').click();
    await until(() => Promise.resolve(!existsSync(join(path, "data/home-faq"))));
    await expect(last()).resolves.toMatchObject({ kind: "hand", label: "Questions deleted" });
    await w().getByTestId("record-deleted-undo").click();
    await until(() => Promise.resolve(existsSync(join(path, "data/home-faq/delivery.md"))));
  });
});
