// The media picker (Q158, Q159): over the window, the website's images, the
// search for free ones, and a file from the computer. It answers with the
// chosen image's address.
import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { upstart } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import type { PickRequest } from "../lib/picker";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { ImageSearch, MediaThumb, useFileDrop, useMediaList } from "./MediaLibrary";
import { Button } from "./ui/button";

export function MediaPicker({ request }: { request: PickRequest }) {
  const [list] = useMediaList();
  const images = list?.filter((m) => m.image) ?? [];
  const [tab, setTab] = useState<"site" | "search">("site");
  const [error, setError] = useState<string>();
  const pick = (path: string | null) => request.resolve(path ? `/${path.replace(/^\//, "")}` : null);
  const added = (run: () => Promise<{ paths: string[] } | null>) => {
    setError(undefined);
    run()
      .then((r) => r?.paths[0] && pick(r.paths.find((p) => /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(p)) ?? null))
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
        aria-label={t.media.pickTitle}
        {...drop.handlers}
        className={cn(
          "flex h-full max-h-[620px] w-full max-w-[780px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
          drop.over && "ring-4 ring-ring/40",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{t.media.pickTitle}</h2>
          <div role="tablist" className="ml-4 flex gap-1">
            {(["site", "search"] as const).map((name) => (
              <button
                key={name}
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
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => added(() => upstart.invoke("media:choose-files"))}
          >
            <Upload />
            {t.media.fromComputer}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t.media.cancel}
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
                {images.map((m) => (
                  <li key={m.path}>
                    <button
                      type="button"
                      data-testid="picker-item"
                      data-path={m.path}
                      onClick={() => pick(m.path)}
                      className="w-full overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-ring/40"
                    >
                      <MediaThumb path={m.path} className="aspect-[4/3] w-full" />
                      <span className="block truncate px-1.5 py-1 text-[11px]">{m.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t.media.none}</p>
            )
          ) : (
            <ImageSearch onAdded={(path) => pick(path)} onError={setError} />
          )}
        </div>
      </div>
    </div>
  );
}
