// The list of a template's adaptation, under the conversation (Q303, Q305,
// Q307, Q313): each page type kept, done, being adapted or to do, those taken
// off struck through; a click on a page to do makes it the next one, its
// cross takes it off the website; Continue sends the agent to the next page.
// Gone once the last page type is done.
import { ArrowRight, Check, Circle, CircleDot, Eye, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdaptationState, AdaptationStep } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

/** The open website's adaptation, as the main process last said; null when there is none. */
export function useAdaptation(projectId: string | undefined): AdaptationState | null {
  const [state, setState] = useState<AdaptationState | null>(null);
  useEffect(() => {
    setState(null);
    if (!projectId) return;
    let live = true;
    void upstart.invoke("adaptation:get").then((s) => live && setState(s));
    const off = upstart.on("adaptation:changed", (m) => {
      if (m.projectId === projectId) setState(m.state);
    });
    return () => {
      live = false;
      off();
    };
  }, [projectId]);
  return state;
}

/** The page type a page belongs to: "/" or its first folder, "/work/first-case" → "/work" (Q306). */
export function pageTypeRoute(route: string): string {
  const first = route.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "/";
}

/** The page types that still show the template's contents (Q305, Q311): not adapted yet, nor new. */
export function stillToAdapt(state: AdaptationState | null): AdaptationStep[] {
  return (state?.steps ?? []).filter((s) => (s.status === "todo" || s.status === "doing") && !s.new);
}

/** The page type Continue goes to: the one picked, or the first to do (Q313). */
export function upcoming(state: AdaptationState): AdaptationStep | undefined {
  return (
    state.steps.find((s) => s.route === state.next && s.status === "todo") ??
    state.steps.find((s) => s.status === "todo")
  );
}

export function AdaptationBar({ state, working }: { state: AdaptationState; working: boolean }) {
  const [problem, setProblem] = useState<string>();
  const next = upcoming(state);
  const interrupted = state.steps.find((s) => s.status === "doing");
  const removing = !next && state.steps.some((s) => s.status === "removed");
  const label = !state.chosen
    ? t.adaptation.choosePages
    : interrupted
      ? t.adaptation.continueTo(interrupted.name)
      : next
        ? t.adaptation.continueTo(next.name)
        : removing
          ? t.adaptation.continueRemoving
          : undefined;
  const looked = state.steps.find((s) => s.status === "ready");
  const go = () => {
    setProblem(undefined);
    void upstart.invoke("adaptation:continue").then((p) => p && setProblem(p));
  };
  return (
    <div data-testid="adaptation-bar" className="mx-3 mb-2 space-y-2 rounded-xl border bg-card p-2.5 shadow-xs">
      <p className="px-0.5 text-xs font-medium text-muted-foreground">{t.adaptation.title}</p>
      {state.chosen && (
        <ul className="flex flex-wrap gap-1">
          {state.steps.map((step) => (
            <StepChip
              key={step.route}
              step={step}
              picked={!!next && step.route === next.route && step.status === "todo"}
              disabled={working}
            />
          ))}
        </ul>
      )}
      {!working && label && (
        <div className="space-y-1">
          <Button
            type="button"
            size="sm"
            className="w-full justify-between"
            data-testid="adaptation-continue"
            tip={t.adaptation.continueTip}
            onClick={go}
          >
            <span className="truncate">{label}</span>
            <ArrowRight />
          </Button>
          {looked && <p className="px-0.5 text-[11px] text-muted-foreground">{t.adaptation.hint}</p>}
          {problem && <p className="px-0.5 text-[11px] text-destructive">{problem}</p>}
        </div>
      )}
    </div>
  );
}

const ICONS = { todo: Circle, doing: CircleDot, ready: Eye, done: Check, removed: X } as const;

function StepChip({ step, picked, disabled }: { step: AdaptationStep; picked: boolean; disabled: boolean }) {
  const Icon = ICONS[step.status];
  const todo = step.status === "todo";
  return (
    <li
      data-testid="adaptation-step"
      data-route={step.route}
      data-status={step.status}
      className={cn(
        "group inline-flex items-center rounded-full border text-xs",
        step.status === "doing" && "border-primary text-primary",
        step.status === "ready" && "border-primary bg-primary/10 text-foreground",
        step.status === "done" && "text-muted-foreground",
        step.status === "removed" && "border-dashed text-muted-foreground line-through",
        picked && "ring-1 ring-primary",
      )}
    >
      {/* The chip's status, or what a click does on a page to do. */}
      <Tip text={todo ? t.adaptation.pick : t.adaptation.status[step.status]}>
        <button
          type="button"
          disabled={!todo || disabled}
          onClick={() => void upstart.invoke("adaptation:pick", step.route)}
          className={cn("inline-flex items-center gap-1 py-0.5 pl-2", todo ? "pr-1 hover:text-primary" : "pr-2")}
        >
          <Icon className={cn("size-3", step.status === "doing" && "animate-pulse")} />
          {step.name}
          {step.new && <span className="text-[10px] text-primary">{t.adaptation.isNew}</span>}
        </button>
      </Tip>
      {todo && (
        <Tip text={t.adaptation.remove}>
          <button
            type="button"
            data-testid="adaptation-remove"
            disabled={disabled}
            aria-label={t.adaptation.remove}
            onClick={() => void upstart.invoke("adaptation:remove", step.route)}
            className="mr-1 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-3" />
          </button>
        </Tip>
      )}
    </li>
  );
}
