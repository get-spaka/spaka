import { describe, expect, test } from "vitest";
import type { CollectedStore, StoredRecord } from "./collected.ts";
import { Runtime } from "./runtime.ts";
import { durationMs, moduleHost, type ServerContext, type ServerModule, VisitorLimiter } from "./server.ts";
import { memorySource } from "./source.ts";

const context = (): ServerContext => ({
  env: {},
  data: { list: async () => [], add: async () => ({ id: "x" }) },
  sql: { all: async () => [], get: async () => undefined, run: async () => ({ changes: 0 }) },
});

/** A host over modules written in the test, counting each load. */
function host(modules: Record<string, ServerModule>, now = () => 0) {
  return moduleHost({
    modules: Object.fromEntries(Object.entries(modules).map(([name, m]) => [name, async () => m])),
    context,
    now,
  });
}

class MemoryStore implements CollectedStore {
  records = new Map<string, StoredRecord[]>();
  async list(name: string) {
    return this.records.get(name) ?? [];
  }
  async add(name: string, record: StoredRecord) {
    this.records.set(name, [record, ...(this.records.get(name) ?? [])]);
  }
  async sentSince() {
    return 0;
  }
  async approve() {
    return false;
  }
  async delete() {
    return false;
  }
}

describe("{% load %} (Q505)", () => {
  test("a page waits for its module's load, given the tag's arguments, its result under the module's name", async () => {
    const seen: unknown[] = [];
    const runtime = new Runtime(
      memorySource({
        "pages/index.liquid":
          "<main>{% load weather city: params.city, days: 3 %}<p>{{ weather.city }}: {{ weather.temp }}°</p>{% for d in weather.days %}<i>{{ d }}</i>{% endfor %}</main>",
      }),
      {
        repair: false,
        trace: false,
        server: host({
          weather: {
            load: async (args) => {
              seen.push(args);
              return { city: args.city, temp: 12, days: ["mon", "tue"] };
            },
          },
        }),
      },
    );
    const result = await runtime.renderRoute("/", { city: "Lyon" });
    expect(result.html).toContain("<p>Lyon: 12°</p><i>mon</i><i>tue</i>");
    expect(seen).toEqual([{ city: "Lyon", days: 3 }]);
    expect(result.notes).toEqual([]);
  });

  test("a load that fails, or no server, leaves it empty, with a note the agent reads", async () => {
    const errors: unknown[] = [];
    const files = { "pages/index.liquid": "<main>{% load weather %}[{{ weather }}]{% load nowhere %}</main>" };
    const failing = new Runtime(memorySource(files), {
      repair: false,
      trace: false,
      onServerError: (e) => errors.push(e),
      server: host({
        weather: {
          load: () => {
            throw new Error("the service did not answer");
          },
        },
      }),
    });
    const result = await failing.renderRoute("/");
    expect(result.status).toBe(200);
    expect(result.html).toContain("<main>[]</main>");
    expect(result.notes).toEqual([
      { file: "pages/index.liquid", note: "load weather: the service did not answer" },
      {
        file: "pages/index.liquid",
        note: "load nowhere: there is no server module named nowhere (server/nowhere.ts or .js)",
      },
    ]);
    expect(errors).toEqual([
      { module: "weather", kind: "load", message: "the service did not answer" },
      {
        module: "nowhere",
        kind: "load",
        message: "there is no server module named nowhere (server/nowhere.ts or .js)",
      },
    ]);
    const none = await new Runtime(memorySource(files), { repair: false, trace: false }).renderRoute("/");
    expect(none.notes[0]).toEqual({ file: "pages/index.liquid", note: "load weather: server modules do not run here" });
  });

  test("two renders waiting at once keep their own notes", async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => {
      release = r;
    });
    const runtime = new Runtime(
      memorySource({
        "pages/index.liquid": "{% load slow %}{% render 'missing-a' %}",
        "pages/b.liquid": "{% render 'missing-b' %}",
      }),
      { repair: false, trace: false, server: host({ slow: { load: () => slow.then(() => 1) } }) },
    );
    const a = runtime.renderRoute("/");
    const b = await runtime.renderRoute("/b");
    release();
    expect((await a).notes.map((n) => n.file)).toEqual(["parts/missing-a.liquid"]);
    expect(b.notes.map((n) => n.file)).toEqual(["parts/missing-b.liquid"]);
  });
});

describe("a module's cache (Q519)", () => {
  test("a load is kept for as long as its module says, by arguments; without cache, never", async () => {
    let now = 0;
    let calls = 0;
    const server = host(
      {
        kept: { cache: "10m", load: (args) => ({ n: ++calls, args }) },
        fresh: { load: () => ++calls },
      },
      () => now,
    );
    expect(await server.load("kept", { a: 1 })).toEqual({ n: 1, args: { a: 1 } });
    expect(await server.load("kept", { a: 1 })).toEqual({ n: 1, args: { a: 1 } });
    expect(await server.load("kept", { a: 2 })).toEqual({ n: 2, args: { a: 2 } });
    now = 10 * 60_000 + 1;
    expect(await server.load("kept", { a: 1 })).toEqual({ n: 3, args: { a: 1 } });
    expect(await server.load("fresh", {})).toBe(4);
    expect(await server.load("fresh", {})).toBe(5);
    expect(durationMs("30s")).toBe(30_000);
    expect(durationMs("2h")).toBe(7_200_000);
    expect(durationMs("forever")).toBeUndefined();
  });

  test("what a load gives is plain data: dates as text, functions left out", async () => {
    const server = host({ x: { load: () => ({ at: new Date("2027-01-12T00:00:00Z"), f: () => 1, big: 2n }) } });
    expect(await server.load("x", {})).toEqual({ at: "2027-01-12T00:00:00.000Z", big: 2 });
  });
});

