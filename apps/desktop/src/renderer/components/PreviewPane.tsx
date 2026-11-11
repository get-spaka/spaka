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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DeviceView, HistoryEntry, PreviewState, PreviewZoom, ProjectInfo, Rect } from "../../shared/ipc";
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
  useEffect(
    () =>
      upstart.on("preview:zoom", (z) => {
        pendingZoom.current = z;
      }),
    [],
  );
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
    if (dialogOpen || covered || pagesView || zoom) {
      setFrame(undefined);
      upstart.send("preview:bounds", null);
      return;
    }
    const send = () => {
      const r = element.getBoundingClientRect();
      const device = DEVICES[width];
      if (!device) {
        setFrame(undefined);
        upstart.send("preview:bounds", {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        });
        return;
      }
      // A tablet or a phone at its own size, smaller if the column is, centred (Q110).
      const { rect, view } = deviceLayout(r, device, landscape);
      setFrame({
        x: rect.x - r.x - BEZEL,
        y: rect.y - r.y - BEZEL,
        width: rect.width + 2 * BEZEL,
        height: rect.height + 2 * BEZEL,
        radius: view.radius + BEZEL,
      });
      upstart.send("preview:bounds", rect, view, {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
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
      setZoom({ src: z.url, from: page, to: { x: r.x, y: r.y, width: r.width, height: r.height }, landing: z.route });
    } else if (!pagesView && z.to === "page") {
      const from = seen.current.rects[z.route];
      const src = seen.current.pictures[z.route];
      if (from && src) setZoom({ src, from, to: page });
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

type Zoom = { src: string; from: Rect; to: Rect; landing?: string };

/** A picture of the page moved and resized from where it was to where it goes, in 300 ms (Q133). */
function ZoomPicture({ zoom, onDone }: { zoom: Zoom; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one animation per zoom
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const at = (r: Rect, radius: number) => ({
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      borderRadius: `${radius}px`,
    });
    const toGrid = zoom.landing !== undefined;
    const animation = element.animate([at(zoom.from, toGrid ? 0 : 6), at(zoom.to, toGrid ? 6 : 0)], {
      duration: 300,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      fill: "forwards",
    });
    animation.onfinish = onDone;
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
  }, [zoom]);
  return (
    <div
      ref={box}
      data-testid="preview-zoom"
      aria-hidden
      className="pointer-events-none fixed z-40 overflow-hidden bg-white shadow-lg ring-1 ring-black/10"
      style={{ left: zoom.from.x, top: zoom.from.y, width: zoom.from.width, height: zoom.from.height }}
    >
      <img src={zoom.src} alt="" draggable={false} className="block h-auto w-full" />
    </div>
  );
}
