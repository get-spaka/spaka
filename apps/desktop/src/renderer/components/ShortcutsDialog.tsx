// The keyboard shortcuts' sheet (Q335), opened from the Help menu or with ⌘/:
// every command that has a shortcut, in the menus' groups, as macOS writes them.
// Escape, its close button or a click outside closes it.
import { X } from "lucide-react";
import { useEffect } from "react";
import { SHEET, shortcutOf } from "../../shared/shortcuts";
import { CLOSE_BUTTON, CLOSE_CROSS } from "../lib/colors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Tip } from "./ui/tip";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click outside is for the pointer; Escape and the close button do the same from the keyboard
    <div
      className="no-drag absolute inset-0 z-30 flex items-center justify-center bg-scrim p-6"
      data-testid="shortcuts-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.shortcuts.title}
        data-testid="shortcuts"
        className="flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-xl border bg-popover text-[13px] text-popover-foreground shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
      >
        <div className="relative flex h-11 shrink-0 items-center justify-center border-b px-3">
          <Tip text={t.shortcuts.close}>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.shortcuts.close}
              data-testid="shortcuts-close"
              className={cn(
                "group absolute left-3 flex size-3.5 items-center justify-center rounded-full ring-1 ring-inset",
                CLOSE_BUTTON,
              )}
            >
              <X className={cn("size-2.5 opacity-0 group-hover:opacity-100", CLOSE_CROSS)} strokeWidth={3} />
            </button>
          </Tip>
          <h2 className="font-semibold">{t.shortcuts.title}</h2>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-3">
          {SHEET.map(({ group, commands }) => (
            <section key={group} className="py-2" data-testid={`shortcuts-${group}`}>
              <h3 className="pb-1 text-xs font-medium text-muted-foreground">{t.shortcuts.groups[group]}</h3>
              <dl>
                {commands.map((command) => (
                  <div key={command} className="flex items-center justify-between gap-4 py-1">
                    <dt>{t.commands[command]}</dt>
                    <dd>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs tracking-widest text-muted-foreground">
                        {shortcutOf(command)}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
