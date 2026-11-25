import {
  Ellipsis,
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  DeviceView,
  HistoryEntry,
  PreviewMode,
  PreviewState,
  PreviewZoom,
  PreviewZoomReady,
  ProjectInfo,
  Rect,
} from "../../shared/ipc";
import { useCommands } from "../hooks/useCommand";
import { useComments } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { BEZEL as BEZEL_COLORS, PAGE_WHITE } from "../lib/colors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { stillToAdapt, useAdaptation } from "./AdaptationBar";
import { ExportDialog } from "./ExportDialog";
import { HistoryButtons, HistoryList } from "./HistoryPanel";
import { PagesGrid, pageName } from "./PagesGrid";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import { Tip, TipOverPage } from "./ui/tip";

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
  onNeed,
}: {
  project: ProjectInfo | null;
  state: PreviewState;
  history: HistoryEntry[];
  working: boolean;
  /** Something is shown over the whole window: the native page view, which would stay on top, is hidden. */
  covered: boolean;
  layoutKey: unknown;
  /** The width, in CSS pixels, the project's panel and this column need side by side, the bar made compact. */
  onNeed?: (width: number) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const sentWidth = useRef(0);
  // Too narrow for the bar's buttons: the view, the mode and the screen go into one menu.
  const [compact, setCompact] = useState(false);
  const fullWidth = useRef(0);
  const needRef = useRef(onNeed);
  needRef.current = onNeed;
  const [exporting, setExporting] = useState(false);
  // Under the publish dialog, a picture of the page where it was (Q392): the native view, hidden meanwhile, would cover the dialog.
  const placed = useRef<{ x: number; y: number; width: number; height: number; radius: number }>(undefined);
  const [picture, setPicture] = useState<{ url: string; at: NonNullable<typeof placed.current> } | null>(null);
  const openPublish = async () => {
    const url = await upstart.invoke("preview:snapshot").catch(() => null);
    setPicture(url && placed.current ? { url, at: placed.current } : null);
    setExporting(true);
  };
  const closePublish = () => {
    setExporting(false);
    setPicture(null);
  };
  // During a template's adaptation, the pages still showing its contents (Q305).
  const adaptation = useAdaptation(project?.id);
  const toAdapt = useMemo(() => new Set(stillToAdapt(adaptation).map((s) => s.route)), [adaptation]);
  const [width, setWidth] = useState<Width>("desktop");
  const [landscape, setLandscape] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // "Menu deleted · Undo" (Q137), for a few seconds after a page is deleted from its thumbnail.
  const [deleted, setDeleted] = useState<{ route: string; name?: string; at: number }>();
  useEffect(
    () => upstart.on("preview:page-deleted", ({ route, name }) => setDeleted({ route, name, at: Date.now() })),
    [],
  );
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
  // The page zoomed to is drawn, out of sight: the zoom may land (Q142).
  const pendingReady = useRef<PreviewZoomReady>(undefined);
  useEffect(() => {
    const offs = [
      upstart.on("preview:zoom", (z) => {
        pendingZoom.current = z;
        pendingReady.current = undefined;
      }),
      upstart.on("preview:zoom-ready", (r) => {
        pendingReady.current = r;
        setZoom((z) => (z && !z.toGrid && z.route === r.route ? { ...z, ready: true } : z));
      }),
      // The page view is in place, over the zoom's picture: two frames later the picture goes.
      upstart.on("preview:placed", () =>
        requestAnimationFrame(() => requestAnimationFrame(() => setZoom((z) => (z?.landed ? undefined : z)))),
      ),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, []);
  // A page view that is never said to be in place does not keep the picture.
  const landed = !!zoom?.landed;
  useEffect(() => {
    if (!landed) return;
    const timer = setTimeout(() => setZoom((z) => (z?.landed ? undefined : z)), 400);
    return () => clearTimeout(timer);
  }, [landed]);
  // The preview's own size, which thumbnails are pictured at (Q142); not followed while it is being resized.
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
  const pageCount = state.routes.filter((r) => !r.generated).length;
  const pagesView = !!project && state.view === "pages" && pageCount >= 2;
  // The menus' items and their shortcuts (Q335): what the bar's buttons do, when they are shown.
  const shown = !!project && state.routes.length > 0;
  useCommands({
    publish: () => shown && void openPublish(),
    "screen-desktop": () => shown && setWidth("desktop"),
    "screen-tablet": () => shown && setWidth("tablet"),
    "screen-phone": () => shown && setWidth("phone"),
    "all-pages": () =>
      project && pageCount >= 2 && void upstart.invoke("preview:set-view", state.view === "pages" ? "page" : "pages"),
    "mode-edit": () => shown && void upstart.invoke("preview:set-mode", "edit"),
    "mode-comment": () => shown && void upstart.invoke("preview:set-mode", "comment"),
    "mode-visitor": () => shown && void upstart.invoke("preview:set-mode", "visitor"),
    "reload-preview": () => project && void upstart.invoke("preview:reload"),
  });
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
    const parked = pagesView || (!!zoom && !zoom.landed);
    const send = () => {
      const r = element.getBoundingClientRect();
      const device = DEVICES[width];
      if (!device) {
        setFrame(undefined);
        placed.current = { x: 0, y: 0, width: r.width, height: r.height, radius: 0 };
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
      placed.current = {
        x: rect.x - r.x,
        y: rect.y - r.y,
        width: rect.width,
        height: rect.height,
        radius: view.radius,
      };
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
  }, [layoutKey, dialogOpen, covered, width, landscape, historyOpen, pagesView, !!zoom && !zoom.landed]);

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
      const ready = pendingReady.current?.route === z.route;
      if (cell && thumb) setZoom({ route: z.route, toGrid: false, page, cell, thumb, ready });
    }
  }, [pagesView]);

  // The bar's buttons side by side: compact when they do not fit in its width, and the window never narrower
  // than the project's panel and the compact bar (main), nor narrower than both with the sidebar beside them (App).
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const gap = Number.parseFloat(style.columnGap) || 0;
      const items = [...el.children].filter((c) => !(c as HTMLElement).dataset.spacer) as HTMLElement[];
      const widthOf = (list: HTMLElement[]) => list.reduce((sum, c) => sum + c.getBoundingClientRect().width + gap, 0);
      const natural =
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight) + widthOf(items) - gap;
      let compactWidth = natural;
      if (!compact) {
        fullWidth.current = natural;
        const folded = items.filter((c) => c.dataset.collapse !== undefined);
        // The menu's button, in their place: 32 pixels and its gap.
        if (folded.length) compactWidth = natural - widthOf(folded) + 32 + gap;
      }
      const available = el.clientWidth;
      const next = compact ? available < fullWidth.current : available < natural;
      if (next !== compact) setCompact(next);
      const panel = document.querySelector('[data-testid="conversation"]')?.getBoundingClientRect().width ?? 0;
      const need = Math.ceil(panel + compactWidth);
      if (need === sentWidth.current) return;
      sentWidth.current = need;
      upstart.send("window:min-width", need);
      needRef.current?.(need);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const c of el.children) observer.observe(c);
    return () => observer.disconnect();
  });
  // No website shown: the window's narrowest is its own again.
  useEffect(
    () => () => {
      upstart.send("window:min-width", 0);
      needRef.current?.(0);
    },
    [],
  );
  const openBarMenu = async (button: HTMLElement) => {
    const r = button.getBoundingClientRect();
    const choice = await upstart.invoke(
      "preview:bar-menu",
      {
        view: pageCount >= 2 ? state.view : null,
        mode: state.mode,
        width,
        landscape: width !== "desktop" ? landscape : null,
      },
      { x: r.left, y: r.bottom + 4 },
    );
    if (choice === "view-page" || choice === "view-pages")
      void upstart.invoke("preview:set-view", choice === "view-page" ? "page" : "pages");
    else if (choice === "mode-edit" || choice === "mode-comment" || choice === "mode-visitor")
      void upstart.invoke("preview:set-mode", choice.slice(5) as PreviewMode);
    else if (choice === "screen-desktop" || choice === "screen-tablet" || choice === "screen-phone")
      setWidth(choice.slice(7) as Width);
    else if (choice === "rotate") setLandscape((l) => !l);
  };

  return (
    <main data-testid="preview" data-tour="page" className="flex min-w-0 flex-1 flex-col bg-muted/40">
      {/* Below the bar, the page's native view would cover its tips: the main process draws them above it. */}
      <TipOverPage.Provider value={true}>
        <div
          ref={bar}
          className="drag-region flex h-13 shrink-0 items-center gap-2 border-b bg-background px-3 win:pr-36"
        >
          {project && state.routes.length > 0 && (
            <div className="no-drag relative flex items-center">
              <Globe className="pointer-events-none absolute left-2 z-10 size-3.5 text-muted-foreground" />
              <NativeSelect
                aria-label={t.preview.pages}
                size="xs"
                data-testid="page-select"
                value={state.route ?? ""}
                onChange={(event) => {
                  const route = event.target.value;
                  void upstart.invoke("preview:set-view", "page").then(() => upstart.invoke("preview:navigate", route));
                }}
                className="field-sizing-content bg-background pl-7 font-medium hover:bg-accent"
              >
                {state.route !== null && !state.routes.some((r) => r.route === state.route) && (
                  <option value={state.route}>{state.route}</option>
                )}
                {state.routes
                  .filter((r) => !r.group)
                  .map((r) => (
                    <option key={r.route} value={r.route}>
                      {r.route}
                    </option>
                  ))}
                {[...new Set(state.routes.flatMap((r) => (r.group ? [r.group] : [])))].map((group) => (
                  <optgroup key={group} label={group}>
                    {state.routes
                      .filter((r) => r.group === group)
                      .map((r) => (
                        <option key={r.route} value={r.route}>
                          {r.route}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="flex-1" data-spacer />
          {deleted && (
            <div
              data-testid="page-deleted"
              className="no-drag flex items-center gap-2 rounded-md bg-foreground py-1 pr-1 pl-2.5 text-xs text-background"
            >
              {t.preview.pageDeleted(pageName(deleted.route, deleted.name))}
              <Tip text={t.preview.undoDelete}>
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
              </Tip>
            </div>
          )}
          {!compact && project && pageCount >= 2 && (
            <div
              data-collapse
              className="no-drag flex items-center gap-px rounded-md border p-0.5"
              data-testid="preview-view"
            >
              {(
                [
                  ["page", Square, t.preview.pageViewTip, undefined],
                  ["pages", LayoutGrid, t.preview.allPagesTip, "all-pages"],
                ] as const
              ).map(([view, Icon, tip, command]) => (
                <Button
                  key={view}
                  variant="ghost"
                  size="icon-sm"
                  className={cn("h-6 w-8", state.view === view && "bg-foreground/10 text-foreground")}
                  tip={tip}
                  command={command}
                  aria-pressed={state.view === view}
                  data-testid={`view-${view}`}
                  onClick={() => void upstart.invoke("preview:set-view", view)}
                >
                  <Icon />
                </Button>
              ))}
            </div>
          )}
          {!compact && project && state.routes.length > 0 && (
            <>
              <div
                data-collapse
                className="no-drag flex items-center gap-px rounded-md border p-0.5"
                data-testid="preview-mode"
              >
                {(
                  [
                    ["edit", MousePointer2, t.preview.editMode],
                    ["comment", MessageSquarePlus, t.preview.commentMode],
                    ["visitor", Eye, t.preview.visitorMode],
                  ] as const
                ).map(([mode, Icon, tip]) => (
                  <Button
                    key={mode}
                    variant="ghost"
                    size="icon-sm"
                    className={cn("h-6 w-8", state.mode === mode && "bg-foreground/10 text-foreground")}
                    tip={tip}
                    command={`mode-${mode}`}
                    aria-pressed={state.mode === mode}
                    data-testid={`mode-${mode}`}
                    onClick={() => void upstart.invoke("preview:set-mode", mode)}
                  >
                    <Icon />
                  </Button>
                ))}
              </div>
              <div
                data-collapse
                className="no-drag flex items-center gap-px rounded-md border p-0.5"
                data-testid="preview-width"
              >
                {(
                  [
                    ["desktop", Monitor, t.preview.desktop],
                    ["tablet", Tablet, t.preview.tablet],
                    ["phone", Smartphone, t.preview.phone],
                  ] as const
                ).map(([w, Icon, tip]) => (
                  <Button
                    key={w}
                    variant="ghost"
                    size="icon-sm"
                    className={cn("h-6 w-8", width === w && "bg-foreground/10 text-foreground")}
                    tip={tip}
                    command={`screen-${w}`}
                    aria-pressed={width === w}
                    data-testid={`width-${w}`}
                    onClick={() => setWidth(w)}
                  >
                    <Icon />
                  </Button>
                ))}
                {/* Always there, so the buttons do not move when the screen changes; a desktop screen does not turn. */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn("h-6 w-8", width !== "desktop" && landscape && "bg-foreground/10 text-foreground")}
                  tip={
                    width === "desktop" ? t.preview.noLandscape : landscape ? t.preview.portrait : t.preview.landscape
                  }
                  disabled={width === "desktop"}
                  aria-pressed={width !== "desktop" && landscape}
                  data-testid="rotate"
                  onClick={() => setLandscape((l) => !l)}
                >
                  <RotateCwSquare />
                </Button>
              </div>
            </>
          )}
          {compact && project && state.routes.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="no-drag"
              tip={t.preview.barMenu.tip}
              data-testid="bar-menu"
              onClick={(event) => void openBarMenu(event.currentTarget)}
            >
              <Ellipsis />
            </Button>
          )}
          {/* At the phone's width the page's own send bar does not fit: it is here instead (Q95). */}
          {project && width === "phone" && comments.length > 0 && (
            <Button
              size="sm"
              className="no-drag h-7"
              disabled={working}
              tip={working ? t.comments.waitForAgent : t.comments.sendTitle}
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
              onClick={() => void openPublish()}
              tip={t.preview.publishTip}
              command="publish"
              data-testid="export-open"
              data-tour="publish"
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
              tip={t.preview.reload}
              command="reload-preview"
              onClick={() => void upstart.invoke("preview:reload")}
            >
              <RotateCw className={state.loading ? "animate-spin" : undefined} />
            </Button>
          )}
        </div>
      </TipOverPage.Provider>
      <div className="flex min-h-0 flex-1">
        <div
          ref={area}
          data-tour-area
          data-native-view
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center"
        >
          {frame && state.route !== null && (
            <div
              data-testid="device-frame"
              aria-hidden
              className={cn("absolute shadow-xl ring-1", BEZEL_COLORS)}
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
              panel={panel}
              toAdapt={toAdapt}
            />
          ) : zoom ? null : (
            <>
              <h2 className="text-base font-medium">{project ? t.preview.emptyTitle : t.preview.noProjectTitle}</h2>
              <p className="max-w-80 text-sm text-muted-foreground">
                {project ? t.preview.emptyText : t.preview.noProjectText}
              </p>
            </>
          )}
          {zoom && (
            <ZoomPicture
              zoom={zoom}
              // To the grid it is over; to a page, the page view is put in place first, over the picture.
              onDone={() => setZoom((z) => (z && !z.toGrid ? { ...z, landed: true } : undefined))}
            />
          )}
          {dialogOpen && picture && (
            <img
              data-testid="publish-page-picture"
              src={picture.url}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute object-cover object-top"
              style={{
                left: picture.at.x,
                top: picture.at.y,
                width: picture.at.width,
                height: picture.at.height,
                borderRadius: picture.at.radius,
              }}
            />
          )}
          {dialogOpen && <ExportDialog project={project} working={working} onClose={closePublish} />}
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
 * shown, `cell` its thumbnail; `shot` a picture of the page as it was shown
 * (going to the thumbnails), `thumb` the thumbnail's picture. To a page, it lands once the page is `ready` (Q142).
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
  /** The movement is over and the page view is being put in place: the picture stays under it until it is. */
  landed?: boolean;
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
 * interface is busy. To the thumbnails, the picture of the page crossfades
 * into the thumbnail's. To a page, the thumbnail's picture, taken at the
 * preview's size (Q142), grows to it, and lands once the page is drawn.
 */
function ZoomPicture({ zoom, onDone }: { zoom: Zoom; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLImageElement>(null);
  const [moved, setMoved] = useState(false);
  const [faded, setFaded] = useState(false);
  const fades = zoom.toGrid && !!zoom.thumb;
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
    const picture = thumb.current;
    if (picture) {
      animations.push(picture.animate([{ transform: from.thumb }, { transform: to.thumb }], timing));
      // To the thumbnails, the page's picture crossfades into the thumbnail's.
      if (fades) {
        const fade = picture.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 200,
          delay: 100,
          easing: "ease-out",
          fill: "both",
        });
        fade.onfinish = () => setFaded(true);
        animations.push(fade);
      }
    }
    const first = animations[0];
    if (first) first.onfinish = () => setMoved(true);
    return () => {
      for (const a of animations) {
        a.onfinish = null;
        a.cancel();
      }
    };
  }, [zoom.route, zoom.toGrid]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: onDone is new at each rendering of the pane
  useEffect(() => {
    if (!moved || zoom.landed) return;
    if (zoom.ready && (!fades || faded)) return onDone();
    // A page that never says it is drawn is shown all the same.
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
  }, [moved, faded, zoom.ready, zoom.landed, fades]);
  return (
    <div
      ref={box}
      data-testid="preview-zoom"
      data-ready={zoom.ready ? "" : undefined}
      aria-hidden
      className={cn("pointer-events-none fixed z-40 origin-top-left overflow-hidden will-change-transform", PAGE_WHITE)}
      style={{ left: zoom.page.x, top: zoom.page.y, width: zoom.page.width, height: zoom.page.height }}
    >
      {zoom.toGrid && zoom.shot && (
        <img src={zoom.shot} alt="" draggable={false} className="absolute inset-0 h-full w-full max-w-none" />
      )}
      {zoom.thumb && (
        <img
          ref={thumb}
          src={zoom.thumb}
          alt=""
          draggable={false}
          className="absolute top-0 left-0 max-w-none origin-top-left"
          style={{ width: zoom.page.width, height: (zoom.page.width * zoom.cell.height) / zoom.cell.width }}
        />
      )}
    </div>
  );
}
