import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { VENDOR } from "@spaka/runtime";
import { expect, test } from "vitest";
import { safeJoin } from "./server";

test("every library the preview serves resolves from the app", () => {
  const appRequire = createRequire(import.meta.url);
  for (const vendor of Object.values(VENDOR)) expect(() => appRequire.resolve(vendor.module)).not.toThrow();
});

test("a project file is served only from inside the project, never from a hidden folder", () => {
  // The project's folder, on this system (C:\p on Windows).
  const p = resolve("/p");
  expect(safeJoin("/p", "/img/a.png")).toBe(join(p, "img", "a.png"));
  expect(safeJoin("/p", "/../etc/passwd")).toBe(join(p, "etc", "passwd"));
  expect(safeJoin("/p", "/.spaka/project.json")).toBeUndefined();
  expect(safeJoin("/p", "/a/../../b")).toBe(join(p, "b"));
});

test("a page whose body has not started does not replace the page shown", async () => {
  const { hasVisibleBody } = await import("./preview");
  expect(hasVisibleBody('<html><head><title>x</title></head><body data-spaka-src="a">\n</body></html>')).toBe(false);
  expect(hasVisibleBody("<html><head><title>x</title></head>")).toBe(false);
  expect(hasVisibleBody('<html><body><script>var a = 1</script><div class="hero"></div></body>')).toBe(false);
  expect(hasVisibleBody("<html><body><header><a>Fleur</a></header>")).toBe(true);
  expect(hasVisibleBody('<html><body><svg viewBox="0 0 1 1"></svg>')).toBe(true);
});

test("a package's module is served where the import map points; what pnpm installs never is (ADR 0013)", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { Runtime } = await import("@spaka/runtime");
  const { diskSource } = await import("@spaka/runtime/node");
  const { PreviewServer } = await import("./server");
  const root = mkdtempSync(join(tmpdir(), "spaka-server-"));
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("pages/index.liquid", "<h1>Hi</h1>");
  write("scripts/carousel.js", 'import E from "embla-carousel";\nimport b from "broken";\nexport function start() {}');
  write("node_modules/embla-carousel/package.json", JSON.stringify({ name: "embla-carousel", version: "8.6.0" }));
  write("node_modules/broken/package.json", JSON.stringify({ name: "broken", version: "1.0.0" }));
  write("package.json", "{}");
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  const asked: string[] = [];
  const server = new PreviewServer(
    () => ({ root, runtime: new Runtime(diskSource(root)) }),
    undefined,
    undefined,
    async (_root, imports, url) => {
      asked.push(`${url} of ${imports.length}`);
      return url.includes("broken")
        ? { error: "Vite could not resolve it" }
        : { module: { code: "export default 1;", gzip: 30, bundled: [], warnings: [] } };
    },
  );
  await server.start();
  try {
    const get = async (path: string) => {
      const response = await fetch(`${server.origin}${path}`);
      return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
    };
    expect(await get("/assets/packages/embla-carousel@8.6.0.js")).toEqual({
      status: 200,
      type: "text/javascript; charset=utf-8",
      text: "export default 1;",
    });
    // One Spaka could not make throws where the preview reads the page's errors.
    expect((await get("/assets/packages/broken@1.0.0.js")).text).toBe(
      'throw new Error("Spaka could not make the module of the package broken 1.0.0: Vite could not resolve it");\n',
    );
    expect(asked).toEqual(["/assets/packages/embla-carousel@8.6.0.js of 2", "/assets/packages/broken@1.0.0.js of 2"]);
    for (const path of [
      "/assets/packages/embla-carousel@9.0.0.js",
      "/node_modules/embla-carousel/package.json",
      "/package.json",
      "/pnpm-lock.yaml",
    ])
      expect((await get(path)).status).toBe(404);
  } finally {
    server.stop();
  }
});
