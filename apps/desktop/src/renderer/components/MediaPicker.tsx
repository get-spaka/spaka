// The media picker (Q158, Q159): over the window, the website's images, the
// search for free ones, and a file from the computer. It answers with the
// chosen image's address; for a list of images, with the addresses of those
// chosen, in the order they were chosen (Q354).
import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { upstart } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import type { PickRequest } from "../lib/picker";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ImageSearch, MediaThumb, useFileDrop, useMediaList } from "./MediaLibrary";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

export function MediaPicker({ request }: { request: PickRequest }) {
  const [list] = useMediaList();
  const images = list?.filter((m) => m.image) ?? [];
  const [tab, setTab] = useState<"site" | "search">("site");
  const [error, setError] = useState<string>();
  const multiple = request.multiple;
  // Several images, as their library paths ("media/a.jpg"), in the order chosen.
  const [chosen, setChosen] = useState<string[]>([]);
  const address = (path: string) => `/${path.replace(/^\//, "")}`;
  const pick = (path: string | null) => request.resolve(path ? [address(path)] : null);
  const choose = (paths: string[]) =>
    setChosen((was) => [...was, ...paths.map((p) => p.replace(/^\//, "")).filter((p) => !was.includes(p))]);
  const toggle = (path: string) =>
    setChosen((was) => (was.includes(path) ? was.filter((p) => p !== path) : [...was, path]));
  const added = (run: () => Promise<{ paths: string[] } | null>) => {
    setError(undefined);
    run()
      .then((r) => {
        const images = r?.paths.filter((p) => /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(p)) ?? [];
        if (!r?.paths[0]) return;
        if (multiple) choose(images);
        else pick(images[0] ?? null);
      })
      .catch((e) => setError(messageOf(e)));
  };
  const drop = useFileDrop((paths) => added(() => upstart.invoke("media:add-files", paths)));
  useEffect(() => {
    if (list && !images.length) setTab("search");
  }, [list, images.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && request.resolve(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-8">
      <div
        data-testid="media-picker"
        role="dialog"
        aria-label={multiple ? t.media.pickManyTitle : t.media.pickTitle}
        {...drop.handlers}
        className={cn(
          "flex h-full max-h-[620px] w-full max-w-[780px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
          drop.over && "ring-4 ring-ring/40",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{multiple ? t.media.pickManyTitle : t.media.pickTitle}</h2>
          <div role="tablist" className="ml-4 flex gap-1">
            {(["site", "search"] as const).map((name) => (
              <Tip key={name} text={t.media.pickerTips[name]}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  data-testid={`picker-${name}`}
                  onClick={() => setTab(name)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    tab === name ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name === "site" ? t.media.thisSite : t.media.search}
                </button>
              </Tip>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            tip={t.media.fromComputerTip}
            onClick={() => added(() => upstart.invoke("media:choose-files"))}
          >
            <Upload />
            {t.media.fromComputer}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            tip={t.media.cancelTip}
            onClick={() => pick(null)}
            data-testid="picker-close"
          >
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 text-xs text-destructive">{error}</p>}
          {tab === "site" ? (
            images.length ? (
              <ul className="grid grid-cols-4 gap-3">
                {images.map((m) => {
                  const place = chosen.indexOf(m.path.replace(/^\//, ""));
                  return (
                    <li key={m.path}>
                      <Tip text={multiple ? t.media.pickManyTip : t.media.pickTip}>
                        <button
                          type="button"
                          data-testid="picker-item"
                          data-path={m.path}
                          aria-pressed={multiple ? place >= 0 : undefined}
                          onClick={() => (multiple ? toggle(m.path.replace(/^\//, "")) : pick(m.path))}
                          className={cn(
                            "relative w-full overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-ring/40",
                            place >= 0 && "ring-2 ring-primary hover:ring-primary",
                          )}
                        >
                          <MediaThumb path={m.path} className="aspect-[4/3] w-full" />
                          <span className="block truncate px-1.5 py-1 text-[11px]">{m.name}</span>
                          {place >= 0 && (
                            <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                              {place + 1}
                            </span>
                          )}
                        </button>
                      </Tip>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.media.none}</p>
            )
          ) : (
            <ImageSearch onAdded={(path) => (multiple ? choose([path]) : pick(path))} onError={setError} />
          )}
        </div>
        {multiple && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2.5">
            <Button
              size="sm"
              disabled={!chosen.length}
              tip={t.media.addChosenTip}
              data-testid="picker-add"
              onClick={() => request.resolve(chosen.map(address))}
            >
              {t.media.addChosen(chosen.length)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
