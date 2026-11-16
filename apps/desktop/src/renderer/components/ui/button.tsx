import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";
import type { Command } from "../../../shared/shortcuts";
import { Tip } from "./tip";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 rounded-md px-3",
        icon: "size-9",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/**
 * A button, with its tooltip (Q329): `tip` says what it does, and `command` adds
 * its shortcut. An icon button is also named by its tip, for a screen reader.
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  tip,
  tipSide,
  command,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    tip?: string;
    /** Where the tip opens, below the button by default. */
    tipSide?: "top" | "bottom" | "left" | "right";
    command?: Command;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  const icon = size === "icon" || size === "icon-sm";
  const button = (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      aria-label={icon ? tip : undefined}
      {...props}
    />
  );
  if (!tip) return button;
  // A disabled button gets no pointer events: its tip is on a wrapper, so it still says what it is for.
  // A button that can be disabled always has it, so it is not drawn again when it turns on or off.
  return (
    <Tip text={tip} command={command} side={tipSide}>
      {"disabled" in props ? <span className="inline-flex">{button}</span> : button}
    </Tip>
  );
}

export { Button, buttonVariants };
