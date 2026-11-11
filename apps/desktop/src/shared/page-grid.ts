// The preview's "All pages" view (Q128–Q140): every page of the website as a
// thumbnail, a live view of its first screen. What can be worked out without
// a window: how many columns the right panel holds, the size a page is laid
// out at before being drawn small, and the address a duplicated page gets.

/** At most this many columns (Q139: to be tried, may change). */
export const GRID_MAX_COLUMNS = 3;
/** A column fewer when thumbnails would be narrower than this. */
export const GRID_MIN_WIDTH = 220;
export const GRID_GAP = 20;
export const GRID_PADDING = 24;

/** How many columns of thumbnails a panel this wide holds: 1 to GRID_MAX_COLUMNS. */
export function gridColumns(width: number): number {
  const room = width - 2 * GRID_PADDING;
  const fit = Math.floor((room + GRID_GAP) / (GRID_MIN_WIDTH + GRID_GAP));
  return Math.max(1, Math.min(GRID_MAX_COLUMNS, fit));
}

/** The width of each thumbnail in a panel this wide. */
export function thumbnailWidth(width: number): number {
  const columns = gridColumns(width);
  return Math.max(1, Math.floor((width - 2 * GRID_PADDING - (columns - 1) * GRID_GAP) / columns));
}

/**
 * The screen a page is laid out on before being drawn small (Q129): the
 * chosen device's, sideways when it is; with a laptop's screen, the preview's
 * own size once it is known (Q142), a laptop's first screen until then.
 */
export function thumbnailScreen(
  device: { width: number; height: number } | undefined,
  landscape: boolean,
): { width: number; height: number; mobile: boolean } {
  if (!device) return { width: 1280, height: 800, mobile: false };
  const [width, height] = landscape ? [device.height, device.width] : [device.width, device.height];
  return { width, height, mobile: true };
}

/**
 * The file and address of a copy of a page (Q138): the next free "-2", "-3"…
 * beside it. `pages/menu.liquid` gives `pages/menu-2.liquid`; the home page,
 * `pages/index.liquid`, gives `pages/index-2.liquid`, at /index-2.
 */
export function copyOfPage(file: string, existing: string[]): string {
  const dot = file.lastIndexOf(".");
  const ext = dot > file.lastIndexOf("/") ? file.slice(dot) : "";
  const stem = file.slice(0, file.length - ext.length).replace(/-\d+$/, "");
  const taken = new Set(existing);
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
