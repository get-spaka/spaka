// The agent's questions to the maker (Q283-Q295, Q387-Q390): a card in its
// turn, the turn waiting for the answer, one question shown at a time. A
// question's choices are buttons, the one the agent recommends first and
// marked; a choice may show a block of the gallery or an image of the site.
// The maker may also answer a question in their own words under its choices,
// the whole card in the message box, or skip. Once settled, the card folds to
// its answer.
import { Check, MessageCircleQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentQuestion, QuestionCard as Card, QuestionAnswer, QuestionOption } from "../../shared/conversation";
import { spaka } from "../lib/bridge";
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

/**
 * A card waiting for the maker, one question at a time (Q387-Q390): the
 * questions' headers as steps, any one reached again by a click; a click on
 * a choice picks it, Continue goes on, Send on the last; Skip passes the
 * question shown, the agent taking its recommended choice for it, and the
 * card is skipped when every question is. An answer of one's own under the
 * choices answers that question.
 */
function WaitingCard({ card }: { card: Card }) {
  const questions = card.questions;
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [sent, setSent] = useState(false);
  const q = questions[step]!;
  const last = step === questions.length - 1;
  const several = questions.length > 1;

  /** What the maker answered to a question: the choices picked, and their own words. */
  const labelsOf = (question: AgentQuestion) => {
    const words = own[question.question]?.trim();
    const picked = chosen[question.question] ?? [];
    if (question.multiSelect) return words ? [...picked, words] : picked;
    return words ? [words] : picked;
  };
  const answered = (question: AgentQuestion) => labelsOf(question).length > 0;

  const send = (answer: QuestionAnswer) => {
    setSent(true);
    void spaka.invoke("conversation:answer", card.id, answer).catch(() => setSent(false));
  };
  /** Sends what was answered; a question not answered is one skipped, and a card with none answered is skipped. */
  const finish = (passed: Set<string>) => {
    const answers = Object.fromEntries(
      questions
        .filter((question) => !passed.has(question.question) && answered(question))
        .map((question) => {
          const labels = labelsOf(question);
          return [question.question, question.multiSelect ? labels : labels[0]!];
        }),
    );
    send(Object.keys(answers).length ? { kind: "choices", answers } : { kind: "skipped" });
  };
  const forward = (passed: Set<string>) => (last ? finish(passed) : setStep(step + 1));
  const unskip = () =>
    setSkipped((now) => {
      if (!now.has(q.question)) return now;
      const next = new Set(now);
      next.delete(q.question);
      return next;
    });

  const choose = (option: QuestionOption) => {
    unskip();
    if (!q.multiSelect) setOwn((now) => ({ ...now, [q.question]: "" }));
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
  const write = (text: string) => {
    unskip();
    if (!q.multiSelect && text.trim()) setChosen((now) => ({ ...now, [q.question]: [] }));
    setOwn((now) => ({ ...now, [q.question]: text }));
  };
  const skip = () => {
    const passed = new Set(skipped).add(q.question);
    setSkipped(passed);
    setChosen((now) => ({ ...now, [q.question]: [] }));
    setOwn((now) => ({ ...now, [q.question]: "" }));
    forward(passed);
  };
  const go = () => {
    if (!answered(q)) return;
    const passed = new Set(skipped);
    passed.delete(q.question);
    forward(passed);
  };

  return (
    <div data-testid="question-card" data-state="waiting" className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
      {several && (
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {questions.map((question, i) => {
              const done = answered(question);
              const passed = skipped.has(question.question);
              return (
                <Tip key={question.question} text={t.question.stepTip}>
                  <button
                    type="button"
                    data-testid="question-step"
                    data-state={i === step ? "current" : done ? "answered" : passed ? "skipped" : "open"}
                    aria-current={i === step ? "step" : undefined}
                    disabled={sent}
                    onClick={() => setStep(i)}
                    className={cn(
                      "inline-flex max-w-40 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-accent disabled:opacity-60",
                      i === step ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                      passed && i !== step && "line-through",
                    )}
                  >
                    {done && i !== step && <Check className="size-3 shrink-0" />}
                    <span className="truncate">{question.header || String(i + 1)}</span>
                  </button>
                </Tip>
              );
            })}
          </div>
          <span data-testid="question-count" className="shrink-0 text-[11px] text-muted-foreground">
            {t.question.of(step + 1, questions.length)}
          </span>
        </div>
      )}
      <fieldset key={q.question} className="space-y-2" disabled={sent}>
        <legend className="space-y-1">
          {q.header && !several && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              <MessageCircleQuestion className="size-3" />
              {q.header}
            </span>
          )}
          <p className="whitespace-pre-wrap text-sm font-medium">{q.question}</p>
        </legend>
        <div className="space-y-1.5">
          {q.options.map((option) => {
            const label = shownLabel(option.label);
            const picked = chosen[q.question]?.includes(option.label) ?? false;
            return (
              <Tip key={option.label} text={t.question.pickChoice}>
                <button
                  type="button"
                  data-testid="question-choice"
                  aria-pressed={picked}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60",
                    picked && "border-primary ring-1 ring-primary",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
                      q.multiSelect ? "rounded" : "rounded-full",
                      picked && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {picked && <Check className="size-3" />}
                  </span>
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
          <input
            type="text"
            data-testid="question-other"
            aria-label={t.question.other}
            placeholder={t.question.other}
            value={own[q.question] ?? ""}
            onChange={(e) => write(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                go();
              }
            }}
            className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </fieldset>
      <div className="flex items-center gap-1">
        {several && step > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="question-back"
            disabled={sent}
            tip={t.question.backTip}
            onClick={() => setStep(step - 1)}
          >
            {t.question.back}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="question-skip"
            disabled={sent}
            tip={several ? t.question.skipOneTip : t.question.skipTip}
            onClick={skip}
          >
            {t.question.skip}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid={last ? "question-answer" : "question-next"}
            disabled={sent || !answered(q)}
            tip={last ? t.question.answerTip : t.question.nextTip}
            onClick={go}
          >
            {last ? t.question.answer : t.question.next}
          </Button>
        </div>
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
    void spaka
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
