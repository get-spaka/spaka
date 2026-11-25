// The plan the agent hands in in plan mode (Q286, Q290): short formatted
// text, approved with Build, after which the agent builds in the same turn;
// changed by answering in the message box, the agent then handing in a new
// one. Once settled, the plan folds and can be unfolded.
import { Check, ChevronRight, Hammer, ListChecks } from "lucide-react";
import { useState } from "react";
import type { PlanCard as Card } from "../../shared/conversation";
import { spaka } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { AgentText } from "./AgentText";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

export function PlanCard({ card }: { card: Card }) {
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  if (card.state === "proposed")
    return (
      <div data-testid="plan-card" data-state="proposed" className="space-y-2 rounded-xl border bg-card p-3 shadow-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          <ListChecks className="size-3" />
          {t.plan.title}
        </span>
        <div data-testid="plan-text">
          <AgentText text={card.text} streaming={false} />
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          <span className="text-xs text-muted-foreground">{t.plan.changeHint}</span>
          <Button
            type="button"
            size="sm"
            data-testid="plan-build"
            disabled={sent}
            tip={t.plan.buildTip}
            onClick={() => {
              setSent(true);
              void spaka.invoke("conversation:approve-plan", card.id).catch(() => setSent(false));
            }}
          >
            <Hammer />
            {t.plan.build}
          </Button>
        </div>
      </div>
    );
  const label =
    card.state === "approved" ? t.plan.approved : card.state === "replaced" ? t.plan.replaced : t.plan.notAnswered;
  return (
    <div data-testid="plan-card" data-state={card.state} className="rounded-lg border border-dashed px-3 py-2 text-xs">
      <Tip text={open ? t.plan.hide : t.plan.show}>
        <button
          type="button"
          data-testid="plan-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-1.5 text-left text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
          {card.state === "approved" && <Check className="size-3.5 shrink-0" />}
          <span className="font-medium">{label}</span>
          {card.changes && <span className="truncate">· {card.changes}</span>}
        </button>
      </Tip>
      {open && (
        <div className="mt-2 text-sm" data-testid="plan-text">
          <AgentText text={card.text} streaming={false} />
        </div>
      )}
    </div>
  );
}
