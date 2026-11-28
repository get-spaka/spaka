// The preview's server process (ADR 0014, Q496): Spaka's Node, under its
// permissions, runs a site's server modules and answers Spaka over Node's IPC
// channel (modules-protocol.ts). Bundled into out/hosts/modules.mjs.
//   modules.mjs <project> <files folder> <database>
// Its environment holds the site's secrets alone (Q501), and SPAKA_SECRET_NAMES
// says which they are; modules get them as `env`, and nothing else of it.
import { mkdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { format } from "node:util";
import { type DataApi, moduleHost, type ServerModule } from "../server.ts";
import { RECORDS_SCHEMA } from "../sql.ts";
import { applyMigrations, migrationsIn, moduleFiles, sqlApi } from "./modules.ts";
import { type DataAnswer, fromWireRequest, type HostCall, type HostMessage, wireResponse } from "./modules-protocol.ts";

const [root, filesDir, dbFile] = process.argv.slice(2) as [string, string, string];
/** Sends to Spaka, while it is there: a closed channel throws, which the handlers below would send again. */
const send = (message: HostMessage) => {
  if (process.connected) process.send?.(message);
};
// Spaka gone (closed, or killed before it could stop this process): nothing is left to answer.
process.on("disconnect", () => process.exit(0));

const secretNames = (() => {
  try {
    return JSON.parse(process.env.SPAKA_SECRET_NAMES ?? "[]") as string[];
  } catch {
    return [];
  }
})();
const env: Record<string, string | undefined> = Object.fromEntries(secretNames.map((n) => [n, process.env[n]]));

/** Where in the site's own files an error comes from: server/weather.ts:12. */
function located(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  for (const match of stack.matchAll(/(?:file:\/\/)?(\/[^\s():]+|[A-Za-z]:[\\/][^\s():]+):(\d+):\d+/g)) {
    const path = decodeURIComponent(match[1]!).replace(/^\/([A-Za-z]:)/, "$1");
    const inProject = relative(root, path);
    if (!inProject.startsWith("..") && !inProject.includes(`node_modules${sep}`))
      return `${message} (${inProject.split(sep).join("/")}:${match[2]})`;
  }
  return message;
}

// What modules print reaches the agent with the page's errors.
for (const level of ["log", "info", "warn", "error", "debug"] as const)
  console[level] = (...args: unknown[]) => send({ type: "console", level, text: format(...args).slice(0, 4000) });
process.on("uncaughtException", (error) => send({ type: "error", source: "server", message: located(error) }));
process.on("unhandledRejection", (error) => send({ type: "error", source: "server", message: located(error) }));

mkdirSync(filesDir, { recursive: true });
mkdirSync(dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(RECORDS_SCHEMA);
const migrated = applyMigrations(db, migrationsIn(join(root, "server", "migrations")));
if (migrated.error)
  send({
    type: "error",
    source: `server/migrations/${migrated.error.name}`,
    message: `this migration failed and was not applied: ${migrated.error.message}`,
  });
const sql = sqlApi(db);

// The data API is Spaka's: its datasources and test records, validated as a form is.
let calls = 0;
const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const ask = (call: "list" | "add", datasource: string, fields?: Record<string, unknown>) =>
  new Promise<unknown>((resolve, reject) => {
    const id = ++calls;
    waiting.set(id, { resolve, reject });
    send({ type: "data", id, call, datasource, ...(fields ? { fields } : {}) });
  });
const data: DataApi = {
  list: (datasource) => ask("list", String(datasource)) as ReturnType<DataApi["list"]>,
  add: (datasource, fields) => ask("add", String(datasource), fields) as ReturnType<DataApi["add"]>,
};

const files = moduleFiles(join(root, "server"));
const host = moduleHost({
  modules: Object.fromEntries(
    Object.entries(files).map(([name, file]) => [
      name,
      async () => (await import(pathToFileURL(file).href)) as ServerModule,
    ]),
  ),
  context: () => ({ env: { ...env }, data, sql, files: filesDir }),
});

process.on("message", async (message: HostCall | DataAnswer) => {
  if ("type" in message) {
    const pending = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.message !== undefined) pending?.reject(new Error(message.message));
    else pending?.resolve(message.value);
    return;
  }
  const { id } = message;
  try {
    if (message.op === "kinds") send({ type: "answer", id, kinds: (await host.kinds(message.name)) ?? null });
    else if (message.op === "load") send({ type: "answer", id, value: await host.load(message.name, message.args) });
    else if (message.op === "action")
      send({
        type: "answer",
        id,
        action: await host.action(message.name, message.fields, fromWireRequest(message.request)),
      });
    else
      send({
        type: "answer",
        id,
        response: await wireResponse(await host.route(message.name, fromWireRequest(message.request))),
      });
  } catch (error) {
    send({ type: "failed", id, message: located(error) });
  }
});

send({ type: "ready", modules: Object.keys(files) });
