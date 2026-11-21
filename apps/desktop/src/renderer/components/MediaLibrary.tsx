// The media library (Q158, Q168, Q169): the project's files as a grid, files
// dropped from the Finder to add them, the search for free images, and for
// each file its alt text, credits and uses. A file in use cannot be deleted;
// one renamed is renamed everywhere it is used.
import { ChevronLeft, FileText, ImageOff, Search, Trash2, Upload } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { IMAGE_MODELS } from "../../shared/image-models";
import type { MediaFound, MediaItem } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

// Small copies of the library's images, kept until a media file changes.
const thumbs = new Map<string, Promise<string | null>>();
if (typeof window !== "undefined") upstart.on("content:changed", () => thumbs.clear());

export function MediaThumb({ path, className }: { path: string; className?: string }) {
  const clean = path.replace(/^\//, "");
  const [url, setUrl] = useState<string | null>();
  useEffect(() => {
    let live = true;
    if (!thumbs.has(clean))
      thumbs.set(
        clean,
        upstart.invoke("media:thumbnail", clean).catch(() => null),
      );
    void thumbs.get(clean)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [clean]);
  if (url === undefined) return <div className={cn("bg-muted", className)} />;
  if (url === null)
    return (
      <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-4" />
      </div>
    );
  return <img src={url} alt="" draggable={false} className={cn("bg-muted object-cover", className)} />;
}

export function useMediaList() {
  const [list, setList] = useState<MediaItem[]>();
  const load = useCallback(
    () =>
      void upstart
        .invoke("media:list")
        .then(setList)
        .catch(() => setList([])),
    [],
  );
  useEffect(() => {
    load();
    return upstart.on("content:changed", load);
  }, [load]);
  return [list, load] as const;
}

/** Dropping files from the Finder: their paths on the disk, for media:add-files. */
export function useFileDrop(onFiles: (paths: string[]) => void) {
  const [over, setOver] = useState(false);
  const files = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!files(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        if (!files(e)) return;
        e.preventDefault();
        setOver(false);
        const paths = [...e.dataTransfer.files].map((f) => upstart.pathOf(f)).filter(Boolean);
        if (paths.length) onFiles(paths);
      },
    },
  };
}

export function MediaLibrary({ onError }: { onError: (message: string | undefined) => void }) {
  const [list] = useMediaList();
  const [open, setOpen] = useState<string>();
  const [searching, setSearching] = useState(false);
  const [deleted, setDeleted] = useState<string>();
  const add = (run: () => Promise<unknown>) => {
    onError(undefined);
    run().catch((e) => onError(messageOf(e)));
  };
  const drop = useFileDrop((paths) => add(() => upstart.invoke("media:add-files", paths)));
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(undefined), 8000);
    return () => clearTimeout(timer);
  }, [deleted]);

  const item = open ? list?.find((i) => i.path === open) : undefined;
  if (item)
    return (
      <MediaDetail
        key={item.path}
        item={item}
        onBack={() => setOpen(undefined)}
        onRenamed={setOpen}
        onDeleted={() => {
          setDeleted(item.name);
          setOpen(undefined);
        }}
        onError={onError}
      />
    );
  return (
    <div
      data-testid="media"
      {...drop.handlers}
      className={cn("relative flex min-h-0 flex-1 flex-col", drop.over && "bg-accent/60")}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
        <Button
          size="sm"
          variant="outline"
          tip={t.media.addFilesTip}
          onClick={() => add(() => upstart.invoke("media:choose-files"))}
        >
          <Upload />
          {t.media.addFiles}
        </Button>
        <Button
          size="sm"
          variant={searching ? "secondary" : "outline"}
          onClick={() => setSearching((s) => !s)}
          tip={searching ? t.media.searchClose : t.media.searchOpen}
          data-testid="media-search-toggle"
        >
          <Search />
          {t.media.search}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {searching && (
          <div className="mb-4 rounded-lg border p-3">
            <ImageSearch onAdded={() => setSearching(false)} onError={onError} />
          </div>
        )}
        {list && list.length === 0 && !searching && <p className="text-sm text-muted-foreground">{t.media.none}</p>}
        <ul className="grid grid-cols-3 gap-2">
          {list?.map((m) => (
            <li key={m.path}>
              {/* Its tip also says where the file is used, which the green dot shows. */}
              <Tip text={t.media.openTip(m.uses.length ? m.usesLabel : undefined)}>
                <button
                  type="button"
                  data-testid="media-item"
                  data-path={m.path}
                  onClick={() => setOpen(m.path)}
                  className="w-full overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-ring/30"
                >
                  {m.image ? (
                    <MediaThumb path={m.path} className="aspect-[4/3] w-full" />
                  ) : (
                    <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
                      <FileText className="size-6" />
                    </div>
                  )}
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <span className="truncate text-[11px]">{m.name}</span>
                    {m.generated && (
                      <span
                        data-testid="media-generated-mark"
                        className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground uppercase"
                      >
                        {t.media.generated}
                      </span>
                    )}
                    {m.uses.length > 0 && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-success" />}
                  </div>
                </button>
              </Tip>
            </li>
          ))}
        </ul>
      </div>
      {drop.over && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-ring/60 text-sm font-medium">
          {t.media.drop}
        </div>
      )}
      {deleted && (
        <div
          data-testid="media-deleted"
          className="mx-4 mb-3 flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs text-background"
        >
          {t.media.deleted(deleted)}
          <Tip text={t.content.undoTip}>
            <button
              type="button"
              data-testid="media-deleted-undo"
              className="ml-auto rounded px-1.5 py-0.5 font-medium hover:bg-background/20"
              onClick={() => {
                setDeleted(undefined);
                void upstart.invoke("history:undo");
              }}
            >
              {t.content.undo}
            </button>
          </Tip>
        </div>
      )}
    </div>
  );
}

