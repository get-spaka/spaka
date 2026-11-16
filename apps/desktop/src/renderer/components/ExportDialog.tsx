import { ArrowRight, Check, Copy, FolderOpen, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportResult, ProjectInfo, PublishInfo } from "../../shared/ipc";
import { upstart } from "../lib/bridge";
import { messageOf } from "../lib/errors";
import { t } from "../lib/strings";
import { cn } from "../lib/utils";
import { stillToAdapt, useAdaptation } from "./AdaptationBar";
import { Button } from "./ui/button";
import { Tip } from "./ui/tip";

type Host = "netlify" | "cloudflare" | "github";
const HOSTS: Host[] = ["netlify", "cloudflare", "github"];

/** A text to copy, with a button that says it was. */
function CopyButton({ text, label, testid }: { text: string; label: string; testid?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 shrink-0"
      tip={t.export.copyTip}
      data-testid={testid}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? <Check /> : <Copy />}
      {copied ? t.export.copied : label}
    </Button>
  );
}

/**
 * Publishing the website (Q181, Q187): the three ways shown equally, none
 * chosen the first time and the last one chosen again after (it can be
 * changed), the static one refused, saying why, when a page shows what
 * visitors send; the form services' addresses for the static one; the export
 * into a folder, the management token written into it (Q191), then the steps
 * that put it online. Shown over the preview column, whose native
 * view is hidden meanwhile. During a template's adaptation, the page types
 * still showing its contents are named first (Q311).
 */
