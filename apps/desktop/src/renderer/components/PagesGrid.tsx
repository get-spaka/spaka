// The preview's "All pages" view (Q128–Q141): a cell per page, in an
// auto-grid of at most three columns (Q139), each showing a picture of the
// page's first screen. The page the agent is writing is a live view instead,
// a native view the main process lays over its cell (Q134, Q141): this
// component says where each cell is and whether it is on screen, and draws
// what goes around: the page's name, the outline of the page being written,
// the shadow of the one the pointer is over. A click opens a page; a right
// click shows its menu (Q132, Q136).
import { Loader2 } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GridCell, PreviewState, Rect } from "../../shared/ipc";
import { GRID_GAP, GRID_PADDING, gridColumns, thumbnailScreen } from "../../shared/page-grid";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";

export function PagesGrid({
  state,
  device,
  landscape,
  hidden,
  layoutKey,
  seen,
  landing,
  panel,
}: {
  state: PreviewState;
  device: { width: number; height: number } | undefined;
  landscape: boolean;
  /** Something covers the preview: the thumbnails are hidden. */
  hidden: boolean;
  layoutKey: unknown;
  /** Where each thumbnail last was and its picture, for the zoom to a page once the grid is gone (Q133). */
  seen: RefObject<{ rects: Record<string, Rect>; pictures: Record<string, string> }>;
  /** The page the zoom from the page view lands on: its cell waits, the others fade in. */
  landing?: string;
  /** The preview's own size: with a laptop's screen, pages are pictured at it, so the zoom to a page is a pure enlargement (Q142). */
  panel?: { width: number; height: number };
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<string, HTMLElement>());
  const [columns, setColumns] = useState(3);
  // The pointer over the live view, which the interface cannot see (the pictures use :hover).
  const [hovered, setHovered] = useState<string | null>(null);
  // The pictures already received, so that the grid shows them at once when it comes back.
  const [pictures, setPictures] = useState<Record<string, string>>(() => ({ ...seen.current.pictures }));
  // Once the maker scrolls during a turn, the grid no longer moves to the page being written.
  const makerScrolled = useRef(false);
  const screen =
    !device && panel
      ? { ...panel, mobile: false, panel: true }
      : { ...thumbnailScreen(device, landscape), panel: false };
  const routes = state.routes.map((r) => r.route);

  useEffect(() => upstart.on("preview:hover", setHovered), []);
  useEffect(
    () =>
      upstart.on("preview:picture", ({ route, url }) => {
        seen.current.pictures[route] = url;
        setPictures((p) => ({ ...p, [route]: url }));
      }),
    [seen],
  );
  const open = (route: string) => void upstart.invoke("preview:open-page", route);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the cells move when any of these change
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (hidden) {
      upstart.send("preview:grid", null);
      return;
    }
    let frame = 0;
    const send = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setColumns(gridColumns(element.clientWidth));
        const box = element.getBoundingClientRect();
        const list: GridCell[] = [];
        for (const route of routes) {
          const cell = cells.current.get(route);
          if (!cell) continue;
          const r = cell.getBoundingClientRect();
          seen.current.rects[route] = { x: r.x, y: r.y, width: r.width, height: r.height };
          // A thumbnail partly scrolled out is cut to what shows, its page moved up by what is hidden.
          const top = Math.max(r.top, box.top);
          const bottom = Math.min(r.bottom, box.bottom);
          const visible = bottom - top > 1 && r.width > 1;
          list.push({
            route,
            rect: {
              x: Math.round(r.left),
              y: Math.round(visible ? top : r.top),
              width: Math.round(r.width),
              height: Math.max(1, Math.round(visible ? bottom - top : r.height)),
            },
            visible,
            clipTop: visible ? Math.round(top - r.top) : 0,
          });
        }
        upstart.send("preview:grid", list, screen);
      });
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(element);
    for (const cell of cells.current.values()) observer.observe(cell);
    element.addEventListener("scroll", send, { passive: true });
    window.addEventListener("resize", send);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("scroll", send);
      window.removeEventListener("resize", send);
    };
  }, [hidden, layoutKey, routes.join("\n"), screen.width, screen.height, columns, hovered]);

  // Hidden when the grid goes away.
  useEffect(() => () => upstart.send("preview:grid", null), []);

  // The page being written comes into view, unless the maker scrolled (Q134).
  useEffect(() => {
    if (!state.writing) {
      makerScrolled.current = false;
      return;
    }
    if (makerScrolled.current) return;
    cells.current.get(state.writing)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.writing]);

  return (
    <div
      ref={scroller}
      data-testid="pages-grid"
      onWheel={() => {
        makerScrolled.current = true;
      }}
      className="absolute inset-0 overflow-y-auto"
      style={{ padding: GRID_PADDING }}
    >
      <div className="grid" style={{ gap: GRID_GAP, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {state.routes.map(({ route }) => {
          const writing = state.writing === route;
          return (
            <figure
              key={route}
              className={cn(
                "group m-0 flex flex-col gap-2",
                landing !== undefined && route !== landing && "animate-in fade-in duration-300",
              )}
              data-testid="page-thumb"
              data-route={route}
            >
              <button
                type="button"
                ref={(el) => {
                  if (el) cells.current.set(route, el);
                  else cells.current.delete(route);
                }}
                aria-label={t.preview.openPage(pageName(route))}
                onClick={() => open(route)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void upstart.invoke("preview:page-menu", route);
                }}
                className={cn(
                  "block overflow-hidden rounded-md bg-background p-0 shadow-sm ring-1 ring-black/10 transition-shadow duration-150 group-hover:shadow-lg",
                  hovered === route && "shadow-lg",
                  writing && "outline-2 outline-offset-3 outline-primary",
                )}
                style={{
                  aspectRatio: `${screen.width} / ${screen.height}`,
                  visibility: route === landing ? "hidden" : undefined,
                }}
              >
                {pictures[route] ? (
                  <img src={pictures[route]} alt="" className="size-full object-cover object-top" draggable={false} />
                ) : (
                  <span className="block size-full animate-pulse bg-muted" />
                )}
              </button>
              <figcaption className="flex min-w-0 items-center gap-1.5 px-0.5 text-xs">
                <span className="truncate font-medium">{pageName(route)}</span>
                <span
                  className={cn(
                    "hidden truncate text-muted-foreground group-hover:inline",
                    hovered === route && "inline",
                  )}
                >
                  {route}
                </span>
                {writing && (
                  <span
                    data-testid="page-writing"
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground"
                  >
                    <Loader2 className="size-3 animate-spin" />
                    {t.preview.writing}
                  </span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

/** "/" is the home page; "/menu" is "Menu", "/shop/cakes" is "Cakes". */
export function pageName(route: string): string {
  if (route === "/") return t.preview.home;
  const last = route.split("/").filter(Boolean).at(-1) ?? route;
  const words = decodeURIComponent(last).replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
