import { ChevronRight, History as HistoryIcon, Undo2 } from "lucide-react";
import { useState } from "react";
import type { HistoryEntry } from "../../shared/ipc";
import { useCommands } from "../hooks/useCommand";
import { spaka } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function entryLabel(entry: HistoryEntry): string {
  if (entry.kind === "start") return t.history.start;
  if (entry.kind === "outside") return t.history.outside;
  if (entry.kind === "restore") return t.history.restored(entry.label || t.history.start);
  return entry.label;
}

/**
 * The undo button and the button that shows the project's versions (decisions:
 * history), in the preview's bar (Q111): they are the versions of the site shown there.
 */
export function HistoryButtons({
  entries,
  disabled,
  open,
  onToggle,
}: {
  entries: HistoryEntry[];
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const canUndo = !disabled && entries.length > 0 && !(entries.length === 1 && entries[0]!.current);
  // ⌘Z, when no text is being typed (Q335).
  useCommands({ undo: () => canUndo && void spaka.invoke("history:undo") });
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="no-drag text-muted-foreground"
        disabled={!canUndo}
        onClick={() => void spaka.invoke("history:undo")}
        tip={t.history.undo}
        command="undo"
        data-testid="undo"
      >
        <Undo2 />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("no-drag text-muted-foreground", open && "bg-foreground/10 text-foreground")}
        onClick={onToggle}
        tip={open ? t.history.hide : t.history.show}
        aria-pressed={open}
        data-testid="history"
      >
        <HistoryIcon />
      </Button>
    </>
  );
}

/**
 * The list of the project's versions, as a column beside the page: the page is
 * a native view that would cover anything drawn over it.
 */
export function HistoryList({
  entries,
  disabled,
  onRestore,
}: {
  entries: HistoryEntry[];
  disabled: boolean;
  onRestore: () => void;
}) {
  return (
    <aside data-testid="history-panel" className="no-drag w-72 shrink-0 overflow-y-auto border-l bg-background p-1">
      <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t.history.title}</div>
      {entries.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{t.history.empty}</p>}
      {groups(entries).map((group) =>
        group.length === 1 ? (
          <Row key={group[0]!.id} entry={group[0]!} disabled={disabled} onRestore={onRestore} />
        ) : (
          <HandGroup key={group[0]!.id} entries={group} disabled={disabled} onRestore={onRestore} />
        ),
      )}
    </aside>
  );
}

function span(from: number, to: number): string {
  const [a, b] = [time.format(from), time.format(to)];
  return a === b ? a : `${a}–${b}`;
}

/** Most recent first; edits by hand that follow one another are kept together (Q94). */
function groups(entries: HistoryEntry[]): HistoryEntry[][] {
  const out: HistoryEntry[][] = [];
  for (const entry of [...entries].reverse()) {
    const last = out.at(-1);
    if (entry.kind === "hand" && last?.[0]?.kind === "hand") last.push(entry);
    else out.push([entry]);
  }
  return out;
}

function HandGroup({
  entries,
  disabled,
  onRestore,
}: {
  entries: HistoryEntry[];
  disabled: boolean;
  onRestore: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="history-group">
      <Tip text={open ? t.history.hideGroup : t.history.showGroup}>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-accent"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="history-group-toggle"
        >
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
          <div className="min-w-0 flex-1">
            <div className="truncate">{t.history.byHand(entries.length)}</div>
            <div className="text-xs text-muted-foreground">
              {day.format(entries[0]!.at)} · {span(entries.at(-1)!.at, entries[0]!.at)}
            </div>
          </div>
          {entries[0]!.current && !open && <span className="text-xs text-muted-foreground">{t.history.current}</span>}
        </button>
      </Tip>
      {open && (
        <div className="ml-4 border-l pl-1">
          {entries.map((entry) => (
            <Row key={entry.id} entry={entry} disabled={disabled} onRestore={onRestore} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ entry, disabled, onRestore }: { entry: HistoryEntry; disabled: boolean; onRestore: () => void }) {
  return (
    <div
      data-testid="history-entry"
      className="group relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate">{entryLabel(entry)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {day.format(entry.at)} · {time.format(entry.at)}
        </div>
      </div>
      {entry.current ? (
        <span className="text-xs text-muted-foreground">{t.history.current}</span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          // Over the row's end on hover: hidden, it takes none of the label's room.
          className="absolute top-1/2 right-2 h-7 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          disabled={disabled}
          onClick={() => {
            onRestore();
            void spaka.invoke("history:restore", entry.id);
          }}
          tip={t.history.restoreTip}
          data-testid="history-restore"
        >
          {t.history.restore}
        </Button>
      )}
    </div>
  );
}
