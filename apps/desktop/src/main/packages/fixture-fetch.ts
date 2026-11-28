// For the whole-app checks (SPAKA_PACKAGES_FIXTURE): the services the
// packages' rules read, answered from one JSON file by address. OSV's
// questions are keyed by what they ask: "osv:<name>" for a package's flaws,
// "osv:<name>@<version>" for a version's in a batch, "osv-vuln:<id>" for one
// flaw. Anything else is not found.
import { readFileSync } from "node:fs";

export function fixtureFetch(file: string): typeof fetch {
  const answers = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const known = (key: string) => (key in answers ? json(answers[key]) : json({ error: "Not found" }, 404));
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "https://api.osv.dev/v1/query") {
      const name = JSON.parse(String(init?.body)).package?.name;
      return json(answers[`osv:${name}`] ?? {});
    }
    if (url === "https://api.osv.dev/v1/querybatch") {
      const { queries } = JSON.parse(String(init?.body)) as {
        queries: { package: { name: string }; version: string }[];
      };
      return json({ results: queries.map((q) => answers[`osv:${q.package.name}@${q.version}`] ?? {}) });
    }
    const vuln = /^https:\/\/api\.osv\.dev\/v1\/vulns\/(.+)$/.exec(url)?.[1];
    if (vuln) return known(`osv-vuln:${decodeURIComponent(vuln)}`);
    return known(url);
  }) as typeof fetch;
}
