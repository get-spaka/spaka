// The entry of worker.mjs: site.json is written beside it by the export, and
// bundled by wrangler when it deploys.
// @ts-expect-error site.json exists only in an export.
import site from "./site.json";
import type { PublishedSite } from "./site.ts";
import { siteWorker } from "./worker.ts";

export default siteWorker(site as PublishedSite);
