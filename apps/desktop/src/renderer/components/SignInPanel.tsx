import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { type AgentStatus, anyAccount } from "../../shared/ipc";
import { spaka } from "../lib/bridge";
import { t } from "../lib/strings";
import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";

type KeyFor = "claude" | "openai" | "gemini";

/** Which account a pasted key is for, from how it starts; undefined when it does not say. */
export function keyAccount(key: string): KeyFor | undefined {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "claude";
  if (k.startsWith("AIza")) return "gemini";
  if (k.startsWith("sk-")) return "openai";
  return undefined;
}

/**
 * Shown while the model in use has no connected account (ADR 0002, Q275): at
 * first launch it offers Claude, ChatGPT or an API key. Claude's sign-in is
 * the official binary's own, ChatGPT's opens the browser; Spaka never shows
 * a login form of its own.
 */
export function SignInPanel({ status, modelName }: { status: AgentStatus; modelName?: string }) {
  const [keyOpen, setKeyOpen] = useState(false);
  const [key, setKey] = useState("");
  // The maker's choice, or what the key's start says.
  const [chosen, setChosen] = useState<KeyFor>();
  const keyFor = chosen ?? keyAccount(key) ?? "claude";
  const waiting = status.auth === "signing-in" || status.chatgpt.signingIn;

  const save = () => {
    if (!key.trim()) return;
    const done = () => {
      setKey("");
      setChosen(undefined);
      setKeyOpen(false);
    };
    if (keyFor === "claude") void spaka.invoke("agent:set-api-key", key).then(done);
    else void spaka.invoke("agent:set-key", keyFor, key).then(done);
  };

  return (
    <div data-testid="sign-in" className="mx-3 space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
      <div className="space-y-1">
        <h2 className="font-semibold">{t.signIn.title}</h2>
        <p className="text-muted-foreground">
          {anyAccount(status) && modelName ? t.signIn.otherModel(modelName) : t.signIn.text}
        </p>
      </div>
      {waiting ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t.signIn.waiting}
          </p>
          <div className="flex gap-2">
            {status.auth === "signing-in" && status.signInUrl && (
              <Button
                size="sm"
                variant="outline"
                tip={t.signIn.openLinkTip}
                onClick={() => void spaka.invoke("agent:open-sign-in-page")}
              >
                {t.signIn.openLink}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              tip={t.signIn.cancelTip}
              onClick={() =>
                void spaka.invoke(status.chatgpt.signingIn ? "agent:chatgpt-cancel" : "agent:cancel-sign-in")
              }
            >
              {t.signIn.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {(status.signInFailed || status.chatgpt.failed) && <p className="text-destructive">{t.signIn.failed}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              tip={t.signIn.subscriptionTip}
              onClick={() => void spaka.invoke("agent:sign-in", "claudeai")}
            >
              {t.signIn.subscription}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="sign-in-chatgpt"
              tip={t.signIn.chatgptTip}
              onClick={() => void spaka.invoke("agent:chatgpt-sign-in")}
            >
              {t.signIn.chatgpt}
            </Button>
            <Button
              size="sm"
              variant="outline"
              tip={t.signIn.consoleTip}
              onClick={() => void spaka.invoke("agent:sign-in", "console")}
            >
              {t.signIn.console}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="sign-in-key"
              tip={t.signIn.apiKeyTip}
              onClick={() => setKeyOpen((open) => !open)}
            >
              <KeyRound />
              {t.signIn.apiKey}
            </Button>
          </div>
          {keyOpen && (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <NativeSelect
                aria-label={t.signIn.keyFor}
                data-testid="sign-in-key-account"
                value={keyFor}
                onChange={(event) => setChosen(event.target.value as KeyFor)}
                size="sm"
                className="text-xs"
                wrapperClassName="shrink-0"
              >
                {(["claude", "openai", "gemini"] as const).map((account) => (
                  <option key={account} value={account}>
                    {t.accounts.names[account]}
                  </option>
                ))}
              </NativeSelect>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                data-testid="sign-in-key-input"
                onChange={(event) => setKey(event.target.value)}
                placeholder={t.signIn.keyPlaceholders[keyFor]}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs outline-none focus:ring-[3px] focus:ring-ring/30"
              />
              <Button size="sm" type="submit" disabled={!key.trim()} tip={t.signIn.saveTip}>
                {t.signIn.save}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
