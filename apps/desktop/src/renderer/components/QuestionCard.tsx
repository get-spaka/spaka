// The agent's questions to the maker (Q283-Q295): a card in its turn, the
// turn waiting for the answer. A question's choices are buttons, the one the
// agent recommends first and marked; a choice may show a block of the gallery
// or an image of the site. The maker may also answer in their own words, in
// the message box, or skip. Once settled, the card folds to its answer.
import { Check, MessageCircleQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentQuestion, QuestionCard as Card, QuestionAnswer, QuestionOption } from "../../shared/conversation";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { MediaThumb } from "./MediaLibrary";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

const RECOMMENDED = /\s*\(recommended\)\s*$/i;

/** A choice's label as the maker reads it, and whether the agent recommends it. */
export function shownLabel(label: string): { text: string; recommended: boolean } {
  return { text: label.replace(RECOMMENDED, ""), recommended: RECOMMENDED.test(label) };
}

export function QuestionCard({ card }: { card: Card }) {
  if (card.state !== "waiting") return <SettledCard card={card} />;
  return <WaitingCard key={card.id} card={card} />;
}

function WaitingCard({ card }: { card: Card }) {
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [sent, setSent] = useState(false);
  // One question with one choice to make: a click answers it.
  const oneClick = card.questions.length === 1 && !card.questions[0]!.multiSelect;
  const complete = card.questions.every((q) => chosen[q.question]?.length);
  const send = (answer: QuestionAnswer) => {
    setSent(true);
    void upstart.invoke("conversation:answer", card.id, answer).catch(() => setSent(false));
  };
  const choose = (q: AgentQuestion, option: QuestionOption) => {
    if (oneClick) return send({ kind: "choices", answers: { [q.question]: option.label } });
    setChosen((now) => {
      const had = now[q.question] ?? [];
      const next = q.multiSelect
        ? had.includes(option.label)
          ? had.filter((l) => l !== option.label)
          : [...had, option.label]
        : [option.label];
      return { ...now, [q.question]: next };
    });
  };
  const answers = () =>
    Object.fromEntries(
      card.questions.map((q) => {
        const labels = chosen[q.question] ?? [];
        return [q.question, q.multiSelect ? labels : labels[0]!];
      }),
    );
  return (
    <div data-testid="question-card" data-state="waiting" className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
      {card.questions.map((q) => (
        <fieldset key={q.question} className="space-y-2" disabled={sent}>
          <legend className="space-y-1">
            {q.header && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                <MessageCircleQuestion className="size-3" />
                {q.header}
              </span>
            )}
            <p className="text-sm font-medium">{q.question}</p>
          </legend>
          <div className="space-y-1.5">
            {q.options.map((option) => {
              const label = shownLabel(option.label);
              const picked = chosen[q.question]?.includes(option.label) ?? false;
              return (
                <Tip key={option.label} text={oneClick ? t.question.sendChoice : t.question.pickChoice}>
                  <button
                    type="button"
                    data-testid="question-choice"
                    aria-pressed={oneClick ? undefined : picked}
                    onClick={() => choose(q, option)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60",
                      picked && "border-primary ring-1 ring-primary",
                    )}
                  >
                    {!oneClick && (
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                          q.multiSelect ? "rounded" : "rounded-full",
                          picked && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        {picked && <Check className="size-3" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-medium">{label.text}</span>
                        {label.recommended && (
                          <span
                            data-testid="question-recommended"
                            className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
                          >
                            {t.question.recommended}
                          </span>
                        )}
                      </span>
                      {option.description && (
                        <span className="block text-xs text-muted-foreground">{option.description}</span>
                      )}
                      {option.preview && <ChoicePreview preview={option.preview} />}
                    </span>
                  </button>
                </Tip>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="question-skip"
          disabled={sent}
          tip={t.question.skipTip}
          onClick={() => send({ kind: "skipped" })}
        >
          {t.question.skip}
        </Button>
        {!oneClick && (
          <Button
            type="button"
            size="sm"
            data-testid="question-answer"
            disabled={sent || !complete}
            tip={t.question.answerTip}
            onClick={() => send({ kind: "choices", answers: answers() })}
          >
            {t.question.answer}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A settled card, folded: each question and what the maker answered. */
function SettledCard({ card }: { card: Card }) {
  const { answer } = card;
  const lines =
    card.state === "skipped" || card.state === "unanswered"
      ? undefined
      : answer?.kind === "words"
        ? undefined
        : card.questions.map((q) => {
            const a = answer?.kind === "choices" ? answer.answers[q.question] : undefined;
            const labels = (a === undefined ? [] : Array.isArray(a) ? a : [a]).map((l) => shownLabel(l).text);
            return { question: q.question, answer: labels.join(", ") };
          });
  return (
    <div
      data-testid="question-card"
      data-state={card.state}
      className="space-y-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
    >
      {lines
        ? lines.map((line) => (
            <p key={line.question}>
              <span>{line.question}</span> <span className="font-medium text-foreground">→ {line.answer || "—"}</span>
            </p>
          ))
        : card.questions.map((q) => <p key={q.question}>{q.question}</p>)}
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

/** What a choice shows (Q291): a block of the gallery, an image of the site, or a few words. */
function ChoicePreview({ preview }: { preview: string }) {
  const block = /^block:([\w-]+)$/.exec(preview.trim());
  if (block) return <BlockPreview id={block[1]!} />;
  if (/^\/?[\w./-]+\.(png|jpe?g|webp|gif|avif|svg)$/i.test(preview.trim()))
    return (
      <span data-testid="choice-preview" className="block w-full max-w-56">
        <MediaThumb path={preview.trim()} className="block aspect-[4/3] w-full rounded-md border" />
      </span>
    );
  return (
    <span className="line-clamp-4 block whitespace-pre-wrap rounded-md bg-muted px-2 py-1 font-mono text-[11px]">
      {preview}
    </span>
  );
}

function BlockPreview({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>();
  useEffect(() => {
    let live = true;
    void upstart
      .invoke("gallery:thumbnail", id)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <span
      data-testid="choice-preview"
      className="flex aspect-[4/3] w-full max-w-56 items-center overflow-hidden rounded-md border bg-muted"
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="size-full object-cover object-top" />
      ) : url === null ? (
        <span className="w-full text-center text-[11px] text-muted-foreground">{t.question.previewMissing}</span>
      ) : null}
    </span>
  );
}
