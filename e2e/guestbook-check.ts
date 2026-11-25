// The "Guestbook" scenario with the real agent (step 4), shared by
// agent-forms.e2e.ts and the packaged check: a bakery with a guestbook shown
// once approved and a contact form, asked for in one message. Then what the
// agent wrote: the collected datasources (review for the guestbook, an e-mail
// field for the contact form), three test records for the one a page shows
// and none for the other, the forms posting to /_data/<name> with their 422
// alert routed, the answer fragment, the alert texts in the definition; and
// the forms tried in the preview: 422 for an empty one, the answer for a
// filled one, kept as a test record.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { parse } from "yaml";
import type { LaunchedApp } from "./app.ts";

export const GUESTBOOK_MESSAGE =
  "A website for Chez Margot, a bakery in Lyon: a home page, a guestbook page where visitors leave a message that appears on the page once I have approved it, and a contact page with a form (name, e-mail, phone, message).";

export type GuestbookReport = {
  turnMs: number;
  collected: { name: string; review?: boolean; answer?: string; messages?: string[]; kinds: string[]; tests: number }[];
  forms: { page: string; datasource: string; status422: boolean }[];
  guestbook?: string;
  contact?: string;
  tried: { datasource: string; empty: number; filled: number; answer: string; kept: boolean }[];
  notes: unknown[];
};

/** What a visitor might fill a form's fields with, by kind. */
export function sampleValues(fields: { name: string; kind: string }[], who: string): Record<string, string> {
  const value = (kind: string) =>
    kind === "email"
      ? `${who.toLowerCase()}@example.com`
      : kind === "phone"
        ? "+33 6 12 34 56 78"
        : kind === "number"
          ? "3"
          : kind === "boolean"
            ? "on"
            : kind === "date"
              ? "2026-11-12"
              : `${who}, from Lyon. Lovely bread.`;
  return Object.fromEntries(fields.map((f) => [f.name, value(f.kind)]));
}

export async function buildGuestbook(launched: LaunchedApp, timeout = 900_000): Promise<GuestbookReport> {
  const invoke = (channel: string, ...args: unknown[]) =>
    launched.window.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the preload's bridge
      ([channel, args]) => (window as any).spaka.invoke(channel, ...args),
      [channel, args] as const,
    );
  const page = (code: string) =>
    launched.app.evaluate(
      // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
      (_electron, code) => (globalThis as any).spaka.preview.view.webContents.executeJavaScript(code),
      code,
    );
  const report: GuestbookReport = { turnMs: 0, collected: [], forms: [], tried: [], notes: [] };
  const started = Date.now();
  await invoke("conversation:send", GUESTBOOK_MESSAGE);
  for (;;) {
    const { items } = await invoke("conversation:get");
    const last = items.at(-1);
    if (last?.kind === "agent" && last.status !== "working") {
      expect(last.status).toBe("done");
      break;
    }
    if (Date.now() - started > timeout) throw new Error(`the agent did not finish in ${timeout / 60_000} minutes`);
    await new Promise((r) => setTimeout(r, 500));
  }
  report.turnMs = Date.now() - started;
  const { path } = (await invoke("projects:current")) as { path: string };

  // The collected datasources and their test records.
  const data = join(path, "data");
  const tests = join(path, ".spaka/test-records");
  for (const name of existsSync(data) ? readdirSync(data) : []) {
    const file = join(data, name, "_datasource.yaml");
    if (!existsSync(file)) continue;
    const definition = parse(readFileSync(file, "utf8")) ?? {};
    if (definition.collected !== true) continue;
    report.collected.push({
      name,
      review: definition.review,
      answer: definition.answer,
      messages: definition.messages ? Object.keys(definition.messages) : undefined,
      kinds: (definition.fields ?? []).map((f: { kind: string }) => f.kind),
      tests: existsSync(join(tests, name)) ? readdirSync(join(tests, name)).filter((f) => f.endsWith(".md")).length : 0,
    });
  }

  // The forms, in every page and fragment.
  for (const dir of ["pages", "fragments", "parts"]) {
    const folder = join(path, dir);
    for (const file of existsSync(folder) ? readdirSync(folder, { recursive: true }).map(String) : []) {
      if (!file.endsWith(".liquid")) continue;
      const text = readFileSync(join(folder, file), "utf8");
      for (const tag of text.match(/<form\b[^>]*>/gi) ?? []) {
        const datasource = /\/_data\/([\w-]+)/.exec(tag)?.[1];
        if (datasource) report.forms.push({ page: `${dir}/${file}`, datasource, status422: /hx-status:422/.test(tag) });
      }
    }
  }
  report.guestbook = report.collected.find((c) => c.review === true)?.name;
  report.contact = report.collected.find((c) => c.kinds.includes("email") && c.name !== report.guestbook)?.name;
  expect(report.guestbook, JSON.stringify(report.collected)).toBeTruthy();
  expect(report.contact, JSON.stringify(report.collected)).toBeTruthy();
  const guestbook = report.collected.find((c) => c.name === report.guestbook)!;
  const contact = report.collected.find((c) => c.name === report.contact)!;
  expect(guestbook.tests).toBeGreaterThanOrEqual(3);
  expect(contact.tests).toBe(0);
  for (const name of [guestbook.name, contact.name])
    expect(
      report.forms.some((f) => f.datasource === name),
      `a form for ${name}`,
    ).toBe(true);
  if (guestbook.answer) expect(existsSync(join(path, "fragments", `${guestbook.answer}.liquid`))).toBe(true);

  // The forms tried in the preview, as the visitor's view sends them.
  for (const c of [contact, guestbook]) {
    const before = existsSync(join(tests, c.name)) ? readdirSync(join(tests, c.name)).length : 0;
    const fields = parse(readFileSync(join(data, c.name, "_datasource.yaml"), "utf8")).fields as {
      name: string;
      kind: string;
    }[];
    const values = sampleValues(fields, "Anne");
    const tried = (await page(`(async () => {
      const send = (body) => fetch("/_data/${c.name}", { method: "POST", headers: { "hx-request": "true" }, body: new URLSearchParams(body) });
      const empty = await send({});
      const filled = await send(${JSON.stringify(values)});
      return { empty: empty.status, filled: filled.status, answer: (await filled.text()).replace(/\\s+/g, " ").slice(0, 300) };
    })()`)) as { empty: number; filled: number; answer: string };
    await new Promise((r) => setTimeout(r, 500));
    const after = existsSync(join(tests, c.name)) ? readdirSync(join(tests, c.name)).length : 0;
    report.tried.push({ datasource: c.name, ...tried, kept: after === before + 1 });
  }
  report.notes = await launched.app.evaluate(
    // biome-ignore lint/suspicious/noExplicitAny: the main process's globals, set for checks
    () => (globalThis as any).spaka.preview.site.runtime.pageNotes(),
  );
  for (const t of report.tried) {
    expect(t.empty, JSON.stringify(t)).toBe(422);
    expect(t.filled, JSON.stringify(t)).toBe(200);
    expect(t.kept, JSON.stringify(t)).toBe(true);
  }
  return report;
}
