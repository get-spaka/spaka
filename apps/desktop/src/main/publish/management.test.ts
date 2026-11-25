import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { callSite, ManagementTokens, recordsCsv, type SiteUnavailable } from "./management";

const vault = {
  encrypt: (text: string) => Buffer.from([...text].reverse().join("")),
  decrypt: (data: Buffer) => [...data.toString()].reverse().join(""),
};

describe("management tokens", () => {
  test("one per website, made when first needed, kept encrypted, replaced on demand", () => {
    const dir = mkdtempSync(join(tmpdir(), "tokens-"));
    const tokens = new ManagementTokens(dir, vault);
    expect(tokens.get("a")).toBeUndefined();
    const first = tokens.ensure("a");
    expect(first).toMatch(/^[\w-]{32}$/);
    expect(tokens.ensure("a")).toBe(first);
    expect(new ManagementTokens(dir, vault).get("a")).toBe(first);
    expect(tokens.ensure("b")).not.toBe(first);
    const second = tokens.create("a");
    expect(second).not.toBe(first);
    expect(tokens.get("a")).toBe(second);
    expect(new ManagementTokens(dir, { ...vault, decrypt: () => "not json" }).get("a")).toBeUndefined();
  });
});

describe("records as CSV", () => {
  test("one column per field, quoted where needed, a formula written as text", () => {
    const csv = recordsCsv(
      ["name", "topics"],
      [
        { id: "1", submitted: "2026-11-12", status: "pending", fields: { name: "+33 6", topics: ["a", "b"] } },
        { id: "2", submitted: "2026-11-11", status: "published", fields: { name: 'Line\n"two"' } },
      ],
    );
    expect(csv).toBe(
      'id,submitted,status,name,topics\r\n1,2026-11-12,pending,\'+33 6,"a, b"\r\n2,2026-11-11,published,"Line\n""two""",\r\n',
    );
  });
});

describe("calling a published site", () => {
  const serve = async (status: number, body: string) => {
    const server = createServer((_, res) => res.writeHead(status, { "content-type": "application/json" }).end(body));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    return { url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, server };
  };
  const reason = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e: SiteUnavailable) => e.reason,
    );

  test("why it could not be reached, in a word", async () => {
    expect(await reason(callSite(undefined, "t", "ping"))).toBe("no-address");
    expect(await reason(callSite("http://127.0.0.1:1", undefined, "ping"))).toBe("no-token");
    expect(await reason(callSite("http://127.0.0.1:1", "t", "ping"))).toBe("unreachable");
    for (const [status, body, expected] of [
      [401, "{}", "wrong-token"],
      [404, "not found", "not-spaka"],
      [200, "<html>", "not-spaka"],
      [500, '{"error":"no table"}', "failed"],
      [200, '{"ok":true}', "ok"],
    ] as const) {
      const { url, server } = await serve(status, body);
      expect(await reason(callSite(url, "t", "ping"))).toBe(expected);
      server.close();
    }
  });
});
