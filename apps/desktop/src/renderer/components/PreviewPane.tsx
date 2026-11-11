import {
  ChevronDown,
  Eye,
  Globe,
  LayoutGrid,
  MessageSquarePlus,
  Monitor,
  MousePointer2,
  RotateCw,
  RotateCwSquare,
  Send,
  Smartphone,
  Square,
  Tablet,
  Upload,
} from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  DeviceView,
  HistoryEntry,
  PreviewState,
  PreviewZoom,
  PreviewZoomReady,
  ProjectInfo,
  Rect,
} from "../../shared/ipc";
import { useComments } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ExportDialog } from "./ExportDialog";
import { HistoryButtons, HistoryList } from "./HistoryPanel";
import { PagesGrid, pageName } from "./PagesGrid";
import { Button } from "./ui/button";

/**
 * The devices the preview can show (Q110), in portrait: an iPad Air and an
 * iPhone 15, with the roundness of their screens' corners.
 */
const DEVICES = {
  desktop: undefined,
  tablet: { width: 820, height: 1180, radius: 18 },
  phone: { width: 393, height: 852, radius: 47 },
} as const;
type Width = keyof typeof DEVICES;
/** Room around a device, and its bezel. */
const ROOM = 24;
const BEZEL = 8;

/** Where a device goes in the area, drawn smaller to fit it whole. */
export function deviceLayout(
  area: { x: number; y: number; width: number; height: number },
  device: { width: number; height: number; radius: number },
  landscape: boolean,
): { rect: { x: number; y: number; width: number; height: number }; view: DeviceView } {
  const [w, h] = landscape ? [device.height, device.width] : [device.width, device.height];
  const room = ROOM + BEZEL;
  const scale = Math.min(1, (area.width - 2 * room) / w, (area.height - 2 * room) / h);
  const s = Math.max(0.1, scale);
  const width = Math.round(w * s);
  const height = Math.round(h * s);
  return {
    rect: {
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 2),
      width,
      height,
    },
    view: { width: w, height: h, scale: Math.round(s * 1000) / 1000, radius: device.radius * s },
  };
}

/**
 * The preview column. The page itself is a native view the main process lays
 * over the area below the bar; this component tells it where that area is.
 */
