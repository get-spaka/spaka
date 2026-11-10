// After a run: fill the first htmx form of the project and submit it, in the same
// recorded browser. Tells whether what the agent wrote works in htmx 4 with the
// compatibility extension off, beyond the attributes merely being valid names.
// Throwaway spike code.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type { PreviewServer } from "../preview/server.ts";

export async function tryForm(page: Page, server: PreviewServer, projectDir: string) {
  for (const r of server.runtime.routes()) {
    if (new URL(page.url()).pathname !== r.route) await page.goto(server.url + r.route);
    await page.waitForTimeout(400);
    const form = page.locator("form[hx-post], form[data-hx-post]").first();
    if (!(await form.count())) continue;
    const action = (await form.getAttribute("hx-post")) ?? (await form.getAttribute("data-hx-post")) ?? "";
    const name = /^\/data\/([\w-]+)/.exec(action)?.[1];
    const count = () => {
      try {
        return (JSON.parse(readFileSync(path.join(projectDir, `data/${name}.json`), "utf8")).records ?? []).length as number;
      } catch {
        return null;
      }
    };
    const before = count();
    await form.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    // Fill every field with something plausible for its type.
    const filled: string[] = [];
    const radiosDone = new Set<string>();
    for (const field of await form.locator("input, textarea, select").all()) {
      const tag = await field.evaluate((e) => e.tagName.toLowerCase());
      const type = ((await field.getAttribute("type")) ?? "text").toLowerCase();
      const fieldName = (await field.getAttribute("name")) ?? "";
      if (!fieldName || ["hidden", "submit", "button", "file"].includes(type)) continue;
      if (!(await field.isVisible())) continue;
      if (tag === "select") {
        const options = await field.locator("option").all();
        const values = (await Promise.all(options.map((o) => o.getAttribute("value")))).filter((v) => v);
        if (values.length) await field.selectOption(values[values.length - 1]!);
      } else if (type === "radio") {
        if (radiosDone.has(fieldName)) continue;
        radiosDone.add(fieldName);
        await form.locator(`input[type=radio][name="${fieldName}"]`).last().check({ force: true });
      } else if (type === "checkbox") await field.check({ force: true });
      else if (type === "email") await field.fill("spike@example.com");
      else if (type === "number" || type === "range") await field.fill((await field.getAttribute("max")) ?? "4");
      else if (type === "date") await field.fill("2026-11-09");
      else if (type === "url") await field.fill("https://example.com");
      else await field.pressSequentially(tag === "textarea" ? "Added by the spike's form check." : "Spike Test", { delay: 25 });
      filled.push(fieldName);
    }
    const htmlBefore = await page.evaluate(() => document.body.innerText);
    const response = page.waitForResponse((res) => res.request().method() === "POST", { timeout: 5000 }).catch(() => null);
    await form.locator('button[type=submit], button:not([type]), input[type=submit]').first().click();
    const res = await response;
    await page.waitForTimeout(1500);
    const htmlAfter = await page.evaluate(() => document.body.innerText);
    const after = count();
    return {
      route: r.route,
      action,
      fields: filled,
      posted: !!res,
      status: res?.status() ?? null,
      // An htmx request carries this header; a plain form post (htmx not handling the form) does not.
      viaHtmx: res ? res.request().headers()["hx-request"] === "true" : false,
      recordsBefore: before,
      recordsAfter: after,
      recordAdded: before !== null && after !== null && after === before + 1,
      pageChanged: htmlBefore !== htmlAfter,
      // Elements that arrived through the htmx swap, and whether they still say where they come from.
      swappedIn: await page.evaluate(() => {
        const els = [...document.querySelectorAll('[data-up-src^="fragments/"]')];
        return { elements: els.length, withRecord: els.filter((e) => e.getAttribute("data-up-rec")).length, sample: els[0]?.getAttribute("data-up-src") ?? null, record: els.find((e) => e.getAttribute("data-up-rec"))?.getAttribute("data-up-rec") ?? null };
      }),
      stayedOnPage: new URL(page.url()).pathname === r.route,
    };
  }
  return { found: false };
}
