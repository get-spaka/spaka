// The Theme tab (Q93): ready-made palettes, each color, the shape (the
// roundness, buttons, relief, density and borders, Q226) and the fonts. The page follows while a gesture lasts (a colour dragged in the
// picker, the slider moved); theme.css is written once, at its end, as one
// version. Only the theme's core values change; the rest of the file stays.
import { AlertTriangle, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FontChoice, ThemeValues } from "../../shared/ipc";
import { contrast, PALETTES, type PaletteColors, parseColor, READ_TOGETHER } from "../../shared/palettes";
import { upstart } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const COLORS = Object.keys(PALETTES[0]!.colors) as (keyof PaletteColors)[];

export function ThemeTab({ theme, working, onAskDark }: { theme: string; working: boolean; onAskDark: () => void }) {
  const [values, setValues] = useState<ThemeValues>({});
  const [fonts, setFonts] = useState<FontChoice[]>([]);
  // The colours of the agent's first design, offered first among the palettes (Q113).
  const [own, setOwn] = useState<ThemeValues>();
  const [error, setError] = useState<string>();
  // While the maker is in a gesture, the theme read back from the disk does not overwrite what is shown.
  const gesture = useRef(false);
  useEffect(() => {
    if (gesture.current || !theme) return;
    void upstart.invoke("theme:get").then((got) => {
      if (gesture.current) return;
      setValues(got.values);
      setFonts(got.fonts);
      setOwn(got.own);
    });
  }, [theme]);

  // A colour edited while "Site's own" is the palette shown edits that palette too (Q114).
  const isOwn = (v: ThemeValues) => !!own && COLORS.filter((c) => own[c]).every((c) => same(v[c], own[c]));
  const editingOwn = useRef(false);
  const show = (next: ThemeValues) => {
    if (!gesture.current) editingOwn.current = isOwn(values);
    gesture.current = true;
    setValues((v) => ({ ...v, ...next }));
    if (editingOwn.current) setOwn((o) => ({ ...o, ...next }));
    void upstart.invoke("theme:show", next);
  };
  const apply = (next: ThemeValues, ownToo = false) => {
    gesture.current = false;
    setError(undefined);
    setValues((v) => ({ ...v, ...next }));
    if (ownToo) setOwn((o) => ({ ...o, ...next }));
    void upstart.invoke("theme:apply", next, ownToo).catch((e) => setError(messageOf(e)));
  };
  const applyColor = (next: ThemeValues) => apply(next, gesture.current ? editingOwn.current : isOwn(values));

  if (!theme) return <p className="px-4 py-3 text-xs text-muted-foreground">{t.theme.noProject}</p>;
  const radius = Number.parseFloat(values["--theme-radius"] ?? "0.75") || 0;
  const tiles: { id: string; name: string; title?: string; colors: ThemeValues }[] = [
    ...(own ? [{ id: "own", name: t.theme.own, title: t.theme.ownTitle, colors: own }] : []),
    ...PALETTES,
  ];

  return (
    <fieldset data-testid="theme" disabled={working} className="flex-1 space-y-6 overflow-y-auto px-4 py-3">
      {working && <p className="text-xs text-muted-foreground">{t.theme.busy}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <Group title={t.theme.palettes}>
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((p) => {
            const set = COLORS.filter((c) => p.colors[c]);
            const current = set.every((c) => same(values[c], p.colors[c]));
            return (
              <button
                key={p.id}
                type="button"
                data-testid={`palette-${p.id}`}
                aria-pressed={current}
                title={p.title}
                onClick={() => apply(Object.fromEntries(set.map((c) => [c, p.colors[c]!])))}
                className={cn(
                  "overflow-hidden rounded-md border text-left text-[11px] disabled:opacity-50",
                  current ? "ring-2 ring-foreground" : "hover:border-foreground/40",
                )}
              >
                <div className="flex h-8" style={{ background: p.colors["--theme-color-surface"] }}>
                  {(
                    [
                      "--theme-color-primary",
                      "--theme-color-secondary",
                      "--theme-color-accent",
                      "--theme-color-neutral",
                    ] as const
                  ).map((c) => (
                    <span key={c} className="m-1 flex-1 rounded-sm" style={{ background: p.colors[c] }} />
                  ))}
                </div>
                <div className="px-1.5 py-1">{p.name}</div>
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={onAskDark} data-testid="ask-dark">
          <Moon /> {t.theme.askDark}
        </Button>
      </Group>

      <Group title={t.theme.colors}>
        <div className="space-y-1.5">
          {COLORS.map((name) => (
            <ColorRow
              key={name}
              name={name}
              value={values[name] ?? ""}
              warning={warningFor(name, values)}
              onShow={(v) => show({ [name]: v })}
              onApply={(v) => applyColor({ [name]: v })}
            />
          ))}
        </div>
      </Group>

      <Group title={t.theme.shape}>
        <div className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0">{t.theme.radius}</span>
          <Gesture
            render={(ref) => (
              <input
                ref={ref}
                type="range"
                min={0}
                max={2}
                step={0.125}
                value={radius}
                data-testid="radius"
                aria-label={t.theme.radius}
                onChange={(e) => show({ "--theme-radius": `${e.target.value}rem` })}
                className="flex-1"
              />
            )}
            onEnd={(el) => apply({ "--theme-radius": `${(el as HTMLInputElement).value}rem` })}
          />
          <span className="w-12 text-right tabular-nums text-muted-foreground">{radius}rem</span>
        </div>
        {STYLES.map((style) => {
          const strings = t.theme.styles[style.id];
          const current = style.read(values[style.variable]);
          return (
            <div key={style.id} className="flex items-center gap-3 text-xs" title={strings.title}>
              <span className="w-24 shrink-0">{strings.label}</span>
              <fieldset
                aria-label={strings.label}
                data-testid={`style-${style.id}`}
                className="flex flex-1 rounded-md border p-0.5"
              >
                {Object.entries(style.options).map(([option, value]) => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`style-${style.id}-${option}`}
                    aria-pressed={current === option}
                    onClick={() => current !== option && apply({ [style.variable]: value })}
                    className={cn(
                      "flex-1 rounded-sm px-1.5 py-1 disabled:opacity-50",
                      current === option ? "bg-foreground text-background" : "hover:bg-muted",
                    )}
                  >
                    {(strings.options as Record<string, string>)[option]}
                  </button>
                ))}
              </fieldset>
            </div>
          );
        })}
      </Group>

      <Group title={t.theme.fonts}>
        {(["--theme-font-heading", "--theme-font-body"] as const).map((name) => (
          <label key={name} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0">{name.endsWith("heading") ? t.theme.heading : t.theme.body}</span>
            <select
              data-testid={`font-${name.endsWith("heading") ? "heading" : "body"}`}
              className="h-8 flex-1 rounded-md border bg-background px-2"
              value={fonts.find((f) => same(f.stack, values[name]))?.id ?? ""}
              onChange={(e) => {
                const font = fonts.find((f) => f.id === e.target.value);
                if (font) apply({ [name]: font.stack });
              }}
            >
              {!fonts.some((f) => same(f.stack, values[name])) && <option value="">{values[name] || "—"}</option>}
              <optgroup label={t.theme.system}>
                {fonts
                  .filter((f) => !f.shipped)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t.theme.shipped}>
                {fonts
                  .filter((f) => f.shipped)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
        ))}
      </Group>
    </fieldset>
  );
}

/** A length in rem, from rem or px; none for another notation. */
function rem(value: string | undefined): number | undefined {
  const m = /^\s*(-?[\d.]+)\s*(rem|px)?\s*$/.exec(value ?? "");
  if (!m) return undefined;
  return m[2] === "px" ? Number.parseFloat(m[1]!) / 16 : Number.parseFloat(m[1]!);
}

/**
 * The style values (Q226), each with its choices and how a value in
 * theme.css reads as one of them; absent, as a site looked before them.
 * A value the agent wrote that is none of them selects no choice.
 */
const STYLES = [
  {
    id: "buttons",
    variable: "--theme-radius-field",
    options: { square: "0rem", rest: "calc(var(--theme-radius) * 0.5)", pill: "9999px" },
    read: (v?: string) => {
      if (!v || v.includes("--theme-radius")) return "rest";
      const n = rem(v);
      if (n === 0) return "square";
      if (n !== undefined && n >= 3) return "pill";
      return undefined;
    },
  },
  {
    id: "relief",
    variable: "--theme-depth",
    options: { flat: "0", raised: "1" },
    read: (v?: string) => (v && Number.parseFloat(v) === 0 ? "flat" : "raised"),
  },
  {
    id: "density",
    variable: "--theme-size",
    options: { compact: "0.21875rem", normal: "0.25rem", spacious: "0.28125rem" },
    read: (v?: string) => {
      const n = v ? rem(v) : 0.25;
      if (n === undefined) return undefined;
      return n < 0.24 ? "compact" : n > 0.26 ? "spacious" : "normal";
    },
  },
  {
    id: "borders",
    variable: "--theme-border",
    options: { fine: "1px", bold: "2px" },
    read: (v?: string) => {
      const n = v ? rem(v) : 1 / 16;
      if (n === undefined) return undefined;
      return n * 16 >= 1.5 ? "bold" : "fine";
    },
  },
] as const satisfies readonly {
  id: keyof typeof t.theme.styles;
  variable: string;
  options: Record<string, string>;
  read: (value?: string) => string | undefined;
}[];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

/** An element whose native "change" event ends a gesture (React's onChange fires on every move). */
function Gesture({
  render,
  onEnd,
}: {
  render: (ref: (el: HTMLElement | null) => void) => React.ReactNode;
  onEnd: (el: HTMLElement) => void;
}) {
  const end = useRef(onEnd);
  end.current = onEnd;
  const attached = useRef<HTMLElement | null>(null);
  const listener = useRef((e: Event) => end.current(e.target as HTMLElement));
  return render((el) => {
    attached.current?.removeEventListener("change", listener.current);
    attached.current = el;
    el?.addEventListener("change", listener.current);
  });
}

function ColorRow({
  name,
  value,
  warning,
  onShow,
  onApply,
}: {
  name: string;
  value: string;
  warning?: string;
  onShow: (value: string) => void;
  onApply: (value: string) => void;
}) {
  const hex = toHex(value);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() && text.trim() !== value) onApply(text.trim());
  };
  return (
    <div data-testid="theme-color" data-name={name}>
      <div className="flex items-center gap-2 text-xs">
        <Gesture
          render={(ref) => (
            <input
              ref={ref}
              type="color"
              value={hex ?? "#000000"}
              disabled={!hex}
              aria-label={t.theme.names[name]}
              onChange={(e) => onShow(e.target.value)}
              className="h-6 w-8 shrink-0 cursor-pointer rounded border bg-transparent p-0"
            />
          )}
          onEnd={(el) => onApply((el as HTMLInputElement).value)}
        />
        <span className="flex-1 truncate">{t.theme.names[name]}</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          spellCheck={false}
          className="h-6 w-24 rounded border bg-background px-1.5 font-mono text-[11px]"
        />
      </div>
      {warning && (
        <p data-testid="contrast-warning" className="mt-0.5 flex items-center gap-1 pl-10 text-[11px] text-warning">
          <AlertTriangle className="size-3" /> {warning}
        </p>
      )}
    </div>
  );
}

/** A warning under a text colour that reads poorly on its background (below WCAG's 4.5:1). */
function warningFor(name: string, values: ThemeValues): string | undefined {
  const pair = READ_TOGETHER.filter(([, text]) => text === name);
  for (const [bg, text] of pair) {
    const a = toHex(values[bg] ?? "");
    const b = toHex(values[text] ?? "");
    if (!a || !b) continue;
    const ratio = contrast(a, b);
    if (ratio < 4.5) return t.theme.hardToRead(ratio.toFixed(1));
  }
  return undefined;
}

function toHex(value: string): string | undefined {
  const c = parseColor(value);
  if (!c) return undefined;
  return `#${c
    .slice(0, 3)
    .map((n) => Math.round(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

function same(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}
