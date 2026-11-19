// A Cloudflare Worker with Static Assets (Q175, Q187), set up the way
// Cloudflare advises today: wrangler.jsonc, the files of public/ served
// without waking the Worker, the Worker run first for /_data/ and /_upstart/,
// the records in D1 (created by the first deploy, its table by the
// migration), the management token a required secret. Node.js compatibility
// comes with the compatibility date: from 2026-08-04 on, Workers turn on
// nodejs_compat by default, for the npm packages a site may use one day.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECORDS_SCHEMA } from "@upstart/runtime";
import type { Builder } from "../builder.ts";
import { Output, slug, writeEnv, writePublishedSite } from "../shared.ts";

/** The wrangler the export installs, the one Upstart is tested with. */
export const WRANGLER_VERSION = "4.160.1";
/** The first compatibility date with nodejs_compat on by default. */
export const NODE_COMPAT_DATE = "2026-08-04";

/**
 * The newest compatibility date the runtime of that wrangler knows (its
 * workerd's): a later one stops `wrangler dev` from starting the Worker. It
 * moves with WRANGLER_VERSION.
 */
export const NEWEST_COMPAT_DATE = "2026-11-10";

/** Today's date, kept between the two above. */
export function compatibilityDate(today: Date): string {
  const day = today.toISOString().slice(0, 10);
  if (day < NODE_COMPAT_DATE) return NODE_COMPAT_DATE;
  return day > NEWEST_COMPAT_DATE ? NEWEST_COMPAT_DATE : day;
}

/**
 * The database id the first deploy wrote into an earlier export's
 * wrangler.jsonc, kept by the next export into the same folder.
 */
export function databaseIdIn(config: string | undefined): string | undefined {
  const id = config && /"database_id"\s*:\s*"([^"]+)"/.exec(config)?.[1];
  return id || undefined;
}

export function wranglerConfig(name: string, date: string, databaseId?: string): string {
  return `// Upstart's Cloudflare export: see README.md.
${JSON.stringify(
  {
    $schema: "./node_modules/wrangler/config-schema.json",
    name,
    main: "worker.mjs",
    compatibility_date: date,
    assets: { directory: "./public", run_worker_first: ["/_data/*", "/_upstart/*"] },
    // Without database_id, the first deploy creates the database and writes it here.
    d1_databases: [
      {
        binding: "DB",
        database_name: `${name}-records`,
        ...(databaseId ? { database_id: databaseId } : {}),
        migrations_dir: "migrations",
      },
    ],
    secrets: { required: ["UPSTART_TOKEN"] },
    observability: { enabled: true },
  },
  null,
  2,
)}
`;
}

const guide = (name: string) => `# Putting ${name} online with Cloudflare

This folder is a Cloudflare Worker: \`worker.mjs\` answers the pages, the forms
and Upstart's management API; \`public/\` holds the files Cloudflare serves as
they are; \`site.json\` holds the pages and data. What visitors send is kept in
a D1 database, \`${name}-records\`.

You need Node.js and a Cloudflare account (the free plan is enough).

1. Install wrangler, Cloudflare's tool, and sign in:

       npm install
       npx wrangler login

2. Deploy. \`npm run deploy\` also gives the Worker the website's management
   token, which Upstart wrote into \`.env\` (keep that file private: git leaves
   it out). The first deploy creates the database and writes its id into
   wrangler.jsonc: keep this folder, and export into it next time.

       npm run deploy

3. Create the database's table:

       npx wrangler d1 migrations apply DB --remote

4. Give the site's address (\`https://${name}.<your-subdomain>.workers.dev\`, or
   your own domain once added in Cloudflare) in the website's settings in
   Upstart, to see what visitors sent.

To try it on this machine first: \`npx wrangler d1 migrations apply DB --local\`,
then \`npm run dev\`. It uses the test token in \`.dev.vars\`.
`;

export const cloudflareBuilder: Builder = {
  id: "cloudflare",
  server: "worker.mjs",
  needs: { managementToken: true, formServices: false },
  check: () => ({ ok: true }),
  async build(project, options) {
    const out = new Output(options.outDir);
    const name = slug(project.name);
    let earlier: string | undefined;
    try {
      earlier = readFileSync(join(options.outDir, "wrangler.jsonc"), "utf8");
    } catch {}
    const site = await writePublishedSite(project, options, out, "worker.mjs");
    out.write(
      "wrangler.jsonc",
      wranglerConfig(name, compatibilityDate(options.today ?? new Date()), databaseIdIn(earlier)),
    );
    out.write(
      "package.json",
      `${JSON.stringify(
        {
          name,
          private: true,
          type: "module",
          scripts: { dev: "wrangler dev", deploy: "wrangler deploy --secrets-file .env" },
          devDependencies: { wrangler: WRANGLER_VERSION },
        },
        null,
        2,
      )}\n`,
    );
    out.write("migrations/0001_records.sql", RECORDS_SCHEMA);
    const local = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    out.write(".dev.vars", `# A token for trying the site on this machine only.\nUPSTART_TOKEN=${local}\n`);
    writeEnv(out, options.managementToken);
    out.write(".gitignore", "node_modules/\n.wrangler/\n.dev.vars\n.env\n");
    out.write("README.md", guide(name));
    return { ...site, files: out.files, name };
  },
  guide: () => [
    { id: "install", command: "npm install" },
    { id: "login", command: "npx wrangler login" },
    { id: "deploy", command: "npm run deploy" },
    { id: "migrate", command: "npx wrangler d1 migrations apply DB --remote" },
    { id: "address" },
  ],
};
