// A static website (decisions: static export at build step 1): each page and
// each fragment rendered once into an HTML file, served by any static file
// host. It cannot keep what visitors send: a form sends to a form service's
// address instead (Q178), and a page showing what visitors sent refuses it.
import { exportHead, injectHead, type ProjectSource, siteAssets, TRAP_FIELD, withSrcset } from "@upstart/runtime";
import type { Builder, BuildOptions, BuildProject, BuildResult, ImageCopies } from "../builder.ts";
import { Output, renderSite, shownCollected, writeAssets, writeImageCopies } from "../shared.ts";

/**
 * Points each form that sends to /_data/<name> at the form service given for
 * that datasource, as a plain form: without htmx's attributes, nor the trap
 * field the runtime adds, which a service would keep as a value.
 */
export function formsToServices(
  html: string,
  services: Record<string, string>,
  file: string,
  warnings: string[],
): string {
  if (!html.includes("/_data/")) return html;
  const trap = new RegExp(
    `<div aria-hidden="true" style="[^"]*"><input type="text" name="${TRAP_FIELD}"[^>]*></div>`,
    "g",
  );
  return html.replace(trap, "").replace(/<form\b[^>]*>/gi, (tag) => {
    const name = /\s(?:hx-post|action)\s*=\s*["']?\/_data\/([\w-]+)/i.exec(tag)?.[1];
    if (!name) return tag;
    const plain = tag.replace(/\s(?:hx-[\w:.-]+|action|method)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
    const service = services[name]?.trim();
    if (!service) {
      warnings.push(`${file}: the ${name} form has no form service's address, so it sends nothing.`);
      return plain;
    }
    return plain.replace(/^<form\b/i, `<form action="${service.replaceAll('"', "&quot;")}" method="post"`);
  });
}

export async function buildStatic(options: {
  source: ProjectSource;
  outDir: string;
  files?: string[];
  readFile?: (path: string) => Buffer;
  images?: ImageCopies;
  formServices?: Record<string, string>;
}): Promise<BuildResult> {
  const project: BuildProject = {
    name: "",
    source: options.source,
    files: options.files ?? [],
    readFile: options.readFile ?? (() => Buffer.alloc(0)),
  };
  const out = new Output(options.outDir);
  const { pages, fragments, warnings } = renderSite(project.source);
  for (const f of fragments)
    if (f.params) warnings.push(`${f.file} reads its parameters: a static site serves it once, without them.`);
  const all = [...pages, ...fragments];
  const html = all.map((p) => p.html).join("\n");
  const copies = await writeImageCopies(html, project, options.readFile && options.images, out, warnings);
  const head = exportHead(project.source.read("theme.css") !== undefined, siteAssets(project.source).assets);
  for (const page of pages)
    out.write(
      page.rel,
      formsToServices(withSrcset(injectHead(page.html, head), copies), options.formServices ?? {}, page.file, warnings),
    );
  for (const f of fragments)
    out.write(f.rel, formsToServices(withSrcset(f.html, copies), options.formServices ?? {}, f.file, warnings));
  await writeAssets(project, out, [html]);
  return {
    files: out.files,
    pages: pages.map((p) => p.route),
    fragments: fragments.map((f) => `/fragments/${f.name}`),
    warnings,
  };
}

export const staticBuilder: Builder = {
  id: "static",
  needs: { managementToken: false, formServices: true },
  check(project) {
    const datasources = shownCollected(project);
    return datasources.length ? { ok: false, refusal: { reason: "shows-collected", datasources } } : { ok: true };
  },
  async build(project: BuildProject, options: BuildOptions) {
    const checked = this.check(project);
    if (!checked.ok)
      throw new Error(
        `A static site cannot show what visitors send (${checked.refusal.datasources.join(", ")}): choose the Node or Cloudflare export.`,
      );
    return buildStatic({ ...project, ...options });
  },
  guide: () => [{ id: "upload" }, { id: "forms" }],
};
