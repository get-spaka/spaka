import { History as HistoryIcon, Undo2 } from "lucide-react";
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
          {[...entries].reverse().map((entry) => (
            <div
              key={entry.id}
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
                    setOpen(false);
                    void upstart.invoke("history:restore", entry.id);
                  }}
                  data-testid="history-restore"
                >
                  {t.history.restore}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
