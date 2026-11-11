import { ChevronDown, Eye, Globe, Monitor, MousePointer2, RotateCw, Smartphone, Tablet, Upload } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { PreviewState, ProjectInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ExportDialog } from "./ExportDialog";
import { Button } from "./ui/button";

/** The widths the preview can take (decisions: a responsive view). */
const WIDTHS = { desktop: undefined, tablet: 768, phone: 390 } as const;
type Width = keyof typeof WIDTHS;

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
}: {
  project: ProjectInfo | null;
  state: PreviewState;
  working: boolean;
  /** Something is shown over the whole window: the native page view, which would stay on top, is hidden. */
  covered: boolean;
  layoutKey: unknown;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [width, setWidth] = useState<Width>("desktop");
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
      // A narrower view, centred in the column, for the tablet and phone widths.
      const w = Math.min(WIDTHS[width] ?? r.width, r.width);
      upstart.send("preview:bounds", {
        x: Math.round(r.x + (r.width - w) / 2),
        y: Math.round(r.y),
        width: Math.round(w),
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
  }, [layoutKey, dialogOpen, covered, width]);

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
            </div>
          </>
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
      <div ref={area} className="relative flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
        <h2 className="text-base font-medium">{project ? t.preview.emptyTitle : t.preview.noProjectTitle}</h2>
        <p className="max-w-80 text-sm text-muted-foreground">
          {project ? t.preview.emptyText : t.preview.noProjectText}
        </p>
        {dialogOpen && <ExportDialog project={project} working={working} onClose={() => setExporting(false)} />}
      </div>
    </main>
  );
}
