// A template shown large in the start screen (Q249, Q541, Q544): the pictures
// of its pages, never the site running. Each page photographed by
// template:shoot, whole, at desktop and phone width, is in the template's
// .zip (Q545), downloaded when it is shown large; its packages are installed
// only once a website is made from it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Runtime } from "@spaka/runtime";
import { diskSource } from "@spaka/runtime/node";
import type { TemplatePageShot } from "../../shared/ipc";
import { en as t } from "../../shared/strings/en";
import { PICTURES, pageName } from "./reader";

export type Device = "desktop" | "phone";

const pictureOf = (dir: string, page: string, device: Device) => join(dir, PICTURES, "pages", `${page}-${device}.webp`);

/**
 * Its pages, as template:shoot photographs them (shotPages): its own, and the
 * first record's page of each page per record, named as the maker reads them;
 * those with no picture left out.
 */
export function shownPages(dir: string): TemplatePageShot[] {
  const runtime = new Runtime(diskSource(dir), { repair: false, trace: false, standIns: true });
  const firsts = new Set<string>();
  const pages: TemplatePageShot[] = [];
  for (const r of runtime.routes()) {
    if (r.generated) continue;
    if (r.record) {
      if (firsts.has(r.file)) continue;
      firsts.add(r.file);
    }
    const page = pageName(r.route);
    const desktop = existsSync(pictureOf(dir, page, "desktop"));
    const phone = existsSync(pictureOf(dir, page, "phone"));
    if (desktop || phone)
      pages.push({ route: r.route, name: r.record && r.title ? r.title : nameOf(r.route), page, desktop, phone });
  }
  return pages;
}

/** A page's picture at desktop or phone width, as a data URL; null when it has none. */
export function pagePicture(dir: string, page: string, device: Device): string | null {
  if (!/^[a-z0-9-]+$/.test(page)) return null;
  const file = pictureOf(dir, page, device);
  if (!existsSync(file)) return null;
  return `data:image/webp;base64,${readFileSync(file).toString("base64")}`;
}

function nameOf(route: string): string {
  if (route === "/") return t.start.home;
  const last = route.split("/").filter(Boolean).at(-1) ?? route;
  const words = last.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
