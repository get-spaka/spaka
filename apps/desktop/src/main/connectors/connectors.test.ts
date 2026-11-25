import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test } from "vitest";
import { Connectors, commandLine, launchedBy, PROJECT_CONNECTORS, splitCommand } from "./connectors";

// A stand-in for the keychain: reversible, and visibly not plain text.
const vault = {
  encrypt: (text: string) => Buffer.from(Buffer.from(text).toString("base64")),
  decrypt: (data: Buffer) => Buffer.from(data.toString(), "base64").toString(),
};

let data: string;
let project: { id: string; path: string };
let connectors: Connectors;
beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), "connectors-data-"));
  project = { id: "p1", path: mkdtempSync(join(tmpdir(), "connectors-project-")) };
  connectors = new Connectors(data, vault);
});

test("a remote connector for all websites: its token is kept encrypted, out of the definitions", () => {
  connectors.add("app", {
    name: "Docs",
    kind: "remote",
    target: "https://mcp.example.com/mcp",
    secrets: [{ name: "Authorization", value: "Bearer s3cret" }],
  });
  expect(readFileSync(join(data, "connectors.json"), "utf8")).not.toContain("s3cret");
  expect(readFileSync(join(data, "connector-secrets.bin"), "utf8")).not.toContain("s3cret");
  expect(connectors.list(project)).toEqual([
    {
      scope: "app",
      name: "docs",
      kind: "remote",
      target: "https://mcp.example.com/mcp",
      secrets: [{ name: "Authorization", set: true }],
      state: "on",
    },
  ]);
  expect(connectors.servers(project)).toEqual({
    docs: { type: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer s3cret" } },
  });
  expect(() => connectors.add("app", { name: "x", kind: "remote", target: "http://example.com" })).toThrow(/https/);
  expect(() => connectors.add("app", { name: "spaka", kind: "remote", target: "https://a.b" })).toThrow(/taken/);
});

test("a received project's local connector stays off until approved, and an edited command turns it off again", () => {
  const file = join(project.path, PROJECT_CONNECTORS);
  mkdirSync(join(project.path, ".spaka"), { recursive: true });
  const write = (args: string[]) =>
    writeFileSync(
      file,
      JSON.stringify({ connectors: [{ name: "files", kind: "local", command: "npx", args, env: ["TOKEN"] }] }),
    );
  write(["-y", "files-server"]);
  expect(connectors.list(project)[0]).toMatchObject({
    scope: "project",
    target: "npx -y files-server",
    state: "needs-approval",
  });
  expect(connectors.servers(project)).toEqual({});
  connectors.approveByName("files", project);
  // Approved, but its variable has no value on this machine.
  expect(connectors.list(project)[0]!.state).toBe("needs-secret");
  connectors.setSecrets("project", "files", { TOKEN: "t" }, project.id);
  expect(connectors.servers(project)).toEqual({
    files: { type: "stdio", ...launchedBy("npx", ["-y", "files-server"]), env: { TOKEN: "t" } },
  });
  const before = connectors.fingerprint(project);
  write(["-y", "files-server", "--evil"]);
  expect(connectors.list(project)[0]!.state).toBe("needs-approval");
  expect(connectors.fingerprint(project)).not.toBe(before);
  // The approval is for this project only.
  expect(connectors.list({ id: "p2", path: project.path })[0]!.state).toBe("needs-approval");
});

test("a local connector the maker adds to the project is on; its definition holds no value", () => {
  connectors.add(
    "project",
    {
      name: "notes",
      kind: "local",
      target: `node "/My Tools/notes.js" --verbose`,
      secrets: [{ name: "KEY", value: "k" }],
    },
    project,
  );
  const saved = readFileSync(join(project.path, PROJECT_CONNECTORS), "utf8");
  expect(JSON.parse(saved)).toEqual({
    connectors: [
      { name: "notes", kind: "local", command: "node", args: ["/My Tools/notes.js", "--verbose"], env: ["KEY"] },
    ],
  });
  expect(connectors.list(project)[0]).toMatchObject({ state: "on", target: `node "/My Tools/notes.js" --verbose` });
  connectors.remove("project", "notes", project);
  expect(connectors.list(project)).toEqual([]);
});

test("a project's connector replaces the app's of the same name; malformed entries are ignored", () => {
  connectors.add("app", { name: "docs", kind: "remote", target: "https://a.example/mcp" });
  mkdirSync(join(project.path, ".spaka"), { recursive: true });
  writeFileSync(
    join(project.path, PROJECT_CONNECTORS),
    JSON.stringify({
      connectors: [
        { name: "docs", kind: "remote", url: "https://b.example/mcp" },
        { name: "Bad Name", kind: "remote", url: "https://c.example" },
        { name: "spaka", kind: "local", command: "sh" },
      ],
    }),
  );
  expect(connectors.list(project).map((c) => `${c.scope}:${c.name}:${c.state}`)).toEqual([
    "app:docs:replaced",
    "project:docs:on",
  ]);
  expect(connectors.servers(project)).toEqual({ docs: { type: "http", url: "https://b.example/mcp" } });
});

test("a command line splits on spaces, keeping quoted parts whole", () => {
  expect(splitCommand(`npx -y "@scope/server" 'a b' c\\ d`, "darwin")).toEqual([
    "npx",
    "-y",
    "@scope/server",
    "a b",
    "c d",
  ]);
  expect(splitCommand("  ")).toEqual([]);
});

test("a remote connector may sign in as an app declared with its service (Q108); empty settings are left out", () => {
  connectors.add("app", {
    name: "slack",
    kind: "remote",
    target: "https://mcp.slack.example/mcp",
    oauth: { clientId: " 1234.5678 ", callbackPort: "3118", authServerMetadataUrl: "" },
  });
  connectors.add("app", {
    name: "notion",
    kind: "remote",
    target: "https://mcp.notion.example/mcp",
    oauth: { clientId: "", callbackPort: "", authServerMetadataUrl: "" },
  });
  expect(connectors.servers(project)).toEqual({
    slack: { type: "http", url: "https://mcp.slack.example/mcp", oauth: { clientId: "1234.5678", callbackPort: 3118 } },
    notion: { type: "http", url: "https://mcp.notion.example/mcp" },
  });
  expect(connectors.list(project)[0]).toMatchObject({ oauth: { clientId: "1234.5678", callbackPort: 3118 } });
  const bad = (oauth: { clientId?: string; callbackPort?: string; authServerMetadataUrl?: string }) => () =>
    connectors.add("app", { name: "x", kind: "remote", target: "https://a.example", oauth });
  expect(bad({ callbackPort: "80" })).toThrow(/port/);
  expect(bad({ clientId: "has spaces" })).toThrow(/identifier/);
  expect(bad({ authServerMetadataUrl: "http://a.example" })).toThrow(/https/);

  // From a received project: settings that do not hold make the entry ignored.
  mkdirSync(join(project.path, ".spaka"), { recursive: true });
  writeFileSync(
    join(project.path, PROJECT_CONNECTORS),
    JSON.stringify({
      connectors: [
        { name: "good", kind: "remote", url: "https://g.example", oauth: { clientId: "abc", callbackPort: 4000 } },
        { name: "port", kind: "remote", url: "https://p.example", oauth: { callbackPort: 22 } },
        { name: "extra", kind: "remote", url: "https://e.example", oauth: { clientSecret: "x" } },
      ],
    }),
  );
  expect(
    connectors
      .list(project)
      .filter((c) => c.scope === "project")
      .map((c) => c.name),
  ).toEqual(["good"]);
});

test("on Windows a backslash is a folder's separator, and npx goes through cmd", () => {
  expect(splitCommand(`C:\\tools\\server.exe --root "C:\\My Sites\\a" "say \\"hi\\""`, "win32")).toEqual([
    "C:\\tools\\server.exe",
    "--root",
    "C:\\My Sites\\a",
    'say "hi"',
  ]);
  const def = { command: "C:\\tools\\server.exe", args: ["--root", "C:\\My Sites\\a"] };
  expect(splitCommand(commandLine(def, "win32"), "win32")).toEqual([def.command, ...def.args]);
  expect(launchedBy("npx", ["-y", "@scope/server"], "win32")).toEqual({
    command: "cmd",
    args: ["/c", "npx", "-y", "@scope/server"],
  });
  expect(launchedBy("C:\\tools\\server.exe", [], "win32")).toEqual({ command: "C:\\tools\\server.exe", args: [] });
  expect(launchedBy("npx", ["x"], "darwin")).toEqual({ command: "npx", args: ["x"] });
});
