import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PiConnectors, VaultSignIns } from "./connectors";
import { answer, STDIO_SERVER } from "./mcp-test-server";

const vault = {
  encrypt: (text: string) => Buffer.from(`check:${Buffer.from(text).toString("base64")}`),
  decrypt: (data: Buffer) => Buffer.from(data.toString().slice(6), "base64").toString(),
};

let dir: string;
let servers: Server[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "spaka-connectors-"));
});
afterEach(async () => {
  for (const s of servers) s.close();
  servers = [];
  rmSync(dir, { recursive: true, force: true });
});

function connectorsFor(servers: ConstructorParameters<typeof PiConnectors>[0]["servers"], changes: string[] = []) {
  return new PiConnectors({
    servers,
    signIns: new VaultSignIns(join(dir, "sign-ins.bin"), vault),
    cwd: dir,
    env: () => ({ PATH: process.env.PATH ?? "" }),
    onChange: () => changes.push("change"),
  });
}

test("a local connector runs in the project's folder; its tools are the agent's, named as Claude's", async () => {
  writeFileSync(join(dir, "server.mjs"), STDIO_SERVER);
  const set = connectorsFor({ notes: { type: "stdio", command: process.execPath, args: [join(dir, "server.mjs")] } });
  expect(set.status()).toEqual([{ name: "notes", status: "pending" }]);
  await set.connect();
  expect(set.status()).toEqual([{ name: "notes", status: "connected" }]);
  const tools = set.tools();
  expect(tools.map((t) => [t.name, t.executionMode])).toEqual([
    ["mcp__notes__add_note", "sequential"],
    ["mcp__notes__list_notes", "parallel"],
  ]);
  const result = await tools[0]!.execute("id", { text: "Roses" });
  expect(result.content).toEqual([{ type: "text", text: "noted: Roses" }]);
  await set.close();
});

test("a local connector that stops is connected again at the next message", async () => {
  writeFileSync(join(dir, "server.mjs"), STDIO_SERVER);
  const set = connectorsFor({ notes: { type: "stdio", command: process.execPath, args: [join(dir, "server.mjs")] } });
  await set.connect();
  await set.tools()[0]!.execute("id", { text: "bye" });
  for (let i = 0; i < 100 && set.status()[0]?.status === "connected"; i++) await new Promise((r) => setTimeout(r, 20));
  expect(set.status()).toEqual([
    { name: "notes", status: "failed", error: expect.stringMatching(/closed its connection/) },
  ]);
  expect(set.tools()).toEqual([]);
  set.reconnect();
  await set.ready();
  expect(set.status()).toEqual([{ name: "notes", status: "connected" }]);
  await set.close();
});

test("a connector that cannot start, or speaks the older SSE, says why", async () => {
  const set = connectorsFor({
    broken: { type: "stdio", command: join(dir, "missing"), args: [] },
    old: { type: "sse", url: "https://example.com/sse" },
  });
  await set.connect();
  const status = Object.fromEntries(set.status().map((s) => [s.name, s]));
  expect(status.broken?.status).toBe("failed");
  expect(status.old).toMatchObject({ status: "failed", error: expect.stringMatching(/older SSE transport/) });
  expect(set.tools()).toEqual([]);
  await set.close();
});

/**
 * A remote connector behind OAuth, with its authorization server: discovery,
 * registration, the authorization page (which sends the browser straight
 * back with a code), the token, then MCP over Streamable HTTP.
 */
async function oauthServer() {
  const issued = "token-e2e";
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const url = new URL(req.url ?? "/", base);
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    seen.push(`${req.method} ${url.pathname}`);
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
      return json(200, { resource: `${base}/mcp`, authorization_servers: [base] });
    if (
      url.pathname.startsWith("/.well-known/oauth-authorization-server") ||
      url.pathname.startsWith("/.well-known/openid")
    )
      return json(200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    if (url.pathname === "/register") return json(201, { ...JSON.parse(body), client_id: "spaka-client" });
    if (url.pathname === "/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", "code-e2e");
      back.searchParams.set("state", url.searchParams.get("state")!);
      back.searchParams.set("iss", base);
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/token") return json(200, { access_token: issued, token_type: "Bearer", expires_in: 3600 });
    if (url.pathname === "/mcp") {
      if (req.headers.authorization !== `Bearer ${issued}`) {
        res.writeHead(401, {
          "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
        });
        return res.end();
      }
      if (req.method !== "POST") {
        res.writeHead(405);
        return res.end();
      }
      const message = JSON.parse(body);
      if (message.id === undefined) {
        res.writeHead(202);
        return res.end();
      }
      return json(200, { jsonrpc: "2.0", id: message.id, result: answer(message) });
    }
    res.writeHead(404);
    res.end();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, seen };
}

test("a remote connector asks for a sign-in; the browser's return connects it, the token kept encrypted", async () => {
  const { url } = await oauthServer();
  const changes: string[] = [];
  const set = connectorsFor({ crm: { type: "http", url } }, changes);
  await set.connect();
  expect(set.status()).toEqual([{ name: "crm", status: "needs-auth" }]);
  const page = await set.signIn("crm");
  expect(page).toMatch(/\/authorize\?/);
  // The maker's browser: the authorization page sends it back to Spaka on this computer.
  await fetch(page!);
  for (let i = 0; i < 100 && set.status()[0]?.status !== "connected"; i++) await new Promise((r) => setTimeout(r, 20));
  expect(set.status()).toEqual([{ name: "crm", status: "connected" }]);
  expect(set.tools().map((t) => t.name)).toEqual(["mcp__crm__add_note", "mcp__crm__list_notes"]);
  expect(changes.length).toBeGreaterThan(0);
  const kept = readFileSync(join(dir, "sign-ins.bin"), "utf8");
  expect(kept).not.toContain("token-e2e");
  expect(vault.decrypt(Buffer.from(kept))).toContain("token-e2e");
  await set.close();
  // At the next start, the kept sign-in connects it at once.
  const again = connectorsFor({ crm: { type: "http", url } });
  await again.connect();
  expect(again.status()).toEqual([{ name: "crm", status: "connected" }]);
  await again.close();
});

test("a remote connector reached with a key in its headers is not signed in to: a refused key fails", async () => {
  const { url } = await oauthServer();
  const set = connectorsFor({ crm: { type: "http", url, headers: { "x-api-key": "refused" } } });
  await set.connect();
  expect(set.status()).toEqual([{ name: "crm", status: "failed", error: expect.stringMatching(/refused its key/) }]);
  await set.close();
});
