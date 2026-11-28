// What every way of exporting a website offers (Q181, Q186): the app lists
// BUILDERS, asks each whether the project can use it, builds with the one the
// maker picks and shows its guide. A new destination (a hosting of Spaka's
// own, for one) is one more file in builders/ and one more line in BUILDERS.
import type { PackageImport, ProjectSource, ServerHost } from "@spaka/runtime";

/** The project being exported. */
export type BuildProject = {
  /** The website's name, for the names an export gives (a Worker, its database, an image). */
  name: string;
  source: ProjectSource;
  /** Every file of the project that is published, for the ones copied as they are (images, icons…). */
  files: string[];
  /** Reads a project file's bytes. */
  readFile: (path: string) => Buffer;
};

/**
 * Makes the WebP copies of an image at the widths given (or at its own width
 * when it is narrower), or undefined for an image kept as it is (a drawing,
 * an animation). Given by the app, which has an image library: the builder
 * itself stays portable.
 */
export type ImageCopies = (
  path: string,
  data: Buffer,
  widths: number[],
) => Promise<{ width: number; data: Buffer }[] | undefined>;

export type BuildOptions = {
  outDir: string;
  /** WebP copies of the images the pages use (Q156); without it, the images are only copied. */
  images?: ImageCopies;
  /** The server the app ships for this builder (server.mjs, worker.mjs), for those that need one. */
  serverBundle?: string;
  /** Where each collected datasource's form sends, for a static site (Q178): a form service's address. */
  formServices?: Record<string, string>;
  /**
   * The website's management token, for the builders that need one: written
   * into the export's .env (Q191), which git and the Docker image leave out.
   */
  managementToken?: string;
  /**
   * The .env of the export this one replaces, read before it is cleared: what
   * the maker wrote into it (a domain name, Q556) is kept.
   */
  earlierEnv?: string;
  /** The day of the export, for the Worker's compatibility date. */
  today?: Date;
  /**
   * The modules of the packages the site's scripts import (ADR 0013), made by
   * the app's Vite: each one's code by its specifier, or why it could not be
   * made. Without it, an export that needs them says so.
   */
  packageModules?: (packages: PackageImport[]) => Promise<Map<string, { code: string } | { error: string }>>;
  /** The website's server modules (ADR 0014): without it, an export of a site that has some says so. */
  server?: ServerOptions;
};

/** Where a website's server modules are bundled for: the Node export's server, or a Cloudflare Worker. */
export type ServerTarget = "node" | "worker";

/** The server modules bundled: modules.mjs and its chunks, by path in the export; or why not. */
export type ServerBundle = { files: { path: string; code: string }[]; warnings: string[] } | { error: string };

/** What the exports need of a website's server modules (ADR 0014), given by the app. */
export type ServerOptions = {
  /** Runs their loads at export, for a static site: the preview's server process. */
  host?: ServerHost;
  /** Bundles them for a target, with the packages they import (`server/<name>.ts` by name). */
  bundle?: (modules: Record<string, string>, target: ServerTarget) => Promise<ServerBundle>;
  /** The website's secrets, by name, written into the export's .env (Q516). */
  secrets?: Record<string, string>;
};

export type BuildResult = {
  /** Files written, relative to the output folder. */
  files: string[];
  pages: string[];
  fragments: string[];
  /** What the site cannot do the way the preview does. */
  warnings: string[];
  /** The names the export gave, used by its guide. */
  name?: string;
};

/** Why a project cannot use a builder. */
export type BuildRefusal = {
  /** A static site cannot show what visitors send: these datasources are shown on a page. */
  reason: "shows-collected";
  datasources: string[];
};

/** One step of a builder's guide, worded by the app under the builder's id and the step's. */
export type GuideStep = { id: string; command?: string };

export interface Builder {
  /** "static", "node", "cloudflare"… */
  readonly id: string;
  /** The server the app ships that this builder copies (BuildOptions.serverBundle): "server.mjs", "worker.mjs". */
  readonly server?: string;
  readonly needs: {
    /** The published site answers the app's management API, with the website's token. */
    managementToken: boolean;
    /** Forms send to a form service's address, given per datasource. */
    formServices: boolean;
  };
  /** Whether this project can use it, and why not. */
  check(project: BuildProject): Promise<{ ok: true } | { ok: false; refusal: BuildRefusal }>;
  build(project: BuildProject, options: BuildOptions): Promise<BuildResult>;
  /** The steps that put the export online, as data the app words. */
  guide(result: BuildResult): GuideStep[];
}
