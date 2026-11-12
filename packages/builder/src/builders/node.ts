// A Node.js server (Q176, Q186): server.mjs, the runtime bundled with its
// libraries, answering pages, forms and the management API; the records in
// SQLite by node:sqlite (Node 24 or later), in data/ or the /data volume; a
// Dockerfile for a platform that runs one, or `node server.mjs` behind a
// reverse proxy on one's own server.
import type { Builder } from "../builder.ts";
import { Output, slug, writePublishedSite } from "../shared.ts";

const dockerfile = `# Upstart's Node export. The records visitors send are kept in /data/data.sqlite:
# keep that volume when you update the site.
FROM node:24-slim
WORKDIR /app
COPY . .
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 UPSTART_DATA=/data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
`;

const guide = (name: string) => `# Putting ${name} online

This folder is a Node.js server: \`server.mjs\` answers the pages, the forms
and Upstart's management API; \`public/\` holds the files served as they are;
\`site.json\` holds the pages and data. What visitors send is kept in
\`data/data.sqlite\` (or \`/data/data.sqlite\` in Docker): back it up, and keep
it when you replace the site with a new export.

The server needs Node.js 24 or later and reads:

- \`UPSTART_TOKEN\`: the website's management token, shown in Upstart. Without
  it, Upstart cannot read what visitors send.
- \`PORT\` (3000) and \`HOST\` (0.0.0.0).
- \`UPSTART_DATA\`: where data.sqlite is kept (\`data\`).

## Try it on this machine

    UPSTART_TOKEN=<token> node server.mjs

Then open http://localhost:3000.

## With Docker

    docker build -t ${name} .
    docker run -d -p 3000:3000 -v ${name}-data:/data -e UPSTART_TOKEN=<token> ${name}

Any platform that runs a Dockerfile can run it the same way: give it the
\`UPSTART_TOKEN\` variable and a volume mounted at \`/data\`.

## On your own server

Copy this folder, run \`node server.mjs\` as a service (systemd, for one), and
put a reverse proxy in front of it for HTTPS, such as Caddy:

    example.com {
      reverse_proxy localhost:3000
    }

## Then

Give the site's address in the website's settings in Upstart, to see what
visitors sent.
`;

export const nodeBuilder: Builder = {
  id: "node",
  server: "server.mjs",
  needs: { managementToken: true, formServices: false },
  check: () => ({ ok: true }),
  async build(project, options) {
    const out = new Output(options.outDir);
    const name = slug(project.name);
    const site = await writePublishedSite(project, options, out, "server.mjs");
    out.write(
      "package.json",
      `${JSON.stringify(
        { name, private: true, type: "module", engines: { node: ">=24" }, scripts: { start: "node server.mjs" } },
        null,
        2,
      )}\n`,
    );
    out.write("Dockerfile", dockerfile);
    out.write(".dockerignore", "data\nnode_modules\n.git\n");
    out.write(".gitignore", "data/\nnode_modules/\n");
    out.write("GUIDE.md", guide(name));
    return { ...site, files: out.files, name };
  },
  guide: (result) => {
    const name = result.name ?? "website";
    return [
      { id: "try", command: "UPSTART_TOKEN=<token> node server.mjs" },
      {
        id: "docker",
        command: `docker build -t ${name} . && docker run -d -p 3000:3000 -v ${name}-data:/data -e UPSTART_TOKEN=<token> ${name}`,
      },
      { id: "server" },
      { id: "address" },
    ];
  },
};
