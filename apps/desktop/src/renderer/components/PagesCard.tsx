// The card of pages of a template's adaptation (Q302, Q310): each page type
// of the template, pictured by its first screen, named and described for the
// maker's business, checked as the agent suggests; the home page always
// kept; the pages the template lacks marked as new. The maker changes the
// checks and keeps them, or skips; once settled, the card folds to the pages kept.
import { Check, Lock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { PagesCard as Card, PageChoice, QuestionAnswer } from "../../shared/conversation";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export function PagesCard({ card }: { card: Card }) {
  if (card.state !== "waiting") return <SettledCard card={card} />;
  return <WaitingCard key={card.id} card={card} />;
}

function WaitingCard({ card }: { card: Card }) {
  const [checked, setChecked] = useState(() => new Set(card.pages.filter((p) => p.checked).map((p) => p.route)));
  const [sent, setSent] = useState(false);
  const send = (answer: QuestionAnswer) => {
    setSent(true);
    void upstart.invoke("conversation:answer", card.id, answer).catch(() => setSent(false));
  };
  const toggle = (page: PageChoice) => {
    if (page.route === "/") return;
    setChecked((now) => {
      const next = new Set(now);
      if (next.has(page.route)) next.delete(page.route);
      else next.add(page.route);
      return next;
    });
  };
  return (
    <div data-testid="pages-card" data-state="waiting" className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
      <p className="text-sm font-medium">{t.pages.title}</p>
      <fieldset className="space-y-1.5" disabled={sent}>
        {card.pages.map((page) => {
          const home = page.route === "/";
          const on = home || checked.has(page.route);
          return (
            <button
              key={page.route}
              type="button"
              data-testid="pages-choice"
              data-route={page.route}
              aria-pressed={on}
              onClick={() => toggle(page)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border bg-background p-1.5 pr-2.5 text-left transition-colors disabled:opacity-60",
                home ? "cursor-default" : "hover:bg-accent",
                on ? "border-primary/60" : "opacity-70",
              )}
            >
              <PagePicture route={page.route} isNew={!!page.new} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{page.name}</span>
                  {page.new && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                      <Sparkles className="size-2.5" />
                      {t.pages.isNew}
                    </span>
                  )}
                </span>
                {page.line && <span className="line-clamp-2 block text-xs text-muted-foreground">{page.line}</span>}
              </span>
              {home ? (
                <span
                  title={t.pages.home}
                  className="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <Lock className="size-3.5" />
                </span>
              ) : (
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    on && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {on && <Check className="size-3" />}
                </span>
              )}
            </button>
          );
        })}
      </fieldset>
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="pages-skip"
          disabled={sent}
          onClick={() => send({ kind: "skipped" })}
        >
          {t.question.skip}
        </Button>
        <Button
          type="button"
          size="sm"
          data-testid="pages-keep"
          disabled={sent}
          onClick={() =>
            send({
              kind: "pages",
              kept: card.pages.filter((p) => p.route === "/" || checked.has(p.route)).map((p) => p.route),
            })
          }
        >
          {t.pages.keep}
        </Button>
      </div>
    </div>
  );
}

/** A page type's first screen, drawn from the website's own page; a new page has none yet. */
function PagePicture({ route, isNew }: { route: string; isNew: boolean }) {
  const [url, setUrl] = useState<string | null>();
  useEffect(() => {
    if (isNew) return;
    let live = true;
    void upstart
      .invoke("adaptation:picture", route)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [route, isNew]);
  return (
    <span className="flex aspect-[16/11] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {url ? (
        <img src={url} alt="" draggable={false} className="w-full object-cover object-top" />
      ) : isNew ? (
        <Sparkles className="size-4 text-muted-foreground" />
      ) : null}
    </span>
  );
}

/** A settled card, folded: the pages kept. */
function SettledCard({ card }: { card: Card }) {
  const { answer } = card;
  const kept =
    answer?.kind === "pages"
      ? card.pages.filter((p) => answer.kept.includes(p.route))
      : card.state === "skipped"
        ? card.pages.filter((p) => p.checked || p.route === "/")
        : undefined;
  return (
    <div
      data-testid="pages-card"
      data-state={card.state}
      className="space-y-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
    >
      <p>{t.pages.title}</p>
      {kept && (
        <p>
          <span className="font-medium text-foreground">{t.pages.kept(kept.length)}</span>:{" "}
          {kept.map((p) => p.name).join(", ")}
        </p>
      )}
      {card.state === "skipped" && <p className="font-medium">{t.question.skipped}</p>}
      {card.state === "unanswered" && <p className="font-medium">{t.question.notAnswered}</p>}
      {answer?.kind === "words" && card.state === "answered" && (
        <p>
          {t.question.yourWords}: <span className="font-medium text-foreground">{answer.text}</span>
        </p>
      )}
    </div>
  );
}
