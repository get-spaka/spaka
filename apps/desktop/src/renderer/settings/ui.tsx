// The settings' building blocks, after macOS System Settings (Q116): white
// groups of rows on a light grey page, the label on the left and the control
// on the right, lists with + and − under them. A row the search found is
// highlighted (Q119).
import { createContext, type ReactNode, useContext } from "react";
import { cn } from "../lib/utils";

/** The ids of the rows the search found; empty when nothing is typed. */
export const Highlighted = createContext<Set<string>>(new Set());

export function Group({
  title,
  caption,
  footer,
  children,
  testid,
}: {
  title?: string;
  caption?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  testid?: string;
}) {
  return (
    <section className="flex flex-col gap-1.5" data-testid={testid}>
      {title && <h3 className="ml-2.5 text-xs font-semibold text-neutral-600">{title}</h3>}
      <div className="overflow-hidden rounded-[10px] border border-neutral-200 bg-white">
        <div className="divide-y divide-neutral-100">{children}</div>
        {footer}
      </div>
      {caption && <div className="mx-2.5 text-[11px] leading-snug text-neutral-600">{caption}</div>}
    </section>
  );
}

export function Row({
  id,
  label,
  detail,
  children,
  htmlFor,
}: {
  id?: string;
  label: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
}) {
  const found = useContext(Highlighted);
  const Label = htmlFor ? "label" : "span";
  return (
    <div
      data-setting={id}
      data-found={id && found.has(id) ? "" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 px-3 py-2 transition-colors",
        id && found.has(id) && "bg-amber-100/80",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="text-[13px]">
          {label}
        </Label>
        {detail && <span className="text-[11px] leading-snug text-neutral-600">{detail}</span>}
      </span>
      {children}
    </div>
  );
}

/** The + and − under a list, as in macOS. */
export function ListBar({
  onAdd,
  onRemove,
  addLabel,
  removeLabel,
  canRemove,
  testid,
}: {
  onAdd?: () => void;
  onRemove?: () => void;
  addLabel: string;
  removeLabel: string;
  canRemove: boolean;
  testid?: string;
}) {
  const button = "flex h-6 w-7 items-center justify-center border-r border-neutral-200 text-[15px] disabled:opacity-35";
  return (
    <div className="flex border-t border-neutral-200 bg-neutral-50">
      <button
        type="button"
        className={button}
        onClick={onAdd}
        disabled={!onAdd}
        aria-label={addLabel}
        title={addLabel}
        data-testid={testid && `${testid}-add`}
      >
        +
      </button>
      <button
        type="button"
        className={button}
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={removeLabel}
        title={removeLabel}
        data-testid={testid && `${testid}-remove`}
      >
        −
      </button>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  testid,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  testid?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      data-testid={testid}
      className={cn(
        "relative h-[22px] w-10 shrink-0 rounded-full transition-colors",
        checked ? "bg-neutral-900" : "bg-neutral-300",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-[left]",
          checked ? "left-5" : "left-0.5",
        )}
      />
    </button>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
  testid,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 rounded-[7px] border-0 bg-neutral-200/70 p-0.5"
      data-testid={testid}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          data-value={o.value}
          className={cn(
            "rounded-[5px] px-3 py-0.5 text-[13px] disabled:opacity-50",
            o.value === value && "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.15)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** A plain macOS-like push button. */
export function Push({
  children,
  onClick,
  disabled,
  testid,
  primary,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testid?: string;
  primary?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={cn(
        "shrink-0 rounded-md border px-3 py-1 text-[13px] disabled:opacity-50",
        primary ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50",
      )}
    >
      {children}
    </button>
  );
}

export const selectClass =
  "h-7 shrink-0 rounded-md border border-neutral-300 bg-white px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";
export const inputClass =
  "h-7 min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";
