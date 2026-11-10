import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import type { AgentStatus } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { t } from "../lib/strings";
import { Button } from "./ui/button";

/**
 * Shown while the agent is not signed in (ADR 0002): the official binary's own
 * sign-in, which opens the browser, or an API key. Upstart never shows a
 * Claude login form of its own.
 */
export function SignInPanel({ status }: { status: AgentStatus }) {
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState("");

  return (
    <div data-testid="sign-in" className="mx-3 space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
      <div className="space-y-1">
        <h2 className="font-semibold">{t.signIn.title}</h2>
        <p className="text-muted-foreground">{t.signIn.text}</p>
      </div>
      {status.auth === "signing-in" ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t.signIn.waiting}
          </p>
          <div className="flex gap-2">
            {status.signInUrl && (
              <Button size="sm" variant="outline" onClick={() => void upstart.invoke("agent:open-sign-in-page")}>
                {t.signIn.openLink}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void upstart.invoke("agent:cancel-sign-in")}>
              {t.signIn.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {status.signInFailed && <p className="text-destructive">{t.signIn.failed}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void upstart.invoke("agent:sign-in", "claudeai")}>
              {t.signIn.subscription}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void upstart.invoke("agent:sign-in", "console")}>
              {t.signIn.console}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setKeyOpen((open) => !open)}>
              <KeyRound />
              {t.signIn.apiKey}
            </Button>
          </div>
          {keyOpen && (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!key.trim()) return;
                void upstart.invoke("agent:set-api-key", key).then(() => setKey(""));
              }}
            >
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={t.signIn.apiKeyPlaceholder}
                className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:ring-[3px] focus:ring-ring/30"
              />
              <Button size="sm" type="submit" disabled={!key.trim()}>
                {t.signIn.save}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
