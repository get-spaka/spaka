import {
  ChevronDown,
  Eye,
  Globe,
  MessageSquarePlus,
  Monitor,
  MousePointer2,
  RotateCw,
  RotateCwSquare,
  Send,
  Smartphone,
  Tablet,
  Upload,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { DeviceView, HistoryEntry, PreviewState, ProjectInfo } from "../../shared/ipc";
import { useComments } from "../hooks/useMain";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ExportDialog } from "./ExportDialog";
import { HistoryButtons, HistoryList } from "./HistoryPanel";
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
  // Where the device's frame is drawn, under the native view, relative to the area.
  const [frame, setFrame] = useState<{ x: number; y: number; width: number; height: number; radius: number }>();
  const comments = useComments(project?.id);
  const dialogOpen = exporting && project !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new project closes the dialog
  useLayoutEffect(() => setExporting(false), [project?.id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey says when the columns before the area changed
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    // The native page view would cover the dialog: it is hidden while the dialog is open.
    if (dialogOpen || covered) {
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
  }, [layoutKey, dialogOpen, covered, width, landscape, historyOpen]);

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
              onChange={(event) => void upstart.invoke("preview:navigate", event.target.value)}
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
          <h2 className="text-base font-medium">{project ? t.preview.emptyTitle : t.preview.noProjectTitle}</h2>
          <p className="max-w-80 text-sm text-muted-foreground">
            {project ? t.preview.emptyText : t.preview.noProjectText}
          </p>
          {dialogOpen && <ExportDialog project={project} working={working} onClose={() => setExporting(false)} />}
        </div>
        {project && historyOpen && (
          <HistoryList entries={history} disabled={working} onRestore={() => setHistoryOpen(false)} />
        )}
      </div>
    </main>
  );
}
