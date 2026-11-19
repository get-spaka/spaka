// Windows (Q375): the agent's shell is Git Bash, from Git for Windows. Until
// it is installed the window asks for it, with where to get it and "Check
// again"; the agent does not start without it.
import { useEffect, useState } from "react";
import type { GitBashState } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { APP_ICON } from "../lib/icon";
import { t } from "../lib/strings";
import { Button } from "./ui/button";

export function useGitBash() {
  const [state, setState] = useState<GitBashState | null>(null);
  useEffect(() => {
    void upstart.invoke("app:git-bash").then(setState);
  }, []);
  return [state, setState] as const;
}

export function GitForWindows({ state, onChange }: { state: GitBashState; onChange: (state: GitBashState) => void }) {
  const [checking, setChecking] = useState(false);
  const [missing, setMissing] = useState(false);
  const check = async () => {
    setChecking(true);
    const next = await upstart.invoke("app:git-bash-check");
    setChecking(false);
    setMissing(next.needed);
    onChange(next);
  };
  return (
    <div
      className="drag-region flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
      data-testid="git-for-windows"
    >
      <img src={APP_ICON} alt="" className="size-16" draggable={false} />
      <h1 className="text-lg font-semibold">{t.gitForWindows.title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t.gitForWindows.why}</p>
      <ol className="max-w-md list-decimal space-y-1 pl-5 text-left text-sm">
        <li>{t.gitForWindows.step1}</li>
        <li>{t.gitForWindows.step2}</li>
      </ol>
      <div className="no-drag flex gap-2">
        <Button
          onClick={() => void upstart.invoke("app:open-link", state.url)}
          tip={t.gitForWindows.downloadTip}
          data-testid="git-download"
        >
          {t.gitForWindows.download}
        </Button>
        <Button
          variant="outline"
          onClick={() => void check()}
          disabled={checking}
          tip={t.gitForWindows.checkTip}
          data-testid="git-check"
        >
          {t.gitForWindows.check}
        </Button>
      </div>
      {missing && (
        <p className="text-sm text-destructive" data-testid="git-missing">
          {t.gitForWindows.stillMissing}
        </p>
      )}
    </div>
  );
}