export function ExportDialog({
  project,
  working,
  onClose,
}: {
  project: ProjectInfo;
  working: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<PublishInfo | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toAdapt = stillToAdapt(useAdaptation(project.id));
  const [anyway, setAnyway] = useState(false);

  useEffect(() => {
    void upstart
      .invoke("export:choices")
      .then((loaded) => {
        setInfo(loaded);
        // How it was published last time is chosen again; another can be picked.
        const last = loaded.choices.find((c) => c.id === loaded.last && !c.refused?.length);
        if (last) {
          setChoice(last.id);
          void upstart.invoke("export:last", last.id).then(setFolder);
        }
      })
      .catch((e) => setError(messageOf(e)));
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const chosen = info?.choices.find((c) => c.id === choice);
  const pick = (id: string) => {
    setChoice(id);
    setResult(null);
    setError(null);
    setFolder(null);
    void upstart.invoke("export:last", id).then(setFolder);
  };

  const run = async (target: string) => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await upstart.invoke("export:run", target, choice));
      setFolder(target);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    const picked = await upstart.invoke("export:choose-folder");
    if (picked) await run(picked);
  };

  return (
    <div data-testid="export-dialog" className="absolute inset-0 z-10 overflow-y-auto bg-background text-left">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-8 py-8">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t.export.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.export.intro}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} tip={t.export.closeTip} data-testid="export-close">
            <X />
          </Button>
        </div>

        {toAdapt.length > 0 && !anyway ? (
          <section
            data-testid="publish-adaptation"
            className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-muted0/5 p-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="size-4 text-warning" />
              {t.adaptation.publish.title}
            </h3>
            <p className="text-sm text-muted-foreground">{t.adaptation.publish.body(toAdapt.map((s) => s.name))}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="publish-continue-adaptation"
                disabled={working}
                tip={t.adaptation.publish.continueTip}
                onClick={() => {
                  onClose();
                  void upstart.invoke("adaptation:continue");
                }}
              >
                {t.adaptation.publish.continue}
                <ArrowRight />
              </Button>
              <Button
                variant="outline"
                data-testid="publish-anyway"
                tip={t.adaptation.publish.anywayTip}
                onClick={() => setAnyway(true)}
              >
                {t.adaptation.publish.anyway}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{t.export.step1}</h3>
              <div className="flex flex-col gap-2">
                {info?.choices.map((c) => {
                  const words = t.export.builders[c.id];
                  const refused = !!c.refused?.length;
                  return (
                    <Tip key={c.id} text={refused ? t.export.refusedTip : t.export.pickTip}>
                      <button
                        type="button"
                        aria-pressed={choice === c.id}
                        disabled={refused}
                        onClick={() => pick(c.id)}
                        data-testid="publish-choice"
                        data-id={c.id}
                        data-refused={refused || undefined}
                        className={cn(
                          "rounded-lg border p-3 text-left text-sm transition-colors",
                          choice === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
                          refused && "cursor-not-allowed opacity-60 hover:bg-transparent",
                        )}
                      >
                        <span className="font-medium">{words?.name ?? c.id}</span>
                        <p className="mt-1 text-muted-foreground">{words?.line}</p>
                        {refused && (
                          <p className="mt-1 text-warning" data-testid="publish-refused">
                            {t.export.refused(c.refused!.join(", "))}
                          </p>
                        )}
                      </button>
                    </Tip>
                  );
                })}
              </div>

              {chosen?.needs.formServices && (info?.forms.length ?? 0) > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3" data-testid="form-services">
                  <h4 className="text-sm font-medium">{t.export.forms.title}</h4>
                  <p className="text-xs text-muted-foreground">{t.export.forms.intro}</p>
                  {info!.forms.map((name) => (
                    <FormService key={name} name={name} initial={project.formServices?.[name] ?? ""} />
                  ))}
                </div>
              )}
            </section>

            <section className={cn("flex flex-col gap-3", !choice && "opacity-50")}>
              <h3 className="text-sm font-medium">{t.export.step2}</h3>
              {working && <p className="text-sm text-muted-foreground">{t.export.agentWorking}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void choose()}
                  disabled={!choice || busy || working}
                  tip={t.export.chooseTip}
                  data-testid="export-choose"
                >
                  <FolderOpen />
                  {t.export.choose}
                </Button>
                {choice && folder && (
                  <Button
                    variant="outline"
                    onClick={() => void run(folder)}
                    disabled={busy || working}
                    tip={t.export.againTip}
                    data-testid="export-again"
                  >
                    {t.export.again}
                  </Button>
                )}
              </div>
              {busy && <p className="text-sm text-muted-foreground">{t.export.running}</p>}
              {error && (
                <p className="text-sm text-destructive" data-testid="export-error">
                  {error}
                </p>
              )}
              {result && (
                <div data-testid="export-result" className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p>{t.export.done(result.pages.length)}</p>
                  <Tip text={t.export.reveal}>
                    <button
                      type="button"
                      className="mt-1 max-w-full truncate text-left font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => void upstart.invoke("export:reveal", result.folder)}
                    >
                      {result.folder}
                    </button>
                  </Tip>
                  {result.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground" data-testid="export-warnings">
                      {result.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {result && (
              <section className="flex flex-col gap-3" data-testid="publish-guide" data-builder={result.builder}>
                <h3 className="text-sm font-medium">{t.export.step3}</h3>
                {result.guide.some((s) => s.command) && (
                  <p className="text-xs text-muted-foreground">{t.export.inFolder}</p>
                )}
                <ol className="flex flex-col gap-3">
                  {result.guide
                    .filter((step) => step.id !== "forms" || (info?.forms.length ?? 0) > 0)
                    .map((step) => (
                      <li key={step.id} data-testid="guide-step" data-id={step.id} className="text-sm">
                        <p>{t.export.guides[result.builder]?.[step.id] ?? step.id}</p>
                        {step.command && (
                          <div className="mt-1 flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1">
                            <code className="min-w-0 flex-1 break-all font-mono text-xs">{step.command}</code>
                            <CopyButton text={step.command} label={t.export.copy} />
                          </div>
                        )}
                        {result.builder === "static" && step.id === "upload" && (
                          <ul className="mt-2 flex flex-col gap-2">
                            {HOSTS.map((host) => (
                              <li key={host} className="rounded-lg border p-3 text-sm">
                                <Tip text={t.export.hostTip}>
                                  <button
                                    type="button"
                                    className="font-medium underline-offset-2 hover:underline"
                                    onClick={() => void upstart.invoke("export:open-host", host)}
                                  >
                                    {t.export.hosts[host].name}
                                  </button>
                                </Tip>
                                <p className="mt-1 text-muted-foreground">{t.export.hosts[host].how}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                </ol>
                {result.builder !== "static" && <p className="text-xs text-muted-foreground">{t.export.guideFile}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A form's form service address (Q178), kept in the project. */
function FormService({ name, initial }: { name: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-1"
      data-testid="form-service"
      data-name={name}
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        upstart
          .invoke("projects:set-form-service", name, value)
          .then(() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          })
          .catch((e) => setError(messageOf(e)));
      }}
    >
      <span className="text-xs font-medium">{t.export.forms.label(name)}</span>
      <div className="flex gap-2">
        <input
          type="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://"
          aria-label={t.export.forms.label(name)}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-8"
          tip={t.export.forms.saveTip}
          data-testid="form-service-save"
        >
          {saved ? t.export.forms.saved : t.export.forms.save}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
