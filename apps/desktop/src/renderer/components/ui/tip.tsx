// Upstart's own tooltip (Q329), on every button, icon or text alike: what the
// button does and its keyboard shortcut, if it has one (shared/shortcuts.ts).
// It replaces the native `title`: quick to appear (300 ms, at once from one
// button to the next) and drawn in the app's colors, light or dark.
import { Tooltip } from "radix-ui";
import type * as React from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { type Command, shortcutOf } from "../../../shared/shortcuts";
import { upstart } from "../../lib/bridge";

export function TipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={300}>
      {children}
    </Tooltip.Provider>
  );
}

/**
 * Tips of a part of the interface that open over the page's native view (the
 * preview's bar): the view covers what the interface draws there, so the main
 * process draws them above it, where and as the interface lays them out.
 */
export const TipOverPage = createContext(false);

export function Tip({
  text,
  command,
  side = "bottom",
  children,
}: {
  /** What the button does, from en.ts. */
  text: string;
  /** The command whose shortcut the tooltip shows. */
  command?: Command;
  side?: "top" | "bottom" | "left" | "right";
  /** The one element the tooltip is for. */
  children: React.ReactElement;
}) {
  const keys = command && shortcutOf(command);
  const overPage = useContext(TipOverPage);
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);

  // Over the page: once laid out, the tooltip is drawn above the native view, the interface's own kept invisible.
  useEffect(() => {
    if (!overPage || !open) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const el = content.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        upstart.send("tip:show", {
          text,
          ...(keys ? { keys } : {}),
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          style: {
            background: style.backgroundColor,
            color: style.color,
            font: style.font,
            padding: style.padding,
            borderRadius: style.borderRadius,
          },
        });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      upstart.send("tip:hide");
    };
  }, [overPage, open, text, keys]);

  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      {/* A button given the keyboard by the app (the tour's Next) shows no tip: only one reached with the keyboard does. */}
      <Tooltip.Trigger
        asChild
        onFocus={(event) => !event.currentTarget.matches(":focus-visible") && event.preventDefault()}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          ref={content}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          data-testid="tip"
          data-over-page={overPage || undefined}
          className={`z-50 flex max-w-64 items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md select-none ${overPage ? "opacity-0" : "animate-in fade-in-0"}`}
        >
          <span>{text}</span>
          {keys && <kbd className="font-sans tracking-widest opacity-60">{keys}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
