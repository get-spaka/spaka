// The entry of worker.mjs: site.json and modules.mjs (the site's server
// modules, ADR 0014) are written beside it by the export, and bundled by
// wrangler when it deploys.
// @ts-expect-error modules.mjs exists only in an export.
import * as bundled from "./modules.mjs";
// @ts-expect-error site.json exists only in an export.
import site from "./site.json";
import type { BundledModules, PublishedSite } from "./site.ts";
import { siteWorker } from "./worker.ts";

export default siteWorker(site as PublishedSite, bundled as BundledModules);
