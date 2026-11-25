// The website's name in a field, in place of where it is shown (Q397): its row
// in the websites list, or the title of its settings.
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";

/** Enter or a click elsewhere keeps the name, Escape leaves it (and nothing around it hears that Escape). */
export function RenameField({
  name,
  onDone,
  className,
  testid = "project-rename",
}: {
  name: string;
  onDone: (name?: string) => void;
  className?: string;
  testid?: string;
}) {
  const [value, setValue] = useState(name);
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (to?: string) => {
    if (done.current) return;
    done.current = true;
    onDone(to);
  };
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <input
      ref={field}
      data-testid={testid}
      aria-label={t.sidebar.rename}
      value={value}
      maxLength={120}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish();
        }
      }}
      onBlur={() => finish(value)}
      className={cn(
        "no-drag min-w-0 flex-1 rounded-sm border bg-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}
