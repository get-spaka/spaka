// The Blocks tab (Q92, Q100, Q204): the gallery's blocks by kind, each drawn
// with the project's theme, narrowed by a search or a kind's chip; with
// neither, each kind is a group showing its count and its first blocks,
// opened to show them all. The project's own blocks, the design of the
// template it started from, come first in a group of their own (Q235). A block is dragged into the preview, where the
// line shows where it goes (Q101, Q112).
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { matchesBlock } from "../../shared/block-filter";
import { BLOCK_DRAG_TYPE, BLOCK_KINDS, type BlockKind, type GalleryBlock } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Tip } from "./ui/tip";

export function BlocksTab({
  projectId,
  theme,
  hasPage,
  working,
}: {
  projectId?: string;
  theme: string;
  hasPage: boolean;
  working: boolean;
}) {
  const [blocks, setBlocks] = useState<GalleryBlock[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<BlockKind>();
  const [open, setOpen] = useState<Set<BlockKind>>(() => new Set());
  // biome-ignore lint/correctness/useExhaustiveDependencies: another project has other blocks of its own
  useEffect(() => {
    let live = true;
    void upstart.invoke("gallery:list").then((list) => live && setBlocks(list));
    return () => {
      live = false;
    };
  }, [projectId]);
  // The theme changes many times while the agent writes it: the thumbnails wait for it to settle.
  const [settled, setSettled] = useState(theme);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(theme), 600);
    return () => clearTimeout(timer);
  }, [theme]);

  const disabled = working || !hasPage;
  const shown = blocks.filter((b) => (!kind || b.kind === kind) && matchesBlock(b, query, [t.gallery.kinds[b.kind]]));
  // A search or a chip shows every block it finds; otherwise a group shows its first ones until opened.
  const narrowed = !!kind || !!query.trim();
  const kinds = BLOCK_KINDS.filter((k) => blocks.some((b) => b.kind === k));
  const design = shown.filter((b) => b.design);
  const toggle = (k: BlockKind) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(k)) next.add(k);
      return next;
    });

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
            <Tip text={t.gallery.clearSearch}>
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t.gallery.clearSearch}
                className="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </Tip>
          )}
        </label>
      </div>
      <div className="space-y-5 px-4 pb-3">
        {kinds.length > 1 && (
          <div className="flex flex-wrap gap-1" role="toolbar" aria-label={t.gallery.kindsLabel}>
            {kinds.map((k) => (
              <Tip key={k} text={kind === k ? t.gallery.kindAll : t.gallery.kindOnly}>
                <button
                  type="button"
                  aria-pressed={kind === k}
                  data-testid="blocks-chip"
                  data-kind={k}
                  onClick={() => setKind(kind === k ? undefined : k)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    kind === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  {t.gallery.kinds[k]}
                </button>
              </Tip>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {working ? t.gallery.busy : hasPage ? t.gallery.intro : t.gallery.noPage}
        </p>
        {blocks.length > 0 && shown.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="blocks-none">
            {t.gallery.noMatch(query.trim())}
          </p>
        )}
        {design.length > 0 && (
          <section className="space-y-2" data-testid="blocks-design">
            <div className="space-y-0.5">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.gallery.design}</h2>
              {!narrowed && <p className="text-[11px] text-muted-foreground">{t.gallery.designIntro}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {design.map((block) => (
                <BlockCard key={block.id} block={block} theme={settled} disabled={disabled} />
              ))}
            </div>
          </section>
        )}
        {BLOCK_KINDS.map((k) => {
          const list = shown.filter((b) => b.kind === k && !b.design);
          if (!list.length) return null;
          const all = narrowed || open.has(k);
          const visible = all ? list : list.slice(0, FIRST);
          const cards = (
            <div className="grid grid-cols-2 gap-2">
              {visible.map((block) => (
                <BlockCard key={block.id} block={block} theme={settled} disabled={disabled} />
              ))}
            </div>
          );
          if (narrowed)
            return (
              <section key={k} className="space-y-2" data-testid="blocks-group" data-kind={k} data-open="true">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t.gallery.kinds[k]}
                </h2>
                {cards}
              </section>
            );
          const Chevron = all ? ChevronDown : ChevronRight;
          return (
            <section key={k} className="space-y-2" data-testid="blocks-group" data-kind={k} data-open={all}>
              <Tip text={all ? t.gallery.groupClose : t.gallery.groupOpen}>
                <button
                  type="button"
                  aria-expanded={all}
                  data-testid="blocks-group-toggle"
                  onClick={() => toggle(k)}
                  className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
                >
                  <Chevron className="size-3.5" />
                  {t.gallery.kinds[k]}
                  <span className="ml-auto font-normal normal-case tracking-normal">{list.length}</span>
                </button>
              </Tip>
              {cards}
              {!all && list.length > FIRST && (
                <Tip text={t.gallery.groupOpen}>
                  <button
                    type="button"
                    data-testid="blocks-group-more"
                    onClick={() => toggle(k)}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {t.gallery.showAll(list.length)}
                  </button>
                </Tip>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** The blocks a closed group shows: its first row. */
const FIRST = 2;

function BlockCard({ block, theme, disabled }: { block: GalleryBlock; theme: string; disabled: boolean }) {
  const thumbnail = useThumbnail(block.id, theme);
  // Resting on a thumbnail shows the block large over the preview (Q109).
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined);
  const peek = (on: boolean) => {
    clearTimeout(resting.current);
    if (on) resting.current = setTimeout(() => upstart.send("gallery:peek", block.id), 150);
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
    <Tip text={block.description}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dragging is for the pointer; the Add button does the same from the keyboard */}
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
    </Tip>
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
