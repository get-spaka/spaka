// Upstart's own tooltip (Q329), on every button, icon or text alike: what the
// button does and its keyboard shortcut, if it has one (shared/shortcuts.ts).
// It replaces the native `title`: quick to appear (300 ms, at once from one
// button to the next) and drawn in the app's colors, light or dark.
import { Tooltip } from "radix-ui";
import type * as React from "react";
import { createContext, useContext } from "react";
import { type Command, shortcutOf } from "../../../shared/shortcuts";

export function TipProvider({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={300}>
      {children}
    </Tooltip.Provider>
  );
}

type Side = "top" | "bottom" | "left" | "right";

/**
 * Where the tips of a part of the interface open when a button does not say:
 * the preview's bar has them beside its buttons, the page's native view
 * covering anything drawn below the bar.
 */
export const TipSide = createContext<Side | undefined>(undefined);

export function Tip({
  text,
  command,
  side,
  children,
}: {
  /** What the button does, from en.ts. */
  text: string;
  /** The command whose shortcut the tooltip shows. */
  command?: Command;
  side?: Side;
  /** The one element the tooltip is for. */
  children: React.ReactElement;
}) {
  const keys = command && shortcutOf(command);
  const around = useContext(TipSide);
  const placed = side ?? around ?? "bottom";
  return (
    <Tooltip.Root>
      {/* A button given the keyboard by the app (the tour's Next) shows no tip: only one reached with the keyboard does. */}
      <Tooltip.Trigger
        asChild
        onFocus={(event) => !event.currentTarget.matches(":focus-visible") && event.preventDefault()}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={placed}
          sideOffset={6}
          collisionPadding={8}
          data-testid="tip"
          className="z-50 flex max-w-64 items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md select-none animate-in fade-in-0"
        >
          <span>{text}</span>
          {keys && <kbd className="font-sans tracking-widest opacity-60">{keys}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
