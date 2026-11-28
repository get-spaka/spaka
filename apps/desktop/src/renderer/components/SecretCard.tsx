// The card of a secret the agent asks for (Q559): a question card with a
// masked field. The value goes straight to Spaka's keeping (secrets:provide),
// never into the conversation; once settled, the card folds to one line.
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { useState } from "react";
import type { SecretCard as Card } from "../../shared/conversation";
import { spaka } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { Button } from "./ui/button";

export function SecretCard({ card }: { card: Card }) {
  if (card.state !== "waiting") return <SettledSecret card={card} />;
  return <WaitingSecret key={card.id} card={card} />;
}

function WaitingSecret({ card }: { card: Card }) {
  const s = t.secrets;
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const save = () => {
    if (!value.trim() || sent) return;
    setSent(true);
    setError(undefined);
    spaka.invoke("secrets:provide", card.id, value).catch((e) => {
      setSent(false);
      setError(messageOf(e));
    });
  };
  const skip = () => {
    setSent(true);
    void spaka.invoke("conversation:answer", card.id, { kind: "skipped" }).catch(() => setSent(false));
  };
  return (
    <div data-testid="secret-card" data-state="waiting" className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="space-y-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          <KeyRound className="size-3" />
          {s.header}
        </span>
        <p className="whitespace-pre-wrap text-sm font-medium">{card.purpose}</p>
        {card.where && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{card.where}</p>}
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center gap-1 rounded-lg border bg-background px-2.5 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <input
            type={shown ? "text" : "password"}
            data-testid="secret-value"
            aria-label={card.name}
            placeholder={card.name}
            autoComplete="off"
            spellCheck={false}
            disabled={sent}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none placeholder:font-mono placeholder:text-muted-foreground"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            tip={shown ? s.hide : s.show}
            aria-label={shown ? s.hide : s.show}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" />
          {s.kept}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="secret-skip"
            disabled={sent}
            tip={s.notNowTip}
            onClick={skip}
          >
            {s.notNow}
          </Button>
          <Button type="submit" size="sm" data-testid="secret-save" disabled={sent || !value.trim()} tip={s.saveKeyTip}>
            {s.saveKey}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Folded: the secret's name and whether it was given, never its value. */
function SettledSecret({ card }: { card: Card }) {
  const s = t.secrets;
  const given = card.state === "answered" && card.answer?.kind === "secret";
  return (
    <div
      data-testid="secret-card"
      data-state={card.state}
      className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
    >
      <KeyRound className="size-3.5 shrink-0" />
      <span>
        {given ? s.given(card.name) : card.state === "unanswered" ? s.unanswered(card.name) : s.declined(card.name)}
      </span>
    </div>
  );
}