function MediaDetail({
  item,
  onBack,
  onRenamed,
  onDeleted,
  onError,
}: {
  item: MediaItem;
  onBack: () => void;
  onRenamed: (path: string) => void;
  onDeleted: () => void;
  onError: (message: string | undefined) => void;
}) {
  const [alt, setAlt] = useState(item.alt ?? "");
  const [name, setName] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string>(undefined);
  const write = useCallback(() => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = undefined;
    if (value === undefined) return Promise.resolve();
    return upstart.invoke("media:set-alt", item.path, value).catch((e) => onError(messageOf(e)));
  }, [item.path, onError]);
  const writing = useRef(write);
  writing.current = write;
  // Leaving the file: what is left is written, then its version (Q162).
  useEffect(() => () => void writing.current().then(() => upstart.invoke("content:leave")), []);
  const stem = item.name.replace(/\.[^.]+$/, "");
  const rename = () => {
    const to = name?.trim();
    setName(undefined);
    if (!to || to === stem) return;
    void write()
      .then(() => upstart.invoke("content:leave"))
      .then(() => upstart.invoke("media:rename", item.path, to))
      .then((r) => onRenamed(r.path))
      .catch((e) => onError(messageOf(e)));
  };
  const credit = item.credit;
  return (
    <div data-testid="media-detail" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" onClick={onBack} tip={t.content.backTip} data-testid="media-back">
          <ChevronLeft />
        </Button>
        <h2 className="min-w-0 truncate text-sm font-medium">{item.name}</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          tip={item.uses.length ? t.media.inUse : t.media.deleteTip}
          disabled={item.uses.length > 0}
          data-testid="media-delete"
          onClick={() =>
            void upstart
              .invoke("media:delete", item.path)
              .then(onDeleted)
              .catch((e) => onError(messageOf(e)))
          }
        >
          <Trash2 />
        </Button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
        {item.image && <MediaThumb path={item.path} className="max-h-56 w-full rounded-md object-contain" />}
        <div className="flex items-center gap-2 text-xs">
          {name === undefined ? (
            <>
              <code data-testid="media-name" className="truncate rounded bg-muted px-1.5 py-0.5">
                /{item.path}
              </code>
              <span className="text-muted-foreground">{t.media.size(item.size)}</span>
              <Tip text={t.media.renameTip}>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground underline"
                  onClick={() => setName(stem)}
                  data-testid="media-rename"
                >
                  {t.media.rename}
                </button>
              </Tip>
            </>
          ) : (
            <>
              <input
                data-testid="media-name-input"
                value={name}
                // biome-ignore lint/a11y/noAutofocus: shown because the maker clicked "Rename"
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename();
                  if (e.key === "Escape") setName(undefined);
                }}
                className="h-7 flex-1 rounded-md border bg-background px-2 font-mono"
              />
              <Button size="sm" onClick={rename} tip={t.media.renameSaveTip} data-testid="media-name-save">
                {t.content.renameSave}
              </Button>
            </>
          )}
        </div>
        <p data-testid="media-uses" className="text-xs text-muted-foreground">
          {item.uses.length ? t.media.usedIn(item.usesLabel) : t.media.notUsed}
        </p>
        {item.image && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t.media.alt}</span>
            <textarea
              data-testid="media-alt"
              value={alt}
              rows={2}
              placeholder={t.media.altHint}
              onChange={(e) => {
                setAlt(e.target.value);
                pending.current = e.target.value;
                clearTimeout(timer.current);
                timer.current = setTimeout(() => void write(), 500);
              }}
              className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
          </label>
        )}
        {item.generated && (
          <div data-testid="media-generated" className="space-y-0.5 text-xs">
            <span className="font-medium text-muted-foreground">{t.media.generated}</span>
            <p>{t.media.generatedWith(modelLabel(item.generated.model), new Date(item.generated.date))}</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{item.generated.prompt}</p>
          </div>
        )}
        {credit && (
          <div data-testid="media-credit" className="space-y-0.5 text-xs">
            <span className="font-medium text-muted-foreground">{t.media.credits}</span>
            <p>
              {credit.title ? `“${credit.title}” ` : ""}
              {credit.author ? `${t.media.by(credit.author)}, ` : ""}
              {credit.license}
              {credit.source ? `, ${t.media.via(credit.source)}` : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The search for free images (Q150, Q151): a click adds one to the library, with its credits. */
export function ImageSearch({
  onAdded,
  onError,
}: {
  onAdded: (path: string) => void;
  onError: (message: string | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ images: MediaFound[]; failed: string[] }>();
  const [busy, setBusy] = useState<"search" | string>();
  const search = () => {
    const q = query.trim();
    if (!q) return;
    setBusy("search");
    onError(undefined);
    void upstart
      .invoke("media:search", q)
      .then(setResult)
      .catch((e) => onError(messageOf(e)))
      .finally(() => setBusy(undefined));
  };
  const choose = (image: MediaFound) => {
    setBusy(image.id);
    void upstart
      .invoke("media:add-found", image.id, image.title)
      .then((r) => onAdded(r.path))
      .catch((e) => onError(messageOf(e)))
      .finally(() => setBusy(undefined));
  };
  return (
    <div data-testid="image-search" className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          data-testid="image-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.media.searchPlaceholder}
          className="h-8 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <Button
          size="sm"
          type="submit"
          disabled={!query.trim() || !!busy}
          tip={t.media.search}
          aria-label={t.media.search}
        >
          <Search />
        </Button>
      </form>
      <p className="text-[11px] text-muted-foreground">{t.media.licensed}</p>
      {busy === "search" && <p className="text-xs text-muted-foreground">{t.media.searching}</p>}
      {result?.failed.length ? (
        <p className="text-xs text-muted-foreground">{t.media.failed(result.failed.join(" and "))}</p>
      ) : null}
      {result && !result.images.length && <p className="text-xs text-muted-foreground">{t.media.noResults}</p>}
      <ul className="grid grid-cols-3 gap-2">
        {result?.images.map((image) => (
          <li key={image.id}>
            <Tip text={t.media.addFound(image.title, image.credit.license, image.credit.author)}>
              <button
                type="button"
                data-testid="image-found"
                data-id={image.id}
                disabled={!!busy}
                onClick={() => choose(image)}
                className="relative w-full overflow-hidden rounded-md border text-left hover:ring-2 hover:ring-ring/30 disabled:opacity-60"
              >
                {image.thumb ? (
                  <img src={image.thumb} alt="" className="aspect-[4/3] w-full bg-muted object-cover" />
                ) : (
                  <div className="aspect-[4/3] w-full bg-muted" />
                )}
                <div className="px-1.5 py-1 text-[10px] leading-tight">
                  <p className="truncate font-medium">{image.title}</p>
                  <p className="truncate text-muted-foreground">
                    {image.credit.license}
                    {image.credit.author ? ` · ${image.credit.author}` : ""}
                  </p>
                </div>
                {busy === image.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs">
                    {t.media.adding}
                  </span>
                )}
              </button>
            </Tip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A generating model's name, from the list of image models, else its id. */
function modelLabel(id: string): string {
  return IMAGE_MODELS.find((m) => m.id === id)?.name ?? id;
}
