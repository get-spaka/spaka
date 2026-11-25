// shadcn's NativeSelect (ui.shadcn.com/docs/components/native-select): the
// system's own list, its arrow replaced by a chevron of the app's, kept off the
// right edge. Spaka adds an extra-small size for its toolbars and a ghost
// look for the selects that sit in the message box, and lets the wrapper take
// the select's place in a flex row.
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "xs" | "sm" | "default";
  variant?: "outline" | "ghost";
  /** The wrapper's classes: its width and how it grows or shrinks in a row. */
  wrapperClassName?: string;
};

function NativeSelect({ className, size = "default", variant = "outline", wrapperClassName, ...props }: Props) {
  return (
    <div
      className={cn("group/native-select relative w-fit has-[select:disabled]:opacity-50", wrapperClassName)}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        data-variant={variant}
        className={cn(
          "w-full min-w-0 appearance-none truncate rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed dark:bg-input/30 dark:hover:bg-input/50",
          // Chosen here rather than by data attributes, so a class passed in wins.
          size === "xs" && "h-7 py-0.5 pr-7 pl-2 text-xs",
          size === "sm" && "h-8 py-1 pr-9 pl-3 text-sm",
          size === "default" && "h-9 py-2 pr-9 pl-3 text-sm",
          variant === "ghost" &&
            "field-sizing-content border-transparent bg-transparent shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground opacity-50 select-none",
          size === "xs" ? "right-2 size-3.5" : "right-3.5 size-4",
        )}
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option data-slot="native-select-option" className={cn("bg-[Canvas] text-[CanvasText]", className)} {...props} />
  );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
