import { ChevronRight, History as HistoryIcon, Undo2 } from "lucide-react";
import { useState } from "react";
import type { HistoryEntry } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export function entryLabel(entry: HistoryEntry): string {
  if (entry.kind === "start") return t.history.start;
  if (entry.kind === "outside") return t.history.outside;
  if (entry.kind === "restore") return t.history.restored(entry.label || t.history.start);
  return entry.label;
}

/** The undo button and the list of the project's versions (decisions: history). */
export function HistoryControls({ entries, disabled }: { entries: HistoryEntry[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const canUndo = !disabled && entries.length > 0 && !(entries.length === 1 && entries[0]!.current);
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="no-drag text-muted-foreground"
        disabled={!canUndo}
        onClick={() => void upstart.invoke("history:undo")}
        title={t.history.undo}
        data-testid="undo"
      >
        <Undo2 />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("no-drag text-muted-foreground", open && "bg-accent")}
        onClick={() => setOpen((o) => !o)}
        title={t.history.title}
        data-testid="history"
      >
        <HistoryIcon />
      </Button>
      {open && (
        <div
          data-testid="history-panel"
          className="no-drag absolute top-12 right-3 left-3 z-10 max-h-[60vh] overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          <div className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t.history.title}</div>
          {entries.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{t.history.empty}</p>}
          {groups(entries).map((group) =>
            group.length === 1 ? (
              <Row key={group[0]!.id} entry={group[0]!} disabled={disabled} onRestore={() => setOpen(false)} />
            ) : (
              <HandGroup key={group[0]!.id} entries={group} disabled={disabled} onRestore={() => setOpen(false)} />
            ),
          )}
        </div>
      )}
    </>
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
      className="group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate">{entryLabel(entry)}</div>
        <div className="text-xs text-muted-foreground">
          {day.format(entry.at)} · {time.format(entry.at)}
        </div>
      </div>
      {entry.current ? (
        <span className="text-xs text-muted-foreground">{t.history.current}</span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          disabled={disabled}
          onClick={() => {
            onRestore();
            void upstart.invoke("history:restore", entry.id);
          }}
          data-testid="history-restore"
        >
          {t.history.restore}
        </Button>
      )}
    </div>
  );
}
