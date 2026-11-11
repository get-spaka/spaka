// The Blocks tab (Q92, Q100): the gallery's blocks by kind, each drawn with the
// project's theme. A block is dragged into the preview, where the line shows
// where it goes, or added where a block of its kind usually goes (Q101).
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BLOCK_DRAG_TYPE, BLOCK_KINDS, type GalleryBlock } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { messageOf } from "./SettingsDialog";
import { Button } from "./ui/button";

export function BlocksTab({ theme, hasPage, working }: { theme: string; hasPage: boolean; working: boolean }) {
  const [blocks, setBlocks] = useState<GalleryBlock[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void upstart.invoke("gallery:list").then(setBlocks);
  }, []);
  // The theme changes many times while the agent writes it: the thumbnails wait for it to settle.
  const [settled, setSettled] = useState(theme);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(theme), 600);
    return () => clearTimeout(timer);
  }, [theme]);

  const add = (block: GalleryBlock) => {
    setError(undefined);
    void upstart.invoke("gallery:add", block.id).catch((e) => setError(messageOf(e)));
  };
  const disabled = working || !hasPage;

  return (
    <div data-testid="blocks" className="flex-1 space-y-5 overflow-y-auto px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {working ? t.gallery.busy : hasPage ? t.gallery.intro : t.gallery.noPage}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {BLOCK_KINDS.map((kind) => {
        const list = blocks.filter((b) => b.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t.gallery.kinds[kind]}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {list.map((block) => (
                <BlockCard key={block.id} block={block} theme={settled} disabled={disabled} onAdd={() => add(block)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BlockCard({
  block,
  theme,
  disabled,
  onAdd,
}: {
  block: GalleryBlock;
  theme: string;
  disabled: boolean;
  onAdd: () => void;
}) {
  const thumbnail = useThumbnail(block.id, theme);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dragging is for the pointer; the Add button does the same from the keyboard
    <div
      data-testid="block"
      data-block={block.id}
      draggable={!disabled}
      onDragStart={(event) => {
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
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          disabled={disabled}
          onClick={onAdd}
          title={t.gallery.addTitle(block.name)}
          aria-label={t.gallery.addTitle(block.name)}
          data-testid="block-add"
        >
          <Plus />
        </Button>
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
