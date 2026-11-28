// A Node.js server (Q176, Q186): server.mjs, the runtime bundled with its
// libraries, answering pages, forms and the management API; the records in
// SQLite by node:sqlite (Node 24 or later), in data/ or the /data volume. With
// Docker (Q556), compose.yaml runs it behind Caddy, which gets the HTTPS
// certificate of the domain name given in .env; the Dockerfile alone is for a
// hosting service that runs one; or `node server.mjs` behind a reverse proxy
// on one's own server.
import type { Builder } from "../builder.ts";
import { Output, slug, writeEnv, writePublishedSite } from "../shared.ts";

const dockerfile = `# Spaka's Node export. The records visitors send are kept in /data/data.sqlite:
# keep that volume when you update the site.
FROM node:24-slim
WORKDIR /app
COPY . .
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 SPAKA_DATA=/data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
`;

/**
 * The website and Caddy in front of it. The website's port is not published:
 * Caddy alone reaches it, so the address Caddy gives for a visitor is
 * believed (SPAKA_PROXY). Without a domain name, Caddy answers in plain HTTP.
 */
const compose = `# Spaka's Node export with Caddy in front of it, for HTTPS.
# Give your domain name in .env (SPAKA_DOMAIN), then: docker compose up -d --build
services:
  site:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      SPAKA_PROXY: "1"
    volumes:
      - data:/data
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      SPAKA_DOMAIN: \${SPAKA_DOMAIN:-:80}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - site
volumes:
  # What visitors send: keep it.
  data:
  # Caddy's HTTPS certificates.
  caddy_data:
  caddy_config:
`;

const caddyfile = `# The domain name comes from .env (SPAKA_DOMAIN), through compose.yaml.
{$SPAKA_DOMAIN} {
	reverse_proxy site:3000
}
`;

const DOMAIN = {
  name: "SPAKA_DOMAIN",
  lines: `# With Docker (compose.yaml): your domain name, for which Caddy gets the HTTPS
# certificate. With www too: SPAKA_DOMAIN=example.com, www.example.com
# Left empty, the website answers in plain HTTP, on port 80.
SPAKA_DOMAIN=`,
};

const guide = (name: string) => `# Putting ${name} online

This folder is a Node.js server: \`server.mjs\` answers the pages, the forms
and Spaka's management API; \`public/\` holds the files served as they are;
\`site.json\` holds the pages and data. What visitors send is kept in
\`data/data.sqlite\` (or in the \`data\` volume with Docker): back it up, and
keep it when you replace the site with a new export.

\`.env\` holds the settings. Keep it private: git and the Docker image leave
it out. A new export into this folder keeps what you wrote into it.

- \`SPAKA_TOKEN\`: the website's management token, with which Spaka reads
  what visitors send. Spaka writes it.
- \`SPAKA_DOMAIN\`: your domain name, for Docker (below).

## With Docker, on your own server

\`compose.yaml\` runs the website and, in front of it, Caddy, a web server
that gets the HTTPS certificate by itself.

1. Make your domain name lead to the server (see "Your own domain name").
2. Write it into \`.env\`:

       SPAKA_DOMAIN=example.com, www.example.com

3. Copy this folder to the server, \`.env\` included, and there, in it:

       docker compose up -d --build

The website is then at https://example.com. The server has to let ports 80
and 443 in. With \`SPAKA_DOMAIN\` left empty, the website answers in plain
HTTP on port 80: enough to try it, on this machine too (http://localhost).

To update the website, export again into this folder, copy it to the server
again and run the same command. \`docker compose down\` stops it; do not add
\`-v\`, which would delete what visitors sent.

## A hosting service that runs Docker

Give it the \`Dockerfile\`, the \`SPAKA_TOKEN\` variable from \`.env\` and a
volume mounted at \`/data\`. The website listens on port 3000. By hand, that
is:

    docker build -t ${name} .
    docker run -d -p 3000:3000 -v ${name}-data:/data --env-file .env ${name}

## Without Docker, on your own server

The server needs Node.js 24 or later. Copy this folder, \`.env\` included, run
\`node server.mjs\` as a service (systemd, for one), and put a reverse proxy
in front of it for HTTPS, such as Caddy:

    example.com, www.example.com {
      reverse_proxy localhost:3000
    }

The server also reads \`PORT\` (3000), \`HOST\` (0.0.0.0) and \`SPAKA_DATA\`,
where data.sqlite is kept (\`data\`). It believes the visitor's address a
reverse proxy gives only when the proxy runs on the same machine, or when
\`SPAKA_PROXY=1\` says every request comes through one.

## Your own domain name

A domain name is bought from a registrar. In its DNS settings, on the
registrar's website, create:

- an \`A\` record for the domain name (\`example.com\`) that points to your
  server's IP address, and an \`AAAA\` record if it has an IPv6 address;
- the same for \`www\`, or a \`CNAME\` record for \`www\` that points to the
  domain name.

A change there takes from a few minutes to a few hours to show. Once the name
leads to the server, Caddy gets the HTTPS certificate by itself: with Docker,
for the names in \`SPAKA_DOMAIN\`.

On a hosting service that runs Docker, add the domain name in its settings
instead: it shows the record to create, usually a \`CNAME\`.

## Try it on this machine, without Docker

    node server.mjs

Then open http://localhost:3000.

## Then

Give the site's address in the website's settings in Spaka, to see what
visitors sent. Give it again when it changes, to a domain name of your own
for one.
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
    out.write("compose.yaml", compose);
    out.write("Caddyfile", caddyfile);
    writeEnv(out, options.managementToken, options.earlierEnv, [DOMAIN]);
    out.write(".dockerignore", "data\nnode_modules\n.git\n.env\ncompose.yaml\nCaddyfile\n");
    out.write(".gitignore", "data/\nnode_modules/\n.env\n");
    out.write("README.md", guide(name));
    return { ...site, files: out.files, name };
  },
  guide: () => [{ id: "docker", command: "docker compose up -d --build" }, { id: "server" }, { id: "address" }],
};
