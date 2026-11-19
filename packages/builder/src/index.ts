// Builds an Upstart project into a website to put online, in one of several
// ways, each a Builder (builder.ts): a static site, a Node.js server, a
// Cloudflare Worker.
import type { Builder } from "./builder.ts";
import { cloudflareBuilder } from "./builders/cloudflare.ts";
import { nodeBuilder } from "./builders/node.ts";
import { staticBuilder } from "./builders/static.ts";

export { ASSETS, copyAddress, exportHead, imagesIn, withSrcset } from "@upstart/runtime";
export type {
  Builder,
  BuildOptions,
  BuildProject,
  BuildRefusal,
  BuildResult,
  GuideStep,
  ImageCopies,
} from "./builder.ts";
export {
  compatibilityDate,
  databaseIdIn,
  NEWEST_COMPAT_DATE,
  NODE_COMPAT_DATE,
  WRANGLER_VERSION,
  wranglerConfig,
} from "./builders/cloudflare.ts";
export { buildStatic, formsToServices } from "./builders/static.ts";
export { candidates, collectedUse, formsIn, IMAGE_WIDTHS, slug } from "./shared.ts";
export { cloudflareBuilder, nodeBuilder, staticBuilder };

/** Every way of exporting, in the order the Publish dialog lists them. */
export const BUILDERS: readonly Builder[] = [staticBuilder, nodeBuilder, cloudflareBuilder];

export function builderById(id: string): Builder | undefined {
  return BUILDERS.find((b) => b.id === id);
}
