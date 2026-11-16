// The tour (Q328-Q337): five steps from the conversation to Publish, each a
// bubble pointing at its place, the rest of the window lightly dimmed, with
// "2 of 5", Next and Skip; the maker has nothing to do to go on. The preview is
// a native view over the interface: there, the page draws its veil and, for the
// step about the page and the one about Publish, the bubble itself (ADR 0008).
// Skip, Escape or the last Next end it, and it no longer opens by itself.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PageTour } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { Button } from "./ui/button";

export const TOUR_STEPS = ["conversation", "page", "blocks", "theme", "publish"] as const;
type Step = (typeof TOUR_STEPS)[number];

/** The steps whose bubble the page draws: over the page, or just below the Publish button, which is above it. */
const IN_PAGE: Partial<Record<Step, true>> = { page: true, publish: true };

type Rect = { left: number; top: number; width: number; height: number };

export function Tour({
  step,
  onStep,
  onEnd,
}: {
  step: number;
  onStep: (step: number) => void;
  onEnd: (how: "finished" | "skipped") => void;
}) {
  const name = TOUR_STEPS[step]!;
  const words = t.tour.steps[name];
  const last = step === TOUR_STEPS.length - 1;
  const count = t.tour.count(step + 1, TOUR_STEPS.length);
  const next = useCallback(() => (last ? onEnd("finished") : onStep(step + 1)), [last, onEnd, onStep, step]);
  const skip = useCallback(() => onEnd("skipped"), [onEnd]);

  // Where the step points, kept as the window changes.
  const [rect, setRect] = useState<Rect>();
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${name}"]`);
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [name]);

  // The page: dimmed, or holding the step's bubble.
  useEffect(() => {
    const tour: PageTour = IN_PAGE[name]
      ? {
          kind: "bubble",
          at: name === "page" ? "content" : below(rect),
          title: words.title,
          text: words.text,
          count,
          next: last ? t.tour.done : t.tour.next,
          skip: t.tour.skip,
        }
      : { kind: "veil" };
    void upstart.invoke("tour:page", tour);
  }, [name, words, count, last, rect]);
  useEffect(() => () => void upstart.invoke("tour:page", null), []);

  // Next and Skip clicked on the bubble in the page; Escape in the interface.
  useEffect(() => upstart.on("tour:action", (action) => (action === "skip" ? skip() : next())), [next, skip]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && skip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  const nextButton = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each step's Next takes the keyboard
  useEffect(() => nextButton.current?.focus({ focusVisible: false }), [step]);

  const pad = 6;
  // The page itself is lit in the page; Publish, above it, is lit here while its bubble is drawn there.
  const hole = rect && name !== "page" ? rect : undefined;
  const bubble = hole && !IN_PAGE[name] ? place(hole) : undefined;

  return (
    <div className="no-drag fixed inset-0 z-40" data-testid="tour" data-step={name}>
      {/* The window dimmed, but around what the step points at. */}
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-lg shadow-[0_0_0_200vmax_var(--scrim)]"
        style={
          hole
            ? { left: hole.left - pad, top: hole.top - pad, width: hole.width + 2 * pad, height: hole.height + 2 * pad }
            : { left: "50%", top: "50%", width: 0, height: 0 }
        }
      />
      {bubble && (
        <div
          role="dialog"
          aria-label={t.tour.label}
          data-testid="tour-bubble"
          className="fixed w-72 rounded-xl border bg-popover p-3.5 text-[13px] text-popover-foreground shadow-xl"
          style={bubble.below ? { left: bubble.left, top: bubble.y } : { left: bubble.left, bottom: bubble.y }}
        >
          <span
            aria-hidden
            className="absolute size-2.5 border-t border-l bg-popover"
            style={
              bubble.below
                ? { top: -6, left: bubble.arrow, rotate: "45deg" }
                : { bottom: -6, left: bubble.arrow, rotate: "225deg" }
            }
          />
          <h3 className="mb-1 font-semibold">{words.title}</h3>
          <p className="text-muted-foreground">{words.text}</p>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="flex-1 text-xs text-muted-foreground" data-testid="tour-count">
              {count}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={skip}
              tip={t.tour.skipTip}
              data-testid="tour-skip"
            >
              {t.tour.skip}
            </Button>
            <Button
              ref={nextButton}
              size="sm"
              className="h-7"
              onClick={next}
              tip={last ? t.tour.doneTip : t.tour.nextTip}
              data-testid="tour-next"
            >
              {last ? t.tour.done : t.tour.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Where in the page's area the bubble drawn there points up at: the middle of what the step points at. */
function below(r: Rect | undefined): { x: number; width: number } {
  const area = document.querySelector("[data-tour-area]")?.getBoundingClientRect();
  if (!r || !area) return { x: 0, width: 0 };
  return { x: Math.round(r.left + r.width / 2 - area.left), width: Math.round(area.width) };
}

const WIDTH = 288;
/** About the tallest a bubble is: below what it points at if that much room is left there. */
const HEIGHT = 170;

/**
 * The bubble below what it points at, or above when there is no room under it,
 * kept in the window: `y` is its top when below, its distance from the window's bottom when above.
 */
function place(r: Rect): { left: number; y: number; below: boolean; arrow: number } {
  const below = r.top + r.height + 14 + HEIGHT <= window.innerHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8));
  const y = below ? r.top + r.height + 14 : window.innerHeight - r.top + 14;
  const arrow = Math.max(12, Math.min(r.left + r.width / 2 - left - 5, WIDTH - 22));
  return { left, y, below, arrow };
}
