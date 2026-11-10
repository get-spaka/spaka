---
status: accepted
---

# Published projects are served by one portable, declarative runtime

htmx consumes HTML fragments, not JSON, so a dynamic project needs its HTML rendered on a server. A single runtime renders the project's Liquid templates into pages and fragments, reads and writes its datasources, and handles form submissions. It runs unchanged inside the desktop app (for the preview), on Node, and on Cloudflare Workers. The static builder pre-renders pages with it. In v2.0 the agent writes no server code: backend behaviour is declarative only.

Liquid is the template language because LiquidJS interprets templates without `eval`, which Cloudflare Workers forbid, where Nunjucks, Handlebars and Eta would need a precompilation step. A page that has no shared part and no data stays plain HTML.

## Considered options

- **Client-side templating over a JSON API** (htmx `client-side-templates`, `htmx-json`): reduces the runtime to static files plus a generic API, but shared headers and navigation must be duplicated in every page or loaded after the fact, the initial HTML carries no content and no per-record metadata, the public API has to be designed and secured, static export needs a hidden browser to snapshot pages, and no such extension exists for htmx 4.
- **Service worker backend**: no local server, but SQLite is heavily constrained there and nothing would be reusable once published.
- **Free-form server code written by the agent** (what v1 did with React Router): slow to generate, needs a build step, puts agent-written code on the path of every visitor request, and cannot be exported statically.

## Consequences

- The preview and the published project behave the same, because they run the same runtime.
- Datasource endpoints answer with HTML fragments only. A JSON output can be added later without changing existing projects.
- Anything a project needs beyond templates, datasources and generated form endpoints is out of reach in v2.0. Custom TypeScript handlers are the planned escape hatch, deliberately deferred.
- Liquid must not cost the live build its immediacy, and the live-generation spike showed that it does not ([report](../../spikes/live-generation/REPORT.md)). A template the agent is still writing renders continuously in the preview: an unfinished tag is cut and closed, a shared part not yet written renders as nothing, and a loop over a datasource that has no record yet shows stand-in records, which leaves one visual jump to remove when the real ones arrive. Each previewed element can be traced back to the page, the shared part or the record it comes from.