export function PreviewPane({
  project,
  state,
  working,
  covered,
  layoutKey,
  history,
}: {
  project: ProjectInfo | null;
  state: PreviewState;
  history: HistoryEntry[];
  working: boolean;
  /** Something is shown over the whole window: the native page view, which would stay on top, is hidden. */
  covered: boolean;
  layoutKey: unknown;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [width, setWidth] = useState<Width>("desktop");
  const [landscape, setLandscape] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // "Menu deleted · Undo" (Q137), for a few seconds after a page is deleted from its thumbnail.
  const [deleted, setDeleted] = useState<{ route: string; at: number }>();
  useEffect(() => upstart.on("preview:page-deleted", ({ route }) => setDeleted({ route, at: Date.now() })), []);
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(undefined), 8000);
    return () => clearTimeout(timer);
  }, [deleted]);
  // The zoom between the page and the thumbnails (Q133): a picture moved from one place to the other.
  const pendingZoom = useRef<PreviewZoom>(undefined);
  const [zoom, setZoom] = useState<Zoom>();
  const seen = useRef({ rects: {} as Record<string, Rect>, pictures: {} as Record<string, string> });
  // biome-ignore lint/correctness/useExhaustiveDependencies: another website's pictures are not this one's
  useLayoutEffect(() => {
    seen.current = { rects: {}, pictures: {} };
  }, [project?.id]);
  // The page zoomed to is drawn, out of sight: the zoom may land, crossfading into its picture (Q142).
  const pendingReady = useRef<PreviewZoomReady>(undefined);
  useEffect(() => {
    const offs = [
      upstart.on("preview:zoom", (z) => {
        pendingZoom.current = z;
        pendingReady.current = undefined;
      }),
      upstart.on("preview:zoom-ready", (r) => {
        pendingReady.current = r;
        setZoom((z) => (z && !z.toGrid && z.route === r.route ? { ...z, ready: true, shot: r.url } : z));
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  // The preview's own size, for thumbnails pictured at it (Q142, being tried); not followed while it is being resized.
  const [panel, setPanel] = useState<{ width: number; height: number }>();
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const r = element.getBoundingClientRect();
      setPanel((p) =>
        p && p.width === Math.round(r.width) && p.height === Math.round(r.height)
          ? p
          : { width: Math.round(r.width), height: Math.round(r.height) },
      );
    };
    measure();
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 250);
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
  // Where the device's frame is drawn, under the native view, relative to the area.
  const [frame, setFrame] = useState<{ x: number; y: number; width: number; height: number; radius: number }>();
  const comments = useComments(project?.id);
  const dialogOpen = exporting && project !== null;
  // Every page as thumbnails (Q128), once the website has two (Q140).
  const pagesView = !!project && state.view === "pages" && state.routes.length >= 2;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new project closes the dialog
  useLayoutEffect(() => setExporting(false), [project?.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey says when the columns before the area changed
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    // The native page view would cover the dialog: it is hidden while the dialog is open.
    if (dialogOpen || covered) {
      setFrame(undefined);
      upstart.send("preview:bounds", null);
      return;
    }
    // Under the thumbnails and during a zoom, the page is kept drawn at its size, out of sight (Q142).
    const parked = pagesView || !!zoom;
    const send = () => {
      const r = element.getBoundingClientRect();
      const device = DEVICES[width];
      if (!device) {
        setFrame(undefined);
        upstart.send(
          "preview:bounds",
          {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
          },
          undefined,
          undefined,
          parked,
        );
        return;
      }
      // A tablet or a phone at its own size, smaller if the column is, centred (Q110).
      const { rect, view } = deviceLayout(r, device, landscape);
      setFrame(
        parked
          ? undefined
          : {
              x: rect.x - r.x - BEZEL,
              y: rect.y - r.y - BEZEL,
              width: rect.width + 2 * BEZEL,
              height: rect.height + 2 * BEZEL,
              radius: view.radius + BEZEL,
            },
      );
      upstart.send(
        "preview:bounds",
        rect,
        view,
        {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
        parked,
      );
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(element);
    window.addEventListener("resize", send);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", send);
    };
    // The area also moves when the columns before it change width.
  }, [layoutKey, dialogOpen, covered, width, landscape, historyOpen, pagesView, !!zoom]);

  // Where the page is shown in the page view, in the window.
  const pageRect = (): Rect | undefined => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return undefined;
    const device = DEVICES[width];
    return device ? deviceLayout(r, device, landscape).rect : { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  // On going between the page and the thumbnails, the zoom the main process announced (Q133).
  const wasPagesView = useRef(pagesView);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the view changes
  useLayoutEffect(() => {
    const was = wasPagesView.current;
    wasPagesView.current = pagesView;
    const z = pendingZoom.current;
    if (was === pagesView || !z) return;
    pendingZoom.current = undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = pageRect();
    if (!page) return;
    if (pagesView && z.to === "pages" && z.url) {
      const cell = area.current?.querySelector(`[data-route="${CSS.escape(z.route)}"] button`);
      if (!cell) return;
      const r = cell.getBoundingClientRect();
      setZoom({
        route: z.route,
        toGrid: true,
        page,
        cell: { x: r.x, y: r.y, width: r.width, height: r.height },
        shot: z.url,
        thumb: seen.current.pictures[z.route],
        ready: true,
        landing: z.route,
      });
    } else if (!pagesView && z.to === "page") {
      const cell = seen.current.rects[z.route];
      const thumb = seen.current.pictures[z.route];
      const ready = pendingReady.current?.route === z.route ? pendingReady.current : undefined;
      if (cell && thumb)
        setZoom({ route: z.route, toGrid: false, page, cell, thumb, shot: ready?.url, ready: !!ready });
    }
  }, [pagesView]);

  return (
    <main data-testid="preview" className="flex min-w-0 flex-1 flex-col bg-muted/40">
      <div className="drag-region flex h-13 shrink-0 items-center gap-2 border-b bg-background px-3">
        {project && state.routes.length > 0 && (
          <label className="no-drag relative flex items-center">
            <Globe className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
            <select
              aria-label={t.preview.pages}
              data-testid="page-select"
              value={state.route ?? ""}
              onChange={(event) => {
                const route = event.target.value;
                void upstart.invoke("preview:set-view", "page").then(() => upstart.invoke("preview:navigate", route));
              }}
              className="h-7 appearance-none rounded-md border bg-background pr-7 pl-7 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              {state.route !== null && !state.routes.some((r) => r.route === state.route) && (
                <option value={state.route}>{state.route}</option>
              )}
              {state.routes.map((r) => (
                <option key={r.route} value={r.route}>
                  {r.route}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground" />
          </label>
        )}
        <div className="flex-1" />
        {deleted && (
          <div
            data-testid="page-deleted"
            className="no-drag flex items-center gap-2 rounded-md bg-foreground py-1 pr-1 pl-2.5 text-xs text-background"
          >
            {t.preview.pageDeleted(pageName(deleted.route))}
            <button
              type="button"
              data-testid="page-deleted-undo"
              onClick={() => {
                setDeleted(undefined);
                void upstart.invoke("history:undo");
              }}
              className="rounded px-1.5 py-0.5 font-medium hover:bg-background/20"
            >
              {t.preview.undo}
            </button>
          </div>
        )}
        {project && state.routes.length >= 2 && (
          <div className="no-drag flex items-center rounded-md border p-0.5" data-testid="preview-view">
            {(
              [
                ["page", Square, t.preview.pageView],
                ["pages", LayoutGrid, t.preview.allPages],
              ] as const
            ).map(([view, Icon, title]) => (
              <Button
                key={view}
                variant="ghost"
                size="icon-sm"
                className={cn("size-6", state.view === view && "bg-accent")}
                title={title}
                aria-label={title}
                aria-pressed={state.view === view}
                data-testid={`view-${view}`}
                onClick={() => void upstart.invoke("preview:set-view", view)}
              >
                <Icon />
              </Button>
            ))}
          </div>
        )}
        {project && state.routes.length > 0 && (
          <>
            <div className="no-drag flex items-center rounded-md border p-0.5" data-testid="preview-mode">
              {(
                [
                  ["edit", MousePointer2, t.preview.editMode],
                  ["comment", MessageSquarePlus, t.preview.commentMode],
                  ["visitor", Eye, t.preview.visitorMode],
                ] as const
              ).map(([mode, Icon, title]) => (
                <Button
                  key={mode}
                  variant="ghost"
                  size="icon-sm"
                  className={cn("size-6", state.mode === mode && "bg-accent")}
                  title={title}
                  aria-label={title}
                  aria-pressed={state.mode === mode}
                  data-testid={`mode-${mode}`}
                  onClick={() => void upstart.invoke("preview:set-mode", mode)}
                >
                  <Icon />
                </Button>
              ))}
            </div>
            <div className="no-drag flex items-center rounded-md border p-0.5" data-testid="preview-width">
              {(
                [
                  ["desktop", Monitor, t.preview.desktop],
                  ["tablet", Tablet, t.preview.tablet],
                  ["phone", Smartphone, t.preview.phone],
                ] as const
              ).map(([w, Icon, title]) => (
                <Button
                  key={w}
                  variant="ghost"
                  size="icon-sm"
                  className={cn("size-6", width === w && "bg-accent")}
                  title={title}
                  aria-label={title}
                  aria-pressed={width === w}
                  data-testid={`width-${w}`}
                  onClick={() => setWidth(w)}
                >
                  <Icon />
                </Button>
              ))}
              {width !== "desktop" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn("size-6", landscape && "bg-accent")}
                  title={landscape ? t.preview.portrait : t.preview.landscape}
                  aria-label={landscape ? t.preview.portrait : t.preview.landscape}
                  aria-pressed={landscape}
                  data-testid="rotate"
                  onClick={() => setLandscape((l) => !l)}
                >
                  <RotateCwSquare />
                </Button>
              )}
            </div>
          </>
        )}
        {/* At the phone's width the page's own send bar does not fit: it is here instead (Q95). */}
        {project && width === "phone" && comments.length > 0 && (
          <Button
            size="sm"
            className="no-drag h-7"
            disabled={working}
            title={working ? t.comments.waitForAgent : t.comments.sendTitle}
            onClick={() => void upstart.invoke("comments:send")}
            data-testid="comments-send"
          >
            <Send />
            {t.comments.sendShort(comments.length)}
          </Button>
        )}
        {project && state.routes.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="no-drag h-7"
            onClick={() => setExporting(true)}
            data-testid="export-open"
          >
            <Upload />
            {t.preview.publish}
          </Button>
        )}
        {project && (
          <HistoryButtons
            entries={history}
            disabled={working}
            open={historyOpen}
            onToggle={() => setHistoryOpen((o) => !o)}
          />
        )}
        {project && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="no-drag"
            title={t.preview.reload}
            onClick={() => void upstart.invoke("preview:reload")}
          >
            <RotateCw className={state.loading ? "animate-spin" : undefined} />
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={area}
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center"
        >
          {frame && state.route !== null && (
            <div
              data-testid="device-frame"
              aria-hidden
              className="absolute bg-zinc-800 shadow-xl ring-1 ring-black/10 dark:bg-zinc-700"
              style={{
                left: frame.x,
                top: frame.y,
                width: frame.width,
                height: frame.height,
                borderRadius: frame.radius,
              }}
            />
          )}
          {pagesView ? (
            <PagesGrid
              state={state}
              device={DEVICES[width]}
              landscape={landscape}
              hidden={dialogOpen || covered || !!zoom}
              layoutKey={`${String(layoutKey)}-${historyOpen}`}
              seen={seen}
              landing={zoom?.landing}
              panel={state.zoomTrial !== "crossfade" ? panel : undefined}
            />
          ) : zoom ? null : (
            <>
              <h2 className="text-base font-medium">{project ? t.preview.emptyTitle : t.preview.noProjectTitle}</h2>
              <p className="max-w-80 text-sm text-muted-foreground">
                {project ? t.preview.emptyText : t.preview.noProjectText}
              </p>
            </>
          )}
          {zoom && <ZoomPicture zoom={zoom} onDone={() => setZoom(undefined)} />}
          {dialogOpen && <ExportDialog project={project} working={working} onClose={() => setExporting(false)} />}
        </div>
        {project && historyOpen && (
          <HistoryList entries={history} disabled={working} onRestore={() => setHistoryOpen(false)} />
        )}
      </div>
    </main>
  );
}

/**
 * A zoom between the page and a thumbnail (Q133): `page` is where the page is
 * shown, `cell` its thumbnail; `shot` a picture of the page at its size, `thumb`
 * the thumbnail's picture. To a page, it lands once the page is `ready` (Q142).
 */
type Zoom = {
  route: string;
  toGrid: boolean;
  page: Rect;
  cell: Rect;
  shot?: string;
  thumb?: string;
  ready: boolean;
  landing?: string;
};

/**
 * The transforms that make a box at the page's place look like the thumbnail:
 * scaled down until it covers the cell, the rest clipped (the first screen's
 * top, centred), and the thumbnail's picture drawn at the part left.
 */
function cellLook(cell: Rect, page: Rect, radius: number) {
  const k = Math.max(cell.width / page.width, cell.height / page.height);
  const vw = cell.width / k;
  const vh = cell.height / k;
  const cx = (page.width - vw) / 2;
  const cy = page.height - vh;
  return {
    box: `translate(${cell.x - page.x - k * cx}px, ${cell.y - page.y}px) scale(${k})`,
    clip: `inset(0px ${cx}px ${cy}px ${cx}px round ${radius / k}px)`,
    thumb: `translate(${cx}px, 0px) scale(${vw / page.width})`,
  };
}
const PAGE_LOOK = {
  box: "translate(0px, 0px) scale(1)",
  clip: "inset(0px 0px 0px 0px round 0px)",
  thumb: "translate(0px, 0px) scale(1)",
};
const ZOOM_MS = 300;
const ZOOM_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Pictures of the page moved from where it was to where it goes in 300 ms
 * (Q133), by transforms only, which the compositor plays even while the
 * interface is busy. The picture it starts from crossfades into the one it
 * ends on: to the thumbnails, the thumbnail's; to a page, the page's own,
 * drawn at its size out of sight (Q142). To a page, it lands once that page is drawn.
 */
function ZoomPicture({ zoom, onDone }: { zoom: Zoom; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLImageElement>(null);
  const top = useRef<HTMLImageElement>(null);
  const [moved, setMoved] = useState(false);
  const [faded, setFaded] = useState(false);
  // The picture on top, faded in: the thumbnail's going to the grid, the page's going to a page.
  const topSrc = zoom.toGrid ? zoom.thumb : zoom.shot;
  // biome-ignore lint/correctness/useExhaustiveDependencies: one movement per zoom
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const small = cellLook(zoom.cell, zoom.page, 6);
    const [from, to] = zoom.toGrid ? [PAGE_LOOK, small] : [small, PAGE_LOOK];
    const timing: KeyframeAnimationOptions = { duration: ZOOM_MS, easing: ZOOM_EASING, fill: "both" };
    const animations = [
      element.animate(
        [
          { transform: from.box, clipPath: from.clip },
          { transform: to.box, clipPath: to.clip },
        ],
        timing,
      ),
    ];
    if (thumb.current)
      animations.push(thumb.current.animate([{ transform: from.thumb }, { transform: to.thumb }], timing));
    const first = animations[0];
    if (first) first.onfinish = () => setMoved(true);
    return () => {
      for (const a of animations) {
        a.onfinish = null;
        a.cancel();
      }
    };
  }, [zoom.route, zoom.toGrid]);
  // The crossfade: during the movement going to the grid; once the page's picture is there going to a page.
  useLayoutEffect(() => {
    const element = top.current;
    if (!element || !topSrc) return;
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: zoom.toGrid ? 200 : 150,
      delay: zoom.toGrid ? 100 : 0,
      easing: "ease-out",
      fill: "both",
    });
    animation.onfinish = () => setFaded(true);
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [topSrc, zoom.toGrid]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: onDone is new at each rendering of the pane
  useEffect(() => {
    if (!moved) return;
    if (zoom.ready && (!topSrc || faded)) return onDone();
    // A page that never says it is drawn is shown all the same.
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [moved, faded, zoom.ready, topSrc]);
  const thumbPicture = zoom.thumb && (
    <img
      ref={thumb}
      src={zoom.thumb}
      alt=""
      draggable={false}
      className="absolute top-0 left-0 max-w-none origin-top-left"
      style={{ width: zoom.page.width, height: (zoom.page.width * zoom.cell.height) / zoom.cell.width }}
    />
  );
  const shotPicture = (src: string | undefined, ref?: RefObject<HTMLImageElement | null>) =>
    src && (
      <img
        ref={ref}
        data-testid="preview-zoom-shot"
        src={src}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full max-w-none"
      />
    );
  return (
    <div
      ref={box}
      data-testid="preview-zoom"
      data-ready={zoom.ready ? "" : undefined}
      aria-hidden
      className="pointer-events-none fixed z-40 origin-top-left overflow-hidden bg-white will-change-transform"
      style={{ left: zoom.page.x, top: zoom.page.y, width: zoom.page.width, height: zoom.page.height }}
    >
      {zoom.toGrid ? (
        <>
          {shotPicture(zoom.shot)}
          {zoom.thumb && (
            <img
              ref={(el) => {
                thumb.current = el;
                top.current = el;
              }}
              src={zoom.thumb}
              alt=""
              draggable={false}
              className="absolute top-0 left-0 max-w-none origin-top-left"
              style={{ width: zoom.page.width, height: (zoom.page.width * zoom.cell.height) / zoom.cell.width }}
            />
          )}
        </>
      ) : (
        <>
          {thumbPicture}
          {shotPicture(zoom.shot, top)}
        </>
      )}
    </div>
  );
}