describe("/_server/<name> (Q497, Q532)", () => {
  const files = {
    "pages/index.liquid": '<form hx-post="/_server/book"><input name="name"></form>',
    "fragments/booked.liquid": "<p>Booked for {{ answer.name }}, place {{ answer.place }}.</p>",
  };
  const modules: Record<string, ServerModule> = {
    book: {
      answer: "booked",
      action: (fields) => (fields.name ? { name: fields.name, place: 3 } : { problems: ["Your name is needed."] }),
    },
    thanks: { action: () => "See you soon." },
    echo: { action: async (_fields, { request }) => `sent ${await request!.text()}` },
    paid: {
      route: async (request) => Response.json({ method: request.method, body: await request.text() }, { status: 201 }),
    },
    broken: {
      action: () => {
        throw new Error("no database");
      },
    },
  };
  const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    new Request(`http://site${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "hx-request": "true", ...headers },
      body,
    });

  test("a form's action answers with its fragment, or its problems; a route answers as it likes", async () => {
    const errors: unknown[] = [];
    const runtime = new Runtime(memorySource(files), {
      repair: false,
      trace: false,
      server: host(modules),
      onServerError: (e) => errors.push(e),
    });
    // The page's form gets the trap field.
    expect((await runtime.renderRoute("/")).html).toContain('name="_website"');
    const booked = await runtime.fetch(post("/_server/book", "name=Ana"));
    expect(booked.status).toBe(200);
    expect(await booked.text()).toBe("<p>Booked for Ana, place 3.</p>");
    const problems = await runtime.fetch(post("/_server/book", "name="));
    expect(problems.status).toBe(422);
    expect(await problems.text()).toContain("<li>Your name is needed.</li>");
    expect(await (await runtime.fetch(post("/_server/thanks", ""))).text()).toContain("See you soon.");
    // The action gets the request with its body.
    expect(await (await runtime.fetch(post("/_server/echo", "a=1"))).text()).toContain("sent a=1");
    const paid = await runtime.fetch(
      new Request("http://site/_server/paid/confirm", { method: "POST", body: '{"ok":true}' }),
    );
    expect(paid.status).toBe(201);
    expect(await paid.json()).toEqual({ method: "POST", body: '{"ok":true}' });
    // A module that fails: the visitor is told something went wrong, the agent what.
    const broken = await runtime.fetch(post("/_server/broken", ""));
    expect(broken.status).toBe(500);
    expect(errors).toEqual([{ module: "broken", kind: "action", message: "no database" }]);
    expect((await runtime.fetch(post("/_server/nowhere", ""))).status).toBe(404);
    // A module with an action alone answers nothing else.
    expect((await runtime.fetch(new Request("http://site/_server/book"))).status).toBe(405);
  });

  test("a robot's form is answered as if done, and dropped; a visitor sends at most five in ten minutes", async () => {
    let done = 0;
    const runtime = new Runtime(memorySource(files), {
      repair: false,
      trace: false,
      server: host({ count: { action: () => `done ${++done}` } }),
    });
    const robot = await runtime.fetch(post("/_server/count", "_website=spam"));
    expect(await robot.text()).toContain("Thank you, it was sent.");
    expect(done).toBe(0);
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await runtime.fetch(post("/_server/count", ""), { visitor: "203.0.113.9" })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect((await runtime.fetch(post("/_server/count", ""), { visitor: "203.0.113.10" })).status).toBe(200);
    const limiter = new VisitorLimiter(1, 1000);
    expect([limiter.take("a", 0), limiter.take("a", 500), limiter.take("a", 1001)]).toEqual([true, false, true]);
  });
});

describe("the data API (Q513)", () => {
  test("a module reads records as templates do, and adds one to a collected datasource as a form would", async () => {
    const store = new MemoryStore();
    const runtime = new Runtime(
      memorySource({
        "data/lessons/_datasource.yaml": "fields:\n  - name: title\n    kind: text\n",
        "data/lessons/surf.md": "---\ntitle: Surf\n---\n",
        "data/bookings/_datasource.yaml":
          "collected: true\nfields:\n  - name: email\n    kind: email\n    required: true\n",
      }),
      { repair: false, trace: false, collected: store, now: () => new Date("2027-01-12T09:31:00Z") },
    );
    const data = runtime.dataApi();
    expect((await data.list("lessons")).map((r) => r.title)).toEqual(["Surf"]);
    expect(await data.add("bookings", { email: "nope" })).toEqual({ problems: ["Email is not valid."] });
    const added = await data.add("bookings", { email: "ana@example.com" });
    expect(added).toEqual({ id: expect.stringMatching(/^2027-01-12-0931-[0-9a-f]{4}$/) });
    expect(store.records.get("bookings")?.[0]?.fields).toEqual({ email: "ana@example.com" });
    expect(await data.add("lessons", { title: "x" })).toEqual({
      problems: ["There is no collected datasource named lessons."],
    });
  });
});
