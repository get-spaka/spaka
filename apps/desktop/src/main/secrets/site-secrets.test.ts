import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { applyEvent, type ConversationItem, waitingFor } from "../../shared/conversation";
import { SiteSecrets, secretsReadBy } from "./site-secrets";

/** A vault that only marks what it kept, as the checks' launches do. */
const vault = {
  encrypt: (text: string) => Buffer.from(`sealed:${Buffer.from(text).toString("base64")}`),
  decrypt: (data: Buffer) => Buffer.from(data.toString().replace(/^sealed:/, ""), "base64").toString(),
};

function site(files: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "spaka-secrets-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("a website's secrets (Q501, Q558)", () => {
  test("are kept sealed per website, listed without their values, with those the modules read and lack", () => {
    const data = site();
    const project = site({
      "server/book.ts": "export async function action(f, { env }) { return pay(env.PAYMENT_KEY, env['MAILER_KEY']); }",
      "server/news.ts": "export async function load(args, { env: { NEWS_TOKEN, other } }) {}",
      "server/later.js": "export function load(a, ctx) { const { MAILER_KEY } = ctx.env; }",
      "server/node_modules/x/index.js": "env.NOT_OURS",
    });
    const secrets = new SiteSecrets(data, vault);
    secrets.set("p1", "PAYMENT_KEY", " sk_test_123 ", { purpose: "Stripe's secret key", where: "Stripe › API keys" });
    secrets.set("p2", "OTHER", "x");
    expect(readFileSync(join(data, "site-secrets.bin"), "utf8")).not.toContain("sk_test_123");
    expect(secrets.values("p1")).toEqual({ PAYMENT_KEY: "sk_test_123" });
    expect(secrets.has("p1", "OTHER")).toBe(false);
    expect(secrets.list("p1", project)).toEqual([
      { name: "MAILER_KEY", set: false, readBy: ["server/book.ts", "server/later.js"] },
      { name: "NEWS_TOKEN", set: false, readBy: ["server/news.ts"] },
      {
        name: "PAYMENT_KEY",
        set: true,
        purpose: "Stripe's secret key",
        at: expect.any(String),
        readBy: ["server/book.ts"],
      },
    ]);
    // Replaced, it keeps what the agent said of it; removed, it is missing again.
    secrets.set("p1", "PAYMENT_KEY", "sk_test_456");
    expect(secrets.list("p1", project).find((s) => s.name === "PAYMENT_KEY")?.purpose).toBe("Stripe's secret key");
    expect(secrets.values("p1")).toEqual({ PAYMENT_KEY: "sk_test_456" });
    secrets.remove("p1", "PAYMENT_KEY");
    expect(secrets.list("p1", project).find((s) => s.name === "PAYMENT_KEY")).toEqual({
      name: "PAYMENT_KEY",
      set: false,
      readBy: ["server/book.ts"],
    });
    expect(() => secrets.set("p1", "payment-key", "x")).toThrow(/capitals/);
    expect(() => secrets.set("p1", "KEY", "  ")).toThrow(/no value/);
    expect(secretsReadBy(site())).toEqual({});
  });

  test("the agent's card holds the name, purpose and where to find it, and settles to given, never a value", () => {
    let items: ConversationItem[] = [];
    items = applyEvent(items, { type: "turn-start", id: "t", text: "Take payments", at: 0 });
    items = applyEvent(items, {
      type: "secret",
      card: {
        id: "s1",
        name: "PAYMENT_KEY",
        purpose: "Stripe's secret key",
        where: "Stripe › API keys",
        state: "waiting",
      },
    });
    expect(waitingFor(items)).toMatchObject({ id: "s1", name: "PAYMENT_KEY" });
    items = applyEvent(items, { type: "question-settled", id: "s1", state: "answered", answer: { kind: "secret" } });
    expect(waitingFor(items)).toBeUndefined();
    const last = items.at(-1);
    expect(last?.kind === "agent" && last.parts[0]).toEqual({
      kind: "secret",
      card: {
        id: "s1",
        name: "PAYMENT_KEY",
        purpose: "Stripe's secret key",
        where: "Stripe › API keys",
        state: "answered",
        answer: { kind: "secret" },
      },
    });
  });
});
