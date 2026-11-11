// The Blocks tab (Q92, Q100): the gallery's blocks by kind, each drawn with the
// project's theme, narrowed by a search. A block is dragged into the preview,
// where the line shows where it goes (Q101, Q112).
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { matchesBlock } from "../../shared/block-filter";
import { BLOCK_DRAG_TYPE, BLOCK_KINDS, type GalleryBlock } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";

export function BlocksTab({ theme, hasPage, working }: { theme: string; hasPage: boolean; working: boolean }) {
  const [blocks, setBlocks] = useState<GalleryBlock[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    void upstart.invoke("gallery:list").then(setBlocks);
  }, []);
  // The theme changes many times while the agent writes it: the thumbnails wait for it to settle.
  const [settled, setSettled] = useState(theme);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(theme), 600);
    return () => clearTimeout(timer);
  }, [theme]);

  const disabled = working || !hasPage;
  const shown = blocks.filter((b) => matchesBlock(b, query, [t.gallery.kinds[b.kind]]));

  return (
    <div data-testid="blocks" className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-background px-4 pt-3 pb-2">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setQuery("")}
            placeholder={t.gallery.search}
            aria-label={t.gallery.search}
            spellCheck={false}
            data-testid="blocks-search"
            className="h-8 w-full rounded-md border bg-background pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              title={t.gallery.clearSearch}
              aria-label={t.gallery.clearSearch}
              className="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>
      <div className="space-y-5 px-4 pb-3">
        <p className="text-xs text-muted-foreground">
          {working ? t.gallery.busy : hasPage ? t.gallery.intro : t.gallery.noPage}
        </p>
        {blocks.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="blocks-none">
            {t.gallery.noMatch(query.trim())}
          </p>
        )}
        {BLOCK_KINDS.map((kind) => {
          const list = shown.filter((b) => b.kind === kind);
          if (!list.length) return null;
          return (
            <section key={kind} className="space-y-2">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t.gallery.kinds[kind]}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {list.map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    theme={settled}
                    disabled={disabled}
                    onAdd={() => add(block)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BlockCard({ block, theme, disabled }: { block: GalleryBlock; theme: string; disabled: boolean }) {
  const thumbnail = useThumbnail(block.id, theme);
  // Resting on a thumbnail shows the block large over the preview (Q109).
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined);
  const peek = (on: boolean) => {
    clearTimeout(resting.current);
    if (on) resting.current = setTimeout(() => upstart.send("gallery:peek", block.id), 250);
    else upstart.send("gallery:peek", null);
  };
  // Leaving the tab while resting on a block hides it.
  useEffect(
    () => () => {
      clearTimeout(resting.current);
      upstart.send("gallery:peek", null);
    },
    [],
  );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dragging is for the pointer; the Add button does the same from the keyboard
    <div
      data-testid="block"
      data-block={block.id}
      draggable={!disabled}
      onMouseEnter={() => peek(true)}
      onMouseLeave={() => peek(false)}
      onDragStart={(event) => {
        peek(false);
        event.dataTransfer.setData(BLOCK_DRAG_TYPE, block.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      title={block.description}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-background",
        disabled ? "opacity-60" : "cursor-grab active:cursor-grabbing",
      )}
    >
      <div ref={thumbnail.ref} className="flex aspect-[4/3] items-center overflow-hidden bg-muted">
        {thumbnail.url ? (
          <img src={thumbnail.url} alt="" draggable={false} className="max-h-full w-full object-cover object-top" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[11px] text-muted-foreground">
            {t.gallery.drawing}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 border-t px-2 py-1">
        <span className="flex-1 truncate text-xs">{block.name}</span>
      </div>
    </div>
  );
}

/** A block's thumbnail, asked for once it is about to be seen, and again when the theme changes. */
function useThumbnail(id: string, theme: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [shown, setShown] = useState<{ theme: string; url: string }>();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!seen || !theme) return;
    let live = true;
    void upstart
      .invoke("gallery:thumbnail", id)
      .then((url) => live && setShown({ theme, url }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, theme, seen]);
  // The last thumbnail stays until the new theme's is drawn.
  return { ref, url: shown?.url };
}
