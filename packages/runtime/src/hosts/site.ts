// A published site (Q175, Q176, Q186): the project's templates, datasources
// and theme in one site.json the export writes beside the server, read by the
// same runtime as the preview's, without its repairs and marks. Portable: the
// Node server and the Cloudflare Worker both build their runtime here.
import type { CollectedStore } from "../collected.ts";
import { exportHead } from "../head.ts";
import { Runtime } from "../runtime.ts";
import type { SiteAssets } from "../scripts.ts";
import { memorySource } from "../source.ts";

/** What an export writes into site.json. */
export type PublishedSite = {
  /** The project's text files the runtime reads: pages, parts, fragments, data, theme.css, what is kept beside media. */
  files: Record<string, string>;
  /** The widths of the WebP copies made of each image (Q156). */
  images: Record<string, number[]>;
  /** The site's scripts the head loads (ADR 0011). */
  assets?: SiteAssets;
};

export function siteRuntime(site: PublishedSite, collected: CollectedStore, managementToken?: string): Runtime {
  const hasTheme = site.files["theme.css"] !== undefined;
  return new Runtime(memorySource(site.files), {
    repair: false,
    trace: false,
    head: () => exportHead(hasTheme, site.assets),
    images: site.images,
    collected,
    ...(managementToken ? { managementToken } : {}),
  });
}
